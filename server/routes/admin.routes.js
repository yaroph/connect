const express = require("express");
const router = express.Router();

const {
  readUsers,
  writeUsers,
  readCagnotte,
  writeCagnotte,
  readAdminMoney,
  writeAdminMoney,
  readQuestionCooldowns,
  readSettings,
  writeSettings,
  readAll,
  readResponses,
  mutateResponses,
  writeJson,
  keyOrPath,
  normalizeUser,
  runStateExclusive,
  responsesMutex,
  invalidateCache,
} = require("../storage/store");
const { ALLOWED_DATA_FILES } = require("../config/constants");
const { isBase64Image, storeImage } = require("../storage/images");
const { formatUserForAdmin, encryptPassword } = require("../utils/crypto");
const { nameKey, nowIso } = require("../utils/helpers");
const { requireAdmin } = require("../middleware/auth");

// All routes in this router require Admin
router.use(requireAdmin);

// List users with decrypted password & pending balance
router.get("/users", async (req, res) => {
  try {
    const users = await readUsers();
    const cagnotte = await readCagnotte();
    const enriched = users.map((u) => ({
      ...formatUserForAdmin(u),
      pending: Number((cagnotte[u.id] && cagnotte[u.id].pending) || 0),
    }));
    res.json({ ok: true, users: enriched });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Update specific user
router.put("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const patch = req.body || {};
    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const idx = users.findIndex((u) => u.id === id);
      if (idx === -1) return { error: "Utilisateur introuvable", status: 404 };

      if (patch.photoProfil && isBase64Image(patch.photoProfil)) {
        const imageId = `user_${id}_photo`;
        patch.photoProfil = await storeImage(patch.photoProfil, imageId);
      }

      const u = normalizeUser({ ...users[idx], ...patch });
      u.token = users[idx].token;
      u.retrait = users[idx].retrait;
      u.gagneSurBNI = users[idx].gagneSurBNI;
      u.lastLoginAt = users[idx].lastLoginAt;
      u.loginByDay = users[idx].loginByDay;
      u.withdrawalsByMonth = users[idx].withdrawalsByMonth;

      users[idx] = u;
      await writeUsers(users);
      invalidateCache("users");
      return { user: formatUserForAdmin(u) };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json({ ok: true, user: result.user });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Reset user passwords in batch
router.post("/reset-passwords", async (req, res) => {
  try {
    const body = req.body || {};
    const entries = Array.isArray(body.entries) ? body.entries : Array.isArray(body.users) ? body.users : null;
    if (!entries) return res.status(400).json({ error: "entries manquant (tableau)" });

    const result = await runStateExclusive(async () => {
      const users = await readUsers();

      const byFull = new Map();
      const byPn = new Map();
      users.forEach((u, idx) => {
        const full = nameKey(u.fullName || `${u.prenom || ""} ${u.nom || ""}`.trim());
        if (full && !byFull.has(full)) byFull.set(full, idx);
        const pn = nameKey(`${u.prenom || ""} ${u.nom || ""}`.trim());
        if (pn && !byPn.has(pn)) byPn.set(pn, idx);
      });

      let updated = 0;
      let invalid = 0;
      const notFound = [];
      const duplicates = [];
      const seenKeys = new Set();

      for (const e of entries) {
        if (!e || typeof e !== "object") {
          invalid += 1;
          continue;
        }
        const motDePasse = String(e.motDePasse || e.password || "").trim();
        const fullNameRaw = String(
          e.fullName || e.fullname || e.nomComplet || `${e.prenom || e.firstName || ""} ${e.nom || e.lastName || ""}`
        ).trim();
        const prenom = String(e.prenom || e.firstName || "").trim();
        const nom = String(e.nom || e.lastName || "").trim();

        if (!motDePasse || (!fullNameRaw && !(prenom && nom))) {
          invalid += 1;
          continue;
        }

        const keyFull = nameKey(fullNameRaw);
        const keyPn = prenom && nom ? nameKey(`${prenom} ${nom}`) : "";
        const lookupKey = keyFull || keyPn;
        if (lookupKey && seenKeys.has(lookupKey)) {
          duplicates.push(fullNameRaw || `${prenom} ${nom}`.trim());
        }
        if (lookupKey) seenKeys.add(lookupKey);

        const idx =
          keyFull && byFull.get(keyFull) !== undefined
            ? byFull.get(keyFull)
            : keyPn && byPn.get(keyPn) !== undefined
            ? byPn.get(keyPn)
            : -1;

        if (idx === -1) {
          notFound.push(fullNameRaw || `${prenom} ${nom}`.trim());
          continue;
        }

        users[idx] = { ...users[idx], motDePasse: encryptPassword(motDePasse), updatedAt: nowIso() };
        updated += 1;
      }

      if (updated > 0) {
        await writeUsers(users);
        invalidateCache("users");
      }

      return {
        updated,
        invalid,
        notFoundCount: notFound.length,
        notFoundSample: notFound.slice(0, 25),
        duplicateNamesSample: duplicates.slice(0, 25),
        totalEntries: entries.length,
        totalUsers: users.length,
      };
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Delete user and associated data
router.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await responsesMutex.runExclusive(async () =>
      runStateExclusive(async () => {
        const [users, adminMoney, cagnotte, cooldowns] = await Promise.all([
          readUsers(),
          readAdminMoney(),
          readCagnotte(),
          readQuestionCooldowns(),
        ]);

        const userIdx = users.findIndex((u) => u.id === id);
        if (userIdx === -1) return { error: "Utilisateur introuvable", status: 404 };

        users.splice(userIdx, 1);
        const filteredAdminMoney = adminMoney.filter((p) => p.userId !== id);
        delete cagnotte[id];
        delete cooldowns[id];

        await Promise.all([
          writeUsers(users),
          writeAdminMoney(filteredAdminMoney),
          writeCagnotte(cagnotte),
          readQuestionCooldowns(cooldowns),
        ]);

        await mutateResponses(async (r) => {
          r.answers = r.answers.filter((a) => a.userId !== id);
          r.completions = r.completions.filter((c) => c.userId !== id);
          return { ok: true };
        });

        invalidateCache("users");
        invalidateCache("cagnotte");
        invalidateCache("responses");

        return { ok: true };
      })
    );

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Delete answer
router.delete("/answers/:id", async (req, res) => {
  try {
    const answerId = req.params.id;
    const result = await responsesMutex.runExclusive(async () =>
      mutateResponses(async (r) => {
        const answerIndex = r.answers.findIndex((a) => a.id === answerId);
        if (answerIndex === -1) {
          return { error: "Réponse introuvable", status: 404 };
        }

        r.answers.splice(answerIndex, 1);
        return { ok: true };
      })
    );

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Payments list
router.get("/payments", async (req, res) => {
  try {
    const list = await readAdminMoney();
    const total = list.reduce((s, x) => s + Number(x.amount || 0), 0);
    res.json({ ok: true, total, payments: list });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Validate payment
router.post("/payments/:id/validate", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await runStateExclusive(async () => {
      const list = await readAdminMoney();
      const p = list.find((x) => x.id === id);
      if (!p) return { error: "Paiement introuvable", status: 404 };

      const users = await readUsers();
      const idx = users.findIndex((u) => u.id === p.userId);
      if (idx === -1) return { error: "Utilisateur introuvable", status: 404 };
      const u = users[idx];
      u.gagneSurBNI = Number(u.gagneSurBNI || 0) + Number(p.amount || 0);
      u.retrait = { status: "IDLE", amount: 0, requestedAt: null };
      u.updatedAt = nowIso();
      users[idx] = normalizeUser(u);
      await writeUsers(users);

      const next = list.filter((x) => x.id !== id);
      await writeAdminMoney(next);
      invalidateCache("users");
      return { ok: true, user: formatUserForAdmin(users[idx]), remaining: next.length };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Cancel payment
router.post("/payments/:id/cancel", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await runStateExclusive(async () => {
      const list = await readAdminMoney();
      const p = list.find((x) => x.id === id);
      if (!p) return { error: "Paiement introuvable", status: 404 };

      const users = await readUsers();
      const idx = users.findIndex((u) => u.id === p.userId);
      if (idx === -1) return { error: "Utilisateur introuvable", status: 404 };
      const u = users[idx];

      const cagnotte = await readCagnotte();
      cagnotte[p.userId] = cagnotte[p.userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
      cagnotte[p.userId].pending = Number(cagnotte[p.userId].pending || 0) + Number(p.amount || 0);
      await writeCagnotte(cagnotte);

      u.retrait = { status: "IDLE", amount: 0, requestedAt: null };
      u.updatedAt = nowIso();
      users[idx] = normalizeUser(u);
      await writeUsers(users);

      const next = list.filter((x) => x.id !== id);
      await writeAdminMoney(next);
      invalidateCache("users");
      invalidateCache("cagnotte");
      return { ok: true, user: formatUserForAdmin(users[idx]), pending: cagnotte[p.userId].pending, remaining: next.length };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Statistics
router.get("/statistics", async (req, res) => {
  try {
    const users = await readUsers();
    const cagnotte = await readCagnotte();
    const responses = await readResponses();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getDateKey = (date) => {
      const d = new Date(date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const last7Days = [];
    const last7DaysData = {
      randomAnswers: {},
      questionnairesCompleted: {},
      inscriptions: {},
      connexions: {},
    };

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = getDateKey(date);
      last7Days.push(key);
      last7DaysData.randomAnswers[key] = 0;
      last7DaysData.questionnairesCompleted[key] = 0;
      last7DaysData.inscriptions[key] = 0;
      last7DaysData.connexions[key] = 0;
    }

    Object.values(cagnotte).forEach((userCagnotte) => {
      if (userCagnotte.randomByDay) {
        Object.entries(userCagnotte.randomByDay).forEach(([dateKey, count]) => {
          if (Object.prototype.hasOwnProperty.call(last7DaysData.randomAnswers, dateKey)) {
            last7DaysData.randomAnswers[dateKey] += Number(count || 0);
          }
        });
      }
    });

    (responses.completions || []).forEach((completion) => {
      const dateKey = getDateKey(completion.completedAt);
      if (Object.prototype.hasOwnProperty.call(last7DaysData.questionnairesCompleted, dateKey)) {
        last7DaysData.questionnairesCompleted[dateKey]++;
      }
    });

    users.forEach((user) => {
      const dateKey = getDateKey(user.createdAt);
      if (Object.prototype.hasOwnProperty.call(last7DaysData.inscriptions, dateKey)) {
        last7DaysData.inscriptions[dateKey]++;
      }
    });

    users.forEach((user) => {
      const loginByDay = user && user.loginByDay && typeof user.loginByDay === "object" ? user.loginByDay : {};
      Object.entries(loginByDay).forEach(([dateKey, count]) => {
        if (Object.prototype.hasOwnProperty.call(last7DaysData.connexions, dateKey)) {
          last7DaysData.connexions[dateKey] += Number(count || 0);
        }
      });
    });

    const todayKeyStr = getDateKey(today);
    const randomAnswersToday = last7DaysData.randomAnswers[todayKeyStr] || 0;
    const questionnairesCompletedToday = last7DaysData.questionnairesCompleted[todayKeyStr] || 0;
    const inscriptionsToday = last7DaysData.inscriptions[todayKeyStr] || 0;
    const connexionsToday = last7DaysData.connexions[todayKeyStr] || 0;

    const totalCagnotte = Object.values(cagnotte).reduce((sum, userCagnotte) => {
      return sum + Number(userCagnotte.pending || 0);
    }, 0);

    const totalGagneSurBNI = users.reduce((sum, user) => {
      return sum + Number(user.gagneSurBNI || 0);
    }, 0);

    const totalUsers = users.length;

    const stats = {
      sexe: {},
      couleurPeau: {},
      couleurCheveux: {},
      longueurCheveux: {},
      styleVestimentaire: {},
      metier: {},
    };

    users.forEach((user) => {
      if (user.sexe) stats.sexe[user.sexe] = (stats.sexe[user.sexe] || 0) + 1;
      if (user.couleurPeau) stats.couleurPeau[user.couleurPeau] = (stats.couleurPeau[user.couleurPeau] || 0) + 1;
      if (user.couleurCheveux) stats.couleurCheveux[user.couleurCheveux] = (stats.couleurCheveux[user.couleurCheveux] || 0) + 1;
      if (user.longueurCheveux) stats.longueurCheveux[user.longueurCheveux] = (stats.longueurCheveux[user.longueurCheveux] || 0) + 1;
      if (user.styleVestimentaire) stats.styleVestimentaire[user.styleVestimentaire] = (stats.styleVestimentaire[user.styleVestimentaire] || 0) + 1;
      if (user.metier) stats.metier[user.metier] = (stats.metier[user.metier] || 0) + 1;
    });

    res.json({
      ok: true,
      statistics: {
        totalUsers,
        totalCagnotte,
        totalGagneSurBNI,
        today: {
          randomAnswers: randomAnswersToday,
          questionnairesCompleted: questionnairesCompletedToday,
          inscriptions: inscriptionsToday,
          connexions: connexionsToday,
        },
        last7Days: {
          dates: last7Days,
          randomAnswers: last7Days.map((d) => last7DaysData.randomAnswers[d]),
          questionnairesCompleted: last7Days.map((d) => last7DaysData.questionnairesCompleted[d]),
          inscriptions: last7Days.map((d) => last7DaysData.inscriptions[d]),
          connexions: last7Days.map((d) => last7DaysData.connexions[d]),
        },
        userStats: stats,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Settings
router.get("/settings", async (req, res) => {
  try {
    const settings = await readSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const settings = req.body || {};
    const updated = await writeSettings(settings);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

module.exports = router;

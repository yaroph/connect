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
  writeQuestionCooldowns,
  readSettings,
  readAll,
  readResponses,
  normalizeUser,
  runStateExclusive,
  invalidateCache,
} = require("../storage/store");
const { DEFAULT_SETTINGS } = require("../config/constants");
const { isBase64Image, storeImage } = require("../storage/images");
const { formatUserForAdmin, genId } = require("../utils/crypto");
const {
  currentMonthKey,
  getUserFieldForVariableTagName,
  nowIso,
} = require("../utils/helpers");
const { requireAuth, requireSelfOrAdmin } = require("../middleware/auth");

// Update own profile (Compte + Infos)
router.put("/me", requireAuth, async (req, res) => {
  try {
    const patch = req.body || {};
    const authUser = req.authUser;

    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const idx = users.findIndex((x) => x.id === authUser.id);
      if (idx === -1) return { error: "Utilisateur introuvable", status: 404 };

      const allowedKeys = [
        "prenom",
        "nom",
        "telephone",
        "dateNaissance",
        "compteBancaire",
        "motDePasse",
        "photoProfil",
        "numeroCitoyen",
        "sexe",
        "couleurPeau",
        "couleurCheveux",
        "longueurCheveux",
        "styleVestimentaire",
        "metier",
      ];
      const allowed = {};
      for (const k of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
          allowed[k] = patch[k];
        }
      }

      const core = ["prenom", "nom", "telephone", "dateNaissance", "compteBancaire", "motDePasse"];
      for (const k of core) {
        if (Object.prototype.hasOwnProperty.call(allowed, k)) {
          const v = allowed[k];
          if (v === null || v === undefined) {
            delete allowed[k];
          } else if (typeof v === "string" && v.trim() === "") {
            delete allowed[k];
          }
        }
      }

      if (allowed.photoProfil && isBase64Image(allowed.photoProfil)) {
        const imageId = `user_${users[idx].id}_photo`;
        allowed.photoProfil = await storeImage(allowed.photoProfil, imageId);
      }

      const u = normalizeUser({ ...users[idx], ...allowed });
      u.token = users[idx].token;
      u.gagneSurBNI = users[idx].gagneSurBNI;
      u.retrait = users[idx].retrait;
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

router.post("/sensible", requireSelfOrAdmin, async (req, res) => {
  try {
    const { userId, tagName, answer, questionId, questionTitle, isCaptcha } = req.body || {};
    if (isCaptcha) {
      if (questionId) {
        const cooldowns = await readQuestionCooldowns();
        cooldowns[userId] = cooldowns[userId] || {};
        cooldowns[userId][questionId] = Date.now();
        await writeQuestionCooldowns(cooldowns);
      }
      return res.json({ ok: true, captcha: true });
    }

    const t = tagName ? String(tagName).trim() : "";
    const tNorm = t.toLowerCase();
    const field = getUserFieldForVariableTagName(t);

    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) return { error: "Utilisateur introuvable", status: 404 };
      const u = users[idx];

      if (field) {
        let processedAnswer = String(answer ?? "");
        if (field === "photoProfil" && isBase64Image(processedAnswer)) {
          const imageId = `user_${u.id}_photo`;
          processedAnswer = await storeImage(processedAnswer, imageId);
        }

        u[field] = processedAnswer;
        u.updatedAt = nowIso();
        users[idx] = normalizeUser(u);
        await writeUsers(users);
        invalidateCache("users");
        return { ok: true, updated: { field } };
      }

      let safeAnswer = answer;
      if (safeAnswer && isBase64Image(String(safeAnswer))) {
        const base = t ? `tag_${tNorm.replace(/[^a-z0-9_-]/g, "").slice(0, 32)}` : `q_${String(questionId || "unknown")}`;
        const imageId = `sensible_${userId}_${base}_${Date.now()}`;
        safeAnswer = await storeImage(String(safeAnswer), imageId);
      }

      if (t) {
        u.sensibleAnswersTagged = u.sensibleAnswersTagged || [];
        const existing = u.sensibleAnswersTagged.find((x) => String(x.tag || "").trim().toLowerCase() === tNorm);
        if (existing) existing.answer = safeAnswer;
        else u.sensibleAnswersTagged.push({ tag: t, answer: safeAnswer });
      } else {
        u.sensibleAnswersUntagged = u.sensibleAnswersUntagged || [];
        u.sensibleAnswersUntagged.push({
          questionId: questionId || null,
          questionTitle: questionTitle || null,
          answer: safeAnswer,
        });
      }
      u.updatedAt = nowIso();
      users[idx] = normalizeUser(u);
      await writeUsers(users);
      invalidateCache("users");
      return { ok: true };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    if (questionId) {
      const cooldowns = await readQuestionCooldowns();
      cooldowns[userId] = cooldowns[userId] || {};
      cooldowns[userId][questionId] = Date.now();
      await writeQuestionCooldowns(cooldowns);
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/request-withdraw", requireSelfOrAdmin, async (req, res) => {
  try {
    const { userId } = req.body || {};
    const result = await runStateExclusive(async () => {
      const [users, cagnotte, adminList, settings] = await Promise.all([
        readUsers(),
        readCagnotte(),
        readAdminMoney(),
        readSettings(),
      ]);

      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) return { error: "Utilisateur introuvable", status: 404 };
      const u = users[idx];

      const pending = Number((cagnotte[userId] && cagnotte[userId].pending) || 0);
      const minimum = Number(settings.minimumWithdrawalAmount || DEFAULT_SETTINGS.minimumWithdrawalAmount);
      if (pending < minimum) {
        return { error: `Seuil minimum: ${minimum}`, status: 400 };
      }
      if (u.retrait && u.retrait.status === "PENDING") {
        return { error: "Déjà en attente", status: 400 };
      }

      const month = currentMonthKey();
      u.withdrawalsByMonth =
        u.withdrawalsByMonth && typeof u.withdrawalsByMonth === "object" ? u.withdrawalsByMonth : {};
      const monthlyCount = Number(u.withdrawalsByMonth[month] || 0);
      if (monthlyCount >= Number(settings.maxWithdrawalsPerMonth || DEFAULT_SETTINGS.maxWithdrawalsPerMonth)) {
        return { error: "Limite mensuelle de demandes de retrait atteinte", status: 400 };
      }

      adminList.unshift({
        id: genId("pay"),
        userId,
        fullName: u.fullName,
        compteBancaire: u.compteBancaire,
        telephone: u.telephone,
        amount: pending,
        createdAt: nowIso(),
      });
      await writeAdminMoney(adminList);

      u.retrait = { status: "PENDING", amount: pending, requestedAt: nowIso() };
      u.withdrawalsByMonth[month] = monthlyCount + 1;
      u.updatedAt = nowIso();
      users[idx] = normalizeUser(u);
      await writeUsers(users);

      cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
      cagnotte[userId].pending = 0;
      await writeCagnotte(cagnotte);

      invalidateCache("users");
      invalidateCache("cagnotte");
      return { ok: true, retrait: users[idx].retrait, pending: 0 };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/verify-payment-status", requireSelfOrAdmin, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId requis" });
    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) return { error: "Utilisateur introuvable", status: 404 };

      const u = users[idx];
      if (!u.retrait || u.retrait.status !== "PENDING") {
        const cagnotte = await readCagnotte();
        const pending = Number((cagnotte[userId] && cagnotte[userId].pending) || 0);
        return { ok: true, fixed: false, user: u, pending };
      }

      const adminList = await readAdminMoney();
      const hasPayment = adminList.some((p) => p.userId === userId);
      if (hasPayment) {
        const cagnotte = await readCagnotte();
        const pending = Number((cagnotte[userId] && cagnotte[userId].pending) || 0);
        return { ok: true, fixed: false, user: u, pending };
      }

      u.retrait = { status: "IDLE", amount: 0, requestedAt: null };
      u.updatedAt = nowIso();
      users[idx] = normalizeUser(u);
      await writeUsers(users);
      invalidateCache("users");

      const cagnotte = await readCagnotte();
      const pending = Number((cagnotte[userId] && cagnotte[userId].pending) || 0);
      return { ok: true, fixed: true, user: users[idx], pending };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.get("/:userId/questionnaires-progress", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId requis" });

    const { questions, questionnaires } = await readAll();
    const responses = await readResponses();

    const userAnswers = responses.answers.filter((a) => a.userId === userId);
    const userCompletions = responses.completions.filter((c) => c.userId === userId);

    const answeredByQn = new Map();
    userAnswers.forEach((a) => {
      if (a.questionnaireId) {
        if (!answeredByQn.has(a.questionnaireId)) {
          answeredByQn.set(a.questionnaireId, new Set());
        }
        answeredByQn.get(a.questionnaireId).add(a.questionId);
      }
    });

    const completedQnIds = new Set(userCompletions.map((c) => c.questionnaireId));

    const questionsByQn = new Map();
    questions.forEach((q) => {
      if (q.questionnaire) {
        if (!questionsByQn.has(q.questionnaire)) {
          questionsByQn.set(q.questionnaire, []);
        }
        questionsByQn.get(q.questionnaire).push(q);
      }
    });

    const progress = {};
    questionnaires.forEach((qn) => {
      const qnQuestions = questionsByQn.get(qn.id) || [];
      const answeredIds = answeredByQn.get(qn.id) || new Set();
      const totalQuestions = qnQuestions.length;
      const answeredCount = qnQuestions.filter((q) => answeredIds.has(q.id)).length;
      const hasCompletionRecord = completedQnIds.has(qn.id);

      const allAnswered = totalQuestions > 0 && answeredCount >= totalQuestions;

      progress[qn.id] = {
        totalQuestions,
        answeredCount,
        answeredQuestionIds: Array.from(answeredIds),
        isCompleted: hasCompletionRecord || allAnswered,
        completionRecorded: hasCompletionRecord,
        remaining: Math.max(0, totalQuestions - answeredCount),
      };
    });

    res.json({ ok: true, progress });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();

const {
  readUsers,
  readSettings,
  readCagnotte,
  writeCagnotte,
  readAll,
  readResponses,
  mutateResponses,
  runStateExclusive,
  responsesMutex,
  invalidateCache,
} = require("../storage/store");
const { todayKey, currentWeekKey, nowIso } = require("../utils/helpers");
const { genId } = require("../utils/crypto");
const { requireAuth, requireSelfOrAdmin } = require("../middleware/auth");

async function completeQuestionnaireForUser(questionnaireId, userId, { autoMarked = false } = {}) {
  const { questionnaires } = await readAll();
  const questionnaire = questionnaires.find((qn) => qn.id === questionnaireId);
  if (!questionnaire) {
    return { error: "Questionnaire introuvable", status: 404 };
  }

  const users = await readUsers();
  const user = users.find((u) => u.id === userId);
  const userName = user ? user.fullName || `${user.prenom} ${user.nom}`.trim() : "Utilisateur";

  const responseResult = await mutateResponses(async (responses) => {
    const alreadyCompleted = responses.completions.some(
      (c) => c.userId === userId && c.questionnaireId === questionnaireId
    );
    if (alreadyCompleted) {
      return { ok: true, alreadyCompleted: true };
    }

    const completion = {
      id: genId("cmp"),
      userId,
      questionnaireId,
      completedAt: nowIso(),
      userName,
    };
    if (autoMarked) {
      completion.autoMarked = true;
    }

    responses.completions.push(completion);
    return { ok: true, completed: true };
  });

  if (!responseResult || !responseResult.ok) {
    return responseResult;
  }

  const cagnotte = await readCagnotte();
  cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
  const currentPending = Number(cagnotte[userId].pending || 0);

  if (responseResult.alreadyCompleted) {
    return {
      ok: true,
      alreadyCompleted: true,
      reward: 0,
      pending: currentPending,
      message: "Questionnaire déjà complété",
    };
  }

  const amt = Number(questionnaire.reward || 0);
  let newPending = currentPending;
  if (amt > 0) {
    cagnotte[userId].pending = currentPending + amt;
    newPending = cagnotte[userId].pending;
    await writeCagnotte(cagnotte);
    invalidateCache("cagnotte");
  }

  return {
    ok: true,
    completed: true,
    reward: amt,
    pending: newPending,
    message: autoMarked ? "Questionnaire finalisé automatiquement" : "Questionnaire complété avec succès",
  };
}

router.post("/earn/random", requireSelfOrAdmin, async (req, res) => {
  try {
    const { userId } = req.body || {};
    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const u = users.find((x) => x.id === userId);
      if (!u) return { error: "Utilisateur introuvable", status: 404 };

      const settings = await readSettings();
      const cagnotte = await readCagnotte();
      cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
      cagnotte[userId].randomByDay = cagnotte[userId].randomByDay || {};
      cagnotte[userId].randomByWeek = cagnotte[userId].randomByWeek || {};

      const key = todayKey();
      const week = currentWeekKey();
      const dailyCount = Number(cagnotte[userId].randomByDay[key] || 0);
      const weeklyCount = Number(cagnotte[userId].randomByWeek[week] || 0);

      if (dailyCount >= settings.randomQuestionsPerDay) {
        return { ok: false, reason: "DAILY_LIMIT", pending: cagnotte[userId].pending, count: dailyCount };
      }
      if (weeklyCount >= settings.randomQuestionsPerWeek) {
        return { ok: false, reason: "WEEKLY_LIMIT", pending: cagnotte[userId].pending, count: weeklyCount };
      }

      cagnotte[userId].randomByDay[key] = dailyCount + 1;
      cagnotte[userId].randomByWeek[week] = weeklyCount + 1;
      cagnotte[userId].pending = Number(cagnotte[userId].pending || 0) + Number(settings.earningsPerRandomQuestion);

      await writeCagnotte(cagnotte);
      invalidateCache("cagnotte");
      return {
        ok: true,
        pending: cagnotte[userId].pending,
        count: cagnotte[userId].randomByDay[key],
        dailyRemaining: settings.randomQuestionsPerDay - cagnotte[userId].randomByDay[key],
        weeklyRemaining: settings.randomQuestionsPerWeek - cagnotte[userId].randomByWeek[week],
      };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/skip/random", requireSelfOrAdmin, async (req, res) => {
  try {
    const { userId } = req.body || {};
    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const u = users.find((x) => x.id === userId);
      if (!u) return { error: "Utilisateur introuvable", status: 404 };

      const settings = await readSettings();
      const cagnotte = await readCagnotte();
      cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
      cagnotte[userId].randomByDay = cagnotte[userId].randomByDay || {};
      cagnotte[userId].randomByWeek = cagnotte[userId].randomByWeek || {};

      const key = todayKey();
      const week = currentWeekKey();
      const dailyCount = Number(cagnotte[userId].randomByDay[key] || 0);
      const weeklyCount = Number(cagnotte[userId].randomByWeek[week] || 0);

      if (dailyCount >= settings.randomQuestionsPerDay) {
        return { ok: false, reason: "DAILY_LIMIT", pending: cagnotte[userId].pending, count: dailyCount };
      }
      if (weeklyCount >= settings.randomQuestionsPerWeek) {
        return { ok: false, reason: "WEEKLY_LIMIT", pending: cagnotte[userId].pending, count: weeklyCount };
      }

      cagnotte[userId].randomByDay[key] = dailyCount + 1;
      cagnotte[userId].randomByWeek[week] = weeklyCount + 1;
      await writeCagnotte(cagnotte);
      invalidateCache("cagnotte");
      return {
        ok: true,
        pending: cagnotte[userId].pending,
        count: cagnotte[userId].randomByDay[key],
        dailyRemaining: settings.randomQuestionsPerDay - cagnotte[userId].randomByDay[key],
        weeklyRemaining: settings.randomQuestionsPerWeek - cagnotte[userId].randomByWeek[week],
      };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/earn/questionnaire", requireAuth, async (req, res) => {
  try {
    const { userId, questionnaireId } = req.body || {};
    const authUser = req.authUser;
    if (!authUser.is_admin && String(authUser.id) !== String(userId)) {
      return res.status(403).json({ error: "Opération non autorisée pour cet utilisateur" });
    }

    const result = await responsesMutex.runExclusive(async () =>
      runStateExclusive(async () => {
        const [users, allData, settings] = await Promise.all([
          readUsers(),
          readAll(),
          readSettings(),
        ]);
        const u = users.find((x) => x.id === userId);
        if (!u) return { error: "Utilisateur introuvable", status: 404 };

        let amt = Number(settings.earningsPerQuestionnaire || 1.0);
        if (questionnaireId) {
          const qn = (allData.questionnaires || []).find((q) => q.id === questionnaireId);
          if (qn && Number(qn.reward) > 0) {
            amt = Number(qn.reward);
          }
        }

        if (questionnaireId) {
          const responseResult = await mutateResponses(async (responses) => {
            const alreadyCompleted = responses.completions.some(
              (c) => c.userId === userId && c.questionnaireId === questionnaireId
            );
            if (alreadyCompleted) {
              return { ok: true, alreadyCompleted: true };
            }

            responses.completions.push({
              id: genId("cmp"),
              userId,
              questionnaireId,
              completedAt: nowIso(),
              userName: u.fullName || `${u.prenom} ${u.nom}`.trim(),
            });
            return { ok: true };
          });

          if (responseResult && responseResult.alreadyCompleted) {
            const cagnotte = await readCagnotte();
            return { ok: true, alreadyCompleted: true, pending: Number((cagnotte[userId] || {}).pending || 0) };
          }
        }

        const cagnotte = await readCagnotte();
        cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
        cagnotte[userId].pending = Number(cagnotte[userId].pending || 0) + amt;
        await writeCagnotte(cagnotte);
        invalidateCache("cagnotte");
        return { ok: true, pending: cagnotte[userId].pending };
      })
    );

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/questionnaire/:questionnaireId/validate", requireSelfOrAdmin, async (req, res) => {
  try {
    const { questionnaireId } = req.params;
    const { userId } = req.body || {};

    if (!questionnaireId || !userId) {
      return res.status(400).json({ error: "questionnaireId et userId requis" });
    }

    const result = await responsesMutex.runExclusive(async () =>
      runStateExclusive(async () => completeQuestionnaireForUser(questionnaireId, userId))
    );

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/questionnaire/:questionnaireId/mark-completed", requireSelfOrAdmin, async (req, res) => {
  try {
    const { questionnaireId } = req.params;
    const { userId } = req.body || {};

    if (!questionnaireId || !userId) {
      return res.status(400).json({ error: "questionnaireId et userId requis" });
    }

    const result = await responsesMutex.runExclusive(async () =>
      runStateExclusive(async () => completeQuestionnaireForUser(questionnaireId, userId, { autoMarked: true }))
    );

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

module.exports = router;

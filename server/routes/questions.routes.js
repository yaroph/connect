const express = require("express");
const router = express.Router();

const {
  readUsers,
  readAll,
  writeAll,
  readResponses,
  mutateResponses,
  readQuestionCooldowns,
  writeQuestionCooldowns,
  readCagnotte,
  readSettings,
  responsesMutex,
  simpleCache,
  invalidateCache,
} = require("../storage/store");
const { DEFAULT_SETTINGS, USER_VARIABLE_TAGS } = require("../config/constants");
const { isBase64Image, storeImage } = require("../storage/images");
const { todayKey, currentWeekKey, isPriorityActive, nowIso } = require("../utils/helpers");
const { genId } = require("../utils/crypto");
const { requireAdmin } = require("../middleware/auth");

// GET combined db
router.get("/db", async (req, res) => {
  try {
    const scope = String((req.query && req.query.scope) || "").trim().toLowerCase();
    const light = scope === "public" || scope === "lite" || String((req.query && req.query.light) || "") === "1";
    const minimal = scope === "minimal";
    const full = !minimal && !light;
    const bypassCache = String((req.query && (req.query.nocache || req.query.noCache || req.query._)) || "") !== "";
    const canUseCache = !full && !bypassCache;

    const cacheKey = `db:${minimal ? "minimal" : light ? "public" : "full"}`;
    const cached = canUseCache ? simpleCache.get(cacheKey) : null;
    if (cached) {
      res.setHeader("Cache-Control", full ? "no-store" : "public, max-age=5");
      return res.json(cached);
    }

    const { tags, questions, questionnaires } = await readAll();

    if (minimal) {
      const activeQuestions = questions.filter((q) => q.active);
      const visibleQuestionnaires = questionnaires.filter((qn) => qn.visible);

      const response = {
        meta: { version: 5, updatedAt: nowIso(), mode: "minimal" },
        user: null,
        tags: [],
        questions: activeQuestions,
        questionnaires: visibleQuestionnaires,
        answers: [],
        completions: [],
      };

      simpleCache.set(cacheKey, response, 30000);
      res.setHeader("Cache-Control", "public, max-age=30");
      res.json(response);
      return;
    }

    const responses = light ? { answers: [], completions: [] } : await readResponses();
    const filteredQuestions = light
      ? questions.filter((q) => q.active || q.questionnaire)
      : questions;

    const response = {
      meta: { version: 5, updatedAt: nowIso(), mode: light ? "public" : "full" },
      user: null,
      tags,
      questions: filteredQuestions,
      questionnaires,
      answers: responses.answers,
      completions: responses.completions,
    };

    if (light) {
      const cacheTtl = 15000;
      simpleCache.set(cacheKey, response, cacheTtl);
      res.setHeader("Cache-Control", `public, max-age=${Math.floor(cacheTtl / 1000)}`);
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// PUT combined db (admin only)
router.put("/db", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const saved = await writeAll({
      tags: body.tags || [],
      questions: body.questions || [],
      questionnaires: body.questionnaires || [],
    });
    const responses = await readResponses();
    invalidateCache("questions");

    res.json({
      meta: { version: 5, updatedAt: nowIso() },
      user: null,
      ...saved,
      answers: responses.answers,
      completions: responses.completions,
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Questions for a specific questionnaire
router.get("/questionnaires/:id/questions", async (req, res) => {
  try {
    const qnId = req.params.id;
    const userId = req.query.userId;

    if (!qnId) {
      return res.status(400).json({ error: "ID du questionnaire requis" });
    }

    const cacheKey = `qn:${qnId}:questions`;
    const cached = simpleCache.get(cacheKey);

    let questions;
    let questionnaire;

    if (cached) {
      questions = cached.questions;
      questionnaire = cached.questionnaire;
    } else {
      const { questions: allQuestions, questionnaires } = await readAll();
      questionnaire = questionnaires.find((qn) => qn.id === qnId);

      if (!questionnaire) {
        return res.status(404).json({ error: "Questionnaire introuvable" });
      }

      const questionsMap = new Map();
      allQuestions.forEach((q) => {
        if (q.questionnaire === qnId) {
          questionsMap.set(q.id, q);
        }
      });

      questions = (questionnaire.questionOrder || questionnaire.questionorder || [])
        .map((id) => questionsMap.get(id))
        .filter(Boolean);

      simpleCache.set(cacheKey, { questions, questionnaire }, 30000);
    }

    let answeredQuestionIds = [];
    let completed = false;
    if (userId) {
      const responses = await readResponses();
      answeredQuestionIds = responses.answers
        .filter((ans) => ans.userId === userId && ans.questionnaireId === qnId)
        .map((ans) => ans.questionId);

      completed = responses.completions.some(
        (c) => c.userId === userId && c.questionnaireId === qnId
      );
    }

    res.setHeader("Cache-Control", userId ? "no-store" : "public, max-age=30");
    res.json({
      ok: true,
      questionnaire,
      questions,
      answeredQuestionIds,
      completed,
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Random question selection
router.get("/questions/random/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const [users, settings, db, cooldowns, cagnotte] = await Promise.all([
      readUsers(),
      readSettings(),
      readAll(),
      readQuestionCooldowns(),
      readCagnotte(),
    ]);

    const user = users.find((x) => x.id === userId);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
    cagnotte[userId].randomByDay = cagnotte[userId].randomByDay || {};
    cagnotte[userId].randomByWeek = cagnotte[userId].randomByWeek || {};

    const currentDayKey = todayKey();
    const currentWeek = currentWeekKey();

    const dailyCount = Number(cagnotte[userId].randomByDay[currentDayKey] || 0);
    const weeklyCount = Number(cagnotte[userId].randomByWeek[currentWeek] || 0);

    const dailyRemaining = Math.max(0, settings.randomQuestionsPerDay - dailyCount);
    const weeklyRemaining = Math.max(0, settings.randomQuestionsPerWeek - weeklyCount);

    if (dailyCount >= settings.randomQuestionsPerDay) {
      return res.json({
        ok: true,
        question: null,
        quotaExceeded: "daily",
        dailyRemaining: 0,
        weeklyRemaining,
        dailyLimit: settings.randomQuestionsPerDay,
        weeklyLimit: settings.randomQuestionsPerWeek,
      });
    }

    if (weeklyCount >= settings.randomQuestionsPerWeek) {
      return res.json({
        ok: true,
        question: null,
        quotaExceeded: "weekly",
        dailyRemaining,
        weeklyRemaining: 0,
        dailyLimit: settings.randomQuestionsPerDay,
        weeklyLimit: settings.randomQuestionsPerWeek,
      });
    }

    const userCooldowns = cooldowns[userId] || {};
    const COOLDOWN_DAYS = Number(settings.randomQuestionCooldown || DEFAULT_SETTINGS.randomQuestionCooldown);
    const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const REAPPEAR_CHANCE = 0.05;
    const now = Date.now();

    const canShowQuestion = (questionId) => {
      const lastAnswered = userCooldowns[questionId];
      if (!lastAnswered) return true;
      const elapsed = now - lastAnswered;
      if (elapsed < COOLDOWN_MS) return false;
      return Math.random() < REAPPEAR_CHANCE;
    };

    let availableQuestions = (db.questions || []).filter((q) => {
      if (!q.active) return false;
      if (q.questionnaire) return false;
      if (!canShowQuestion(q.id)) return false;
      return true;
    });

    availableQuestions = availableQuestions.filter((q) => {
      if (!q.tagId) return true;
      const varUserTag = USER_VARIABLE_TAGS.find((t) => t.id === q.tagId);
      if (!varUserTag) return true;

      const fieldValue = user[varUserTag.field];
      const isEmpty = !fieldValue || String(fieldValue).trim() === "";

      if (!isEmpty && !userCooldowns[q.id]) {
        userCooldowns[q.id] = now;
        cooldowns[userId] = userCooldowns;
        writeQuestionCooldowns(cooldowns).catch((err) => console.error("Erreur cooldown:", err));
        return false;
      }

      return isEmpty;
    });

    const answeredTags = new Set();
    (db.answers || []).forEach((answer) => {
      if (answer.userId === userId && answer.questionId) {
        const question = db.questions.find((q) => q.id === answer.questionId);
        if (question && question.tagId) {
          answeredTags.add(question.tagId);
        }
      }
    });

    availableQuestions = availableQuestions.filter((q) => {
      if (!q.tagId) return true;
      if (answeredTags.has(q.tagId)) {
        return canShowQuestion(q.id);
      }
      return true;
    });

    if (availableQuestions.length === 0) {
      return res.json({
        ok: true,
        question: null,
        noQuestionsAvailable: true,
        dailyRemaining,
        weeklyRemaining,
        dailyLimit: settings.randomQuestionsPerDay,
        weeklyLimit: settings.randomQuestionsPerWeek,
      });
    }

    const nRaw = Number(req.query.n || req.query.count || 1);
    const n = Number.isFinite(nRaw) ? Math.max(1, Math.min(10, Math.floor(nRaw))) : 1;

    const nowDt = new Date();
    const priorityAll = availableQuestions.filter((q) => isPriorityActive(q, nowDt));
    const normalAll = availableQuestions.filter((q) => !isPriorityActive(q, nowDt));

    const priorityQuestions = [...priorityAll];
    const normalQuestions = [...normalAll];

    const pickOne = () => {
      if (priorityQuestions.length === 0 && normalQuestions.length === 0) return null;

      let pool = normalQuestions;
      if (priorityQuestions.length > 0) {
        const roll = Math.random();
        if (roll < 1 / 6) pool = priorityQuestions;
        else pool = normalQuestions.length > 0 ? normalQuestions : priorityQuestions;
      } else {
        pool = normalQuestions;
      }

      if (!pool || pool.length === 0) {
        pool = pool === normalQuestions ? priorityQuestions : normalQuestions;
      }
      if (!pool || pool.length === 0) return null;

      const randomIndex = Math.floor(Math.random() * pool.length);
      const selectedQuestion = pool.splice(randomIndex, 1)[0];
      return selectedQuestion || null;
    };

    const questions = [];
    for (let i = 0; i < n; i += 1) {
      const q = pickOne();
      if (!q) break;
      questions.push(q);
    }

    res.json({
      ok: true,
      question: questions[0] || null,
      questions,
      dailyRemaining,
      weeklyRemaining,
      dailyLimit: settings.randomQuestionsPerDay,
      weeklyLimit: settings.randomQuestionsPerWeek,
    });
  } catch (e) {
    console.error("Erreur /api/questions/random:", e);
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Bulk sync answers for questionnaire
router.post("/questionnaire/:questionnaireId/sync-answers", async (req, res) => {
  try {
    const { questionnaireId } = req.params;
    const { userId, userName, answers } = req.body || {};

    const qnId = String(questionnaireId || "").trim();
    const uId = String(userId || "").trim();
    const list = Array.isArray(answers) ? answers : [];

    if (!qnId || !uId) {
      return res.status(400).json({ error: "questionnaireId et userId requis" });
    }
    if (list.length === 0) {
      return res.json({ ok: true, synced: 0 });
    }

    let resolvedUserName = String(userName || "").trim();
    if (!resolvedUserName || resolvedUserName === "Utilisateur") {
      const users = await readUsers();
      const u = users.find((x) => x.id === uId);
      resolvedUserName = String(u?.fullName || `${u?.prenom || ""} ${u?.nom || ""}`.trim()).trim();
    }
    if (!resolvedUserName) resolvedUserName = "Utilisateur";

    const preparedAnswers = [];
    for (const item of list) {
      const qId = String(item?.questionId || "").trim();
      if (!qId) continue;

      let processedAnswer = item.answer ?? "";
      if (processedAnswer && isBase64Image(processedAnswer)) {
        const imageId = `answer_${uId}_${qId}_${Date.now()}`;
        processedAnswer = await storeImage(processedAnswer, imageId);
      }

      preparedAnswers.push({
        questionId: qId,
        questionTitle: String(item.questionTitle || "").trim() || null,
        answer: processedAnswer,
        correct: Boolean(item.correct),
        isCaptcha: Boolean(item.isCaptcha),
      });
    }

    const result = await responsesMutex.runExclusive(async () =>
      mutateResponses(async (r) => {
        let updated = 0;
        let created = 0;

        for (const item of preparedAnswers) {
          const existingIndex = r.answers.findIndex(
            (a) =>
              a.userId === uId &&
              a.questionId === item.questionId &&
              a.questionnaireId === qnId
          );

          if (existingIndex !== -1) {
            r.answers[existingIndex] = {
              ...r.answers[existingIndex],
              userName: resolvedUserName,
              questionTitle: item.questionTitle || r.answers[existingIndex].questionTitle || null,
              answer: item.answer,
              correct: item.correct,
              isCaptcha: item.isCaptcha,
              updatedAt: nowIso(),
            };
            updated += 1;
          } else {
            r.answers.push({
              id: genId("ans"),
              userId: uId,
              userName: resolvedUserName,
              questionnaireId: qnId,
              questionId: item.questionId,
              questionTitle: item.questionTitle,
              answer: item.answer,
              correct: item.correct,
              isCaptcha: item.isCaptcha,
              createdAt: nowIso(),
            });
            created += 1;
          }
        }

        return { ok: true, synced: updated + created, updated, created };
      })
    );

    try {
      const cooldowns = await readQuestionCooldowns();
      cooldowns[uId] = cooldowns[uId] || {};
      for (const item of list) {
        const qId = String(item?.questionId || "").trim();
        if (!qId) continue;
        cooldowns[uId][qId] = Date.now();
      }
      await writeQuestionCooldowns(cooldowns);
    } catch (e) {
      // ignore cooldown errors
    }

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    console.error("[questionnaire/sync-answers] Error:", e);
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Check answered questions in a questionnaire
router.get("/questionnaire/:questionnaireId/answered/:userId", async (req, res) => {
  try {
    const { questionnaireId, userId } = req.params;

    if (!questionnaireId || !userId) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    const responses = await readResponses();
    const userAnswers = responses.answers.filter(
      (ans) => ans.userId === userId && ans.questionnaireId === questionnaireId
    );
    const completions = responses.completions.filter(
      (cmp) => cmp.userId === userId && cmp.questionnaireId === questionnaireId
    );

    const answeredQuestionIds = userAnswers.map((ans) => ans.questionId);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      completed: completions.length > 0,
      answeredQuestionIds,
      answeredCount: answeredQuestionIds.length,
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Append single answer
router.post("/answers/append", async (req, res) => {
  try {
    const b = req.body || {};
    const { userId, userName, questionnaireId, questionId, questionTitle, answer, correct, isCaptcha } = b;
    if (!userId || !questionId) return res.status(400).json({ error: "Paramètres manquants" });

    let resolvedUserName = String(userName || "").trim();
    if (!resolvedUserName || resolvedUserName === "Utilisateur") {
      const users = await readUsers();
      const u = users.find((x) => x.id === String(userId));
      resolvedUserName = String(u?.fullName || `${u?.prenom || ""} ${u?.nom || ""}`.trim()).trim();
    }
    if (!resolvedUserName) resolvedUserName = "Utilisateur";

    let processedAnswer = answer ?? "";
    if (processedAnswer && isBase64Image(processedAnswer)) {
      const imageId = `answer_${userId}_${questionId}_${Date.now()}`;
      processedAnswer = await storeImage(processedAnswer, imageId);
    }

    const result = await responsesMutex.runExclusive(async () =>
      mutateResponses(async (r) => {
        const existingIndex = r.answers.findIndex(
          (a) =>
            a.userId === String(userId) &&
            a.questionId === String(questionId) &&
            (questionnaireId
              ? a.questionnaireId === String(questionnaireId)
              : a.questionnaireId === null || a.questionnaireId === undefined)
        );

        if (existingIndex !== -1) {
          r.answers[existingIndex] = {
            ...r.answers[existingIndex],
            userName: resolvedUserName,
            questionTitle: String(questionTitle || r.answers[existingIndex].questionTitle || "").trim() || null,
            answer: processedAnswer,
            correct: Boolean(correct),
            isCaptcha: Boolean(isCaptcha),
            updatedAt: nowIso(),
          };
        } else {
          r.answers.push({
            id: genId("ans"),
            userId: String(userId),
            userName: resolvedUserName,
            questionnaireId: questionnaireId ? String(questionnaireId) : null,
            questionId: String(questionId),
            questionTitle: String(questionTitle || "").trim() || null,
            answer: processedAnswer,
            correct: Boolean(correct),
            isCaptcha: Boolean(isCaptcha),
            createdAt: nowIso(),
          });
        }

        return { ok: true, updated: existingIndex !== -1 };
      })
    );

    const cooldowns = await readQuestionCooldowns();
    cooldowns[userId] = cooldowns[userId] || {};
    cooldowns[userId][questionId] = Date.now();
    await writeQuestionCooldowns(cooldowns);

    res.json(result);
  } catch (e) {
    console.error("[answers/append] Error:", e);
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Append completion
router.post("/completions/append", async (req, res) => {
  try {
    const b = req.body || {};
    const { userId, userName, questionnaireId } = b;
    if (!userId || !questionnaireId) return res.status(400).json({ error: "Paramètres manquants" });

    let resolvedUserName = String(userName || "").trim();
    if (!resolvedUserName || resolvedUserName === "Utilisateur") {
      const users = await readUsers();
      const u = users.find((x) => x.id === String(userId));
      resolvedUserName = String(u?.fullName || `${u?.prenom || ""} ${u?.nom || ""}`.trim()).trim();
    }
    if (!resolvedUserName) resolvedUserName = "Utilisateur";

    const entry = {
      id: genId("cmp"),
      userId: String(userId),
      userName: resolvedUserName,
      questionnaireId: String(questionnaireId),
      completedAt: nowIso(),
    };

    await responsesMutex.runExclusive(async () =>
      mutateResponses(async (r) => {
        r.completions.push(entry);
        return { ok: true };
      })
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

module.exports = router;

import { isQuestionnaireActive } from "./storage";
function parseDateOnlyMaybe(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function isPriorityActive(q, now = new Date()) {
  const enabled = Boolean(q && (q.priority ?? q.prioritaire));
  if (!enabled) return false;
  const untilRaw = q ? (q.priorityUntil ?? q.prioritaireUntil ?? q.priorityEndDate ?? q.prioritaireFin) : null;
  const dt = parseDateOnlyMaybe(untilRaw);
  if (!dt) return false;
  const end = new Date(dt.getTime());
  end.setHours(23, 59, 59, 999);
  return now.getTime() <= end.getTime();
}

export function formatPriorityUntil(value) {
  const dt = parseDateOnlyMaybe(value);
  if (!dt) return "";
  try {
    return dt.toLocaleDateString('fr-FR');
  } catch {
    // fallback
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
}

export function getQuestionById(db, id) {
  return (db.questions || []).find((q) => q.id === id) || null;
}

export function getQuestionnaireById(db, id) {
  return (db.questionnaires || []).find((q) => q.id === id) || null;
}

export function getVisibleQuestionnairesForUser(db, userId, progressData = null) {
  // Questionnaires explicitement complétés
  const completed = new Set(
    (db.completions || [])
      .filter((c) => c.userId === userId)
      .map((c) => c.questionnaireId)
  );

  // Si on a des données de progression, vérifier aussi les questionnaires totalement répondus
  if (progressData) {
    Object.entries(progressData).forEach(([qnId, progress]) => {
      if (progress && progress.isCompleted) {
        completed.add(qnId);
      }
    });
  }

  return (db.questionnaires || [])
    .filter((qn) => isQuestionnaireActive(qn))
    .filter((qn) => !completed.has(qn.id));
}

export function getActiveQuestionsPool(db) {
  const qnById = new Map((db.questionnaires || []).map((q) => [q.id, q]));
  return (db.questions || []).filter((q) => {
    if (!q.active) return false;
    if (!q.questionnaire) return true;
    const qn = qnById.get(q.questionnaire);
    if (!qn) return false;
    // Si le questionnaire est en statut "unrelease" (non publié), ses questions ne doivent jamais apparaître
    // dans la liste des questions individuelles (peu importe actif/inactif).
    if (qn.unrelease || qn.unreleased || String(qn.status || "").toLowerCase() === "unrelease") return false;
    if (qn.isPrivate) return false;
    // only if questionnaire is NOT active (otherwise server/client locks to inactive)
    return !isQuestionnaireActive(qn);
  });
}

export function getAnswersForQuestionnaire(db, questionnaireId) {
  return (db.answers || []).filter((a) => a.questionnaireId === questionnaireId);
}

export function getAnswersForTag(db, tagId) {
  const qIds = new Set(
    (db.questions || []).filter((q) => q.tagId === tagId).map((q) => q.id)
  );
  return (db.answers || []).filter((a) => qIds.has(a.questionId));
}

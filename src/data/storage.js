export const API_DB_URL = "/api/db";
export const API_AUTH_REGISTER = "/api/auth/register";
export const API_AUTH_LOGIN = "/api/auth/login";
export const API_AUTH_ME = "/api/auth/me";
export const API_AUTH_PASSWORD_RESET_VERIFY = "/api/auth/password-reset/verify";
export const API_AUTH_PASSWORD_RESET = "/api/auth/password-reset";
export const API_EARN_RANDOM = "/api/earn/random";
export const API_SKIP_RANDOM = "/api/skip/random";
export const API_EARN_QUESTIONNAIRE = "/api/earn/questionnaire";
export const API_REQUEST_WITHDRAW = "/api/user/request-withdraw";
export const API_USER_SENSIBLE = "/api/user/sensible";
export const API_USER_ME = "/api/user/me";
export const API_ANS_APPEND = "/api/answers/append";
export const API_CMP_APPEND = "/api/completions/append";
// Bulk safety sync for questionnaire answers
export const API_QN_SYNC_ANSWERS = "/api/questionnaire";

export const API_ADMIN_USERS = "/api/admin/users";
export const API_ADMIN_PAYMENTS = "/api/admin/payments";
export const API_ADMIN_STATISTICS = "/api/admin/statistics";
export const API_ADMIN_SETTINGS = "/api/admin/settings";

function cloneDeep(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

async function fetchJSON(url, options = {}) {
  const tryFetch = async (u) => {
    const res = await fetch(u, {
      // Avoid stale reads after writes (Netlify/edge caches, browser cache)
      cache: options.cache ?? "no-store",
      ...options,
      // Ensure we never drop Content-Type when callers pass their own headers
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
      err.status = res.status;
      err.url = u;
      throw err;
    }
    return res.json();
  };

  // Primary attempt (works locally thanks to CRA proxy, and on Netlify if redirects are configured)
  try {
    return await tryFetch(url);
  } catch (e1) {
    // Netlify fallback: if redirects are missing/misconfigured, call the Function directly.
    // This makes the deployed site more robust without changing the rest of the app.
    const u0 = String(url || "");
    const isApi = u0.startsWith("/api/");
    if (!isApi) throw e1;

    // Attempt 1: keep the /api prefix inside the function path
    //   /api/db  -> /.netlify/functions/api/api/db
    const direct1 = `/.netlify/functions/api${u0}`;
    try {
      return await tryFetch(direct1);
    } catch (e2) {
      // Attempt 2: strip the /api prefix
      //   /api/db  -> /.netlify/functions/api/db
      const direct2 = `/.netlify/functions/api${u0.replace(/^\/api/, "")}`;
      return await tryFetch(direct2);
    }
  }
}

export function getAuthToken() {
  return localStorage.getItem("bni_token") || "";
}

export function setAuthToken(token) {
  if (token) localStorage.setItem("bni_token", token);
  else localStorage.removeItem("bni_token");
}

// Persist last used credentials so the browser can restore the session
// even if the server re-issues a token (ex: serverless cold start).
// NOTE: This stores the password in localStorage.
const CREDS_KEY = "bni_creds";

export function saveCredentials({ prenom, nom, motDePasse }) {
  try {
    const payload = {
      prenom: String(prenom || "").trim(),
      nom: String(nom || "").trim(),
      motDePasse: String(motDePasse || "").trim(),
      savedAt: new Date().toISOString(),
    };
    // Only store if all fields are present
    if (!payload.prenom || !payload.nom || !payload.motDePasse) return;
    localStorage.setItem(CREDS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function getSavedCredentials() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    const prenom = String(p.prenom || "").trim();
    const nom = String(p.nom || "").trim();
    const motDePasse = String(p.motDePasse || "").trim();
    if (!prenom || !nom || !motDePasse) return null;
    return { prenom, nom, motDePasse };
  } catch {
    return null;
  }
}

export function clearSavedCredentials() {
  try {
    localStorage.removeItem(CREDS_KEY);
  } catch {
    // ignore
  }
}

export async function authRegister(payload) {
  return fetchJSON(API_AUTH_REGISTER, { method: "POST", body: JSON.stringify(payload) });
}

export async function authLogin(payload) {
  return fetchJSON(API_AUTH_LOGIN, { method: "POST", body: JSON.stringify(payload) });
}

export async function authMe() {
  const token = getAuthToken();
  return fetchJSON(API_AUTH_ME, { headers: { Authorization: `Bearer ${token}` } });
}

// Password reset ("Mot de passe oublié ?")
export async function passwordResetVerify({ prenom, nom, dateNaissance, compteBancaire }) {
  return fetchJSON(API_AUTH_PASSWORD_RESET_VERIFY, {
    method: "POST",
    body: JSON.stringify({ prenom, nom, dateNaissance, compteBancaire }),
  });
}

export async function passwordResetSet({ prenom, nom, dateNaissance, compteBancaire, nouveauMotDePasse }) {
  return fetchJSON(API_AUTH_PASSWORD_RESET, {
    method: "POST",
    body: JSON.stringify({ prenom, nom, dateNaissance, compteBancaire, nouveauMotDePasse }),
  });
}

export async function earnRandom(userId) {
  return fetchJSON(API_EARN_RANDOM, { method: "POST", body: JSON.stringify({ userId }) });
}

export async function skipRandom(userId) {
  return fetchJSON(API_SKIP_RANDOM, { method: "POST", body: JSON.stringify({ userId }) });
}

export async function earnQuestionnaire(userId, amount) {
  return fetchJSON(API_EARN_QUESTIONNAIRE, { method: "POST", body: JSON.stringify({ userId, amount }) });
}

export async function appendAnswer(entry) {
  return fetchJSON(API_ANS_APPEND, { method: "POST", body: JSON.stringify(entry || {}) });
}

export async function appendCompletion(entry) {
  return fetchJSON(API_CMP_APPEND, { method: "POST", body: JSON.stringify(entry || {}) });
}

export async function requestWithdraw(userId) {
  return fetchJSON(API_REQUEST_WITHDRAW, { method: "POST", body: JSON.stringify({ userId }) });
}

export async function recordSensible(userId, tagName, answer, questionId, questionTitle, isCaptcha = false) {
  return fetchJSON(API_USER_SENSIBLE, { method: "POST", body: JSON.stringify({ userId, tagName, answer, questionId, questionTitle, isCaptcha }) });
}

export async function updateMe(patch) {
  const token = getAuthToken();
  return fetchJSON(API_USER_ME, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch || {}),
  });
}

export async function adminListUsers() {
  return fetchJSON(API_ADMIN_USERS);
}

export async function adminUpdateUser(userId, patch) {
  return fetchJSON(`${API_ADMIN_USERS}/${userId}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function adminListPayments() {
  // Cache-buster to avoid any intermediate caching of the payments list
  return fetchJSON(`${API_ADMIN_PAYMENTS}?_=${Date.now()}`);
}

export async function adminValidatePayment(paymentId) {
  return fetchJSON(`${API_ADMIN_PAYMENTS}/${paymentId}/validate`, { method: "POST", body: JSON.stringify({}) });
}

export async function adminCancelPayment(paymentId) {
  return fetchJSON(`${API_ADMIN_PAYMENTS}/${paymentId}/cancel`, { method: "POST", body: JSON.stringify({}) });
}

export async function adminGetStatistics() {
  return fetchJSON(API_ADMIN_STATISTICS);
}

/**
 * Get list of answered question IDs for a user in a specific questionnaire
 * @param {string} questionnaireId 
 * @param {string} userId 
 * @returns {Promise} { ok: boolean, answeredQuestionIds: string[], completed: boolean }
 */
export async function getAnsweredQuestionsInQuestionnaire(questionnaireId, userId) {
  try {
    // Cache-buster to avoid any intermediate caching of user-specific progress
    const url = `/api/questionnaires/${questionnaireId}/questions?userId=${encodeURIComponent(userId)}&_=${Date.now()}`;
    const result = await fetchJSON(url);
    return {
      ok: result.ok || false,
      answeredQuestionIds: result.answeredQuestionIds || [],
      completed: result.completed || false
    };
  } catch (e) {
    console.error('[getAnsweredQuestionsInQuestionnaire] Error:', e);
    return { ok: false, answeredQuestionIds: [], completed: false };
  }
}

/**
 * Get progress for all questionnaires for a user
 * @param {string} userId 
 * @returns {Promise} { ok: boolean, progress: { [qnId]: { totalQuestions, answeredCount, isCompleted, remaining } } }
 */
export async function getUserQuestionnairesProgress(userId) {
  try {
    const url = `/api/user/${userId}/questionnaires-progress`;
    const result = await fetchJSON(url);
    return {
      ok: result.ok || false,
      progress: result.progress || {}
    };
  } catch (e) {
    console.error('[getUserQuestionnairesProgress] Error:', e);
    return { ok: false, progress: {} };
  }
}

/**
 * Validate and complete a questionnaire (checks all questions are answered)
 * @param {string} questionnaireId 
 * @param {string} userId 
 * @returns {Promise} 
 */
export async function validateQuestionnaire(questionnaireId, userId) {
  try {
    const url = `/api/questionnaire/${questionnaireId}/validate`;
    const result = await fetchJSON(url, { 
      method: "POST", 
      body: JSON.stringify({ userId }) 
    });
    return result;
  } catch (e) {
    console.error('[validateQuestionnaire] Error:', e);
    return { ok: false, error: e.message };
  }
}

/**
 * Mark a questionnaire as completed (for sync purposes)
 * @param {string} questionnaireId 
 * @param {string} userId 
 * @returns {Promise}
 */
export async function markQuestionnaireCompleted(questionnaireId, userId) {
  try {
    const url = `/api/questionnaire/${questionnaireId}/mark-completed`;
    const result = await fetchJSON(url, { 
      method: "POST", 
      body: JSON.stringify({ userId }) 
    });
    return result;
  } catch (e) {
    console.error('[markQuestionnaireCompleted] Error:', e);
    return { ok: false, error: e.message };
  }
}

/**
 * Sync a whole questionnaire answers payload (client local backup) to the server.
 * Used as a safety-net at the end of a questionnaire (and can also repair
 * partially-saved sessions).
 *
 * @param {string} questionnaireId
 * @param {string} userId
 * @param {Array<{questionId:string, questionTitle?:string|null, answer:any, isCaptcha?:boolean}>} answers
 * @param {string} userName
 */
export async function syncQuestionnaireAnswers(questionnaireId, userId, answers = [], userName = "") {
  try {
    const qnId = String(questionnaireId || "").trim();
    const uId = String(userId || "").trim();
    if (!qnId || !uId) return { ok: false, error: "missing questionnaireId/userId" };

    const url = `${API_QN_SYNC_ANSWERS}/${encodeURIComponent(qnId)}/sync-answers`;
    return await fetchJSON(url, {
      method: "POST",
      body: JSON.stringify({ userId: uId, userName: String(userName || "").trim(), answers: Array.isArray(answers) ? answers : [] }),
    });
  } catch (e) {
    console.error('[syncQuestionnaireAnswers] Error:', e);
    return { ok: false, error: e.message };
  }
}

export async function loadSettings() {
  return fetchJSON(API_ADMIN_SETTINGS);
}

export async function saveSettings(settings) {
  return fetchJSON(API_ADMIN_SETTINGS, { 
    method: "PUT", 
    body: JSON.stringify(settings) 
  });
}

export function newId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

/**
 * Resize an image to max 500px height while maintaining aspect ratio
 * @param {string} base64Image - Base64 encoded image
 * @param {number} maxHeight - Maximum height (default 500px)
 * @returns {Promise<string>} - Resized base64 image
 */
export async function resizeImage(base64Image, maxHeight = 500) {
  return new Promise((resolve, reject) => {
    // Create an image element
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;
      
      // Only resize if image is taller than maxHeight
      if (height <= maxHeight) {
        resolve(base64Image);
        return;
      }
      
      // Calculate new dimensions maintaining aspect ratio
      const ratio = maxHeight / height;
      width = Math.round(width * ratio);
      height = maxHeight;
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      // Draw resized image
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert back to base64
      try {
        const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85); // 85% quality for good balance
        resolve(resizedBase64);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = base64Image;
  });
}

export function isExpired(endDate) {
  if (!endDate) return false;
  const t = new Date(endDate).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

export function isQuestionnaireActive(qn) {
  // Un questionnaire "unrelease" (non publié) n'est jamais actif sur le site
  if (qn && (qn.unrelease || qn.unreleased || String(qn.status || "").toLowerCase() === "unrelease")) return false;
  return Boolean(qn && qn.visible) && !isExpired(qn.endDate);
}

const asArray = (v) =>
  Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];

function normalizeDB(db) {
  if (!db) return null;

  db.tags = asArray(db.tags);
  db.questions = asArray(db.questions);
  db.questionnaires = asArray(db.questionnaires);
  db.answers = asArray(db.answers);
  db.completions = asArray(db.completions);

  // migrate questions to new format
  db.questions = db.questions.map((q) => {
    const questionnaireId =
      q.questionnaire ??
      q.questionnaireId ??
      q.sourceQuestionnaireId ??
      null;

    const allowed = new Set(["FREE_TEXT", "QCM", "DROPDOWN", "CHECKBOX", "SLIDER", "PHOTO"]);
    let type = String(q.type || "FREE_TEXT").trim().toUpperCase();
    if (!allowed.has(type)) type = q.type === "QCM" ? "QCM" : "FREE_TEXT";
    const hasChoices = type === "QCM" || type === "DROPDOWN" || type === "CHECKBOX";

    let checkboxMode = null;
    if (type === "CHECKBOX") {
      const raw = String(q.checkboxMode || q.checkboxmode || "").trim().toUpperCase();
      if (raw === "SINGLE" || raw === "UNIQUE") checkboxMode = "SINGLE";
      else if (raw === "MULTI" || raw === "MULTIPLE") checkboxMode = "MULTI";
      else if (q.checkboxMultiple === false || q.allowMultiple === false) checkboxMode = "SINGLE";
      else checkboxMode = "MULTI";
    }

    let sliderMin = null;
    let sliderMax = null;
    if (type === "SLIDER") {
      const a = Number(q.sliderMin ?? q.slidermin ?? q.start ?? 0);
      const b = Number(q.sliderMax ?? q.slidermax ?? q.end ?? 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        sliderMin = Math.min(a, b);
        sliderMax = Math.max(a, b);
      } else {
        sliderMin = 0;
        sliderMax = 10;
      }
    }

    return {
      id: q.id,
      title: q.title || "Sans titre",
      type,
      correctAnswer: q.correctAnswer ?? null,
      // FREE_TEXT only: if true, user can only enter digits.
      digitsOnly: type === "FREE_TEXT" ? Boolean(q.digitsOnly ?? q.freeTextDigitsOnly ?? q.onlyDigits) : false,
      imageUrl: q.imageUrl ?? null,
      importance: q.importance || (q.sensitive ? "SENSIBLE" : "SENSIBLE"),
      tagId: q.tagId ?? null,
      // Priority (individual questions only)
      priority: Boolean(q.priority ?? q.prioritaire) && !questionnaireId,
      priorityUntil: questionnaireId
        ? null
        : (q.priorityUntil ?? q.prioritaireUntil ?? q.priorityEndDate ?? q.prioritaireFin ?? null),
      active: Boolean(q.active),
      questionnaire: questionnaireId,
      forcedInactiveByQuestionnaire: Boolean(q.forcedInactiveByQuestionnaire),
      createdAt: q.createdAt || new Date().toISOString(),
      updatedAt: q.updatedAt || new Date().toISOString(),

      checkboxMode,
      sliderMin,
      sliderMax,

      choices: hasChoices
        ? asArray(q.choices).map((c, idx) => ({
            id: c.id || `c_${idx + 1}`,
            text: c.text || "",
            isCorrect: Boolean(c.isCorrect),
          }))
        : [],
    };
  });

  db.questionnaires = db.questionnaires.map((qn) => ({
    id: qn.id,
    name: qn.name || "Sans nom",
    reward: Number(qn.reward || 0),
    visible: Boolean(qn.visible),
    // New status field
    unrelease: Boolean(qn.unrelease ?? qn.unreleased ?? (String(qn.status || "").toLowerCase() === "unrelease")),
    endDate: qn.endDate || null,
    isPrivate: Boolean(qn.isPrivate),
    code: qn.code || "",
    // Order is persisted on the server in questionnaire.json via `questionorder`.
    // Keep `questionOrder` (camelCase) for UI code compatibility.
    questionOrder: asArray(qn.questionorder ?? qn.questionOrder ?? qn.questionIds),
    questionorder: asArray(qn.questionorder ?? qn.questionOrder ?? qn.questionIds),
    createdAt: qn.createdAt || new Date().toISOString(),
    updatedAt: qn.updatedAt || new Date().toISOString(),
  }));

  const qnById = new Map(db.questionnaires.map((q) => [q.id, q]));

  // ensure questionnaire.questionOrder includes all linked questions
  for (const q of db.questions) {
    if (q.questionnaire && qnById.has(q.questionnaire)) {
      const qn = qnById.get(q.questionnaire);
      qn.questionOrder = asArray(qn.questionOrder);
      qn.questionorder = asArray(qn.questionorder);
      if (!qn.questionOrder.includes(q.id)) qn.questionOrder.push(q.id);
      if (!qn.questionorder.includes(q.id)) qn.questionorder.push(q.id);
    }
  }

  // apply questionnaire->question active lock/unlock logic (mirrors server)
  db.questions = db.questions.map((q) => {
    if (!q.questionnaire) return q;
    const qn = qnById.get(q.questionnaire);
    if (!qn) return q;

    const qnUnreleased = Boolean(qn && (qn.unrelease || qn.unreleased || String(qn.status || "").toLowerCase() === "unrelease"));
    const qnActive = isQuestionnaireActive(qn);

    // If questionnaire is unreleased (non publié), its questions must always be inactive
    if (qnUnreleased) {
      if (q.active) return { ...q, active: false, forcedInactiveByQuestionnaire: true };
      return { ...q, active: false };
    }

    // If questionnaire is active, lock linked questions to inactive
    if (qnActive) {
      if (q.active) return { ...q, active: false, forcedInactiveByQuestionnaire: true };
      return { ...q, active: false };
    }

    // When questionnaire is not active AND not unreleased, restore only questions that were forced inactive
    if (q.forcedInactiveByQuestionnaire) {
      return { ...q, active: true, forcedInactiveByQuestionnaire: false };
    }

    return q;
  });

  return db;
}

const DB_CACHE_MS = 5000;
const dbCacheByScope = new Map();
let inflightDb = null;
let inflightScope = null;

/**
 * Clear the DB cache to force reload
 * Call this after any modification to the database
 */
export function clearDBCache() {
  console.log('🔄 Invalidation du cache DB');
  dbCacheByScope.clear();
  inflightDb = null;
  inflightScope = null;
}

export async function loadDB(options = {}) {
  const scope = String(options.scope || "").trim().toLowerCase();
  const cacheKey = scope || "full";
  const now = Date.now();
  const cached = dbCacheByScope.get(cacheKey);
  if (!options.force && cached && now - cached.at < DB_CACHE_MS) {
    return cached.db;
  }
  if (inflightDb && inflightScope === cacheKey) return inflightDb;

  // When forcing a reload (typically after an admin write), also bypass any
  // intermediate/browser caches via a cache-busting query param.
  // The server (api/db) also uses this to skip its own in-memory cache.
  const cacheBust = options.force ? `&_=${Date.now()}` : "";
  const url = scope
    ? `${API_DB_URL}?scope=${encodeURIComponent(scope)}${cacheBust}`
    : `${API_DB_URL}${options.force ? `?_=${Date.now()}` : ""}`;
  inflightScope = cacheKey;
  inflightDb = fetchJSON(url, options.force ? { cache: "no-store" } : {})
    .then((db) => normalizeDB(db))
    .then((db) => {
      dbCacheByScope.set(cacheKey, { db, at: Date.now() });
      return db;
    })
    .finally(() => {
      inflightDb = null;
      inflightScope = null;
    });
  return inflightDb;
}

/**
 * Progressive loading: load minimal data first, then full data in background
 * Returns initial data immediately and updates callback when full data is loaded
 */
export async function loadDBProgressive(onFullDataLoaded) {
  // Phase 1: Load minimal data (only active questions and visible questionnaires)
  const minimalDb = await loadDB({ scope: "minimal", force: true });
  
  // Phase 2: Load full public data in background
  if (onFullDataLoaded) {
    loadDB({ scope: "public", force: true })
      .then((fullDb) => {
        onFullDataLoaded(fullDb);
      })
      .catch((e) => {
        console.error("[loadDBProgressive] Failed to load full data:", e);
      });
  }
  
  return minimalDb;
}

export async function saveDB(db) {
  const normalized = normalizeDB(db);
  const res = await fetchJSON(API_DB_URL, {
    method: "PUT",
    body: JSON.stringify(normalized),
  });
  const next = normalizeDB(res);
  dbCacheByScope.set("full", { db: next, at: Date.now() });
  return next;
}

/**
 * Get list of question IDs that the user has already answered in a questionnaire (local version)
 * @param {string} userId 
 * @param {string} questionnaireId 
 * @param {Array} answers - Array of answer objects from DB
 * @returns {Set} Set of answered question IDs
 */
export function filterAnsweredQuestionsLocal(userId, questionnaireId, answers) {
  if (!userId || !questionnaireId || !Array.isArray(answers)) {
    return new Set();
  }
  
  const answeredIds = new Set();
  
  for (const ans of answers) {
    if (ans.userId === userId && ans.questionnaireId === questionnaireId && ans.questionId) {
      answeredIds.add(ans.questionId);
    }
  }
  
  return answeredIds;
}

/**
 * Update optimistic (UI instant), then persist to server.
 * The updater can mutate draft OR return a new object.
 */
export function updateDB(currentDB, updater) {
  const draft = cloneDeep(currentDB);
  const maybe = updater(draft);
  const next = normalizeDB(maybe || draft);

  next.meta = next.meta || {};
  next.meta.updatedAt = new Date().toISOString();

  // IMPORTANT:
  // AdminPage triggers a short "re-sync" loadDB() right after calling updateDB().
  // If we don't update the in-memory cache immediately, loadDB() can return
  // stale cached data (client cache or server cache) and the UI looks like it
  // "reverted" the edit for a second.
  try {
    dbCacheByScope.set("full", { db: next, at: Date.now() });
    // Any inflight request for the same scope is now obsolete.
    if (inflightScope === "full") {
      inflightDb = null;
      inflightScope = null;
    }
  } catch {
    // ignore
  }

  // IMPORTANT:
  // On ne persiste PLUS ici. L'ancien comportement (saveDB + re-sync) provoquait
  // un "rollback" visuel quand une lecture juste après écriture renvoyait une
  // version stale (cache/réplication). La persistance est maintenant pilotée
  // par la page Admin (elle applique la réponse du PUT /api/db comme source de vérité).
  return next;
}

/**
 * Delete user and all associated data
 * @param {string} userId - ID of user to delete
 * @returns {Promise} Response from server
 */
export async function adminDeleteUser(userId) {
  const result = await fetchJSON(`${API_ADMIN_USERS}/${userId}`, { method: "DELETE" });
  if (result && result.ok) {
    clearDBCache(); // Invalider le cache après suppression
  }
  return result;
}

/**
 * Delete a specific answer
 * @param {string} answerId - ID of answer to delete
 * @returns {Promise} Response from server
 */
export async function adminDeleteAnswer(answerId) {
  const result = await fetchJSON(`/api/admin/answers/${answerId}`, { method: "DELETE" });
  if (result && result.ok) {
    clearDBCache(); // Invalider le cache après suppression
  }
  return result;
}

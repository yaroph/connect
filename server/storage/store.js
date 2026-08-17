const path = require("path");
let fs = null;
try {
  fs = require("fs/promises");
} catch (_) {
  // safe fallback
}

const {
  DATA_DIR,
  DEFAULT_SETTINGS,
  USER_VARIABLE_TAGS,
  USER_VARIABLE_TAG_IDS,
  USER_VARIABLE_TAG_NAMES_LOWER,
} = require("../config/constants");
const { getBlobsStore, isBlobsEnabled, disableBlobs } = require("./blobs");
const { encryptPassword, genId } = require("../utils/crypto");
const { nowIso, asArray } = require("../utils/helpers");
const { isBase64Image, storeImage } = require("./images");

function keyOrPath(filename) {
  return isBlobsEnabled() ? filename : path.join(DATA_DIR, filename);
}

function resolveFsPath(filePath) {
  const fp = String(filePath || "");
  if (!fp) return DATA_DIR;
  return path.isAbsolute(fp) ? fp : path.join(DATA_DIR, fp);
}

const QUESTIONS_PATH = "question.json";
const QUESTIONNAIRES_PATH = "questionnaire.json";
const TAGS_PATH = "tag.json";
const RESPONSES_PATH = "reponses.json";
const USERS_PATH = "utilisateur.json";
const CAGNOTTE_PATH = "cagnotte.json";
const ADMIN_MONEY_PATH = "argentadmin.json";
const QUESTION_COOLDOWNS_PATH = "questionCooldowns.json";
const SETTINGS_PATH = "settings.json";

// Mutex class for concurrent operations
class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }

  async acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    } else {
      this.locked = false;
    }
  }

  async runExclusive(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const responsesMutex = new Mutex();
const stateMutex = new Mutex();

async function runStateExclusive(fn) {
  return stateMutex.runExclusive(fn);
}

// In-memory cache
const simpleCache = {
  data: new Map(),
  ttl: 10000, // 10s default

  set(key, value, customTtl) {
    const ttl = customTtl !== undefined ? customTtl : this.ttl;
    this.data.set(key, { value, expires: Date.now() + ttl });
  },

  get(key) {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  },

  clear() {
    this.data.clear();
  },

  invalidate(key) {
    this.data.delete(key);
  },
};

function invalidateCache(type) {
  switch (type) {
    case "settings":
      simpleCache.invalidate("settings");
      break;
    case "responses":
      simpleCache.invalidate("db:full");
      break;
    case "questions":
      simpleCache.invalidate("activeQuestions");
      simpleCache.invalidate("db:minimal");
      simpleCache.invalidate("db:public");
      simpleCache.invalidate("db:full");
      break;
    case "users":
      simpleCache.invalidate("users");
      break;
    case "cagnotte":
      simpleCache.invalidate("cagnotte");
      break;
    default:
      simpleCache.clear();
  }
}

async function ensureDir() {
  if (isBlobsEnabled()) return;
  if (!fs) throw new Error("Filesystem persistence requested but fs/promises is not available");
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  const filename = path.basename(String(filePath));
  if (isBlobsEnabled()) {
    try {
      const store = await getBlobsStore();
      if (!store) throw new Error("Netlify Blobs store not initialized");
      try {
        const data = await store.get(filename, { type: "json" });
        if (data === null || data === undefined) {
          await writeJson(filename, fallback);
          return fallback;
        }
        return data;
      } catch (e) {
        await writeJson(filename, fallback);
        return fallback;
      }
    } catch (e) {
      disableBlobs();
      console.warn("[storage] Netlify Blobs indisponible, bascule vers le filesystem:", e.message);
    }
  }

  try {
    await ensureDir();
    const fsPath = resolveFsPath(filename);
    const raw = await fs.readFile(fsPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.name === "SyntaxError")) {
      await writeJson(filename, fallback);
      return fallback;
    }
    throw e;
  }
}

const writeQueues = new Map();

async function writeJson(filePath, data) {
  const filename = path.basename(String(filePath));
  const prev = writeQueues.get(filename) || Promise.resolve();
  const next = prev.then(async () => {
    if (isBlobsEnabled()) {
      try {
        const store = await getBlobsStore();
        if (!store) throw new Error("Netlify Blobs store not initialized");
        await store.setJSON(filename, data);
        return;
      } catch (e) {
        disableBlobs();
        console.warn("[storage] Netlify Blobs indisponible, bascule vers le filesystem:", e.message);
      }
    }

    await ensureDir();
    const fsPath = resolveFsPath(filename);
    await fs.mkdir(path.dirname(fsPath), { recursive: true });
    const tmp = fsPath + "." + process.pid + "." + Date.now() + "." + Math.random().toString(16).slice(2) + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    try {
      await fs.rename(tmp, fsPath);
    } catch (e) {
      try { await fs.unlink(fsPath); } catch (_) {}
      await fs.rename(tmp, fsPath);
    }
  });

  writeQueues.set(filename, next.catch(() => {}));
  return next;
}

function normalizeUser(u) {
  const digitsOnly = (v) => String(v || "").replace(/\D+/g, "");
  const id = u.id || genId("u");
  const prenom = (u.prenom || u.firstName || "").toString().trim();
  const nom = (u.nom || u.lastName || "").toString().trim();
  const fullName = (u.fullName || `${prenom} ${nom}`.trim()).trim() || "Utilisateur";

  const rawPass = (u.motDePasse || u.password || "").toString();
  const motDePasse = encryptPassword(rawPass);

  return {
    id,
    prenom,
    nom,
    fullName,
    compteBancaire: digitsOnly((u.compteBancaire || u.bankAccount || "").toString()),
    dateNaissance: (u.dateNaissance || u.birthDate || "").toString(),
    telephone: digitsOnly((u.telephone || u.phone || "").toString()),
    motDePasse,
    photoProfil: u.photoProfil || u.avatarUrl || "",
    numeroCitoyen: digitsOnly((u.numeroCitoyen || u.citizenNumber || "").toString()),
    sexe: u.sexe || "",
    couleurPeau: u.couleurPeau || "",
    couleurCheveux: u.couleurCheveux || "",
    longueurCheveux: u.longueurCheveux || "",
    styleVestimentaire: u.styleVestimentaire || "",
    metier: u.metier || "",
    gagneSurBNI: Number(u.gagneSurBNI || 0),
    is_admin: Boolean(u.is_admin || false),
    token: u.token || "",
    retrait: u.retrait || { status: "IDLE", amount: 0, requestedAt: null },
    lastLoginAt: u.lastLoginAt || null,
    loginByDay: u.loginByDay && typeof u.loginByDay === "object" ? u.loginByDay : {},
    withdrawalsByMonth:
      u.withdrawalsByMonth && typeof u.withdrawalsByMonth === "object" ? u.withdrawalsByMonth : {},
    sensibleAnswersTagged: Array.isArray(u.sensibleAnswersTagged) ? u.sensibleAnswersTagged : [],
    sensibleAnswersUntagged: Array.isArray(u.sensibleAnswersUntagged) ? u.sensibleAnswersUntagged : [],
    createdAt: u.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeQuestion(q) {
  const id = q.id || genId("q");
  const allowed = new Set(["FREE_TEXT", "QCM", "DROPDOWN", "CHECKBOX", "SLIDER", "PHOTO"]);
  let type = String(q.type || "").trim().toUpperCase();
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
    id,
    title: (q.title || "").trim() || "Sans titre",
    type,
    correctAnswer: q.correctAnswer ?? null,
    digitsOnly: type === "FREE_TEXT" ? Boolean(q.digitsOnly ?? q.freeTextDigitsOnly ?? q.onlyDigits) : false,
    imageUrl: q.imageUrl ?? null,
    importance: q.importance === "CAPTCHA" ? "CAPTCHA" : "SENSIBLE",
    tagId: q.tagId ?? null,
    priority: Boolean(q.priority ?? q.prioritaire) && !(q.questionnaire ?? null),
    priorityUntil: (q.questionnaire ?? null) ? null : (q.priorityUntil ?? q.prioritaireUntil ?? q.priorityEndDate ?? q.prioritaireFin ?? null),
    active: Boolean(q.active),
    questionnaire: q.questionnaire ?? null,
    forcedInactiveByQuestionnaire: Boolean(q.forcedInactiveByQuestionnaire),
    createdAt: q.createdAt || nowIso(),
    updatedAt: q.updatedAt || nowIso(),
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
}

function normalizeQuestionnaire(qn) {
  const id = qn.id || genId("qn");
  const questionorder = asArray(qn.questionorder ?? qn.questionOrder ?? qn.questionIds).map(String);
  const unrelease = Boolean(
    qn?.unrelease ?? qn?.unreleased ?? (String(qn?.status || "").toLowerCase() === "unrelease")
  );
  return {
    id,
    name: (qn.name || "").trim() || "Sans nom",
    reward: Number(qn.reward || 0),
    visible: Boolean(qn.visible),
    unrelease,
    endDate: qn.endDate ?? null,
    isPrivate: Boolean(qn.isPrivate),
    code: qn.code || "",
    questionIds: asArray(qn.questionIds).map(String),
    questionorder,
    createdAt: qn.createdAt || nowIso(),
    updatedAt: qn.updatedAt || nowIso(),
  };
}

function normalizeTag(t) {
  const id = t.id || genId("t");
  return { id, name: (t.name || "").trim() || "Sans nom", createdAt: t.createdAt || nowIso() };
}

function normalizeResponsesPayload(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  return {
    answers: asArray(p.answers),
    completions: asArray(p.completions),
  };
}

async function ensureFiles() {
  await ensureDir();

  const seedTags = [
    { id: "t_fun", name: "Fun", createdAt: nowIso() },
    { id: "t_state", name: "État", createdAt: nowIso() },
    { id: "t_newyear", name: "Nouvel an", createdAt: nowIso() },
  ];

  const existingTags = asArray(await readJson(TAGS_PATH, seedTags));
  const byName = new Map(existingTags.map((t) => [String(t.name || "").trim().toLowerCase(), t]));
  const merged = [...existingTags];
  for (const t of seedTags) {
    if (!byName.has(String(t.name || "").trim().toLowerCase())) merged.push(t);
  }
  await writeJson(TAGS_PATH, merged);

  await readJson(QUESTIONS_PATH, []);
  await readJson(QUESTIONNAIRES_PATH, []);
  await readJson(USERS_PATH, []);
  await readJson(CAGNOTTE_PATH, {});
  await readJson(ADMIN_MONEY_PATH, []);
  await readJson(RESPONSES_PATH, { answers: [], completions: [] });
  await readJson(QUESTION_COOLDOWNS_PATH, {});
  await readJson(SETTINGS_PATH, DEFAULT_SETTINGS);
}

let ensureFilesPromise = null;
async function ensureFilesOnce() {
  if (!ensureFilesPromise) {
    ensureFilesPromise = ensureFiles().catch((err) => {
      ensureFilesPromise = null;
      throw err;
    });
  }
  return ensureFilesPromise;
}

async function readUsers() {
  await ensureFilesOnce();
  const raw = asArray(await readJson(USERS_PATH, []));
  const users = raw.map(normalizeUser);
  if (!isBlobsEnabled()) {
    await writeJson(USERS_PATH, users);
  }
  return users;
}

async function writeUsers(users) {
  await ensureFilesOnce();
  const norm = asArray(users).map(normalizeUser);
  await writeJson(USERS_PATH, norm);
  return norm;
}

async function readCagnotte() {
  await ensureFilesOnce();
  const c = await readJson(CAGNOTTE_PATH, {});
  return c && typeof c === "object" ? c : {};
}

async function writeCagnotte(c) {
  await ensureFilesOnce();
  await writeJson(CAGNOTTE_PATH, c && typeof c === "object" ? c : {});
}

async function readAdminMoney() {
  await ensureFilesOnce();
  const list = asArray(await readJson(ADMIN_MONEY_PATH, [])).map((p) => ({
    id: p.id || genId("pay"),
    userId: p.userId,
    fullName: p.fullName || "",
    compteBancaire: p.compteBancaire || "",
    telephone: p.telephone || "",
    amount: Number(p.amount || 0),
    createdAt: p.createdAt || nowIso(),
  }));
  if (!isBlobsEnabled()) {
    await writeJson(ADMIN_MONEY_PATH, list);
  }
  return list;
}

async function writeAdminMoney(list) {
  await ensureFilesOnce();
  await writeJson(ADMIN_MONEY_PATH, asArray(list));
}

async function getBlobJsonWithMetadata(filePath, fallback, { preferStrong = false } = {}) {
  const store = await getBlobsStore();
  if (!store) throw new Error("Netlify Blobs store not initialized");

  const key = path.basename(String(filePath));
  const load = async (options = {}) => {
    const entry = await store.getWithMetadata(key, { type: "json", ...options });
    if (!entry) return null;
    return {
      data: entry.data,
      etag: entry.etag,
      metadata: entry.metadata,
    };
  };

  try {
    const entry = preferStrong ? await load({ consistency: "strong" }) : await load();
    if (entry) return entry;
  } catch (e) {
    if (!preferStrong) throw e;
  }

  if (preferStrong) {
    try {
      const fallbackEntry = await load();
      if (fallbackEntry) return fallbackEntry;
    } catch (e) {
      throw e;
    }
  }

  return {
    data: fallback,
    etag: null,
    metadata: null,
  };
}

async function readResponses() {
  await ensureFilesOnce();
  if (isBlobsEnabled()) {
    try {
      const entry = await getBlobJsonWithMetadata(RESPONSES_PATH, { answers: [], completions: [] }, { preferStrong: true });
      return normalizeResponsesPayload(entry && entry.data ? entry.data : entry);
    } catch (e) {
      disableBlobs();
      console.warn("[storage] Netlify Blobs indisponible, bascule vers le filesystem:", e.message);
    }
  }

  const r = await readJson(RESPONSES_PATH, { answers: [], completions: [] });
  return normalizeResponsesPayload(r);
}

async function mutateResponses(mutator, { attempts = 8 } = {}) {
  const applyMutation = async (current) => {
    const draft = normalizeResponsesPayload(current);
    const before = JSON.stringify(draft);
    const result = await mutator(draft);
    const payload = normalizeResponsesPayload(draft);
    const changed = before !== JSON.stringify(payload);
    return { payload, result, changed };
  };

  if (isBlobsEnabled()) {
    try {
      const store = await getBlobsStore();
      if (!store) throw new Error("Netlify Blobs store not initialized");
      const key = path.basename(String(RESPONSES_PATH));

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const entry = await getBlobJsonWithMetadata(RESPONSES_PATH, { answers: [], completions: [] }, { preferStrong: true });
        const current = normalizeResponsesPayload(entry && entry.data ? entry.data : entry);
        const { payload, result, changed } = await applyMutation(current);

        if (!changed) {
          return result;
        }

        const writeOptions = entry && entry.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true };
        const writeResult = await store.setJSON(key, payload, writeOptions);
        if (writeResult && writeResult.modified === false) {
          continue;
        }

        invalidateCache("responses");
        return result;
      }

      throw new Error("Conflit d'écriture sur reponses.json (CAS retries exceeded)");
    } catch (e) {
      if (String(e && e.message ? e.message : e).includes("CAS retries exceeded")) {
        throw e;
      }
      disableBlobs();
      console.warn("[storage] Netlify Blobs indisponible, bascule vers le filesystem:", e.message);
    }
  }

  const current = await readResponses();
  const { payload, result } = await applyMutation(current);
  await writeResponses(payload);
  return result;
}

async function writeResponses(payload) {
  await ensureFilesOnce();
  const p = normalizeResponsesPayload(payload);
  await writeJson(RESPONSES_PATH, {
    answers: p.answers,
    completions: p.completions,
  });
  invalidateCache("responses");
}

async function readQuestionCooldowns() {
  await ensureFilesOnce();
  const cooldowns = await readJson(QUESTION_COOLDOWNS_PATH, {});
  return cooldowns && typeof cooldowns === "object" ? cooldowns : {};
}

async function writeQuestionCooldowns(cooldowns) {
  await ensureFilesOnce();
  await writeJson(QUESTION_COOLDOWNS_PATH, cooldowns && typeof cooldowns === "object" ? cooldowns : {});
}

async function readSettings() {
  await ensureFilesOnce();
  const cached = simpleCache.get("settings");
  if (cached) return cached;

  const raw = await readJson(SETTINGS_PATH, DEFAULT_SETTINGS);
  const settings = {
    randomQuestionsPerDay: Math.max(1, Math.min(100, parseInt(raw.randomQuestionsPerDay, 10) || DEFAULT_SETTINGS.randomQuestionsPerDay)),
    randomQuestionsPerWeek: Math.max(1, Math.min(500, parseInt(raw.randomQuestionsPerWeek, 10) || DEFAULT_SETTINGS.randomQuestionsPerWeek)),
    minimumWithdrawalAmount: Math.max(0.01, parseFloat(raw.minimumWithdrawalAmount) || DEFAULT_SETTINGS.minimumWithdrawalAmount),
    earningsPerRandomQuestion: Math.max(0.01, parseFloat(raw.earningsPerRandomQuestion) || DEFAULT_SETTINGS.earningsPerRandomQuestion),
    earningsPerQuestionnaire: Math.max(0.01, parseFloat(raw.earningsPerQuestionnaire) || DEFAULT_SETTINGS.earningsPerQuestionnaire),
    randomQuestionCooldown: Math.max(1, Math.min(365, parseInt(raw.randomQuestionCooldown, 10) || DEFAULT_SETTINGS.randomQuestionCooldown)),
    maxWithdrawalsPerMonth: Math.max(1, Math.min(50, parseInt(raw.maxWithdrawalsPerMonth, 10) || DEFAULT_SETTINGS.maxWithdrawalsPerMonth)),
  };

  simpleCache.set("settings", settings);
  return settings;
}

async function writeSettings(settings) {
  await ensureFilesOnce();
  const validated = {
    randomQuestionsPerDay: Math.max(1, Math.min(100, parseInt(settings.randomQuestionsPerDay, 10) || DEFAULT_SETTINGS.randomQuestionsPerDay)),
    randomQuestionsPerWeek: Math.max(1, Math.min(500, parseInt(settings.randomQuestionsPerWeek, 10) || DEFAULT_SETTINGS.randomQuestionsPerWeek)),
    minimumWithdrawalAmount: Math.max(0.01, parseFloat(settings.minimumWithdrawalAmount) || DEFAULT_SETTINGS.minimumWithdrawalAmount),
    earningsPerRandomQuestion: Math.max(0.01, parseFloat(settings.earningsPerRandomQuestion) || DEFAULT_SETTINGS.earningsPerRandomQuestion),
    earningsPerQuestionnaire: Math.max(0.01, parseFloat(settings.earningsPerQuestionnaire) || DEFAULT_SETTINGS.earningsPerQuestionnaire),
    randomQuestionCooldown: Math.max(1, Math.min(365, parseInt(settings.randomQuestionCooldown, 10) || DEFAULT_SETTINGS.randomQuestionCooldown)),
    maxWithdrawalsPerMonth: Math.max(1, Math.min(50, parseInt(settings.maxWithdrawalsPerMonth, 10) || DEFAULT_SETTINGS.maxWithdrawalsPerMonth)),
  };
  await writeJson(SETTINGS_PATH, validated);
  invalidateCache("settings");
  return validated;
}

async function readAll() {
  await ensureFilesOnce();

  const persistedTags = asArray(await readJson(TAGS_PATH, [])).map(normalizeTag);
  const byId = new Map(persistedTags.map((t) => [t.id, t]));
  const byNameLower = new Map(persistedTags.map((t) => [String(t.name || "").trim().toLowerCase(), t]));

  const hardTags = USER_VARIABLE_TAGS.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt || nowIso(),
  }));

  const tags = [...persistedTags];
  for (const ht of hardTags) {
    const key = String(ht.name || "").trim().toLowerCase();
    if (byId.has(ht.id)) {
      const existing = byId.get(ht.id);
      if (existing && existing.name !== ht.name) existing.name = ht.name;
      continue;
    }
    if (key && byNameLower.has(key)) continue;
    tags.push(ht);
  }
  const questions = asArray(await readJson(QUESTIONS_PATH, [])).map(normalizeQuestion);
  const questionnaires = asArray(await readJson(QUESTIONNAIRES_PATH, [])).map(normalizeQuestionnaire);

  const memberIdsByQn = new Map();
  for (const q of questions) {
    if (!q.questionnaire) continue;
    if (!memberIdsByQn.has(q.questionnaire)) memberIdsByQn.set(q.questionnaire, []);
    memberIdsByQn.get(q.questionnaire).push(q.id);
  }

  const cleanedQuestionnaires = questionnaires.map((qn) => {
    const members = memberIdsByQn.get(qn.id) || [];
    const memberSet = new Set(members);

    const existingOrder = asArray(qn.questionorder ?? qn.questionOrder ?? qn.questionIds).map(String);
    const order = existingOrder.filter((id) => memberSet.has(id));
    const orderSet = new Set(order);
    for (const id of members) {
      if (!orderSet.has(id)) order.push(id);
    }

    return {
      ...qn,
      questionIds: members,
      questionorder: order,
    };
  });

  if (JSON.stringify(cleanedQuestionnaires) !== JSON.stringify(questionnaires)) {
    await writeJson(QUESTIONNAIRES_PATH, cleanedQuestionnaires);
  }

  return { tags, questions, questionnaires: cleanedQuestionnaires };
}

async function writeAll({ tags, questions, questionnaires }) {
  await ensureFiles();
  const normTags = asArray(tags)
    .filter((t) => {
      const id = String(t && t.id ? t.id : "");
      const nameLower = String(t && t.name ? t.name : "").trim().toLowerCase();
      if (USER_VARIABLE_TAG_IDS.has(id)) return false;
      if (USER_VARIABLE_TAG_NAMES_LOWER.has(nameLower)) return false;
      if (nameLower.startsWith("variable.user.")) return false;
      return true;
    })
    .map(normalizeTag);

  const normQuestionsRaw = asArray(questions).map(normalizeQuestion);
  const normQuestions = [];

  for (const question of normQuestionsRaw) {
    const processed = { ...question };
    if (processed.imageUrl && isBase64Image(processed.imageUrl)) {
      const imageId = `q_${question.id}_img`;
      processed.imageUrl = await storeImage(processed.imageUrl, imageId);
    }
    normQuestions.push(processed);
  }

  const normQuestionnaires = asArray(questionnaires).map(normalizeQuestionnaire);

  const idsByQn = new Map();
  for (const q of normQuestions) {
    if (!q.questionnaire) continue;
    if (!idsByQn.has(q.questionnaire)) idsByQn.set(q.questionnaire, []);
    idsByQn.get(q.questionnaire).push(q.id);
  }
  const finalQuestionnaires = normQuestionnaires.map((qn) => {
    const members = idsByQn.get(qn.id) || [];
    const memberSet = new Set(members);

    const existingOrder = asArray(qn.questionorder ?? qn.questionOrder ?? qn.questionIds).map(String);
    const order = existingOrder.filter((id) => memberSet.has(id));
    const orderSet = new Set(order);
    for (const id of members) {
      if (!orderSet.has(id)) order.push(id);
    }

    return {
      ...qn,
      questionIds: members,
      questionorder: order,
      updatedAt: nowIso(),
    };
  });

  await writeJson(TAGS_PATH, normTags);
  await writeJson(QUESTIONS_PATH, normQuestions);
  await writeJson(QUESTIONNAIRES_PATH, finalQuestionnaires);

  return { tags: normTags, questions: normQuestions, questionnaires: finalQuestionnaires };
}

module.exports = {
  keyOrPath,
  resolveFsPath,
  responsesMutex,
  stateMutex,
  runStateExclusive,
  simpleCache,
  invalidateCache,
  readJson,
  writeJson,
  normalizeUser,
  normalizeQuestion,
  normalizeQuestionnaire,
  normalizeTag,
  ensureFiles,
  ensureFilesOnce,
  readUsers,
  writeUsers,
  readCagnotte,
  writeCagnotte,
  readAdminMoney,
  writeAdminMoney,
  readResponses,
  writeResponses,
  mutateResponses,
  readQuestionCooldowns,
  writeQuestionCooldowns,
  readSettings,
  writeSettings,
  readAll,
  writeAll,
  QUESTIONS_PATH,
  QUESTIONNAIRES_PATH,
  TAGS_PATH,
  RESPONSES_PATH,
  USERS_PATH,
  CAGNOTTE_PATH,
  ADMIN_MONEY_PATH,
  QUESTION_COOLDOWNS_PATH,
  SETTINGS_PATH,
};

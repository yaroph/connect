const express = require("express");
const path = require("path");

// In local/dev mode we persist JSON to ./data via the filesystem.
// On Netlify (Functions / netlify dev), we persist JSON to Netlify Blobs.
let fs = null;
try {
  fs = require("fs/promises");
} catch (_) {
  // ignore (Netlify runtime still provides fs, but keep safe)
}

let USE_BLOBS =
  // Prefer Blobs on any Netlify runtime (Functions run on AWS Lambda)
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT) ||
  // Netlify usually injects one of these
  Boolean(process.env.NETLIFY_BLOBS_CONTEXT) ||
  Boolean(process.env.SITE_ID) ||
  Boolean(process.env.NETLIFY_SITE_ID) ||
  Boolean(process.env.SITE_NAME) ||
  Boolean(process.env.URL) ||
  Boolean(process.env.NETLIFY) ||
  Boolean(process.env.NETLIFY_DEV) ||
  // Manual override (useful for local testing)
  Boolean(process.env.USE_NETLIFY_BLOBS);
function decodeNetlifyBlobsContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) return null;

  // Netlify commonly injects NETLIFY_BLOBS_CONTEXT as base64 JSON, but depending on
  // tooling it may also be plain JSON.
  const tryParse = (s) => {
    try {
      const ctx = JSON.parse(String(s));
      return ctx && typeof ctx === "object" ? ctx : null;
    } catch (_) {
      return null;
    }
  };

  // 1) base64 JSON
  try {
    const json = Buffer.from(String(raw), "base64").toString("utf8");
    const parsed = tryParse(json);
    if (parsed) return parsed;
  } catch (_) {
    // ignore
  }

  // 2) plain JSON
  return tryParse(raw);
}

// Some versions of @netlify/blobs ship as ESM; support both require() and import().
let blobsModulePromise = null;
async function loadBlobsModule() {
  if (blobsModulePromise) return blobsModulePromise;
  blobsModulePromise = (async () => {
    try {
      // eslint-disable-next-line global-require
      return require("@netlify/blobs");
    } catch (e) {
      // ESM fallback
      const mod = await import("@netlify/blobs");
      return mod;
    }
  })();
  return blobsModulePromise;
}

function pickGetStore(mod) {
  return mod?.getStore || mod?.default?.getStore || null;
}

function createStoreCompat(getStore, name, options) {
  // Newer API: getStore(name, options)
  try {
    return getStore(name, options);
  } catch (e1) {
    // Older/alternate API: getStore({ name, ...options })
    try {
      return getStore({ name, ...(options || {}) });
    } catch (e2) {
      // Prefer the first error message for clarity, but keep the second as context.
      const msg1 = String(e1 && e1.message ? e1.message : e1);
      const msg2 = String(e2 && e2.message ? e2.message : e2);
      throw new Error(`${msg1} (fallback: ${msg2})`);
    }
  }
}

let BLOBS_DISABLED = false;

async function getBlobsStore() {
  if (!USE_BLOBS || BLOBS_DISABLED) return null;

  const storeName = process.env.BLOBS_STORE_NAME || "bni-data";

  const mod = await loadBlobsModule();
  const getStore = pickGetStore(mod);
  if (!getStore) {
    throw new Error("Netlify Blobs: impossible de trouver getStore dans @netlify/blobs");
  }

    // Read Blobs context if present (base64 JSON injected by Netlify)
  const ctx0 = decodeNetlifyBlobsContext() || null;
  const apiURL0 = ctx0 && (ctx0.apiURL || ctx0.apiUrl) ? (ctx0.apiURL || ctx0.apiUrl) : undefined;
  const edgeURL0 = ctx0 && (ctx0.edgeURL || ctx0.edgeUrl) ? (ctx0.edgeURL || ctx0.edgeUrl) : undefined;
  const uncachedEdgeURL0 =
    ctx0 && (ctx0.uncachedEdgeURL || ctx0.uncachedEdgeUrl)
      ? (ctx0.uncachedEdgeURL || ctx0.uncachedEdgeUrl)
      : undefined;

  // Strong consistency requires an uncachedEdgeURL in the environment.
  // If it's not available, fall back to eventual consistency to avoid 500s.
  const consistency0 = uncachedEdgeURL0 ? "strong" : "eventual";

// 1) Zero-config path (preferred on Netlify)
  try {
    return createStoreCompat(getStore, storeName, { consistency: consistency0 });
  } catch (e1) {
    const msg = String(e1 && e1.message ? e1.message : e1);

    // 2) Robust fallback: decode NETLIFY_BLOBS_CONTEXT (auto-injected on Netlify) and pass explicit creds
    const ctx = ctx0;

    const siteID =
      process.env.SITE_ID ||
      process.env.NETLIFY_SITE_ID ||
      process.env.BLOBS_SITE_ID ||
      (ctx && (ctx.siteID || ctx.siteId)) ||
      "";

    const token =
      (ctx && ctx.token) ||
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      process.env.NETLIFY_ACCESS_TOKEN ||
      process.env.BLOBS_TOKEN ||
      "";

    const apiURL = apiURL0;
    const edgeURL = edgeURL0;
    const uncachedEdgeURL = uncachedEdgeURL0;

    if (siteID && token) {
      try {
        return createStoreCompat(getStore, storeName, { siteID, token, apiURL, edgeURL, uncachedEdgeURL, consistency: consistency0 });
      } catch (e2) {
        const msg2 = String(e2 && e2.message ? e2.message : e2);
        throw new Error(
          "Netlify Blobs store non initialisé (fallback). " +
            msg2 +
            " | erreur initiale: " +
            msg
        );
      }
    }

    throw new Error(
      "Netlify Blobs store non initialisé. " +
        "Sur Netlify, l'environnement doit fournir NETLIFY_BLOBS_CONTEXT automatiquement. " +
        "Si vous exécutez hors Netlify, fournissez SITE_ID et NETLIFY_AUTH_TOKEN (PAT). " +
        "Erreur originale: " +
        msg
    );
  }
}


const PORT = process.env.PORT || 4000;
const IS_LAMBDA =
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT);

// Netlify Functions file system is read-only outside /tmp.
// We primarily persist to Netlify Blobs, but if Blobs is disabled for some reason,
// this fallback prevents ENOENT/EROFS crashes (data will be ephemeral).
const DATA_DIR = IS_LAMBDA ? path.join("/tmp", "data") : path.join(__dirname, "..", "data");

function keyOrPath(filename) {
  return USE_BLOBS ? filename : path.join(DATA_DIR, filename);
}

function resolveFsPath(filePath) {
  const fp = String(filePath || "");
  if (!fp) return DATA_DIR;
  return path.isAbsolute(fp) ? fp : path.join(DATA_DIR, fp);
}

// The app persists ONLY these 3 files (as requested)
const QUESTIONS_PATH = keyOrPath("question.json");
const QUESTIONNAIRES_PATH = keyOrPath("questionnaire.json");
const TAGS_PATH = keyOrPath("tag.json");

// Persist answers/completions so admin can review them
const RESPONSES_PATH = keyOrPath("reponses.json");

// New: user/account + money/payout persistence
const USERS_PATH = keyOrPath("utilisateur.json");
const CAGNOTTE_PATH = keyOrPath("cagnotte.json");
const ADMIN_MONEY_PATH = keyOrPath("argentadmin.json");
const QUESTION_COOLDOWNS_PATH = keyOrPath("questionCooldowns.json");
const SETTINGS_PATH = keyOrPath("settings.json");

// -----------------
// Hardcoded "variable.user" tags (pseudo-tags)
// These tags behave like tags in the admin UI, but are not persisted in tag.json and cannot be edited/removed.
// When a question uses one of these tags, the user's answer updates the corresponding field in utilisateur.json.
// -----------------

const USER_VARIABLE_TAGS = [
  { id: "vu_dateNaissance", name: "variable.user.dateNaissance", field: "dateNaissance" },
  { id: "vu_telephone", name: "variable.user.telephone", field: "telephone" },
  { id: "vu_photoProfil", name: "variable.user.photoProfil", field: "photoProfil" },
  { id: "vu_numeroCitoyen", name: "variable.user.numeroCitoyen", field: "numeroCitoyen" },
  { id: "vu_sexe", name: "variable.user.sexe", field: "sexe" },
  { id: "vu_couleurPeau", name: "variable.user.couleurPeau", field: "couleurPeau" },
  { id: "vu_couleurCheveux", name: "variable.user.couleurCheveux", field: "couleurCheveux" },
  { id: "vu_longueurCheveux", name: "variable.user.longueurCheveux", field: "longueurCheveux" },
  { id: "vu_styleVestimentaire", name: "variable.user.styleVestimentaire", field: "styleVestimentaire" },
  { id: "vu_metier", name: "variable.user.metier", field: "metier" },
];

const USER_VARIABLE_TAG_IDS = new Set(USER_VARIABLE_TAGS.map((t) => t.id));
const USER_VARIABLE_TAG_NAMES_LOWER = new Set(USER_VARIABLE_TAGS.map((t) => String(t.name).toLowerCase()));
const USER_VARIABLE_FIELDS = new Set(USER_VARIABLE_TAGS.map((t) => t.field));

function getUserFieldForVariableTagName(tagName) {
  const name = String(tagName || "").trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  // exact match
  if (USER_VARIABLE_TAG_NAMES_LOWER.has(lower)) {
    const t = USER_VARIABLE_TAGS.find((x) => String(x.name).toLowerCase() === lower);
    return t ? t.field : null;
  }
  // prefix match
  if (!lower.startsWith("variable.user.")) return null;
  const field = name.slice("variable.user.".length).trim();
  return USER_VARIABLE_FIELDS.has(field) ? field : null;
}

// -----------------
// Mutex pour protéger les opérations concurrentes sur reponses.json
// -----------------
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

const app = express();

// -----------------
// Netlify Functions path compatibility
// -----------------
// When an Express app is wrapped by serverless-http and deployed as a Netlify Function,
// requests may arrive with the "/.netlify/functions/<functionName>" prefix still present
// in req.url (depending on runtime/adapter). Our routes are registered under "/api/...".
// To make routing robust in both local Express and Netlify Functions, strip the Netlify
// prefix if it exists.
app.use((req, _res, next) => {
  try {
    const u = String(req.url || "");
    const pfx = "/.netlify/functions/api";
    if (u.startsWith(pfx)) {
      req.url = u.slice(pfx.length) || "/";
    }
  } catch {
    // ignore
  }
  next();
});
app.use(express.json({ limit: "10mb" }));

// Netlify routing compatibility:
// Depending on redirects and tooling, the function can receive paths like
//   /.netlify/functions/api/api/...
// or sometimes double /api prefixes. Normalize so our routes consistently match
// /api/*.
app.use((req, _res, next) => {
  try {
    let u = req.url || "";
    u = u.replace(/^\/\.netlify\/functions\/api(?=\/)/, "");
    u = u.replace(/^\/api\/api\//, "/api/");
    req.url = u;
  } catch (_) {
    // ignore
  }
  next();
});

const nowIso = () => new Date().toISOString();

// Cache simple pour améliorer les performances
const simpleCache = {
  data: new Map(),
  ttl: 10000, // 10 secondes par défaut (réduit pour des données plus fraîches)
  
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
  }
};

// Invalider le cache quand les données changent
function invalidateCache(type) {
  switch (type) {
    case 'settings':
      simpleCache.invalidate('settings');
      break;
    case 'questions':
      simpleCache.invalidate('activeQuestions');
      simpleCache.invalidate('db:minimal');
      simpleCache.invalidate('db:public');
      // IMPORTANT: the admin UI loads the full DB view (scope=full)
      // If we don't invalidate it, /api/db may return stale data for ~10s and
      // the admin UI appears to "revert" edits right after saving.
      simpleCache.invalidate('db:full');
      break;
    case 'users':
      simpleCache.invalidate('users');
      break;
    case 'cagnotte':
      simpleCache.invalidate('cagnotte');
      break;
    default:
      simpleCache.clear();
  }
}


function parseDateOnlyMaybe(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  // If YYYY-MM-DD, parse as local date (avoid JS interpreting as UTC)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  // If DD/MM/YYYY (common FR format)
  const parts = s.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    const isNum = (x) => /^[0-9]+$/.test(String(x));
    if (dd.length === 2 && mm.length === 2 && yyyy.length === 4 && isNum(dd) && isNum(mm) && isNum(yyyy)) {
      const y = Number(yyyy);
      const mo = Number(mm);
      const d = Number(dd);
      const dt = new Date(y, mo - 1, d);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function isPriorityActive(question, now = new Date()) {
  const enabled = Boolean(question && (question.priority ?? question.prioritaire));
  if (!enabled) return false;
  const untilRaw = question ? (question.priorityUntil ?? question.prioritaireUntil ?? question.priorityEndDate ?? question.prioritaireFin) : null;
  const dt = parseDateOnlyMaybe(untilRaw);
  if (!dt) return false;
  const end = new Date(dt.getTime());
  end.setHours(23, 59, 59, 999);
  return now.getTime() <= end.getTime();
}


async function ensureDir() {
  if (USE_BLOBS) return;
  if (!fs) throw new Error("Filesystem persistence requested but fs/promises is not available");
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  if (USE_BLOBS && !BLOBS_DISABLED) {
    try {
      const store = await getBlobsStore();
      if (!store) throw new Error("Netlify Blobs store not initialized (missing @netlify/blobs or SITE_ID?)");
      try {
        const data = await store.get(String(filePath), { type: "json" });
        if (data === null || data === undefined) {
          await writeJson(filePath, fallback);
          return fallback;
        }
        return data;
      } catch (e) {
        // If the blob is corrupted/unparseable, reset it to fallback.
        await writeJson(filePath, fallback);
        return fallback;
      }
    } catch (e) {
      BLOBS_DISABLED = true;
      USE_BLOBS = false;
      console.warn(
        "[storage] Netlify Blobs indisponible, bascule vers le filesystem:",
        String(e && e.message ? e.message : e)
      );
    }
  }

  try {
    await ensureDir();
    const fsPath = resolveFsPath(filePath);
    const raw = await fs.readFile(fsPath, "utf-8");
    const data = JSON.parse(raw);
    return data;
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.name === "SyntaxError")) {
      await writeJson(filePath, fallback);
      return fallback;
    }
    throw e;
  }
}

const writeQueues = new Map();

async function writeJson(filePath, data) {
  const key = String(filePath);
  const prev = writeQueues.get(key) || Promise.resolve();
  const next = prev.then(async () => {
    if (USE_BLOBS && !BLOBS_DISABLED) {
      try {
        const store = await getBlobsStore();
        if (!store) throw new Error("Netlify Blobs store not initialized (missing @netlify/blobs or SITE_ID?)");
        // store JSON in blobs
        await store.setJSON(key, data);
        return;
      } catch (e) {
        BLOBS_DISABLED = true;
        USE_BLOBS = false;
        console.warn(
          "[storage] Netlify Blobs indisponible, bascule vers le filesystem:",
          String(e && e.message ? e.message : e)
        );
      }
    }

    await ensureDir();
    const fsPath = resolveFsPath(filePath);
    await fs.mkdir(path.dirname(fsPath), { recursive: true });
    const tmp = fsPath + "." + process.pid + "." + Date.now() + "." + Math.random().toString(16).slice(2) + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    try {
      await fs.rename(tmp, fsPath);
    } catch (e) {
      // Windows: rename over existing can fail; fallback to replace
      try { await fs.unlink(fsPath); } catch (_) {}
      await fs.rename(tmp, fsPath);
    }
  });
  // Keep the queue even if a write fails so future writes still run
  writeQueues.set(key, next.catch(() => {}));
  return next;
}

function asArray(v) {
  return Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
}

function normalizeQuestion(q) {
  const id = q.id || `q_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  const allowed = new Set(["FREE_TEXT", "QCM", "DROPDOWN", "CHECKBOX", "SLIDER", "PHOTO"]);
  let type = String(q.type || "").trim().toUpperCase();
  if (!allowed.has(type)) type = q.type === "QCM" ? "QCM" : "FREE_TEXT";

  const hasChoices = type === "QCM" || type === "DROPDOWN" || type === "CHECKBOX";

  // Checkbox options
  let checkboxMode = null; // "SINGLE" | "MULTI"
  if (type === "CHECKBOX") {
    const raw = String(q.checkboxMode || q.checkboxmode || "").trim().toUpperCase();
    if (raw === "SINGLE" || raw === "UNIQUE") checkboxMode = "SINGLE";
    else if (raw === "MULTI" || raw === "MULTIPLE") checkboxMode = "MULTI";
    else if (q.checkboxMultiple === false || q.allowMultiple === false) checkboxMode = "SINGLE";
    else checkboxMode = "MULTI";
  }

  // Slider options
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
    // FREE_TEXT only: if true, user can only enter digits.
    digitsOnly: type === "FREE_TEXT" ? Boolean(q.digitsOnly ?? q.freeTextDigitsOnly ?? q.onlyDigits) : false,
    imageUrl: q.imageUrl ?? null,
    importance: q.importance === "CAPTCHA" ? "CAPTCHA" : "SENSIBLE",
    tagId: q.tagId ?? null,

    // Priority (individual questions only): if enabled, a date must be provided in the UI
    priority: Boolean(q.priority ?? q.prioritaire) && !(q.questionnaire ?? null),
    priorityUntil: (q.questionnaire ?? null) ? null : (q.priorityUntil ?? q.prioritaireUntil ?? q.priorityEndDate ?? q.prioritaireFin ?? null),
    active: Boolean(q.active),
    questionnaire: q.questionnaire ?? null, // questionnaire id or null
    // Remember if a question was forced inactive because of its questionnaire (active or non publié)
    forcedInactiveByQuestionnaire: Boolean(q.forcedInactiveByQuestionnaire),
    createdAt: q.createdAt || nowIso(),
    updatedAt: q.updatedAt || nowIso(),

    // New type-specific fields
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
  const id = qn.id || `qn_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  // IMPORTANT: question order is persisted in questionnaire.json via `questionorder`.
  // Backward compatibility: accept `questionOrder` (camelCase) and the legacy `questionIds`.
  const questionorder = asArray(qn.questionorder ?? qn.questionOrder ?? qn.questionIds).map(String);

  // New status: "unrelease" (non publié).
  // Backward compatibility: accept legacy boolean `unreleased` and a string `status`.
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
    // Membership list (derived from questions on write). Kept for compatibility.
    questionIds: asArray(qn.questionIds).map(String),
    // Order list (source of truth for question ordering).
    questionorder,
    createdAt: qn.createdAt || nowIso(),
    updatedAt: qn.updatedAt || nowIso(),
  };
}

function normalizeTag(t) {
  const id = t.id || `t_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  return { id, name: (t.name || "").trim() || "Sans nom", createdAt: t.createdAt || nowIso() };
}

async function ensureFiles() {
  await ensureDir();

  // Minimal seed so the UI never starts empty
  const seedTags = [
    { id: "t_fun", name: "Fun", createdAt: nowIso() },
    { id: "t_state", name: "État", createdAt: nowIso() },
    { id: "t_newyear", name: "Nouvel an", createdAt: nowIso() },
  ];

  // Ensure base tags exist
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
  
  // Initialiser les paramètres système avec des valeurs par défaut
  const defaultSettings = {
    randomQuestionsPerDay: 10,
    randomQuestionsPerWeek: 50,
    minimumWithdrawalAmount: 50, // en dollars
    earningsPerRandomQuestion: 0.10, // en dollars
    earningsPerQuestionnaire: 1.00, // en dollars
    maxWithdrawalsPerMonth: 5,
  };
  await readJson(SETTINGS_PATH, defaultSettings);
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

function normalizeUser(u) {
  const digitsOnly = (v) => String(v || "").replace(/\D+/g, "");
  const id = u.id || `u_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  const prenom = (u.prenom || u.firstName || "").toString().trim();
  const nom = (u.nom || u.lastName || "").toString().trim();
  const fullName = (u.fullName || `${prenom} ${nom}`.trim()).trim() || "Utilisateur";
  const norm = {
    id,
    prenom,
    nom,
    fullName,
    compteBancaire: digitsOnly((u.compteBancaire || u.bankAccount || "").toString()),
    dateNaissance: (u.dateNaissance || u.birthDate || "").toString(),
    telephone: digitsOnly((u.telephone || u.phone || "").toString()),
    motDePasse: (u.motDePasse || u.password || "").toString(),
    photoProfil: u.photoProfil || u.avatarUrl || "",
    numeroCitoyen: digitsOnly((u.numeroCitoyen || u.citizenNumber || "").toString()),
    sexe: u.sexe || "",
    couleurPeau: u.couleurPeau || "",
    couleurCheveux: u.couleurCheveux || "",
    longueurCheveux: u.longueurCheveux || "",
    styleVestimentaire: u.styleVestimentaire || "",
    metier: u.metier || "",

    // money
    gagneSurBNI: Number(u.gagneSurBNI || 0),

    // admin flag
    is_admin: Boolean(u.is_admin || false),

    // per-user auth token (simple demo auth)
    token: u.token || "",

    // payout button state
    retrait: u.retrait || { status: "IDLE", amount: 0, requestedAt: null },

    // answers to sensible questions
    sensibleAnswersTagged: Array.isArray(u.sensibleAnswersTagged) ? u.sensibleAnswersTagged : [],
    sensibleAnswersUntagged: Array.isArray(u.sensibleAnswersUntagged) ? u.sensibleAnswersUntagged : [],

    createdAt: u.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  return norm;
}

// Helpers: name matching (case-insensitive + accent-insensitive)
function nameKey(str) {
  const s = String(str || "").trim().toLowerCase();
  if (!s) return "";
  try {
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch (_) {
    return s.replace(/\s+/g, " ").trim();
  }
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateOnlyKey(value) {
  const dt = parseDateOnlyMaybe(value);
  if (!dt) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


function genToken() {
  return `tok_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

async function readUsers() {
  await ensureFilesOnce();
  const raw = asArray(await readJson(USERS_PATH, []));
  const users = raw.map(normalizeUser);

  // IMPORTANT (Netlify Blobs): ne pas "réécrire" automatiquement un fichier lu.
  // En mode éventuel (réplication / cache), un read peut retourner une version
  // légèrement en retard. Si on re-sauvegarde immédiatement cette version, on
  // peut écraser une mise à jour fraîche (ex: gagneSurBNI après validation d'un
  // paiement). On normalise en mémoire et on ne persiste que sur les routes
  // qui modifient explicitement les users.
  if (!USE_BLOBS) {
    // Sur filesystem local (consistance forte), on peut conserver la normalisation.
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
    id: p.id || `pay_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    userId: p.userId,
    fullName: p.fullName || "",
    compteBancaire: p.compteBancaire || "",
    telephone: p.telephone || "",
    amount: Number(p.amount || 0),
    createdAt: p.createdAt || nowIso(),
  }));
  // Même logique que readUsers: éviter de ré-écrire en mode Blobs (éventuel).
  if (!USE_BLOBS) {
    await writeJson(ADMIN_MONEY_PATH, list);
  }
  return list;
}
async function readResponses() {
  await ensureFilesOnce();
  const r = await readJson(RESPONSES_PATH, { answers: [], completions: [] });
  return {
    answers: asArray(r.answers),
    completions: asArray(r.completions),
  };
}

async function writeResponses(payload) {
  await ensureFilesOnce();
  const p = payload && typeof payload === "object" ? payload : {};
  await writeJson(RESPONSES_PATH, {
    answers: asArray(p.answers),
    completions: asArray(p.completions),
  });
}

async function writeAdminMoney(list) {
  await ensureFilesOnce();
  await writeJson(ADMIN_MONEY_PATH, asArray(list));
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

async function readAll() {
  await ensureFilesOnce();

  // Merge persisted tags with hardcoded variable.user tags (pseudo-tags)
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
      // If a reserved id is already present on disk, enforce the canonical name.
      const existing = byId.get(ht.id);
      if (existing && existing.name !== ht.name) existing.name = ht.name;
      continue;
    }
    if (key && byNameLower.has(key)) continue;
    tags.push(ht);
  }
  const questions = asArray(await readJson(QUESTIONS_PATH, [])).map(normalizeQuestion);
  const questionnaires = asArray(await readJson(QUESTIONNAIRES_PATH, [])).map(normalizeQuestionnaire);

  // Build membership lists from questions (source of truth for membership)
  const memberIdsByQn = new Map();
  for (const q of questions) {
    if (!q.questionnaire) continue;
    if (!memberIdsByQn.has(q.questionnaire)) memberIdsByQn.set(q.questionnaire, []);
    memberIdsByQn.get(q.questionnaire).push(q.id);
  }

  // Clean up questionnaire.questionorder so it only contains ids that belong to that questionnaire,
  // and ensure it contains all linked questions (append missing ones at the end).
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
      questionIds: members, // kept for compatibility
      questionorder: order,
    };
  });

  // If we cleaned something, write back
  if (JSON.stringify(cleanedQuestionnaires) !== JSON.stringify(questionnaires)) {
    await writeJson(QUESTIONNAIRES_PATH, cleanedQuestionnaires);
  }

  return { tags, questions, questionnaires: cleanedQuestionnaires };
}

async function writeAll({ tags, questions, questionnaires }) {
  await ensureFiles();
  // Never persist hardcoded variable.user tags in tag.json
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
  
  // Process questions and handle base64 images
  const normQuestionsRaw = asArray(questions).map(normalizeQuestion);
  const normQuestions = [];
  
  for (const question of normQuestionsRaw) {
    const processed = { ...question };
    
    // If imageUrl is a base64 image, store it separately
    if (processed.imageUrl && isBase64Image(processed.imageUrl)) {
      const imageId = `q_${question.id}_img`;
      // IMPORTANT: we never persist base64 blobs in JSON.
      // If image storage fails, we abort the save so the admin/client can retry.
      processed.imageUrl = await storeImage(processed.imageUrl, imageId);
    }
    
    normQuestions.push(processed);
  }
  
  const normQuestionnaires = asArray(questionnaires).map(normalizeQuestionnaire);

  // Enforce link integrity:
  // - question.questionnaire sets membership
  // - questionnaire.questionIds is derived (kept consistent)
  // - questionnaire.questionorder is the source of truth for ordering
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

// GET combined db (frontend convenience)
app.get("/api/db", async (req, res) => {
  try {
    const scope = String((req.query && req.query.scope) || "").trim().toLowerCase();
    const light = scope === "public" || scope === "lite" || String((req.query && req.query.light) || "") === "1";
    const minimal = scope === "minimal";
    const full = !minimal && !light;
    const bypassCache = String((req.query && (req.query.nocache || req.query.noCache || req.query._)) || "") !== "";
    
    // Essayer de récupérer depuis le cache
    const cacheKey = `db:${minimal ? 'minimal' : light ? 'public' : 'full'}`;
    const cached = bypassCache ? null : simpleCache.get(cacheKey);
    if (cached) {
      // Cache navigateur: OK for minimal/public. For full (admin), avoid browser caching.
      res.setHeader('Cache-Control', full ? 'no-store' : 'public, max-age=5');
      return res.json(cached);
    }
    
    const { tags, questions, questionnaires } = await readAll();
    
    // Mode minimal : seulement les questions actives et les questionnaires visibles
    if (minimal) {
      // Inclure TOUTES les questions actives (questionnaire ou non)
      // car on a besoin de connaître les questions liées aux questionnaires
      const activeQuestions = questions.filter(q => q.active);
      const visibleQuestionnaires = questionnaires.filter(qn => qn.visible);
      
      const response = {
        meta: { version: 5, updatedAt: nowIso(), mode: 'minimal' },
        user: null,
        tags: [],
        questions: activeQuestions,
        questionnaires: visibleQuestionnaires,
        answers: [],
        completions: [],
      };
      
      // Cache plus long pour les données minimales (30 secondes)
      simpleCache.set(cacheKey, response, 30000);
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(response);
      return;
    }
    
    // Mode public/light : pas de réponses détaillées
    const responses = light ? { answers: [], completions: [] } : await readResponses();
    
    // En mode public, ne pas envoyer les questions inactives qui ne sont pas dans un questionnaire
    const filteredQuestions = light 
      ? questions.filter(q => q.active || q.questionnaire)
      : questions;
    
    const response = {
      meta: { version: 5, updatedAt: nowIso(), mode: light ? 'public' : 'full' },
      user: null,
      tags,
      questions: filteredQuestions,
      questionnaires,
      answers: responses.answers,
      completions: responses.completions,
    };
    
    // Cache différent selon le mode (public = 15s, full = 10s)
    const cacheTtl = light ? 15000 : 10000;
    simpleCache.set(cacheKey, response, cacheTtl);
    // Public/minimal can be cached briefly. Full (admin) should not be cached by the browser.
    res.setHeader('Cache-Control', full ? 'no-store' : `public, max-age=${Math.floor(cacheTtl / 1000)}`);
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Endpoint optimisé pour récupérer les questions d'un questionnaire spécifique
app.get("/api/questionnaires/:id/questions", async (req, res) => {
  try {
    const qnId = req.params.id;
    const userId = req.query.userId;
    
    if (!qnId) {
      return res.status(400).json({ error: 'ID du questionnaire requis' });
    }
    
    // Cache par questionnaire
    const cacheKey = `qn:${qnId}:questions`;
    const cached = simpleCache.get(cacheKey);
    
    let questions;
    let questionnaire;
    
    if (cached) {
      questions = cached.questions;
      questionnaire = cached.questionnaire;
    } else {
      const { questions: allQuestions, questionnaires } = await readAll();
      questionnaire = questionnaires.find(qn => qn.id === qnId);
      
      if (!questionnaire) {
        return res.status(404).json({ error: 'Questionnaire introuvable' });
      }
      
      // Récupérer les questions du questionnaire dans l'ordre
      const questionsMap = new Map();
      allQuestions.forEach(q => {
        if (q.questionnaire === qnId) {
          questionsMap.set(q.id, q);
        }
      });
      
      questions = (questionnaire.questionOrder || questionnaire.questionorder || [])
        .map(id => questionsMap.get(id))
        .filter(Boolean);
      
      // Cache pour 30 secondes
      simpleCache.set(cacheKey, { questions, questionnaire }, 30000);
    }
    
    // Si userId fourni, récupérer les questions déjà répondues
    let answeredQuestionIds = [];
    let completed = false;
    if (userId) {
      const responses = await readResponses();
      answeredQuestionIds = responses.answers
        .filter(ans => ans.userId === userId && ans.questionnaireId === qnId)
        .map(ans => ans.questionId);
      
      // Vérifier si le questionnaire a été complété
      completed = responses.completions.some(
        c => c.userId === userId && c.questionnaireId === qnId
      );
    }
    
    // IMPORTANT:
    // When userId is present, the response contains user-specific state.
    // Do NOT let the browser cache this (otherwise the UI can "rollback" / show stale progress).
    res.setHeader('Cache-Control', userId ? 'no-store' : 'public, max-age=30');
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

// Bulk safety sync: upsert a set of answers for a questionnaire (client local backup)
app.post("/api/questionnaire/:questionnaireId/sync-answers", async (req, res) => {
  try {
    const { questionnaireId } = req.params;
    const { userId, userName, answers } = req.body || {};

    const qnId = String(questionnaireId || "").trim();
    const uId = String(userId || "").trim();
    if (!qnId || !uId) return res.status(400).json({ error: "questionnaireId et userId requis" });

    const list = Array.isArray(answers) ? answers : [];
    if (list.length === 0) return res.json({ ok: true, synced: 0, updated: 0, created: 0 });

    // Resolve a stable userName for admin views
    let resolvedUserName = String(userName || "").trim();
    if (!resolvedUserName || resolvedUserName === "Utilisateur") {
      const users = await readUsers();
      const u = users.find((x) => x.id === String(uId));
      resolvedUserName = String(u?.fullName || `${u?.prenom || ""} ${u?.nom || ""}`.trim()).trim();
    }
    if (!resolvedUserName) resolvedUserName = "Utilisateur";

    const result = await responsesMutex.runExclusive(async () => {
      const r = await readResponses();
      let updated = 0;
      let created = 0;

      for (const item of list) {
        const qId = String(item?.questionId || "").trim();
        if (!qId) continue;

        let processedAnswer = item?.answer ?? "";
        if (processedAnswer && isBase64Image(processedAnswer)) {
          const imageId = `answer_${uId}_${qId}_${Date.now()}`;
          processedAnswer = await storeImage(processedAnswer, imageId);
        }

        const questionTitle = String(item?.questionTitle || "").trim() || null;
        const isCaptcha = Boolean(item?.isCaptcha);

        const existingIndex = r.answers.findIndex(
          (a) => a.userId === String(uId) && a.questionId === String(qId) && a.questionnaireId === String(qnId)
        );

        if (existingIndex !== -1) {
          r.answers[existingIndex] = {
            ...r.answers[existingIndex],
            userName: resolvedUserName,
            questionTitle: questionTitle ?? r.answers[existingIndex].questionTitle ?? null,
            answer: processedAnswer,
            isCaptcha,
            updatedAt: nowIso(),
          };
          updated += 1;
        } else {
          r.answers.push({
            id: `ans_${Math.random().toString(16).slice(2)}_${Date.now()}`,
            userId: String(uId),
            userName: resolvedUserName,
            questionnaireId: String(qnId),
            questionId: String(qId),
            questionTitle,
            answer: processedAnswer,
            correct: false,
            isCaptcha,
            createdAt: nowIso(),
          });
          created += 1;
        }
      }

      await writeResponses(r);
      return { ok: true, synced: updated + created, updated, created };
    });

    // Update cooldowns (best effort)
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

    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (e) {
    console.error('[questionnaire/sync-answers] Error:', e);
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Endpoint pour vérifier les questions déjà répondues dans un questionnaire
app.get("/api/questionnaire/:questionnaireId/answered/:userId", async (req, res) => {
  try {
    const { questionnaireId, userId } = req.params;
    
    if (!questionnaireId || !userId) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }
    
    const responses = await readResponses();
    
    // Trouver toutes les réponses de l'utilisateur pour ce questionnaire
    const userAnswers = responses.answers.filter(
      ans => ans.userId === userId && ans.questionnaireId === questionnaireId
    );
    
    // Vérifier si le questionnaire est complété
    const completions = responses.completions.filter(
      cmp => cmp.userId === userId && cmp.questionnaireId === questionnaireId
    );
    
    const answeredQuestionIds = userAnswers.map(ans => ans.questionId);
    
    res.setHeader('Cache-Control', 'no-store');
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

// PUT combined db (frontend convenience)
app.put("/api/db", async (req, res) => {
  try {
    const body = req.body || {};
    const saved = await writeAll({
      tags: body.tags || [],
      questions: body.questions || [],
      questionnaires: body.questionnaires || [],
    });
    // IMPORTANT:
    // Do NOT overwrite persisted answers/completions when the admin edits tags/questions/questionnaires.
    // User responses are appended via /api/answers/append and /api/completions/append.
    // This prevents accidental wipes where the client sends an empty answers list.
    const responses = await readResponses();
    
    // Invalider le cache
    invalidateCache('questions');
    
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


// -----------------
// Answers / Completions (persisted for admin review)
// -----------------

app.post("/api/answers/append", async (req, res) => {
  try {
    const b = req.body || {};
    const { userId, userName, questionnaireId, questionId, questionTitle, answer, correct, isCaptcha } = b;
    if (!userId || !questionId) return res.status(400).json({ error: "Paramètres manquants" });

    // Ensure we always store a human name (Prénom Nom) for admin views.
    let resolvedUserName = String(userName || "").trim();
    if (!resolvedUserName || resolvedUserName === "Utilisateur") {
      const users = await readUsers();
      const u = users.find((x) => x.id === String(userId));
      resolvedUserName = String(u?.fullName || `${u?.prenom || ""} ${u?.nom || ""}`.trim()).trim();
    }
    if (!resolvedUserName) resolvedUserName = "Utilisateur";
    
    // Convertir answer si c'est une image base64 (questions de type PHOTO)
    let processedAnswer = answer ?? "";
    if (processedAnswer && isBase64Image(processedAnswer)) {
      const imageId = `answer_${userId}_${questionId}_${Date.now()}`;
      processedAnswer = await storeImage(processedAnswer, imageId);
      console.log('[answers/append] Photo converted and stored:', processedAnswer);
    }
    
    // UTILISER LE MUTEX pour éviter les race conditions
    const result = await responsesMutex.runExclusive(async () => {
      const r = await readResponses();
      
      // UPSERT: Chercher si une réponse existe déjà pour (userId, questionnaireId, questionId)
      // Si oui, mettre à jour. Si non, ajouter.
      const existingIndex = r.answers.findIndex(a => 
        a.userId === String(userId) && 
        a.questionId === String(questionId) &&
        // Pour les questionnaires, on vérifie aussi questionnaireId
        // Pour les questions random (questionnaireId = null), on accepte null ou undefined
        (questionnaireId 
          ? a.questionnaireId === String(questionnaireId)
          : (a.questionnaireId === null || a.questionnaireId === undefined))
      );
      
      if (existingIndex !== -1) {
        // Mise à jour de la réponse existante
        r.answers[existingIndex] = {
          ...r.answers[existingIndex],
          userName: resolvedUserName,
          questionTitle: String(questionTitle || r.answers[existingIndex].questionTitle || "").trim() || null,
          answer: processedAnswer,
          correct: Boolean(correct),
          isCaptcha: Boolean(isCaptcha),
          updatedAt: nowIso(),
        };
        console.log(`[answers/append] Updated existing answer for user ${userId}, question ${questionId}`);
      } else {
        // Nouvelle réponse
        const entry = {
          id: `ans_${Math.random().toString(16).slice(2)}_${Date.now()}`,
          userId: String(userId),
          userName: resolvedUserName,
          questionnaireId: questionnaireId ? String(questionnaireId) : null,
          questionId: String(questionId),
          questionTitle: String(questionTitle || "").trim() || null,
          answer: processedAnswer,
          correct: Boolean(correct),
          isCaptcha: Boolean(isCaptcha),
          createdAt: nowIso(),
        };
        r.answers.push(entry);
        console.log(`[answers/append] Added new answer for user ${userId}, question ${questionId}`);
      }
      
      await writeResponses(r);
      return { ok: true, updated: existingIndex !== -1 };
    });
    
    // Mettre à jour le cooldown pour cette question
    const cooldowns = await readQuestionCooldowns();
    cooldowns[userId] = cooldowns[userId] || {};
    cooldowns[userId][questionId] = Date.now();
    await writeQuestionCooldowns(cooldowns);
    
    res.json(result);
  } catch (e) {
    console.error('[answers/append] Error:', e);
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Delete an answer
app.delete("/api/admin/answers/:id", async (req, res) => {
  try {
    const answerId = req.params.id;
    const r = await readResponses();
    
    const answerIndex = r.answers.findIndex((a) => a.id === answerId);
    if (answerIndex === -1) {
      return res.status(404).json({ error: "Réponse introuvable" });
    }
    
    // Remove the answer
    r.answers.splice(answerIndex, 1);
    await writeResponses(r);
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/completions/append", async (req, res) => {
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
      id: `cmp_${Math.random().toString(16).slice(2)}_${Date.now()}`,
      userId: String(userId),
      userName: resolvedUserName,
      questionnaireId: String(questionnaireId),
      completedAt: nowIso(),
    };
    const r = await readResponses();
    r.completions.push(entry);
    await writeResponses(r);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});
// -----------------
// Auth / Users
// -----------------

app.post("/api/auth/register", async (req, res) => {
  try {
    const b = req.body || {};
    const required = ["prenom", "nom", "compteBancaire", "dateNaissance", "telephone", "motDePasse"];
    for (const k of required) {
      if (!String(b[k] || "").trim()) {
        return res.status(400).json({ error: `Champ obligatoire manquant: ${k}` });
      }
    }

    const users = await readUsers();
    // Simple uniqueness: prenom+nom+telephone
    const key = `${String(b.prenom).trim().toLowerCase()}|${String(b.nom).trim().toLowerCase()}|${String(b.telephone).trim()}`;
    const exists = users.some(
      (u) => `${u.prenom.toLowerCase()}|${u.nom.toLowerCase()}|${u.telephone}` === key
    );
    if (exists) return res.status(409).json({ error: "Ce compte existe déjà." });

    // Convertir photoProfil si c'est du base64
    let photoProfil = b.photoProfil || "";
    if (photoProfil && isBase64Image(photoProfil)) {
      const imageId = `user_${Date.now()}_${Math.random().toString(16).slice(2)}_photo`;
      photoProfil = await storeImage(photoProfil, imageId);
      console.log('[register] Photo converted and stored:', photoProfil);
    }

    const token = genToken();
    const user = normalizeUser({
      prenom: b.prenom,
      nom: b.nom,
      compteBancaire: b.compteBancaire,
      dateNaissance: b.dateNaissance,
      telephone: b.telephone,
      motDePasse: b.motDePasse,
      photoProfil: photoProfil,
      numeroCitoyen: b.numeroCitoyen || "",
      sexe: b.sexe || "",
      couleurPeau: b.couleurPeau || "",
      couleurCheveux: b.couleurCheveux || "",
      longueurCheveux: b.longueurCheveux || "",
      styleVestimentaire: b.styleVestimentaire || "",
      metier: b.metier || "",
      token,
    });

    const next = await writeUsers([...users, user]);

    const cagnotte = await readCagnotte();
    cagnotte[user.id] = cagnotte[user.id] || { pending: 0, randomByDay: {} };
    await writeCagnotte(cagnotte);

    res.json({ ok: true, token, user: next.find((u) => u.id === user.id) });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const b = req.body || {};
    const prenom = String(b.prenom || "").trim();
    const nom = String(b.nom || "").trim();
    const motDePasse = String(b.motDePasse || "").trim();
    const users = await readUsers();
    const u = users.find(
      (x) => x.prenom.toLowerCase() === prenom.toLowerCase() && x.nom.toLowerCase() === nom.toLowerCase() && x.motDePasse === motDePasse
    );
    if (!u) return res.status(401).json({ error: "Identifiants invalides." });
    if (!u.token) {
      u.token = genToken();
      await writeUsers(users.map((x) => (x.id === u.id ? u : x)));
    }
    res.json({ ok: true, token: u.token, user: u });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Missing token" });
    const users = await readUsers();
    const u = users.find((x) => x.token === token);
    if (!u) return res.status(401).json({ error: "Invalid token" });
    const cagnotte = await readCagnotte();
    const pending = Number((cagnotte[u.id] && cagnotte[u.id].pending) || 0);
    res.json({ ok: true, user: u, pending });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// -----------------
// Password reset ("Mot de passe oublié ?")
// -----------------

app.post("/api/auth/password-reset/verify", async (req, res) => {
  try {
    const b = req.body || {};
    const prenom = nameKey(b.prenom);
    const nom = nameKey(b.nom);
    const compteBancaire = String(b.compteBancaire || b.bankAccount || "").replace(/\D+/g, "");
    const dateNaissance = dateOnlyKey(b.dateNaissance);

    if (!prenom || !nom || !compteBancaire || !dateNaissance) {
      return res.status(400).json({ error: "Champs manquants" });
    }

    const users = await readUsers();
    const u = users.find((x) =>
      nameKey(x.prenom) === prenom &&
      nameKey(x.nom) === nom &&
      String(x.compteBancaire || "").replace(/\D+/g, "") === compteBancaire &&
      dateOnlyKey(x.dateNaissance) === dateNaissance
    );

    if (!u) return res.status(401).json({ error: "Informations invalides" });
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/auth/password-reset", async (req, res) => {
  try {
    const b = req.body || {};
    const prenom = nameKey(b.prenom);
    const nom = nameKey(b.nom);
    const compteBancaire = String(b.compteBancaire || b.bankAccount || "").replace(/\D+/g, "");
    const dateNaissance = dateOnlyKey(b.dateNaissance);
    const nouveauMotDePasse = String(b.nouveauMotDePasse || b.newPassword || "").trim();

    if (!prenom || !nom || !compteBancaire || !dateNaissance || !nouveauMotDePasse) {
      return res.status(400).json({ error: "Champs manquants" });
    }
    if (nouveauMotDePasse.length < 3) {
      return res.status(400).json({ error: "Mot de passe trop court" });
    }

    const users = await readUsers();
    const idx = users.findIndex((x) =>
      nameKey(x.prenom) === prenom &&
      nameKey(x.nom) === nom &&
      String(x.compteBancaire || "").replace(/\D+/g, "") === compteBancaire &&
      dateOnlyKey(x.dateNaissance) === dateNaissance
    );

    if (idx === -1) return res.status(401).json({ error: "Informations invalides" });

    // Update password and rotate token (force re-login)
    users[idx] = { ...users[idx], motDePasse: nouveauMotDePasse, token: genToken(), updatedAt: nowIso() };
    await writeUsers(users);
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Update own profile (Compte + Infos) - requires Bearer token
app.put("/api/user/me", async (req, res) => {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Missing token" });
    const patch = req.body || {};

    const users = await readUsers();
    const idx = users.findIndex((x) => x.token === token);
    if (idx === -1) return res.status(401).json({ error: "Invalid token" });

    // Allowed fields for self-edit.
    // IMPORTANT: only apply keys that are present in the request body.
    // This prevents wiping existing values when the client sends a partial update.
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

    // Extra safety: never allow accidental wipes of core identity fields.
    // If the client sends empty strings for required fields, we keep existing values.
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

    // Convertir photoProfil si c'est du base64
    if (allowed.photoProfil && isBase64Image(allowed.photoProfil)) {
      const imageId = `user_${users[idx].id}_photo`;
      allowed.photoProfil = await storeImage(allowed.photoProfil, imageId);
      console.log('[user/me] Photo converted and stored:', allowed.photoProfil);
    }

    const u = normalizeUser({ ...users[idx], ...allowed });
    // Keep token & money & payout states stable
    u.token = users[idx].token;
    u.gagneSurBNI = users[idx].gagneSurBNI;
    u.retrait = users[idx].retrait;

    users[idx] = u;
    await writeUsers(users);
    res.json({ ok: true, user: u });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await readUsers();
    const cagnotte = await readCagnotte();
    const enriched = users.map((u) => ({ ...u, pending: Number((cagnotte[u.id] && cagnotte[u.id].pending) || 0) }));
    res.json({ ok: true, users: enriched });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.put("/api/admin/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const patch = req.body || {};
    const users = await readUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return res.status(404).json({ error: "Utilisateur introuvable" });
    
    // Process photoProfil if it's a base64 image
    if (patch.photoProfil && isBase64Image(patch.photoProfil)) {
      const imageId = `user_${id}_photo`;
      // IMPORTANT: never persist base64 images in utilisateur.json.
      patch.photoProfil = await storeImage(patch.photoProfil, imageId);
    }
    
    const u = normalizeUser({ ...users[idx], ...patch });
    // keep token stable unless overwritten
    u.token = users[idx].token;

    users[idx] = u;
    await writeUsers(users);
    res.json({ ok: true, user: u });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Reset user passwords from a provided list (typically motdepasse_defaut.json)
// Body: { entries: [{ fullName?, prenom?, nom?, motDePasse }] }
app.post("/api/admin/reset-passwords", async (req, res) => {
  try {
    const body = req.body || {};
    const entries = Array.isArray(body.entries) ? body.entries : Array.isArray(body.users) ? body.users : null;
    if (!entries) return res.status(400).json({ error: "entries manquant (tableau)" });

    const users = await readUsers();

    // Index users by normalized fullName and by prenom+nom
    const byFull = new Map(); // key -> index
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

      const idx = (keyFull && byFull.get(keyFull) !== undefined)
        ? byFull.get(keyFull)
        : (keyPn && byPn.get(keyPn) !== undefined)
          ? byPn.get(keyPn)
          : -1;

      if (idx === -1) {
        notFound.push(fullNameRaw || `${prenom} ${nom}`.trim());
        continue;
      }

      // Update only the password; keep token / money / etc.
      users[idx] = { ...users[idx], motDePasse };
      updated += 1;
    }

    if (updated > 0) {
      await writeUsers(users);
    }

    res.json({
      ok: true,
      updated,
      invalid,
      notFoundCount: notFound.length,
      // keep response small
      notFoundSample: notFound.slice(0, 25),
      duplicateNamesSample: duplicates.slice(0, 25),
      totalEntries: entries.length,
      totalUsers: users.length,
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Delete user and all associated data
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    
    // Load all data (current persistence model)
    const [users, responses, adminMoney, cagnotte, cooldowns] = await Promise.all([
      readUsers(),
      readResponses(),
      readAdminMoney(),
      readCagnotte(),
      readQuestionCooldowns(),
    ]);
    
    // Check if user exists
    const userIdx = users.findIndex((u) => u.id === id);
    if (userIdx === -1) return res.status(404).json({ error: "Utilisateur introuvable" });
    
    // Remove user from users array
    users.splice(userIdx, 1);
    
    // Remove all user's answers/completions
    const filteredAnswers = (responses.answers || []).filter((a) => a.userId !== id);
    const filteredCompletions = (responses.completions || []).filter((c) => c.userId !== id);

    // Remove all user's admin payments (withdraw requests)
    const filteredAdminMoney = (adminMoney || []).filter((p) => p.userId !== id);
    
    // Remove user from cagnotte
    if (cagnotte[id]) {
      delete cagnotte[id];
    }

    // Remove cooldowns for that user
    if (cooldowns && typeof cooldowns === "object" && cooldowns[id]) {
      delete cooldowns[id];
    }
    
    // Save all changes
    await Promise.all([
      writeUsers(users),
      writeResponses({ answers: filteredAnswers, completions: filteredCompletions }),
      writeAdminMoney(filteredAdminMoney),
      writeCagnotte(cagnotte),
      writeQuestionCooldowns(cooldowns)
    ]);
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// -----------------
// Money / earnings
// -----------------

// Nouvel endpoint: Obtenir une question aléatoire avec système de cooldown
app.get("/api/questions/random/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Charger les données en parallèle pour optimiser
    const [users, settings, db, cooldowns, cagnotte] = await Promise.all([
      readUsers(),
      // Utiliser le cache pour les settings qui changent rarement
      (async () => {
        const cached = simpleCache.get('settings');
        if (cached) return cached;
        const data = await readJson(SETTINGS_PATH, {
          randomQuestionsPerDay: 10,
          randomQuestionsPerWeek: 50,
          minimumWithdrawalAmount: 50,
          earningsPerRandomQuestion: 0.10,
          earningsPerQuestionnaire: 1.00,
          randomQuestionCooldown: 30,
          maxWithdrawalsPerMonth: 5,
        });
        simpleCache.set('settings', data);
        return data;
      })(),
      readAll(),
      readQuestionCooldowns(),
      readCagnotte()
    ]);
    
    const user = users.find((x) => x.id === userId);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    // Vérifier les quotas
    cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
    cagnotte[userId].randomByDay = cagnotte[userId].randomByDay || {};
    cagnotte[userId].randomByWeek = cagnotte[userId].randomByWeek || {};
    
    const currentDayKey = todayKey();
    const weekKey = () => {
      const d = new Date();
      const y = d.getFullYear();
      const week = Math.ceil(((d - new Date(y, 0, 1)) / 86400000 + 1) / 7);
      return `${y}-W${String(week).padStart(2, "0")}`;
    };
    const currentWeekKey = weekKey();
    
    const dailyCount = Number(cagnotte[userId].randomByDay[currentDayKey] || 0);
    const weeklyCount = Number(cagnotte[userId].randomByWeek[currentWeekKey] || 0);
    
    const dailyRemaining = Math.max(0, settings.randomQuestionsPerDay - dailyCount);
    const weeklyRemaining = Math.max(0, settings.randomQuestionsPerWeek - weeklyCount);
    
    // Si quotas dépassés
    if (dailyCount >= settings.randomQuestionsPerDay) {
      return res.json({ 
        ok: true, 
        question: null, 
        quotaExceeded: "daily",
        dailyRemaining: 0,
        weeklyRemaining,
        dailyLimit: settings.randomQuestionsPerDay,
        weeklyLimit: settings.randomQuestionsPerWeek
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
        weeklyLimit: settings.randomQuestionsPerWeek
      });
    }

    const userCooldowns = cooldowns[userId] || {};
    
    // Constantes
    const COOLDOWN_DAYS = 14;
    const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000; // 14 jours en millisecondes
    const REAPPEAR_CHANCE = 0.05; // 5% de chance de réapparaître après le cooldown
    const now = Date.now();
    
    // Fonction pour vérifier si une question peut être affichée
    const canShowQuestion = (questionId) => {
      const lastAnswered = userCooldowns[questionId];
      if (!lastAnswered) return true; // Jamais répondu
      
      const elapsed = now - lastAnswered;
      if (elapsed < COOLDOWN_MS) return false; // Encore en cooldown
      
      // Après 14 jours, petit % de chance
      return Math.random() < REAPPEAR_CHANCE;
    };
    
    // Récupérer toutes les questions actives (pas dans un questionnaire)
    let availableQuestions = (db.questions || []).filter(q => {
      // Doit être active
      if (!q.active) return false;
      // Ne doit pas être dans un questionnaire
      if (q.questionnaire) return false;
      // Vérifier le cooldown
      if (!canShowQuestion(q.id)) return false;
      
      return true;
    });
    
    // Filtrer les questions liées aux variable.user déjà remplis
    availableQuestions = availableQuestions.filter(q => {
      if (!q.tagId) return true; // Pas de tag, ok
      
      // Vérifier si c'est un tag variable.user
      const varUserTag = USER_VARIABLE_TAGS.find(t => t.id === q.tagId);
      if (!varUserTag) return true; // Pas un tag variable.user, ok
      
      // Vérifier si le champ est déjà rempli
      const fieldValue = user[varUserTag.field];
      const isEmpty = !fieldValue || String(fieldValue).trim() === "";
      
      // Si le champ est rempli, on initialise le cooldown si pas déjà fait
      if (!isEmpty && !userCooldowns[q.id]) {
        userCooldowns[q.id] = now;
        cooldowns[userId] = userCooldowns;
        // On écrit de manière asynchrone (fire and forget pour ne pas ralentir)
        writeQuestionCooldowns(cooldowns).catch(err => console.error("Erreur cooldown:", err));
        return false; // Ne pas afficher maintenant
      }
      
      return isEmpty; // Afficher seulement si vide
    });
    
    // Filtrer les questions dont le tag a déjà été répondu
    const answeredTags = new Set();
    (db.answers || []).forEach(answer => {
      if (answer.userId === userId && answer.questionId) {
        const question = db.questions.find(q => q.id === answer.questionId);
        if (question && question.tagId) {
          answeredTags.add(question.tagId);
        }
      }
    });
    
    availableQuestions = availableQuestions.filter(q => {
      if (!q.tagId) return true; // Pas de tag
      if (answeredTags.has(q.tagId)) {
        // Tag déjà répondu, vérifier cooldown
        return canShowQuestion(q.id);
      }
      return true;
    });
    
    // S'il n'y a plus de questions disponibles
    if (availableQuestions.length === 0) {
      return res.json({ 
        ok: true, 
        question: null, 
        noQuestionsAvailable: true,
        dailyRemaining,
        weeklyRemaining,
        dailyLimit: settings.randomQuestionsPerDay,
        weeklyLimit: settings.randomQuestionsPerWeek
      });
    }
    
    // Sélectionner une ou plusieurs questions aléatoires
// Si des questions prioritaires sont actives, elles ont 1 chance sur 6 d'être proposées.
const nRaw = Number(req.query.n || req.query.count || 1);
const n = Number.isFinite(nRaw) ? Math.max(1, Math.min(10, Math.floor(nRaw))) : 1;

const nowDt = new Date();
const priorityAll = availableQuestions.filter((q) => isPriorityActive(q, nowDt));
const normalAll = availableQuestions.filter((q) => !isPriorityActive(q, nowDt));

// Copies mutables (sans remplacement)
const priorityQuestions = [...priorityAll];
const normalQuestions = [...normalAll];

const pickOne = () => {
  if (priorityQuestions.length === 0 && normalQuestions.length === 0) return null;

  let pool = normalQuestions;
  if (priorityQuestions.length > 0) {
    const roll = Math.random();
    if (roll < (1 / 6)) pool = priorityQuestions;
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
  // backward-compat (ancien client)
  question: questions[0] || null,
  // nouveau: plusieurs questions en une seule requête (buffer côté client)
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

app.post("/api/earn/random", async (req, res) => {
  try {
    const { userId } = req.body || {};
    const users = await readUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });

    // Charger les paramètres système
    const settings = await readJson(SETTINGS_PATH, {
      randomQuestionsPerDay: 10,
      randomQuestionsPerWeek: 50,
      minimumWithdrawalAmount: 50,
      earningsPerRandomQuestion: 0.10,
      earningsPerQuestionnaire: 1.00,
      randomQuestionCooldown: 30,
      maxWithdrawalsPerMonth: 5,
    });

    const cagnotte = await readCagnotte();
    cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
    cagnotte[userId].randomByDay = cagnotte[userId].randomByDay || {};
    cagnotte[userId].randomByWeek = cagnotte[userId].randomByWeek || {};
    
    const key = todayKey();
    const weekKey = () => {
      const d = new Date();
      const y = d.getFullYear();
      const week = Math.ceil(((d - new Date(y, 0, 1)) / 86400000 + 1) / 7);
      return `${y}-W${String(week).padStart(2, "0")}`;
    };
    const currentWeekKey = weekKey();
    
    const dailyCount = Number(cagnotte[userId].randomByDay[key] || 0);
    const weeklyCount = Number(cagnotte[userId].randomByWeek[currentWeekKey] || 0);
    
    // Vérifier les quotas
    if (dailyCount >= settings.randomQuestionsPerDay) {
      return res.json({ 
        ok: false, 
        reason: "DAILY_LIMIT", 
        pending: cagnotte[userId].pending, 
        count: dailyCount 
      });
    }
    
    if (weeklyCount >= settings.randomQuestionsPerWeek) {
      return res.json({ 
        ok: false, 
        reason: "WEEKLY_LIMIT", 
        pending: cagnotte[userId].pending, 
        count: weeklyCount 
      });
    }
    
    // Incrémenter les compteurs
    cagnotte[userId].randomByDay[key] = dailyCount + 1;
    cagnotte[userId].randomByWeek[currentWeekKey] = weeklyCount + 1;
    
    // Ajouter les gains basés sur les paramètres (valeurs directes en dollars)
    const earnings = Number(settings.earningsPerRandomQuestion);
    cagnotte[userId].pending = Number(cagnotte[userId].pending || 0) + earnings;
    
    await writeCagnotte(cagnotte);
    res.json({ 
      ok: true, 
      pending: cagnotte[userId].pending, 
      count: cagnotte[userId].randomByDay[key],
      dailyRemaining: settings.randomQuestionsPerDay - cagnotte[userId].randomByDay[key],
      weeklyRemaining: settings.randomQuestionsPerWeek - cagnotte[userId].randomByWeek[currentWeekKey]
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Endpoint pour skip une question aléatoire (consomme le quota sans donner d'argent)
app.post("/api/skip/random", async (req, res) => {
  try {
    const { userId } = req.body || {};
    const users = await readUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });

    // Charger les paramètres système
    const settings = await readJson(SETTINGS_PATH, {
      randomQuestionsPerDay: 10,
      randomQuestionsPerWeek: 50,
      minimumWithdrawalAmount: 50,
      earningsPerRandomQuestion: 0.10,
      earningsPerQuestionnaire: 1.00,
      maxWithdrawalsPerMonth: 5,
    });

    const cagnotte = await readCagnotte();
    cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {}, randomByWeek: {} };
    cagnotte[userId].randomByDay = cagnotte[userId].randomByDay || {};
    cagnotte[userId].randomByWeek = cagnotte[userId].randomByWeek || {};
    
    const key = todayKey();
    const weekKey = () => {
      const d = new Date();
      const y = d.getFullYear();
      const week = Math.ceil(((d - new Date(y, 0, 1)) / 86400000 + 1) / 7);
      return `${y}-W${String(week).padStart(2, "0")}`;
    };
    const currentWeekKey = weekKey();
    
    const dailyCount = Number(cagnotte[userId].randomByDay[key] || 0);
    const weeklyCount = Number(cagnotte[userId].randomByWeek[currentWeekKey] || 0);
    
    // Vérifier les quotas
    if (dailyCount >= settings.randomQuestionsPerDay) {
      return res.json({ 
        ok: false, 
        reason: "DAILY_LIMIT", 
        pending: cagnotte[userId].pending, 
        count: dailyCount 
      });
    }
    
    if (weeklyCount >= settings.randomQuestionsPerWeek) {
      return res.json({ 
        ok: false, 
        reason: "WEEKLY_LIMIT", 
        pending: cagnotte[userId].pending, 
        count: weeklyCount 
      });
    }
    
    // Incrémenter les compteurs SANS ajouter d'argent
    cagnotte[userId].randomByDay[key] = dailyCount + 1;
    cagnotte[userId].randomByWeek[currentWeekKey] = weeklyCount + 1;
    
    await writeCagnotte(cagnotte);
    res.json({ 
      ok: true, 
      pending: cagnotte[userId].pending,
      count: cagnotte[userId].randomByDay[key],
      dailyRemaining: settings.randomQuestionsPerDay - cagnotte[userId].randomByDay[key],
      weeklyRemaining: settings.randomQuestionsPerWeek - cagnotte[userId].randomByWeek[currentWeekKey]
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/earn/questionnaire", async (req, res) => {
  try {
    const { userId, amount } = req.body || {};
    const users = await readUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });
    const amt = Number(amount || 0);
    if (!(amt > 0)) return res.status(400).json({ error: "Montant invalide" });
    const cagnotte = await readCagnotte();
    cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {} };
    cagnotte[userId].pending = Number(cagnotte[userId].pending || 0) + amt;
    await writeCagnotte(cagnotte);
    res.json({ ok: true, pending: cagnotte[userId].pending });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Nouvel endpoint: obtenir l'état de progression de tous les questionnaires pour un utilisateur
app.get("/api/user/:userId/questionnaires-progress", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId requis" });
    
    const { questions, questionnaires } = await readAll();
    const responses = await readResponses();
    
    // Récupérer toutes les réponses de l'utilisateur
    const userAnswers = responses.answers.filter(a => a.userId === userId);
    const userCompletions = responses.completions.filter(c => c.userId === userId);
    
    // Construire un map questionnaireId -> Set de questionIds répondus
    const answeredByQn = new Map();
    userAnswers.forEach(a => {
      if (a.questionnaireId) {
        if (!answeredByQn.has(a.questionnaireId)) {
          answeredByQn.set(a.questionnaireId, new Set());
        }
        answeredByQn.get(a.questionnaireId).add(a.questionId);
      }
    });
    
    // Set des questionnaires complétés
    const completedQnIds = new Set(userCompletions.map(c => c.questionnaireId));
    
    // Construire les questions par questionnaire
    const questionsByQn = new Map();
    questions.forEach(q => {
      if (q.questionnaire) {
        if (!questionsByQn.has(q.questionnaire)) {
          questionsByQn.set(q.questionnaire, []);
        }
        questionsByQn.get(q.questionnaire).push(q);
      }
    });
    
    // Construire la progression pour chaque questionnaire
    const progress = {};
    questionnaires.forEach(qn => {
      const qnQuestions = questionsByQn.get(qn.id) || [];
      const answeredIds = answeredByQn.get(qn.id) || new Set();
      const totalQuestions = qnQuestions.length;
      const answeredCount = qnQuestions.filter(q => answeredIds.has(q.id)).length;
      const isCompleted = completedQnIds.has(qn.id);
      
      // Vérifier si toutes les questions ont été répondues (même sans completion enregistrée)
      const allAnswered = totalQuestions > 0 && answeredCount >= totalQuestions;
      
      progress[qn.id] = {
        totalQuestions,
        answeredCount,
        answeredQuestionIds: Array.from(answeredIds),
        isCompleted: isCompleted || allAnswered,
        remaining: Math.max(0, totalQuestions - answeredCount)
      };
    });
    
    res.json({ ok: true, progress });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Nouvel endpoint: valider et compléter un questionnaire
app.post("/api/questionnaire/:questionnaireId/validate", async (req, res) => {
  try {
    const { questionnaireId } = req.params;
    const { userId } = req.body || {};
    
    if (!questionnaireId || !userId) {
      return res.status(400).json({ error: "questionnaireId et userId requis" });
    }
    
    const { questions, questionnaires } = await readAll();
    const responses = await readResponses();
    
    // Trouver le questionnaire
    const questionnaire = questionnaires.find(qn => qn.id === questionnaireId);
    if (!questionnaire) {
      return res.status(404).json({ error: "Questionnaire introuvable" });
    }
    
    // Vérifier si déjà complété
    const alreadyCompleted = responses.completions.some(
      c => c.userId === userId && c.questionnaireId === questionnaireId
    );
    if (alreadyCompleted) {
      return res.json({ ok: true, alreadyCompleted: true, message: "Questionnaire déjà complété" });
    }
    
    // Récupérer toutes les questions du questionnaire
    const qnQuestions = questions.filter(q => q.questionnaire === questionnaireId);
    const totalQuestions = qnQuestions.length;
    
    // Récupérer les réponses de l'utilisateur pour ce questionnaire
    const userAnswers = responses.answers.filter(
      a => a.userId === userId && a.questionnaireId === questionnaireId
    );
    const answeredQuestionIds = new Set(userAnswers.map(a => a.questionId));
    
    // Vérifier si toutes les questions ont été répondues
    const unansweredQuestions = qnQuestions.filter(q => !answeredQuestionIds.has(q.id));
    
    if (unansweredQuestions.length > 0) {
      return res.json({
        ok: false,
        incomplete: true,
        totalQuestions,
        answeredCount: answeredQuestionIds.size,
        answeredQuestionIds: Array.from(answeredQuestionIds),
        missingCount: unansweredQuestions.length,
        missingQuestionIds: unansweredQuestions.map(q => q.id),
        message: `Il reste ${unansweredQuestions.length} question(s) à répondre`
      });
    }
    
    // Toutes les questions sont répondues - enregistrer la completion
    const completionEntry = {
      id: `cmp_${Math.random().toString(16).slice(2)}_${Date.now()}`,
      userId,
      questionnaireId,
      completedAt: nowIso()
    };
    
    responses.completions.push(completionEntry);
    await writeResponses(responses);
    
    // Donner la récompense
    const users = await readUsers();
    const user = users.find(u => u.id === userId);
    const userName = user ? (user.fullName || `${user.prenom} ${user.nom}`.trim()) : "Utilisateur";
    
    // Mettre à jour la completion avec le userName
    completionEntry.userName = userName;
    
    const amt = Number(questionnaire.reward || 0);
    let newPending = 0;
    if (amt > 0) {
      const cagnotte = await readCagnotte();
      cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {} };
      cagnotte[userId].pending = Number(cagnotte[userId].pending || 0) + amt;
      newPending = cagnotte[userId].pending;
      await writeCagnotte(cagnotte);
    }
    
    res.json({
      ok: true,
      completed: true,
      reward: amt,
      pending: newPending,
      message: "Questionnaire validé avec succès"
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Endpoint pour marquer un questionnaire comme complété (utilisé pour synchroniser après vérification côté client)
app.post("/api/questionnaire/:questionnaireId/mark-completed", async (req, res) => {
  try {
    const { questionnaireId } = req.params;
    const { userId } = req.body || {};
    
    if (!questionnaireId || !userId) {
      return res.status(400).json({ error: "questionnaireId et userId requis" });
    }
    
    const responses = await readResponses();
    
    // Vérifier si déjà complété
    const alreadyCompleted = responses.completions.some(
      c => c.userId === userId && c.questionnaireId === questionnaireId
    );
    
    if (alreadyCompleted) {
      return res.json({ ok: true, alreadyMarked: true });
    }
    
    // Ajouter une completion
    const completionEntry = {
      id: `cmp_${Math.random().toString(16).slice(2)}_${Date.now()}`,
      userId,
      questionnaireId,
      completedAt: nowIso(),
      autoMarked: true // Indique que c'est une synchronisation automatique
    };
    
    responses.completions.push(completionEntry);
    await writeResponses(responses);
    
    res.json({ ok: true, marked: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/user/sensible", async (req, res) => {
  try {
    const { userId, tagName, answer, questionId, questionTitle, isCaptcha } = req.body || {};
    const users = await readUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: "Utilisateur introuvable" });
    const u = users[idx];
    
    // Si c'est une question CAPTCHA, ne PAS stocker dans le profil utilisateur
    // (on l'enregistre uniquement dans reponses.json via /api/answers/append)
    if (isCaptcha) {
      // Mettre à jour le cooldown pour cette question CAPTCHA
      if (questionId) {
        const cooldowns = await readQuestionCooldowns();
        cooldowns[userId] = cooldowns[userId] || {};
        cooldowns[userId][questionId] = Date.now();
        await writeQuestionCooldowns(cooldowns);
      }
      return res.json({ ok: true, captcha: true });
    }
    
    // Tag name is optional.
    const t = tagName ? String(tagName).trim() : "";
    const tNorm = t.toLowerCase();

    // Special case: hardcoded variable.user tags -> write directly into utilisateur.json
    const field = getUserFieldForVariableTagName(t);
    if (field) {
      let processedAnswer = String(answer ?? "");
      
      // Si c'est le champ photoProfil et que c'est une image base64, la stocker séparément
      if (field === 'photoProfil' && isBase64Image(processedAnswer)) {
        const imageId = `user_${u.id}_photo`;
        processedAnswer = await storeImage(processedAnswer, imageId);
        console.log('[sensible] Photo converted and stored:', processedAnswer);
      }
      
      u[field] = processedAnswer;
      u.updatedAt = nowIso();
      users[idx] = normalizeUser(u);
      await writeUsers(users);
      
      // Mettre à jour le cooldown pour cette question variable.user
      if (questionId) {
        const cooldowns = await readQuestionCooldowns();
        cooldowns[userId] = cooldowns[userId] || {};
        cooldowns[userId][questionId] = Date.now();
        await writeQuestionCooldowns(cooldowns);
      }
      
      return res.json({ ok: true, updated: { field } });
    }

    // IMPORTANT: never persist base64 images in utilisateur.json.
    // If a sensible answer is a photo, store it as a real image blob and only keep the URL.
    let safeAnswer = answer;
    if (safeAnswer && isBase64Image(String(safeAnswer))) {
      const base = t ? `tag_${tNorm.replace(/[^a-z0-9_-]/g, '').slice(0, 32)}` : `q_${String(questionId || 'unknown')}`;
      const imageId = `sensible_${userId}_${base}_${Date.now()}`;
      safeAnswer = await storeImage(String(safeAnswer), imageId);
      console.log('[user/sensible] Photo converted and stored:', safeAnswer);
    }

    if (t) {
      u.sensibleAnswersTagged = u.sensibleAnswersTagged || [];
      // upsert per tag
      const existing = u.sensibleAnswersTagged.find((x) => String(x.tag || "").trim().toLowerCase() === tNorm);
      if (existing) existing.answer = safeAnswer;
      else u.sensibleAnswersTagged.push({ tag: t, answer: safeAnswer });
    } else {
      u.sensibleAnswersUntagged = u.sensibleAnswersUntagged || [];
      u.sensibleAnswersUntagged.push({ questionId: questionId || null, questionTitle: questionTitle || null, answer: safeAnswer });
    }
    u.updatedAt = nowIso();
    users[idx] = u;
    await writeUsers(users);
    
    // Mettre à jour le cooldown pour cette question
    if (questionId) {
      const cooldowns = await readQuestionCooldowns();
      cooldowns[userId] = cooldowns[userId] || {};
      cooldowns[userId][questionId] = Date.now();
      await writeQuestionCooldowns(cooldowns);
    }
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Obtenir les questions déjà répondues par l'utilisateur dans un questionnaire
app.get("/api/questionnaire/:questionnaireId/answered/:userId", async (req, res) => {
  try {
    const { questionnaireId, userId } = req.params;
    
    // Récupérer les réponses de l'utilisateur
    const responses = await readResponses();
    
    // Filtrer les réponses de cet utilisateur pour ce questionnaire
    const answeredQuestionIds = new Set();
    
    responses.answers.forEach(answer => {
      if (answer.userId === userId && answer.questionnaireId === questionnaireId) {
        answeredQuestionIds.add(answer.questionId);
      }
    });
    
    // Vérifier les completions pour voir si le questionnaire a déjà été complété
    const completed = responses.completions.some(c => 
      c.userId === userId && c.questionnaireId === questionnaireId
    );
    
    res.json({
      ok: true,
      answeredQuestionIds: Array.from(answeredQuestionIds),
      completed
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/user/request-withdraw", async (req, res) => {
  try {
    const { userId } = req.body || {};
    const users = await readUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: "Utilisateur introuvable" });
    const u = users[idx];

    const cagnotte = await readCagnotte();
    const pending = Number((cagnotte[userId] && cagnotte[userId].pending) || 0);
    if (pending < 2000) return res.status(400).json({ error: "Seuil minimum: 2000" });
    if (u.retrait && u.retrait.status === "PENDING") return res.status(400).json({ error: "Déjà en attente" });

    const adminList = await readAdminMoney();
    const entry = {
      id: `pay_${Math.random().toString(16).slice(2)}_${Date.now()}`,
      userId,
      fullName: u.fullName,
      compteBancaire: u.compteBancaire,
      telephone: u.telephone,
      amount: pending,
      createdAt: nowIso(),
    };
    adminList.unshift(entry);
    await writeAdminMoney(adminList);

    u.retrait = { status: "PENDING", amount: pending, requestedAt: nowIso() };
    u.updatedAt = nowIso();
    users[idx] = u;
    await writeUsers(users);

    cagnotte[userId] = cagnotte[userId] || { pending: 0, randomByDay: {} };
    cagnotte[userId].pending = 0;
    await writeCagnotte(cagnotte);

    res.json({ ok: true, retrait: u.retrait, pending: 0 });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.get("/api/admin/payments", async (req, res) => {
  try {
    const list = await readAdminMoney();
    const total = list.reduce((s, x) => s + Number(x.amount || 0), 0);
    res.json({ ok: true, total, payments: list });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/admin/payments/:id/validate", async (req, res) => {
  try {
    const id = req.params.id;
    const list = await readAdminMoney();
    const p = list.find((x) => x.id === id);
    if (!p) return res.status(404).json({ error: "Paiement introuvable" });

    const users = await readUsers();
    const idx = users.findIndex((u) => u.id === p.userId);
    if (idx === -1) return res.status(404).json({ error: "Utilisateur introuvable" });
    const u = users[idx];
    u.gagneSurBNI = Number(u.gagneSurBNI || 0) + Number(p.amount || 0);
    u.retrait = { status: "IDLE", amount: 0, requestedAt: null };
    u.updatedAt = nowIso();
    users[idx] = u;
    await writeUsers(users);

    const next = list.filter((x) => x.id !== id);
    await writeAdminMoney(next);

    res.json({ ok: true, user: u, remaining: next.length });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.post("/api/admin/payments/:id/cancel", async (req, res) => {
  try {
    const id = req.params.id;
    const list = await readAdminMoney();
    const p = list.find((x) => x.id === id);
    if (!p) return res.status(404).json({ error: "Paiement introuvable" });

    const users = await readUsers();
    const idx = users.findIndex((u) => u.id === p.userId);
    if (idx === -1) return res.status(404).json({ error: "Utilisateur introuvable" });
    const u = users[idx];
    
    // Remettre l'argent dans la cagnotte "Argent en attente"
    const cagnotte = await readCagnotte();
    cagnotte[p.userId] = cagnotte[p.userId] || { pending: 0, randomByDay: {} };
    cagnotte[p.userId].pending = Number(cagnotte[p.userId].pending || 0) + Number(p.amount || 0);
    await writeCagnotte(cagnotte);
    
    // Réinitialiser le statut de retrait
    u.retrait = { status: "IDLE", amount: 0, requestedAt: null };
    u.updatedAt = nowIso();
    users[idx] = u;
    await writeUsers(users);

    // Retirer le paiement de la liste
    const next = list.filter((x) => x.id !== id);
    await writeAdminMoney(next);

    res.json({ ok: true, user: u, pending: cagnotte[p.userId].pending, remaining: next.length });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// -----------------
// Statistics endpoint
// -----------------
app.get("/api/admin/statistics", async (req, res) => {
  try {
    const users = await readUsers();
    const db = await readAll();
    const questionnaires = db.questionnaires || [];
    const cagnotte = await readCagnotte();
    const responses = await readResponses();
    
    // Date d'aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Fonction pour obtenir la clé de date (YYYY-MM-DD)
    const getDateKey = (date) => {
      const d = new Date(date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    
    // Générer les 7 derniers jours
    const last7Days = [];
    const last7DaysData = {
      randomAnswers: {},
      questionnairesCompleted: {},
      inscriptions: {},
      connexions: {}
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
    
    // Réponses aléatoires par jour (7 derniers jours)
    Object.values(cagnotte).forEach(userCagnotte => {
      if (userCagnotte.randomByDay) {
        Object.entries(userCagnotte.randomByDay).forEach(([dateKey, count]) => {
          if (last7DaysData.randomAnswers.hasOwnProperty(dateKey)) {
            last7DaysData.randomAnswers[dateKey] += Number(count || 0);
          }
        });
      }
    });
    
    // Questionnaires complétés par jour
    (responses.completions || []).forEach(completion => {
      const dateKey = getDateKey(completion.completedAt);
      if (last7DaysData.questionnairesCompleted.hasOwnProperty(dateKey)) {
        last7DaysData.questionnairesCompleted[dateKey]++;
      }
    });
    
    // Inscriptions par jour
    users.forEach(user => {
      const dateKey = getDateKey(user.createdAt);
      if (last7DaysData.inscriptions.hasOwnProperty(dateKey)) {
        last7DaysData.inscriptions[dateKey]++;
      }
    });
    
    // Connexions par jour (simulé à partir des réponses pour la démo)
    // Dans une vraie app, vous trackeriez les connexions séparément
    (responses.answers || []).forEach(answer => {
      const dateKey = getDateKey(answer.answeredAt || answer.createdAt || new Date());
      if (last7DaysData.connexions.hasOwnProperty(dateKey)) {
        last7DaysData.connexions[dateKey]++;
      }
    });
    
    // Stats d'aujourd'hui
    const todayKey = getDateKey(today);
    const randomAnswersToday = last7DaysData.randomAnswers[todayKey] || 0;
    const questionnairesCompletedToday = last7DaysData.questionnairesCompleted[todayKey] || 0;
    const inscriptionsToday = last7DaysData.inscriptions[todayKey] || 0;
    const connexionsToday = last7DaysData.connexions[todayKey] || 0;
    
    // Total des cagnottes (argent en attente)
    const totalCagnotte = Object.values(cagnotte).reduce((sum, userCagnotte) => {
      return sum + Number(userCagnotte.pending || 0);
    }, 0);
    
    // Total de l'argent gagné sur BNI
    const totalGagneSurBNI = users.reduce((sum, user) => {
      return sum + Number(user.gagneSurBNI || 0);
    }, 0);
    
    // Nombre total d'utilisateurs
    const totalUsers = users.length;
    
    // Statistiques par catégorie pour les graphiques
    const stats = {
      sexe: {},
      couleurPeau: {},
      couleurCheveux: {},
      longueurCheveux: {},
      styleVestimentaire: {},
      metier: {}
    };
    
    users.forEach(user => {
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
          connexions: connexionsToday
        },
        last7Days: {
          dates: last7Days,
          randomAnswers: last7Days.map(d => last7DaysData.randomAnswers[d]),
          questionnairesCompleted: last7Days.map(d => last7DaysData.questionnairesCompleted[d]),
          inscriptions: last7Days.map(d => last7DaysData.inscriptions[d]),
          connexions: last7Days.map(d => last7DaysData.connexions[d])
        },
        userStats: stats
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// GET /api/admin/settings - Récupérer les paramètres système
app.get("/api/admin/settings", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_PATH, {
      randomQuestionsPerDay: 10,
      randomQuestionsPerWeek: 50,
      minimumWithdrawalAmount: 50, // en dollars
      earningsPerRandomQuestion: 0.10, // en dollars
      earningsPerQuestionnaire: 1.00, // en dollars
      maxWithdrawalsPerMonth: 5,
    });
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// PUT /api/admin/settings - Sauvegarder les paramètres système
app.put("/api/admin/settings", async (req, res) => {
  try {
    const settings = req.body || {};
    
    // Validation des paramètres
    const validatedSettings = {
      randomQuestionsPerDay: Math.max(1, Math.min(100, parseInt(settings.randomQuestionsPerDay) || 10)),
      randomQuestionsPerWeek: Math.max(1, Math.min(500, parseInt(settings.randomQuestionsPerWeek) || 50)),
      minimumWithdrawalAmount: Math.max(0.01, parseFloat(settings.minimumWithdrawalAmount) || 50), // en dollars
      earningsPerRandomQuestion: Math.max(0.01, parseFloat(settings.earningsPerRandomQuestion) || 0.10), // en dollars
      earningsPerQuestionnaire: Math.max(0.01, parseFloat(settings.earningsPerQuestionnaire) || 1.00), // en dollars
      maxWithdrawalsPerMonth: Math.max(1, Math.min(50, parseInt(settings.maxWithdrawalsPerMonth) || 5)),
    };
    
    await writeJson(SETTINGS_PATH, validatedSettings);
    res.json(validatedSettings);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});


// -----------------
// Data import (Netlify Blobs bootstrap)
// Public endpoint by request: allows uploading current JSON files into the persistent store.
// WARNING: this allows overwriting data; keep the /data URL private if needed.
// -----------------
const ALLOWED_DATA_FILES = new Set([
  "question.json",
  "questionnaire.json",
  "tag.json",
  "reponses.json",
  "utilisateur.json",
  "cagnotte.json",
  "argentadmin.json",
  "questionCooldowns.json",
  "settings.json",
]);

app.post("/api/data/import", async (req, res) => {
  try {
    const body = req.body || {};
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) return res.status(400).json({ error: "Aucun fichier" });

    const results = [];
    for (const f of files) {
      const name = String(f && (f.name || f.filename || f.key) ? (f.name || f.filename || f.key) : "").trim();
      if (!name) continue;

      // sanitize: keep only basename
      const base = name.split("/").pop().split("\\").pop();
      if (!ALLOWED_DATA_FILES.has(base)) {
        results.push({ name: base, ok: false, error: "Nom de fichier non autorisé" });
        continue;
      }

      const data = f && Object.prototype.hasOwnProperty.call(f, "data") ? f.data : null;
      if (data === null || data === undefined) {
        results.push({ name: base, ok: false, error: "Contenu manquant" });
        continue;
      }

      // Persist
      await writeJson(keyOrPath(base), data);
      results.push({ name: base, ok: true });
    }

    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});


// -----------------
// Image Storage Management
// -----------------
// Store images separately in Netlify Blobs to avoid large JSON payloads
// Images are stored with keys like: "images/q_abc123.png" or "images/user_xyz.jpg"

async function storeImage(base64Data, imageId) {
  if (!base64Data || typeof base64Data !== 'string') {
    throw new Error('Invalid base64 data');
  }

  // Extract media type and data from base64 string
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    console.error('[storeImage] Invalid base64 format, data starts with:', base64Data.substring(0, 50));
    throw new Error('Invalid base64 format');
  }

  const mediaType = matches[1];
  const base64Content = matches[2];
  
  // Determine file extension
  const ext = mediaType.split('/')[1] || 'png';
  const imageKey = `images/${imageId}.${ext}`;

  // Helper: only disable Blobs when we are clearly missing the Blobs environment.
  // For other errors (transient/network/etc.), we prefer failing the request rather than
  // silently falling back to the (ephemeral) function filesystem.
  const shouldDisableBlobs = (err) => {
    const msg = String(err && err.message ? err.message : err);
    return /MissingBlobsEnvironmentError/i.test(msg) ||
      /environment has not been configured to use Netlify Blobs/i.test(msg) ||
      (/Netlify Blobs store non initialisé/i.test(msg) && /SITE_ID|token/i.test(msg));
  };

  if (USE_BLOBS && !BLOBS_DISABLED) {
    const store = await getBlobsStore();
    if (!store) {
      console.error('[storeImage] Blobs store not initialized - falling back to filesystem');
      console.error('[storeImage] USE_BLOBS:', USE_BLOBS, 'BLOBS_DISABLED:', BLOBS_DISABLED);
      // Désactiver Blobs et utiliser le filesystem à la place
      BLOBS_DISABLED = true;
    } else {
      try {
        // Convert base64 to buffer
        const buffer = Buffer.from(base64Content, 'base64');
        
        console.log(`[storeImage] Storing ${imageKey}, size: ${buffer.length} bytes, type: ${mediaType}`);
        
        // Store as binary blob
        await store.set(imageKey, buffer, {
          metadata: { contentType: mediaType }
        });

        // Verify using a binary-safe read (text mode can look "empty" for binary)
        const verified = await store.getWithMetadata(imageKey, { type: 'arrayBuffer' });
        if (!verified || !verified.data || verified.data.byteLength <= 0) {
          throw new Error(`Image stored but verification failed for ${imageKey}`);
        }
        
        console.log(`[storeImage] Successfully stored and verified ${imageKey}`);
        
        // Return the URL path to access this image
        return `/api/images/${imageId}.${ext}`;
      } catch (e) {
        console.error('[storeImage] Blobs error:', e);
        console.error('[storeImage] Image key:', imageKey);

        // Only disable blobs if we're truly missing the Blobs environment.
        // Otherwise, surface the error so the client can retry (and we never persist base64).
        if (shouldDisableBlobs(e)) {
          console.error('[storeImage] Disabling Blobs due to missing/invalid Blobs environment');
          BLOBS_DISABLED = true;
        } else {
          throw e;
        }
      }
    }
  }
  
  // Filesystem fallback
  await ensureDir();
  const imagesDir = path.join(DATA_DIR, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  const imagePath = path.join(imagesDir, `${imageId}.${ext}`);
  const buffer = Buffer.from(base64Content, 'base64');
  await fs.writeFile(imagePath, buffer);
  console.log(`[storeImage] Successfully stored ${imagePath} (filesystem)`);
  return `/api/images/${imageId}.${ext}`;
}

async function getImage(imageFilename) {
  const imageKey = `images/${imageFilename}`;

  if (USE_BLOBS && !BLOBS_DISABLED) {
    try {
      const store = await getBlobsStore();
      if (!store) {
        console.error('[getImage] Blobs store not initialized');
      } else {
        // Use a binary-safe retrieval and prefer the stored metadata contentType.
        // (If we read binary blobs in text mode, it can appear "empty" and break images.)
        const getter = typeof store.getWithMetadata === 'function'
          ? (k) => store.getWithMetadata(k, { type: 'arrayBuffer' })
          : async (k) => {
              const data = await store.get(k, { type: 'arrayBuffer' });
              return data ? { data, metadata: {} } : null;
            };

        const entry = await getter(imageKey);
        if (entry && entry.data) {
          const ext = imageFilename.split('.').pop().toLowerCase();
          const typeMap = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml'
          };
          const contentType = (entry.metadata && entry.metadata.contentType) || typeMap[ext] || 'image/png';

          console.log(`[getImage] Successfully retrieved ${imageKey} from Blobs, size: ${entry.data.byteLength} bytes, type: ${contentType}`);

          return {
            buffer: Buffer.from(entry.data),
            contentType
          };
        }
        
        console.log(`[getImage] Image not found in Blobs: ${imageKey}, trying filesystem`);
      }
    } catch (e) {
      console.error('[getImage] Blobs error:', e);
      console.error('[getImage] Image key:', imageKey);
      console.log('[getImage] Trying filesystem fallback');
    }
  }
  
  // Filesystem fallback
  const imagePath = path.join(DATA_DIR, 'images', imageFilename);
  try {
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(imageFilename).slice(1).toLowerCase();
    const typeMap = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml'
    };
    const contentType = typeMap[ext] || 'application/octet-stream';
    console.log(`[getImage] Successfully retrieved ${imagePath} from filesystem`);
    return { buffer, contentType };
  } catch (e) {
    console.error('[getImage] Filesystem error:', e);
    console.error('[getImage] Image path:', imagePath);
    return null;
  }
}

// Helper function to detect if a string is a base64 image
function isBase64Image(str) {
  if (typeof str !== 'string') return false;
  return /^data:image\/[a-zA-Z]+;base64,/.test(str);
}

// Endpoint to retrieve images
app.get("/api/images/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const image = await getImage(filename);
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.setHeader('Content-Type', image.contentType);
    // NOTE: some images (ex: photo de profil) can be replaced while keeping the same URL.
    // A very long cache can make the UI look "broken" (old/corrupted cached responses).
    // Keep a reasonable cache and rely on the browser/Netlify revalidation.
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(image.buffer);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Endpoint to upload an image
app.post("/api/images/upload", async (req, res) => {
  try {
    const { base64Data, id } = req.body;
    
    if (!base64Data) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    
    // Generate ID if not provided
    const imageId = id || `img_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    
    const imageUrl = await storeImage(base64Data, imageId);
    
    res.json({ 
      ok: true, 
      imageUrl,
      imageId 
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Migration endpoint to convert base64 images in existing data to separate image files
app.post("/api/admin/migrate-images", async (req, res) => {
  try {
    let migratedCount = 0;
    const results = {
      questions: 0,
      users: 0,
      total: 0
    };

    // Migrate questions
    const questions = await readJson(QUESTIONS_PATH, []);
    const questionsProcessed = [];
    
    for (const question of questions) {
      const processed = { ...question };
      
      // Process imageUrl
      if (processed.imageUrl && isBase64Image(processed.imageUrl)) {
        const imageId = `q_${question.id}_img`;
        try {
          processed.imageUrl = await storeImage(processed.imageUrl, imageId);
          results.questions++;
          migratedCount++;
        } catch (e) {
          console.error(`[migrate] Failed to migrate question image ${question.id}:`, e);
        }
      }
      
      questionsProcessed.push(processed);
    }
    
    if (results.questions > 0) {
      await writeJson(QUESTIONS_PATH, questionsProcessed);
    }

    // Migrate users
    const users = await readUsers();
    const usersProcessed = [];
    
    for (const user of users) {
      const processed = { ...user };
      
      // Process photoProfil
      if (processed.photoProfil && isBase64Image(processed.photoProfil)) {
        const imageId = `user_${user.id}_photo`;
        try {
          processed.photoProfil = await storeImage(processed.photoProfil, imageId);
          results.users++;
          migratedCount++;
        } catch (e) {
          console.error(`[migrate] Failed to migrate user photo ${user.id}:`, e);
        }
      }
      
      usersProcessed.push(processed);
    }
    
    if (results.users > 0) {
      await writeJson(USERS_PATH, usersProcessed);
    }

    results.total = migratedCount;

    res.json({
      ok: true,
      message: `Migration completed. ${migratedCount} images migrated.`,
      results
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] persistence: ${USE_BLOBS ? "netlify-blobs" : "filesystem"}`);
    if (!USE_BLOBS) {
      console.log(`[server] data dir: ${DATA_DIR}`);
      console.log(`[server] questions: ${QUESTIONS_PATH}`);
      console.log(`[server] questionnaires: ${QUESTIONNAIRES_PATH}`);
      console.log(`[server] tags: ${TAGS_PATH}`);
    } else {
      console.log(`[server] blobs store: ${process.env.BLOBS_STORE_NAME || "bni-data"}`);
    }
  });
}

module.exports = app;

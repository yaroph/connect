const {
  USER_VARIABLE_TAGS,
  USER_VARIABLE_TAG_NAMES_LOWER,
  USER_VARIABLE_FIELDS,
} = require("../config/constants");

const nowIso = () => new Date().toISOString();

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

function dayKey(value = new Date()) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentWeekKey(value = new Date()) {
  const d = new Date(value);
  const y = d.getFullYear();
  const week = Math.ceil(((d - new Date(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

function currentMonthKey(value = new Date()) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function markUserLogin(user, value = new Date()) {
  const at = new Date(value);
  const key = dayKey(at);
  const loginByDay =
    user && user.loginByDay && typeof user.loginByDay === "object"
      ? { ...user.loginByDay }
      : {};
  loginByDay[key] = Number(loginByDay[key] || 0) + 1;
  return {
    ...user,
    loginByDay,
    lastLoginAt: at.toISOString(),
  };
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

function dateOnlyKey(value) {
  const dt = parseDateOnlyMaybe(value);
  if (!dt) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isPriorityActive(question, now = new Date()) {
  const enabled = Boolean(question && (question.priority ?? question.prioritaire));
  if (!enabled) return false;
  const untilRaw = question
    ? question.priorityUntil ??
      question.prioritaireUntil ??
      question.priorityEndDate ??
      question.prioritaireFin
    : null;
  const dt = parseDateOnlyMaybe(untilRaw);
  if (!dt) return false;
  const end = new Date(dt.getTime());
  end.setHours(23, 59, 59, 999);
  return now.getTime() <= end.getTime();
}

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

function asArray(v) {
  return Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
}

module.exports = {
  nowIso,
  nameKey,
  todayKey,
  dayKey,
  currentWeekKey,
  currentMonthKey,
  markUserLogin,
  parseDateOnlyMaybe,
  dateOnlyKey,
  isPriorityActive,
  getUserFieldForVariableTagName,
  asArray,
};

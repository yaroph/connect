const path = require("path");

const PORT = process.env.PORT || 4000;
const IS_LAMBDA =
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT);

// Netlify Functions file system is read-only outside /tmp.
// We primarily persist to Netlify Blobs, but if Blobs is disabled for some reason,
// this fallback prevents ENOENT/EROFS crashes (data will be ephemeral).
const DATA_DIR = IS_LAMBDA ? path.join("/tmp", "data") : path.join(__dirname, "..", "..", "data");

const APP_ENCRYPTION_SECRET =
  process.env.APP_ENCRYPTION_SECRET ||
  process.env.PASSWORD_SECRET_KEY ||
  "bni-connect-secure-passwords-encryption-key-2025!";

const DEFAULT_SETTINGS = {
  randomQuestionsPerDay: 10,
  randomQuestionsPerWeek: 50,
  minimumWithdrawalAmount: 50,
  earningsPerRandomQuestion: 0.10,
  earningsPerQuestionnaire: 1.00,
  randomQuestionCooldown: 14,
  maxWithdrawalsPerMonth: 5,
};

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

module.exports = {
  PORT,
  IS_LAMBDA,
  DATA_DIR,
  APP_ENCRYPTION_SECRET,
  DEFAULT_SETTINGS,
  USER_VARIABLE_TAGS,
  USER_VARIABLE_TAG_IDS,
  USER_VARIABLE_TAG_NAMES_LOWER,
  USER_VARIABLE_FIELDS,
  ALLOWED_DATA_FILES,
};

// Hardcoded tags that map answers directly into utilisateur.json fields.
// These tags are visible like regular tags, but are not editable/deletable.

export const USER_VARIABLE_TAGS = [
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

const byId = new Map(USER_VARIABLE_TAGS.map((t) => [t.id, t]));
const byNameLower = new Map(USER_VARIABLE_TAGS.map((t) => [String(t.name).toLowerCase(), t]));

export function isUserVariableTag(tag) {
  if (!tag) return false;
  const id = String(tag.id || "");
  const name = String(tag.name || "");
  if (byId.has(id)) return true;
  return name.toLowerCase().startsWith("variable.user.");
}

export function getUserFieldForTagId(tagId) {
  const t = byId.get(String(tagId || ""));
  return t ? t.field : null;
}

export function getUserFieldForTagName(tagName) {
  const name = String(tagName || "").trim();
  if (!name) return null;
  const direct = byNameLower.get(name.toLowerCase());
  if (direct) return direct.field;
  const lower = name.toLowerCase();
  if (!lower.startsWith("variable.user.")) return null;
  const field = name.slice("variable.user.".length).trim();
  const allowed = new Set(USER_VARIABLE_TAGS.map((x) => x.field));
  return allowed.has(field) ? field : null;
}

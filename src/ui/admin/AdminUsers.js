import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Copy,
  CheckCircle2,
  Pencil,
  Download,
  Trash2,
  AlertTriangle,
  User,
  CreditCard,
  Tag,
  Save,
  X,
} from "lucide-react";
import {
  adminListUsers,
  adminUpdateUser,
  loadDB,
  resizeImage,
  adminDeleteUser,
} from "../../data/storage";
import Modal from "../Modal";

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function initials(u) {
  const a = (u?.prenom || "")[0] || "?";
  const b = (u?.nom || "")[0] || "";
  return `${String(a).toUpperCase()}${String(b).toUpperCase()}`;
}

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="iconCopy"
      type="button"
      title="Copier"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value || ""));
          setOk(true);
          setTimeout(() => setOk(false), 700);
        } catch (e) {
          // ignore
        }
      }}
    >
      {ok ? <CheckCircle2 size={16} /> : <Copy size={16} />}
    </button>
  );
}

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newTagAnswer, setNewTagAnswer] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoModal, setPhotoModal] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoUpload, setPhotoUpload] = useState(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminListUsers();
      setUsers(r.users || []);
      if (!selectedId && (r.users || []).length) setSelectedId(r.users[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Load tags for the "add sensitive answer" selector
    loadDB()
      .then((db) =>
        setAllTags(
          (db?.tags || [])
            .map((t) => String(t?.name || "").trim())
            .filter(Boolean),
        ),
      )
      .catch(() => setAllTags([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // reset edit state when changing selected user
    setEditMode(false);
    setNewTag("");
    setNewTagAnswer("");
    setPhotoModal(false);
    setPhotoUrl("");
    setPhotoUpload(null);
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.prenom} ${u.nom}`.toLowerCase().includes(q),
    );
  }, [users, query]);

  const selected = useMemo(
    () => users.find((u) => u.id === selectedId) || null,
    [users, selectedId],
  );

  useEffect(() => {
    setEditMode(false);
    setNewTag("");
    setNewTagAnswer("");
  }, [selectedId]);

  const updateSelected = (patch) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === selectedId ? { ...u, ...patch } : u)),
    );
  };

  const exportUser = () => {
    if (!selected) return;

    let content = `EXPORT UTILISATEUR\n`;
    content += `==================\n\n`;
    content += `Date d'export : ${new Date().toLocaleString("fr-FR")}\n\n`;

    // Section Compte
    content += `--- COMPTE ---\n`;
    content += `Prénom : ${selected.prenom || ""}\n`;
    content += `Nom : ${selected.nom || ""}\n`;
    content += `Nom complet : ${selected.fullName || ""}\n`;
    content += `Téléphone : ${selected.telephone || ""}\n`;
    content += `Date de naissance : ${selected.dateNaissance || ""}\n`;
    content += `Numéro de compte : ${selected.compteBancaire || ""}\n`;
    content += `Numéro de citoyen : ${selected.numeroCitoyen || ""}\n`;
    content += `Mot de passe : ${selected.motDePasse || ""}\n`;
    content += `Photo de profil : ${selected.photoProfil ? (selected.photoProfil.startsWith("data:") ? "[Base64 Data]" : selected.photoProfil) : ""}\n`;
    content += `Argent gagné sur BNI : $${Number(selected.gagneSurBNI || 0).toFixed(2)}\n\n`;

    // Section Infos
    content += `--- INFOS ---\n`;
    content += `Sexe : ${selected.sexe || ""}\n`;
    content += `Couleur de peau : ${selected.couleurPeau || ""}\n`;
    content += `Couleur de cheveux : ${selected.couleurCheveux || ""}\n`;
    content += `Longueur de cheveux : ${selected.longueurCheveux || ""}\n`;
    content += `Style vestimentaire : ${selected.styleVestimentaire || ""}\n`;
    content += `Métier : ${selected.metier || ""}\n\n`;

    // Section Réponses sensibles (avec tag)
    content += `--- RÉPONSES SENSIBLES (avec tag) ---\n`;
    if ((selected.sensibleAnswersTagged || []).length === 0) {
      content += `Aucune\n\n`;
    } else {
      selected.sensibleAnswersTagged.forEach((a) => {
        content += `${a.tag} : ${a.answer || ""}\n`;
      });
      content += `\n`;
    }

    // Section Réponses sensibles (sans tag)
    content += `--- RÉPONSES SENSIBLES (sans tag) ---\n`;
    if ((selected.sensibleAnswersUntagged || []).length === 0) {
      content += `Aucune\n\n`;
    } else {
      selected.sensibleAnswersUntagged.forEach((a, i) => {
        content += `${i + 1}. ${a.questionTitle || "Question"}\n`;
        content += `   Réponse : ${a.answer || ""}\n`;
      });
      content += `\n`;
    }

    // Section Métadonnées
    content += `--- MÉTADONNÉES ---\n`;
    content += `ID : ${selected.id || ""}\n`;
    content += `Date de création : ${selected.createdAt ? new Date(selected.createdAt).toLocaleString("fr-FR") : ""}\n`;
    content += `Dernière mise à jour : ${selected.updatedAt ? new Date(selected.updatedAt).toLocaleString("fr-FR") : ""}\n`;

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const filename =
      `export_utilisateur_${selected.prenom}_${selected.nom}_${timestamp}.txt`.replace(
        /\s+/g,
        "_",
      );
    downloadTextFile(filename, content);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const r = await adminUpdateUser(selected.id, selected);
      if (r && r.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === selected.id ? { ...u, ...r.user } : u)),
        );
        setEditMode(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const r = await adminDeleteUser(selected.id);
      if (r && r.ok) {
        // Supprimer l'utilisateur de la liste
        setUsers((prev) => prev.filter((u) => u.id !== selected.id));
        // Sélectionner le premier utilisateur restant ou null
        const remaining = users.filter((u) => u.id !== selected.id);
        setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        setDeleteConfirmModal(false);
        setEditMode(false);
      }
    } catch (e) {
      alert("Erreur lors de la suppression de l'utilisateur.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="adminUsersTop">
        <div className="adminSearch">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom ou prénom..."
          />
        </div>
        <div className="adminUsersCount">
          Total: {users.length} utilisateurs
        </div>
      </div>

      {loading ? <div className="muted">Chargement…</div> : null}

      <div className="adminUsersList">
        {filtered.map((u, idx) => (
          <div
            key={u.id}
            className={`adminUserCard ${u.id === selectedId ? "selected" : ""}`}
            onClick={() => setSelectedId(u.id)}
            role="button"
            tabIndex={0}
          >
            <div className="adminUserCardHead">
              <button
                type="button"
                className="adminUserAvatar"
                title="Voir la photo"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (u.photoProfil) setPhotoPreview(u.photoProfil);
                }}
              >
                {u.photoProfil ? (
                  <img alt="" src={u.photoProfil} />
                ) : (
                  initials(u)
                )}
              </button>
              <div className="adminUserHeadInfo">
                <div className="adminUserTitle">
                  {idx + 1}. {u.prenom} {u.nom}
                  {u.is_admin ? (
                    <span
                      style={{
                        marginLeft: 8,
                        padding: "2px 8px",
                        borderRadius: 12,
                        background:
                          "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
                        color: "#000",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "inline-block",
                        boxShadow: "0 2px 4px rgba(255, 215, 0, 0.3)",
                      }}
                    >
                      ADMIN
                    </span>
                  ) : null}
                </div>
                <div className="adminUserMoney">
                  <span>${Number(u.gagneSurBNI || 0).toFixed(0)} payés</span>
                  <span className="muted">
                    ${Number(u.pending || 0).toFixed(0)} en attente
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="adminUserEditIcon"
                title="Modifier"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedId(u.id);
                  setEditMode((prev) => (u.id === selectedId ? !prev : true));
                }}
              >
                <Pencil size={18} />
              </button>
            </div>

            {u.id === selectedId && selected ? (
              <div className="adminUserDetails">
                {!editMode ? (
                  <div className="adminBox cyberDossierWrap">
                    {/* Section 1: Identité & Coordonnées */}
                    <div className="dossierSectionTitle">
                      <CreditCard size={15} />
                      <span>Identité & Compte Bancaire</span>
                    </div>
                    <div className="adminTwoCols">
                      <ReadOnlyText
                        label="Prénom & Nom"
                        value={`${selected.prenom || ""} ${selected.nom || ""}`}
                      />
                      <ReadOnlyText
                        label="Numéro de citoyen"
                        value={selected.numeroCitoyen || ""}
                        right={<CopyBtn value={selected.numeroCitoyen} />}
                      />
                      <ReadOnlyText
                        label="Numéro de compte bancaire"
                        value={selected.compteBancaire}
                        right={<CopyBtn value={selected.compteBancaire} />}
                      />
                      <ReadOnlyText
                        label="Téléphone"
                        value={selected.telephone}
                        right={<CopyBtn value={selected.telephone} />}
                      />
                      <ReadOnlyText
                        label="Date de naissance"
                        value={selected.dateNaissance}
                      />
                      <ReadOnlyText
                        label="Mot de passe"
                        value={selected.motDePasse || "—"}
                        right={<CopyBtn value={selected.motDePasse} />}
                      />
                    </div>

                    {/* Section 2: Caractéristiques RP */}
                    <div className="dossierSectionTitle" style={{ marginTop: 16 }}>
                      <User size={15} />
                      <span>Caractéristiques & Profil RP</span>
                    </div>
                    <div className="adminTwoCols">
                      <ReadOnlyText label="Sexe" value={selected.sexe} />
                      <ReadOnlyText label="Couleur de peau" value={selected.couleurPeau} />
                      <ReadOnlyText label="Couleur de cheveux" value={selected.couleurCheveux} />
                      <ReadOnlyText label="Longueur de cheveux" value={selected.longueurCheveux} />
                      <ReadOnlyText label="Style vestimentaire" value={selected.styleVestimentaire} />
                      <ReadOnlyText label="Métier" value={selected.metier} />
                    </div>

                    {/* Section 3: Réponses Sensibles & Tags */}
                    <div className="dossierSectionTitle" style={{ marginTop: 16 }}>
                      <Tag size={15} />
                      <span>Données Sensibles & Tags Profilés</span>
                    </div>
                    {(selected.sensibleAnswersTagged || []).length === 0 ? (
                      <div className="muted" style={{ fontSize: 13, padding: "4px 0" }}>
                        Aucune réponse sensible taguée
                      </div>
                    ) : (
                      <div className="adminTagChipsGrid">
                        {(selected.sensibleAnswersTagged || []).map((a, i) => (
                          <div key={i} className="adminTagChip">
                            <span className="adminTagChipKey">{a.tag} :</span>
                            <span className="adminTagChipVal">{String(a.answer || "")}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="adminSaveRow" style={{ marginTop: 20 }}>
                      <button
                        className="btn btnGhost"
                        type="button"
                        onClick={exportUser}
                      >
                        <Download size={15} />
                        <span>Exporter en TXT</span>
                      </button>
                      <button
                        className="btn btnGhost"
                        type="button"
                        onClick={() => setDeleteConfirmModal(true)}
                        style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.4)" }}
                      >
                        <Trash2 size={15} />
                        <span>Supprimer</span>
                      </button>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        style={{ marginLeft: "auto" }}
                        onClick={() => setEditMode(true)}
                      >
                        <Pencil size={15} />
                        <span>Modifier le citoyen</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="adminBox">
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#00f0ff", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
                        Édition du Compte Citoyen
                      </div>

                      <div className="adminTwoCols">
                        <Field
                          label="Prénom"
                          value={selected.prenom}
                          onChange={(v) => updateSelected({ prenom: v })}
                        />
                        <Field
                          label="Nom"
                          value={selected.nom}
                          onChange={(v) => updateSelected({ nom: v })}
                        />
                        <Field
                          label="Téléphone"
                          value={selected.telephone}
                          onChange={(v) => updateSelected({ telephone: v })}
                          right={<CopyBtn value={selected.telephone} />}
                        />
                        <Field
                          label="Date de naissance"
                          value={selected.dateNaissance}
                          onChange={(v) => updateSelected({ dateNaissance: v })}
                        />
                        <Field
                          label="Numéro de compte"
                          value={selected.compteBancaire}
                          onChange={(v) =>
                            updateSelected({ compteBancaire: v })
                          }
                          right={<CopyBtn value={selected.compteBancaire} />}
                        />
                        <Field
                          label="Numéro de citoyen"
                          value={selected.numeroCitoyen || ""}
                          onChange={(v) => updateSelected({ numeroCitoyen: v })}
                        />
                        <Field
                          label="Mot de passe"
                          value={selected.motDePasse}
                          onChange={(v) => updateSelected({ motDePasse: v })}
                        />
                        <div
                          className="adminField"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          <div className="adminFieldLabel">
                            Photo de profil (URL ou base64)
                          </div>
                          <div className="adminFieldRow">
                            <input
                              className="adminFieldInput"
                              value={selected.photoProfil || ""}
                              onChange={(e) =>
                                updateSelected({ photoProfil: e.target.value })
                              }
                            />
                            <div className="adminFieldRight">
                              <button
                                className="btn btnGhost"
                                type="button"
                                onClick={() => {
                                  setPhotoUrl("");
                                  setPhotoUpload(null);
                                  setPhotoModal(true);
                                }}
                              >
                                Changer la photo
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="adminBox">
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#ffd600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                        Droits d'administration
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "6px 0",
                        }}
                      >
                        <input
                          type="checkbox"
                          id="isAdminCheckbox"
                          checked={Boolean(selected.is_admin)}
                          onChange={(e) =>
                            updateSelected({ is_admin: e.target.checked })
                          }
                          style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#00f0ff" }}
                        />
                        <label
                          htmlFor="isAdminCheckbox"
                          style={{ cursor: "pointer", fontWeight: 700, color: "#f8fafc" }}
                        >
                          Compte Administrateur (Accès complet au Panel Admin)
                        </label>
                      </div>
                    </div>

                    <div className="adminBox">
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#00f0ff", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
                        Caractéristiques & Profil RP
                      </div>
                      <div className="adminTwoCols">
                        <Field
                          label="Sexe"
                          value={selected.sexe || ""}
                          onChange={(v) => updateSelected({ sexe: v })}
                        />
                        <Field
                          label="Couleur de peau"
                          value={selected.couleurPeau || ""}
                          onChange={(v) => updateSelected({ couleurPeau: v })}
                        />
                        <Field
                          label="Couleur de cheveux"
                          value={selected.couleurCheveux || ""}
                          onChange={(v) =>
                            updateSelected({ couleurCheveux: v })
                          }
                        />
                        <Field
                          label="Longueur de cheveux"
                          value={selected.longueurCheveux || ""}
                          onChange={(v) =>
                            updateSelected({ longueurCheveux: v })
                          }
                        />
                        <Field
                          label="Style vestimentaire"
                          value={selected.styleVestimentaire || ""}
                          onChange={(v) =>
                            updateSelected({ styleVestimentaire: v })
                          }
                        />
                        <Field
                          label="Métier"
                          value={selected.metier || ""}
                          onChange={(v) => updateSelected({ metier: v })}
                        />
                      </div>
                    </div>

                    <div className="adminBox">
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#00f0ff", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
                        Réponses sensibles (avec tag)
                      </div>
                      {(selected.sensibleAnswersTagged || []).length === 0 ? (
                        <div className="muted" style={{ fontSize: 13 }}>Aucune</div>
                      ) : (
                        <div className="adminTwoCols">
                          {(selected.sensibleAnswersTagged || []).map(
                            (a, i) => (
                              <TextField
                                key={`${a.tag}_${i}`}
                                label={a.tag}
                                value={String(a.answer || "")}
                                onChange={(v) => {
                                  const next = [
                                    ...(selected.sensibleAnswersTagged || []),
                                  ];
                                  next[i] = { ...next[i], answer: v };
                                  updateSelected({
                                    sensibleAnswersTagged: next,
                                  });
                                }}
                              />
                            ),
                          )}
                        </div>
                      )}

                      <div className="adminAddTagRow" style={{ marginTop: 12 }}>
                        <input
                          className="adminFieldInput"
                          list="bniTagList"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          placeholder="Nom du tag"
                        />
                        <datalist id="bniTagList">
                          {(allTags || []).map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                        <input
                          className="adminFieldInput"
                          value={newTagAnswer}
                          onChange={(e) => setNewTagAnswer(e.target.value)}
                          placeholder="Réponse"
                        />
                        <button
                          className="btn btnGhost"
                          type="button"
                          onClick={() => {
                            const t = (newTag || "").trim();
                            if (!t) return;
                            const usedInSensitive = new Set(
                              (
                                (selected && selected.sensibleAnswersTagged) ||
                                []
                              ).map((x) => String(x.tag || "").trim()),
                            );
                            if (usedInSensitive.has(t)) return;
                            const ans = (newTagAnswer || "").trim();
                            const list = [
                              ...(selected.sensibleAnswersTagged || []),
                            ];
                            const idx = list.findIndex((x) => x.tag === t);
                            if (idx >= 0)
                              list[idx] = { ...list[idx], answer: ans };
                            else list.push({ tag: t, answer: ans });
                            updateSelected({ sensibleAnswersTagged: list });
                            setNewTag("");
                            setNewTagAnswer("");
                          }}
                        >
                          + Ajouter
                        </button>
                      </div>
                    </div>

                    <div className="adminSaveRow">
                      <button
                        className="btn btnGhost"
                        type="button"
                        onClick={() => setDeleteConfirmModal(true)}
                        style={{
                          color: "#f87171",
                          borderColor: "rgba(239, 68, 68, 0.4)",
                        }}
                      >
                        <Trash2 size={15} />
                        <span>Supprimer le profil</span>
                      </button>
                      <div
                        style={{ marginLeft: "auto", display: "flex", gap: 10 }}
                      >
                        <button
                          className="btn btnGhost"
                          type="button"
                          disabled={saving}
                          onClick={() => setEditMode(false)}
                        >
                          <X size={14} />
                          <span>Annuler</span>
                        </button>
                        <button
                          className="btn btnPrimary"
                          type="button"
                          disabled={saving}
                          onClick={save}
                        >
                          <Save size={14} />
                          <span>{saving ? "Sauvegarde…" : "Enregistrer"}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {photoPreview ? (
        <Modal title="Photo de profil" onClose={() => setPhotoPreview("")}>
          <div
            style={{ display: "flex", justifyContent: "center", padding: 8 }}
          >
            <img
              alt=""
              src={photoPreview}
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                borderRadius: 18,
                objectFit: "contain",
              }}
            />
          </div>
        </Modal>
      ) : null}

      {photoModal ? (
        <Modal
          title="Changer la photo de profil"
          onClose={() => setPhotoModal(false)}
        >
          <div className="field">
            <div className="label">Upload</div>
            <input
              className="input"
              style={{ padding: 10 }}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setPhotoUpload(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setPhotoUrl("");
              }}
            />
          </div>
          <div className="field">
            <div className="label">Ou lien (URL)</div>
            <input
              className="input"
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value);
                if (e.target.value) setPhotoUpload(null);
              }}
              placeholder="https://..."
            />
          </div>

          <div className="rowBtns" style={{ marginTop: 14 }}>
            <button
              className="btn btnGhost"
              type="button"
              onClick={() => setPhotoModal(false)}
            >
              Annuler
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={async () => {
                try {
                  let next = (photoUrl || "").trim();
                  if (photoUpload) {
                    const photoData = await fileToDataUrl(photoUpload);
                    // Redimensionner l'image à max 500px de hauteur
                    next = await resizeImage(photoData, 500);
                  }
                  updateSelected({ photoProfil: next });
                } catch (e) {
                  console.error("Error processing photo:", e);
                } finally {
                  setPhotoModal(false);
                }
              }}
            >
              Valider
            </button>
          </div>
        </Modal>
      ) : null}

      {deleteConfirmModal ? (
        <Modal
          title="Confirmer la suppression"
          onClose={() => setDeleteConfirmModal(false)}
        >
          <div style={{ marginBottom: 20 }}>
            <p style={{ marginBottom: 12 }}>
              Êtes-vous sûr de vouloir supprimer le profil de{" "}
              <strong>
                {selected?.prenom} {selected?.nom}
              </strong>{" "}
              ?
            </p>
            <p style={{ color: "#ff4444", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              Cette action est irréversible et supprimera toutes les données
              associées à cet utilisateur (réponses, paiements, etc.).
            </p>
          </div>
          <div className="rowBtns">
            <button
              className="btn btnGhost"
              type="button"
              onClick={() => setDeleteConfirmModal(false)}
              disabled={deleting}
            >
              Annuler
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={deleteUser}
              disabled={deleting}
              style={{
                backgroundColor: "#ff4444",
                borderColor: "#ff4444",
              }}
            >
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange, right }) {
  const onlyDigits = (v) => String(v || "").replace(/\D+/g, "");
  const toDateInputValue = (v) => {
    const s = String(v || "").trim();
    if (!s) return "";
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
    return "";
  };

  const isDigitsOnly =
    label === "Téléphone" ||
    label === "Numéro de compte" ||
    label === "Numéro de citoyen";
  const isBirthDate = label === "Date de naissance";

  return (
    <div className="adminField">
      <div className="adminFieldLabel">{label}</div>
      <div className="adminFieldRow">
        <input
          className="adminFieldInput"
          type={isBirthDate ? "date" : "text"}
          value={
            isBirthDate
              ? toDateInputValue(value)
              : isDigitsOnly
                ? onlyDigits(value)
                : value
          }
          onChange={(e) => {
            const next = e.target.value;
            if (isDigitsOnly) onChange(onlyDigits(next));
            else onChange(next);
          }}
          inputMode={isDigitsOnly ? "numeric" : undefined}
          pattern={isDigitsOnly ? "[0-9]*" : undefined}
        />
        {right ? <div className="adminFieldRight">{right}</div> : null}
      </div>
    </div>
  );
}

function ReadOnlyText({ label, value, right }) {
  return (
    <div className="adminField">
      <div className="adminFieldLabel">{label}</div>
      <div className="adminReadOnlyRow">
        <div className="adminReadOnlyVal">{String(value || "") || "—"}</div>
        {right ? <div className="adminFieldRight">{right}</div> : null}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <div className="adminField">
      <div className="adminFieldLabel" style={{ fontSize: 12, opacity: 0.85 }}>
        {label}
      </div>
      <textarea
        className="adminFieldInput"
        style={{ minHeight: 46, height: 46, resize: "vertical" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

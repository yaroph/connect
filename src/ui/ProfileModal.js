import React, { useState } from "react";
import Modal from "./Modal";
import { resizeImage } from "../data/storage";
import { notifyError } from "./notify";

export default function ProfileModal({
  user,
  profileDraft,
  setProfileDraft,
  onClose,
  onSave,
  onLogout,
  saving,
}) {
  const [activeTab, setActiveTab] = useState("account"); // "account" | "details"
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoUpload, setPhotoUpload] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");

  const handleSave = async () => {
    try {
      await onSave();
    } catch {
      notifyError("Sauvegarde impossible");
    }
  };

  const handlePhotoConfirm = async () => {
    try {
      let next = (photoUrl || "").trim();
      if (photoUpload) {
        const photoData = await fileToDataUrl(photoUpload);
        next = await resizeImage(photoData, 500);
      }
      setProfileDraft((p) => ({ ...p, photoProfil: next }));
    } catch (e) {
      console.error("Error processing profile photo:", e);
    } finally {
      setPhotoModalOpen(false);
    }
  };

  return (
    <>
      <Modal title="Mon profil & compte" onClose={onClose}>
        <div className="profileModal">
          {/* Top Profile Header Preview */}
          <div className="profileHeaderCard">
            <div className="profileAvatarContainer">
              {profileDraft.photoProfil ? (
                <img
                  src={profileDraft.photoProfil}
                  alt="Avatar"
                  className="profileAvatarImg"
                />
              ) : (
                <div className="profileAvatarPlaceholder">
                  {String(profileDraft.prenom || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                className="profileAvatarEditBtn"
                onClick={() => {
                  setPhotoUrl(profileDraft.photoProfil || "");
                  setPhotoUpload(null);
                  setPhotoModalOpen(true);
                }}
                title="Changer la photo de profil"
              >
                ✏️
              </button>
            </div>
            <div className="profileHeaderInfo">
              <div className="profileHeaderName">
                {profileDraft.prenom || ""} {profileDraft.nom || ""}
              </div>
              <div className="profileHeaderSubtitle">
                {profileDraft.metier || "Citoyen"} • {profileDraft.telephone || "Sans numéro"}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="profileTabs">
            <button
              type="button"
              className={`profileTabBtn ${activeTab === "account" ? "active" : ""}`}
              onClick={() => setActiveTab("account")}
            >
              Identifiants & Compte
            </button>
            <button
              type="button"
              className={`profileTabBtn ${activeTab === "details" ? "active" : ""}`}
              onClick={() => setActiveTab("details")}
            >
              Informations du Citoyen
            </button>
          </div>

          {/* Tab 1: Identifiants & Compte */}
          {activeTab === "account" ? (
            <div className="profileSection">
              <div className="profileGrid">
                <ProfileField
                  label="Prénom"
                  value={profileDraft.prenom || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, prenom: v }))}
                />
                <ProfileField
                  label="Nom"
                  value={profileDraft.nom || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, nom: v }))}
                />
                <ProfileField
                  label="Téléphone"
                  value={profileDraft.telephone || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, telephone: v }))}
                />
                <ProfileField
                  label="Date de naissance"
                  value={profileDraft.dateNaissance || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, dateNaissance: v }))}
                />
                <ProfileField
                  label="Numéro de compte"
                  value={profileDraft.compteBancaire || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, compteBancaire: v }))}
                />
                <ProfileField
                  label="Numéro de citoyen"
                  value={profileDraft.numeroCitoyen || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, numeroCitoyen: v }))}
                />
                <ProfileField
                  label="Mot de passe"
                  value={profileDraft.motDePasse || ""}
                  type="password"
                  onChange={(v) => setProfileDraft((p) => ({ ...p, motDePasse: v }))}
                />
              </div>
            </div>
          ) : (
            /* Tab 2: Infos du Citoyen */
            <div className="profileSection">
              <div className="profileGrid">
                <ProfileSelect
                  label="Sexe"
                  value={profileDraft.sexe || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, sexe: v }))}
                  options={["Homme", "Femme", "Neutre"]}
                />
                <ProfileSelect
                  label="Couleur de peau"
                  value={profileDraft.couleurPeau || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, couleurPeau: v }))}
                  options={["Claire", "Métisse", "Foncé", "Asiatique"]}
                />
                <ProfileSelect
                  label="Couleur de cheveux"
                  value={profileDraft.couleurCheveux || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, couleurCheveux: v }))}
                  options={[
                    "Noir",
                    "Chatain",
                    "Blond",
                    "Roux",
                    "Gris",
                    "Blanc",
                    "Bleu",
                    "Vert",
                    "Jaune",
                    "Rose",
                    "Autre",
                  ]}
                />
                <ProfileSelect
                  label="Longueur de cheveux"
                  value={profileDraft.longueurCheveux || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, longueurCheveux: v }))}
                  options={[
                    "Fantaisie",
                    "Long",
                    "Crépu",
                    "Mi-long",
                    "Court",
                    "Tressé",
                    "Chauve",
                  ]}
                />
                <ProfileSelect
                  label="Style vestimentaire"
                  value={profileDraft.styleVestimentaire || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, styleVestimentaire: v }))}
                  options={[
                    "Corpo",
                    "Chic",
                    "Kikoo",
                    "Street",
                    "Schlag",
                    "Neutre",
                    "Sport",
                    "Futuriste",
                    "Fantaisie",
                  ]}
                />
                <ProfileSelect
                  label="Métier"
                  value={profileDraft.metier || ""}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, metier: v }))}
                  options={[
                    "((Sans Emploi))",
                    "(A mon compte)",
                    "AGENT IMMOBILIER",
                    "APEX NIGHTCLUB",
                    "ARAKOSHI",
                    "ATELIS",
                    "AZUL PAWNSHOP",
                    "BNI",
                    "CASINO EMPIRE",
                    "CERBERUS",
                    "CHATEAU D'AMOUR",
                    "CLUB 77",
                    "COIFFEUR",
                    "DARNEL",
                    "EREBOS",
                    "FIVE STAR RECORD",
                    "GOUVERNEMENT",
                    "HOPITAL (Mordechai)",
                    "HOPITAL (Nova Life)",
                    "HOPITAL (publique)",
                    "LA HAUTE",
                    "LE CERCLE",
                    "LIFEINVADER",
                    "LSPD POLICE DEP",
                    "LTD LOTUS QUARTER",
                    "LTD VERDANT",
                    "LUCHETTI'S",
                    "LUXXX CLUB",
                    "MAZZARI MOTORS",
                    "MIDNIGHT CLUB",
                    "MLAD & KO",
                    "POMPIER (LSFD)",
                    "PREMIUM DELUXE MOTORSPORT",
                    "SECRET SERVICE",
                    "SIA",
                    "TATOUEUR",
                    "TRIAD RECORD",
                    "WEAZEL NEWS",
                    "WESTBROOK MOTORSPORT",
                    "WESTBROOK SECURITY",
                    "((Autre))",
                  ]}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="profileFooter">
            <button
              className="btn btnGhost btnDangerText"
              type="button"
              onClick={onLogout}
            >
              Se déconnecter
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="btn btnGhost"
              type="button"
              disabled={saving}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Sauvegarde…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Sub-modal: Change photo */}
      {photoModalOpen ? (
        <Modal title="Photo de profil" onClose={() => setPhotoModalOpen(false)}>
          <div className="field">
            <div className="label">Importer une image locale</div>
            <input
              className="input fileInput"
              type="file"
              accept="image/*"
              onChange={(e) => {
                setPhotoUpload(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setPhotoUrl("");
              }}
            />
          </div>
          <div className="field">
            <div className="label">Ou spécifier une URL web</div>
            <input
              className="input"
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value);
                if (e.target.value) setPhotoUpload(null);
              }}
              placeholder="https://images.unsplash.com/..."
            />
          </div>
          <div className="rowBtns" style={{ marginTop: 16 }}>
            <button
              className="btn btnGhost"
              type="button"
              onClick={() => setPhotoModalOpen(false)}
            >
              Annuler
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={handlePhotoConfirm}
            >
              Valider la photo
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function ProfileField({ label, value, onChange, type = "text" }) {
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
    <div className="profileField">
      <div className="profileLabel">{label}</div>
      <input
        className="input"
        type={isBirthDate ? "date" : type}
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
      />
    </div>
  );
}

function ProfileSelect({ label, value, onChange, options }) {
  return (
    <div className="profileField">
      <div className="profileLabel">{label}</div>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Non renseigné —</option>
        {(options || []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

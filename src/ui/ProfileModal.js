import React, { useState } from "react";
import Modal from "./Modal";
import { resizeImage } from "../data/storage";
import { notifyError } from "./notify";
import {
  TrendingUp,
  DollarSign,
  Camera,
  CheckCircle2,
  Activity,
} from "lucide-react";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function ProfileField({ label, value, onChange, type = "text" }) {
  return (
    <div className="profileField">
      <label className="profileLabel">{label}</label>
      <input
        type={type}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ProfileSelect({ label, value, onChange, options = [] }) {
  return (
    <div className="profileField">
      <label className="profileLabel">{label}</label>
      <div className="customSelectWrap">
        <select
          className="select customSelect"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Sélectionner...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <span className="customSelectArrow">▾</span>
      </div>
    </div>
  );
}

export default function ProfileModal({
  user,
  profileDraft,
  setProfileDraft,
  onClose,
  onSave,
  onLogout,
  saving,
}) {
  const [activeTab, setActiveTab] = useState("account"); // "account" | "details" | "stats"
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

  const earned = Number(profileDraft.gagneSurBNI || user?.gagneSurBNI || 0);

  return (
    <>
      <Modal title="Mon Profil Citoyen & Compte Bancaire" onClose={onClose}>
        <div className="profileModal">
          {/* Top Profile Header Preview */}
          <div className="profileHeaderCard">
            <div className="profileAvatarContainer">
              {profileDraft.photoProfil ? (
                <img
                  src={profileDraft.photoProfil}
                  alt="Avatar"
                  className="profileAvatarImg"
                  loading="lazy"
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
                aria-label="Changer la photo"
              >
                <Camera size={13} />
              </button>
            </div>
            <div className="profileHeaderInfo">
              <div className="profileHeaderName">
                {profileDraft.prenom || ""} {profileDraft.nom || ""}
              </div>
              <div className="profileHeaderSubtitle">
                {profileDraft.metier || "Citoyen"} • {profileDraft.telephone || "Sans numéro"}
              </div>
              <div className="profileTierBadge tierBronze">
                <CheckCircle2 size={13} /> Profil Citoyen Actif
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
            <button
              type="button"
              className={`profileTabBtn ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => setActiveTab("stats")}
            >
              <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Statistiques & Gains
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
          ) : activeTab === "details" ? (
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
                  ]}
                />
              </div>
            </div>
          ) : (
            /* Tab 3: Statistiques & Croissance */
            <div className="profileSection profileStatsTab">
              <div className="statsGrowthCards">
                <div className="statsGrowthCard glassCard">
                  <div className="statsGrowthHeader">
                    <DollarSign size={18} className="statsIcon" />
                    <span>Total Rémunéré</span>
                  </div>
                  <div className="statsGrowthValue">$ {earned.toFixed(2)}</div>
                </div>

                <div className="statsGrowthCard glassCard">
                  <div className="statsGrowthHeader">
                    <Activity size={18} className="statsIcon" />
                    <span>Indexation Données</span>
                  </div>
                  <div className="statsGrowthValue" style={{ color: "#34d399", fontSize: 16 }}>
                    Vérifié & Actif
                  </div>
                </div>
              </div>

              {/* Graphique SVG d'évolution visuelle */}
              <div className="growthChartWrap glassCard">
                <div className="growthChartTitle">
                  <TrendingUp size={16} /> Évolution des Récompenses
                </div>
                <svg className="growthSvgChart" viewBox="0 0 400 120">
                  <defs>
                    <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 10,100 Q 100,85 200,60 T 390,20 L 390,110 L 10,110 Z"
                    fill="url(#growthGrad)"
                  />
                  <path
                    d="M 10,100 Q 100,85 200,60 T 390,20"
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="390" cy="20" r="5" fill="#34d399" />
                </svg>
                <div className="growthChartLegend">
                  <span>Inscription</span>
                  <span>Premiers Sondages</span>
                  <span>Récompenses Validées</span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="profileFooterActions">
            <button
              type="button"
              className="btn btnDanger"
              onClick={onLogout}
            >
              Se déconnecter
            </button>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Photo */}
      {photoModalOpen ? (
        <Modal
          title="Modifier la photo de profil"
          onClose={() => setPhotoModalOpen(false)}
        >
          <div className="profilePhotoSubModal">
            <div className="photoModes">
              <button
                type="button"
                className={`btn btnGhost ${!photoUpload ? "activeBtn" : ""}`}
                onClick={() => setPhotoUpload(null)}
              >
                Lien Web
              </button>
              <button
                type="button"
                className={`btn btnGhost ${photoUpload ? "activeBtn" : ""}`}
                onClick={() => document.getElementById("avatarFileInput")?.click()}
              >
                Upload Fichier
              </button>
            </div>

            {!photoUpload ? (
              <input
                type="text"
                className="input"
                placeholder="https://..."
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            ) : (
              <div className="filePickedNotice">
                Fichier sélectionné : {photoUpload.name}
              </div>
            )}

            <input
              id="avatarFileInput"
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhotoUpload(file);
              }}
            />

            <div className="photoConfirmActions">
              <button
                type="button"
                className="btn btnGhost"
                onClick={() => setPhotoModalOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btnPrimary"
                onClick={handlePhotoConfirm}
              >
                Confirmer la photo
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

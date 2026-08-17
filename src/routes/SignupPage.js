import React, { useEffect, useMemo, useState } from "react";
import "../styles/auth.css";
import { Link, useNavigate } from "react-router-dom";
import {
  authMe,
  authRegister,
  getAuthToken,
  setAuthToken,
  saveCredentials,
  resizeImage,
} from "../data/storage";
import Modal from "../ui/Modal";

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function SignupPage() {
  const nav = useNavigate();

  // If already connected, redirect to main page
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    authMe()
      .then((r) => {
        if (r && r.ok) nav("/", { replace: true });
      })
      .catch(() => {
        // invalid token -> keep on signup
      });
  }, [nav]);

  // Required
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [compteBancaire, setCompteBancaire] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Optional
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoUpload, setPhotoUpload] = useState(null);
  const [photoModal, setPhotoModal] = useState(false);
  const [numeroCitoyen, setNumeroCitoyen] = useState("");
  const [sexe, setSexe] = useState("");
  const [couleurPeau, setCouleurPeau] = useState("");
  const [couleurCheveux, setCouleurCheveux] = useState("");
  const [longueurCheveux, setLongueurCheveux] = useState("");
  const [styleVestimentaire, setStyleVestimentaire] = useState("");
  const [metier, setMetier] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const preview = useMemo(() => {
    if (photoUpload) return URL.createObjectURL(photoUpload);
    return photoUrl || "";
  }, [photoUpload, photoUrl]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let photoProfil = photoUrl.trim();
      if (photoUpload) {
        const photoData = await fileToDataUrl(photoUpload);
        photoProfil = await resizeImage(photoData, 500);
      }

      const r = await authRegister({
        prenom,
        nom,
        compteBancaire,
        dateNaissance,
        telephone,
        motDePasse,
        photoProfil,
        numeroCitoyen,
        sexe,
        couleurPeau,
        couleurCheveux,
        longueurCheveux,
        styleVestimentaire,
        metier,
      });

      if (r && r.ok) {
        setAuthToken(r.token);
        saveCredentials({ prenom, nom, motDePasse });
        nav("/", { replace: true });
      } else {
        setError(r?.error || "Inscription impossible");
      }
    } catch (e2) {
      setError(String(e2?.message || e2 || "Inscription impossible"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authRoot">
      <div className="authCard" style={{ width: "min(920px, 100%)" }}>
        <div className="authLogo">
          <img
            src="/bniconnect.png"
            alt="BNI Connect"
            style={{ width: 130, height: "auto" }}
          />
        </div>
        <div className="authTitle">Créer un compte Citoyen</div>
        <div className="authSub">Complétez vos informations pour accéder aux questionnaires rémunérés</div>

        <div className="rpDisclaimer">
          <span className="rpBadge">RP ONLY</span>
          Application réservée au jeu de rôle. N'entrez <strong>aucune donnée personnelle réelle</strong> (mot de passe, compte bancaire, etc.).
        </div>

        <form onSubmit={onSubmit}>
          <div className="authGrid">
            <div>
              <div className="authColTitle">Informations du compte (Obligatoire)</div>
              <div className="authField">
                <div className="authLabel">Prénom(s)</div>
                <input
                  className="authInput"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  required
                  placeholder="Ex: Jean Pierre"
                  autoFocus
                />
              </div>
              <div className="authField">
                <div className="authLabel">Nom de famille</div>
                <input
                  className="authInput"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  placeholder="Ex: Dupont"
                />
              </div>
              <div className="authField">
                <div className="authLabel">Numéro de compte en banque (RP)</div>
                <input
                  className="authInput"
                  value={compteBancaire}
                  onChange={(e) =>
                    setCompteBancaire(onlyDigits(e.target.value))
                  }
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder="Ex: 12345"
                />
              </div>
              <div className="authField">
                <div className="authLabel">Date de naissance</div>
                <input
                  className="authInput"
                  type="date"
                  value={dateNaissance}
                  onChange={(e) => setDateNaissance(e.target.value)}
                  required
                />
              </div>
              <div className="authField">
                <div className="authLabel">Numéro de téléphone (RP)</div>
                <input
                  className="authInput"
                  value={telephone}
                  onChange={(e) => setTelephone(onlyDigits(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder="Ex: 555-1234"
                />
              </div>
              <div className="authField">
                <div className="authLabel">Mot de passe (Jeu)</div>
                <div className="passwordInputWrapper">
                  <input
                    className="authInput"
                    type={showPassword ? "text" : "password"}
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="passwordToggleBtn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Masquer" : "Afficher"}
                  >
                    {showPassword ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="authColTitle">Détails du citoyen (Optionnel)</div>
              <div className="authField">
                <div className="authLabel">Photo de profil</div>
                <button
                  className="btn btnGhost"
                  type="button"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setPhotoModal(true)}
                >
                  📷 {preview ? "Changer la photo" : "Choisir une photo"}
                </button>
              </div>
              {preview ? (
                <div className="authField" style={{ display: "flex", justifyContent: "center" }}>
                  <img
                    alt="Aperçu avatar"
                    src={preview}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 16,
                      objectFit: "cover",
                      border: "2px solid rgba(255,255,255,0.25)",
                    }}
                  />
                </div>
              ) : null}
              <div className="authField">
                <div className="authLabel">Numéro de citoyen</div>
                <input
                  className="authInput"
                  value={numeroCitoyen}
                  onChange={(e) => setNumeroCitoyen(onlyDigits(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Ex: 9876"
                />
              </div>
              <div className="authField">
                <div className="authLabel">Sexe</div>
                <select
                  className="authInput"
                  value={sexe}
                  onChange={(e) => setSexe(e.target.value)}
                >
                  <option value="">— Non renseigné —</option>
                  {["Homme", "Femme", "Neutre"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="authField">
                <div className="authLabel">Couleur de peau</div>
                <select
                  className="authInput"
                  value={couleurPeau}
                  onChange={(e) => setCouleurPeau(e.target.value)}
                >
                  <option value="">— Non renseigné —</option>
                  {["Claire", "Métisse", "Foncé", "Asiatique"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="authField">
                <div className="authLabel">Couleur de cheveux</div>
                <select
                  className="authInput"
                  value={couleurCheveux}
                  onChange={(e) => setCouleurCheveux(e.target.value)}
                >
                  <option value="">— Non renseigné —</option>
                  {[
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
                  ].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="authField">
                <div className="authLabel">Longueur de cheveux</div>
                <select
                  className="authInput"
                  value={longueurCheveux}
                  onChange={(e) => setLongueurCheveux(e.target.value)}
                >
                  <option value="">— Non renseigné —</option>
                  {[
                    "Fantaisie",
                    "Long",
                    "Crépu",
                    "Mi-long",
                    "Court",
                    "Tressé",
                    "Chauve",
                  ].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="authField">
                <div className="authLabel">Style vestimentaire</div>
                <select
                  className="authInput"
                  value={styleVestimentaire}
                  onChange={(e) => setStyleVestimentaire(e.target.value)}
                >
                  <option value="">— Non renseigné —</option>
                  {[
                    "Corpo",
                    "Chic",
                    "Kikoo",
                    "Street",
                    "Schlag",
                    "Neutre",
                    "Sport",
                    "Futuriste",
                    "Fantaisie",
                  ].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="authField">
                <div className="authLabel">Métier</div>
                <select
                  className="authInput"
                  value={metier}
                  onChange={(e) => setMetier(e.target.value)}
                >
                  <option value="">— Non renseigné —</option>
                  {[
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
                  ].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button className="authBtn" disabled={loading} type="submit">
            {loading ? "Création du compte…" : "Créer mon compte"}
          </button>

          {error ? <div className="authError">{error}</div> : null}
        </form>

        <div className="authBottom">
          Déjà un compte ?
          <Link className="authLink" to="/login">
            Se connecter
          </Link>
        </div>
      </div>

      {photoModal ? (
        <Modal title="Photo de profil" onClose={() => setPhotoModal(false)}>
          <div className="field">
            <div className="label">Importer une image locale</div>
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
              placeholder="https://images.unsplash.com/..."
            />
          </div>
          <div className="rowBtns" style={{ marginTop: 16 }}>
            <button
              className="btn btnGhost"
              type="button"
              onClick={() => setPhotoModal(false)}
            >
              Fermer
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

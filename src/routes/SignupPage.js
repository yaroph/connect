import React, { useEffect, useMemo, useState } from "react";
import "../styles/auth.css";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Camera, UserPlus, User, Lock, CreditCard, Calendar, Phone, Briefcase, ArrowRight } from "lucide-react";
import Modal from "../ui/Modal";
import CyberBackground from "../ui/CyberBackground";
import { playLaserClick } from "../ui/soundEffects";
import {
  authMe,
  authRegister,
  getAuthToken,
  setAuthToken,
  saveCredentials,
  resizeImage,
} from "../data/storage";

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
    playLaserClick();
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
      <CyberBackground />

      <div className="authCard authCardWide cyberHudPanel">
        <div className="hudBracket hudBracketTL" />
        <div className="hudBracket hudBracketTR" />
        <div className="hudBracket hudBracketBL" />
        <div className="hudBracket hudBracketBR" />

        <div className="authLogo">
          <img
            src="/bniconnect.png"
            alt="BNI Connect"
            className="authLogoImg"
          />
        </div>

        <div className="authHeaderWrap">
          <h1 className="authTitle">Créer un compte Citoyen</h1>
          <p className="authSub">Complétez vos informations pour accéder aux questionnaires rémunérés</p>
        </div>

        <form onSubmit={onSubmit} className="authForm">
          <div className="authGrid">
            {/* Colonne 1: Obligatoire */}
            <div className="authCol">
              <div className="authColTitle">Informations du compte (Obligatoire)</div>

              <div className="authField">
                <label className="authLabel">
                  <User size={13} className="authFieldIcon" /> Prénom(s)
                </label>
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
                <label className="authLabel">
                  <User size={13} className="authFieldIcon" /> Nom de famille
                </label>
                <input
                  className="authInput"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  placeholder="Ex: Dupont"
                />
              </div>

              <div className="authField">
                <label className="authLabel">
                  <CreditCard size={13} className="authFieldIcon" /> Numéro de compte BNI
                </label>
                <input
                  className="authInput"
                  value={compteBancaire}
                  onChange={(e) => setCompteBancaire(onlyDigits(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder="Ex: 12345"
                />
              </div>

              <div className="authField">
                <label className="authLabel">
                  <Calendar size={13} className="authFieldIcon" /> Date de naissance
                </label>
                <input
                  className="authInput"
                  type="date"
                  value={dateNaissance}
                  onChange={(e) => setDateNaissance(e.target.value)}
                  required
                />
              </div>

              <div className="authField">
                <label className="authLabel">
                  <Phone size={13} className="authFieldIcon" /> Téléphone
                </label>
                <input
                  className="authInput"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  required
                  placeholder="Ex: 555-0199"
                />
              </div>

              <div className="authField">
                <label className="authLabel">
                  <Lock size={13} className="authFieldIcon" /> Mot de passe
                </label>
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
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Colonne 2: Profil Citoyen */}
            <div className="authCol">
              <div className="authColTitle">Profil Citoyen (Optionnel)</div>

              <div className="authField">
                <label className="authLabel">Photo de profil</label>
                <div className="authPhotoUploadWrap">
                  <div className="authPhotoPreview">
                    {preview ? (
                      <img src={preview} alt="Aperçu" className="authPhotoImg" />
                    ) : (
                      <Camera size={24} className="authPhotoPlaceholderIcon" />
                    )}
                  </div>
                  <div className="authPhotoBtns">
                    <button
                      type="button"
                      className="btn btnGhost authPhotoBtn"
                      onClick={() => setPhotoModal(true)}
                    >
                      <Camera size={14} />
                      <span>{preview ? "Modifier la photo" : "Ajouter une photo"}</span>
                    </button>
                    {preview ? (
                      <button
                        type="button"
                        className="btn btnGhost authPhotoBtnRemove"
                        onClick={() => {
                          setPhotoUrl("");
                          setPhotoUpload(null);
                        }}
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="authField">
                <label className="authLabel">Numéro de citoyen</label>
                <input
                  className="authInput"
                  value={numeroCitoyen}
                  onChange={(e) => setNumeroCitoyen(e.target.value)}
                  placeholder="Ex: ABC12345"
                />
              </div>

              <div className="authField">
                <label className="authLabel">
                  <Briefcase size={13} className="authFieldIcon" /> Métier / Profession
                </label>
                <input
                  className="authInput"
                  value={metier}
                  onChange={(e) => setMetier(e.target.value)}
                  placeholder="Ex: Mécanicien, Avocat..."
                />
              </div>

              <div className="authRowFields">
                <div className="authField" style={{ flex: 1 }}>
                  <label className="authLabel">Sexe</label>
                  <select
                    className="authInput authSelect"
                    value={sexe}
                    onChange={(e) => setSexe(e.target.value)}
                  >
                    <option value="">Non spécifié</option>
                    <option value="Homme">Homme</option>
                    <option value="Femme">Femme</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div className="authField" style={{ flex: 1 }}>
                  <label className="authLabel">Style vestimentaire</label>
                  <input
                    className="authInput"
                    value={styleVestimentaire}
                    onChange={(e) => setStyleVestimentaire(e.target.value)}
                    placeholder="Ex: Formel, Décontracté"
                  />
                </div>
              </div>

              <div className="authRowFields">
                <div className="authField" style={{ flex: 1 }}>
                  <label className="authLabel">Couleur de peau</label>
                  <input
                    className="authInput"
                    value={couleurPeau}
                    onChange={(e) => setCouleurPeau(e.target.value)}
                    placeholder="Ex: Claire, Mate, Foncée"
                  />
                </div>
                <div className="authField" style={{ flex: 1 }}>
                  <label className="authLabel">Couleur cheveux</label>
                  <input
                    className="authInput"
                    value={couleurCheveux}
                    onChange={(e) => setCouleurCheveux(e.target.value)}
                    placeholder="Ex: Brun, Blond, Noir"
                  />
                </div>
                <div className="authField" style={{ flex: 1 }}>
                  <label className="authLabel">Longueur cheveux</label>
                  <input
                    className="authInput"
                    value={longueurCheveux}
                    onChange={(e) => setLongueurCheveux(e.target.value)}
                    placeholder="Ex: Courts, Mi-longs, Longs"
                  />
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="authError">{error}</div> : null}

          <div className="authSubmitWrap">
            <button className="btn authBtn" disabled={loading} type="submit">
              <UserPlus size={16} />
              <span>{loading ? "Création du compte…" : "Créer mon compte"}</span>
            </button>
          </div>
        </form>

        <div className="authFooterLinks">
          <div className="authBottom">
            <span>Vous avez déjà un compte ?</span>
            <Link className="authLink" to="/login">
              <span>Se connecter</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {photoModal ? (
        <Modal title="Ajouter une photo de profil" onClose={() => setPhotoModal(false)}>
          <div className="authModalHint">
            Choisissez une méthode pour ajouter votre photo.
          </div>

          <div className="authField">
            <label className="authLabel">Importer un fichier image</label>
            <input
              type="file"
              accept="image/*"
              className="authInput"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                  setPhotoUpload(file);
                  setPhotoUrl("");
                  setPhotoModal(false);
                }
              }}
            />
          </div>

          <div className="authField">
            <label className="authLabel">Ou entrer une URL d'image directe</label>
            <input
              className="authInput"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
            />
          </div>

          <div className="rowBtns" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btnGhost"
              onClick={() => setPhotoModal(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => setPhotoModal(false)}
            >
              Valider
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

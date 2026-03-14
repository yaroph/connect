import React, { useEffect, useState } from "react";
import "../styles/auth.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Modal from "../ui/Modal";
import { authLogin, authMe, getAuthToken, setAuthToken, saveCredentials, passwordResetVerify, passwordResetSet } from "../data/storage";

export default function LoginPage() {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Mot de passe oublié
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fpPrenom, setFpPrenom] = useState("");
  const [fpNom, setFpNom] = useState("");
  const [fpDateNaissance, setFpDateNaissance] = useState("");
  const [fpCompte, setFpCompte] = useState("");
  const [fpStep, setFpStep] = useState(1); // 1: verify, 2: set
  const [fpNew1, setFpNew1] = useState("");
  const [fpNew2, setFpNew2] = useState("");
  const [fpError, setFpError] = useState("");
  const [fpOk, setFpOk] = useState("");
  const [fpLoading, setFpLoading] = useState(false);

  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  // If already connected, redirect to main page
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    authMe()
      .then((r) => {
        if (r && r.ok) nav("/", { replace: true });
      })
      .catch(() => {
        // invalid token -> keep on login
      });
  }, [nav]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await authLogin({ prenom, nom, motDePasse });
      if (r && r.ok) {
        setAuthToken(r.token);
        // Remember account to restore session after a page reload
        saveCredentials({ prenom, nom, motDePasse });
        nav(from, { replace: true });
      } else {
        setError(r?.error || "Connexion impossible");
      }
    } catch (e2) {
      setError(String(e2?.message || e2 || "Identifiants invalides."));
    } finally {
      setLoading(false);
    }
  };

  const openForgot = () => {
    setFpPrenom(prenom);
    setFpNom(nom);
    setFpDateNaissance("");
    setFpCompte("");
    setFpStep(1);
    setFpNew1("");
    setFpNew2("");
    setFpError("");
    setFpOk("");
    setForgotOpen(true);
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setFpError("");
    setFpOk("");
    setFpLoading(false);
  };

  const onVerifyForgot = async () => {
    setFpError("");
    setFpOk("");
    setFpLoading(true);
    try {
      const r = await passwordResetVerify({
        prenom: fpPrenom,
        nom: fpNom,
        dateNaissance: fpDateNaissance,
        compteBancaire: fpCompte,
      });
      if (r && r.ok) {
        setFpStep(2);
      } else {
        setFpError(r?.error || "Informations invalides");
      }
    } catch (e) {
      setFpError(String(e?.message || e || "Erreur"));
    } finally {
      setFpLoading(false);
    }
  };

  const onSetForgot = async () => {
    setFpError("");
    setFpOk("");
    if (!fpNew1 || fpNew1.length < 3) {
      setFpError("Nouveau mot de passe trop court");
      return;
    }
    if (fpNew1 !== fpNew2) {
      setFpError("Les mots de passe ne correspondent pas");
      return;
    }
    setFpLoading(true);
    try {
      const r = await passwordResetSet({
        prenom: fpPrenom,
        nom: fpNom,
        dateNaissance: fpDateNaissance,
        compteBancaire: fpCompte,
        nouveauMotDePasse: fpNew1,
      });
      if (r && r.ok) {
        setFpOk("Mot de passe modifié. Vous pouvez vous reconnecter.");
        setFpStep(1);
        setFpNew1("");
        setFpNew2("");
      } else {
        setFpError(r?.error || "Impossible de modifier le mot de passe");
      }
    } catch (e) {
      setFpError(String(e?.message || e || "Erreur"));
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div className="authRoot">
      <div className="authCard">
        <div className="authLogo">
          <img src="/bniconnect.png" alt="BNI" style={{ width: 120, height: "auto" }} />
        </div>
        <div className="authTitle">Connexion</div>
        <div className="authSub">Entrez votre nom, prénom et mot de passe</div>

        <form onSubmit={onSubmit}>
          <div className="authField">
            <div className="authLabel">Prénom(s)</div>
            <input className="authInput" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
          </div>
          <div className="authField">
            <div className="authLabel">Nom de famille</div>
            <input className="authInput" value={nom} onChange={(e) => setNom(e.target.value)} required />
          </div>
          <div className="authField">
            <div className="authLabel">Mot de passe</div>
            <input
              className="authInput"
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
            />
          </div>

          <button className="authBtn" disabled={loading} type="submit">
            Se connecter
          </button>

          {error ? <div className="authError">{error}</div> : null}
        </form>

        <div className="authBottom">
          Pas encore de compte ?
          <Link className="authLink" to="/signup">S'inscrire</Link>
        </div>

        <div className="authForgotWrap">
          <button
            type="button"
            className="authForgotLink"
            onClick={openForgot}
          >
            Mot de passe oublié ?
          </button>
        </div>
      </div>

      {forgotOpen ? (
        <Modal title="Mot de passe oublié" onClose={closeForgot}>
          {fpOk ? <div className="authOk">{fpOk}</div> : null}

          {fpStep === 1 ? (
            <>
              <div className="muted" style={{ marginBottom: 12 }}>
                Renseignez les informations du compte.
              </div>
              <div className="authField">
                <div className="authLabel">Prénom(s)</div>
                <input className="authInput" value={fpPrenom} onChange={(e) => setFpPrenom(e.target.value)} />
              </div>
              <div className="authField">
                <div className="authLabel">Nom</div>
                <input className="authInput" value={fpNom} onChange={(e) => setFpNom(e.target.value)} />
              </div>
              <div className="authField">
                <div className="authLabel">Date de naissance</div>
                <input className="authInput" type="date" value={fpDateNaissance} onChange={(e) => setFpDateNaissance(e.target.value)} />
              </div>
              <div className="authField">
                <div className="authLabel">Numéro de compte en banque</div>
                <input className="authInput" value={fpCompte} onChange={(e) => setFpCompte(e.target.value)} inputMode="numeric" />
              </div>

              {fpError ? <div className="authError">{fpError}</div> : null}

              <div className="rowBtns" style={{ marginTop: 14 }}>
                <button className="btn btnGhost" type="button" onClick={closeForgot} disabled={fpLoading}>
                  Fermer
                </button>
                <button className="btn btnPrimary" type="button" onClick={onVerifyForgot} disabled={fpLoading}>
                  {fpLoading ? "Vérification…" : "Vérifier"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 12 }}>
                Entrez votre nouveau mot de passe.
              </div>
              <div className="authField">
                <div className="authLabel">Nouveau mot de passe</div>
                <input className="authInput" type="password" value={fpNew1} onChange={(e) => setFpNew1(e.target.value)} />
              </div>
              <div className="authField">
                <div className="authLabel">Confirmer le nouveau mot de passe</div>
                <input className="authInput" type="password" value={fpNew2} onChange={(e) => setFpNew2(e.target.value)} />
              </div>

              {fpError ? <div className="authError">{fpError}</div> : null}

              <div className="rowBtns" style={{ marginTop: 14 }}>
                <button className="btn btnGhost" type="button" onClick={() => setFpStep(1)} disabled={fpLoading}>
                  Retour
                </button>
                <button className="btn btnPrimary" type="button" onClick={onSetForgot} disabled={fpLoading}>
                  {fpLoading ? "Modification…" : "Changer"}
                </button>
              </div>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

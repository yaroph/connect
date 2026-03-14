import React, { useMemo, useState } from "react";
import { Upload, CheckCircle2, XCircle, FileJson2, ImagePlus, KeyRound } from "lucide-react";
import "./dataImportPage.css";

const ALLOWED = [
  "question.json",
  "questionnaire.json",
  "tag.json",
  "reponses.json",
  "utilisateur.json",
  "cagnotte.json",
  "argentadmin.json",
  "questionCooldowns.json",
  "settings.json",
];

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text };
  }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export default function DataImportPage() {
  const [files, setFiles] = useState([]); // { file, status, message }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Reset mots de passe (motdepasse_defaut.json)
  const [pwdFile, setPwdFile] = useState(null);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdResult, setPwdResult] = useState(null);

  // Migration d'images
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [migrationError, setMigrationError] = useState("");

  const allowedSet = useMemo(() => new Set(ALLOWED), []);

  const onPick = (e) => {
    setDone(false);
    setError("");
    const list = Array.from(e.target.files || []);
    const next = list.map((f) => ({
      file: f,
      status: allowedSet.has(f.name) ? "READY" : "BLOCKED",
      message: allowedSet.has(f.name)
        ? "Prêt"
        : "Nom non autorisé (utilisez un des noms ci-dessous)",
    }));
    setFiles(next);
  };

  const onPickPwd = (e) => {
    setPwdError("");
    setPwdResult(null);
    const f = (e.target.files && e.target.files[0]) || null;
    setPwdFile(f);
  };

  const importNow = async () => {
    setError("");
    setDone(false);
    const ready = files.filter((x) => x.status === "READY");
    if (ready.length === 0) {
      setError("Sélectionnez au moins un fichier .json autorisé.");
      return;
    }

    setBusy(true);
    try {
      const payloadFiles = [];
      for (const item of ready) {
        const text = await item.file.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`JSON invalide : ${item.file.name}`);
        }
        payloadFiles.push({ name: item.file.name, data });
      }

      const r = await postJSON("/api/data/import", { files: payloadFiles });
      const results = Array.isArray(r?.results) ? r.results : [];
      setFiles((prev) =>
        prev.map((it) => {
          const rr = results.find((x) => x.name === it.file.name);
          if (!rr) return it;
          return {
            ...it,
            status: rr.ok ? "OK" : "ERR",
            message: rr.ok ? "Importé" : rr.error || "Erreur",
          };
        })
      );
      setDone(true);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const migrateImages = async () => {
    setMigrationError("");
    setMigrationResult(null);
    setMigrating(true);

    try {
      const r = await postJSON("/api/admin/migrate-images", {});
      setMigrationResult(r);
    } catch (e) {
      setMigrationError(String(e?.message || e));
    } finally {
      setMigrating(false);
    }
  };

  const resetPasswords = async () => {
    setPwdError("");
    setPwdResult(null);
    if (!pwdFile) {
      setPwdError("Sélectionnez le fichier motdepasse_defaut.json");
      return;
    }
    setPwdBusy(true);
    try {
      const text = await pwdFile.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("JSON invalide");
      }
      if (!Array.isArray(data)) {
        throw new Error("Le fichier doit contenir un tableau (array) d'utilisateurs");
      }
      const r = await postJSON("/api/admin/reset-passwords", { entries: data });
      setPwdResult(r);
    } catch (e) {
      setPwdError(String(e?.message || e));
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div className="dataImportRoot">
      <div className="dataImportCard glass">
        <div className="dataImportTitleRow">
          <div className="dataImportTitle">
            <FileJson2 size={18} style={{ marginRight: 10 }} />
            Importer des JSON (Netlify Blobs)
          </div>
        </div>

        <div className="dataImportHint">
          Cette page permet de charger vos fichiers <b>.json</b> dans le stockage persistant Netlify Blobs.
          <br />
          Noms acceptés : <span className="mono">{ALLOWED.join(", ")}</span>
        </div>

        <div className="dataImportActions">
          <label className="btn btnGhost" style={{ cursor: "pointer" }}>
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={onPick}
              style={{ display: "none" }}
            />
            <Upload size={16} style={{ marginRight: 8 }} />
            Choisir des fichiers
          </label>

          <button className="btn" type="button" onClick={importNow} disabled={busy || files.length === 0}>
            {busy ? "Import..." : "Importer"}
          </button>
        </div>

        {error ? <div className="dataImportError">{error}</div> : null}
        {done ? <div className="dataImportOk">Import terminé.</div> : null}

        <div className="dataImportList">
          {files.length === 0 ? (
            <div className="muted">Aucun fichier sélectionné.</div>
          ) : (
            files.map((it) => (
              <div key={it.file.name} className="dataImportItem">
                <div className="dataImportItemName">{it.file.name}</div>
                <div className="dataImportItemStatus">
                  {it.status === "OK" ? (
                    <CheckCircle2 size={16} />
                  ) : it.status === "ERR" ? (
                    <XCircle size={16} />
                  ) : it.status === "BLOCKED" ? (
                    <XCircle size={16} />
                  ) : (
                    <span className="pill">Prêt</span>
                  )}
                  <span className={it.status === "OK" ? "ok" : it.status === "ERR" || it.status === "BLOCKED" ? "err" : ""}>
                    {it.message}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="dataImportFooter muted">
          Astuce : après import, rechargez la page principale pour utiliser les nouvelles données.
        </div>
      </div>

      {/* Reset mot de passe (utilisateur.json) */}
      <div className="dataImportCard glass" style={{ marginTop: 24 }}>
        <div className="dataImportTitleRow">
          <div className="dataImportTitle">
            <KeyRound size={18} style={{ marginRight: 10 }} />
            Réinitialiser les mots de passe (motdepasse_defaut.json)
          </div>
        </div>

        <div className="dataImportHint">
          Uploadez votre fichier <b>motdepasse_defaut.json</b> (liste d'utilisateurs + motDePasse) et le site remettra
          les mots de passe dans <code>utilisateur.json</code>.
          <br />
          Correspondance par <b>fullName</b> (ou prenom+nom). Les entrées non trouvées sont ignorées.
        </div>

        <div className="dataImportActions">
          <label className="btn btnGhost" style={{ cursor: "pointer" }}>
            <input
              type="file"
              accept=".json,application/json"
              onChange={onPickPwd}
              style={{ display: "none" }}
            />
            <Upload size={16} style={{ marginRight: 8 }} />
            Choisir motdepasse_defaut
          </label>

          <button className="btn" type="button" onClick={resetPasswords} disabled={pwdBusy || !pwdFile}>
            {pwdBusy ? "Reset…" : "Remettre les mots de passe"}
          </button>

          {pwdFile ? <span className="muted">{pwdFile.name}</span> : <span className="muted">Aucun fichier</span>}
        </div>

        {pwdError ? <div className="dataImportError">{pwdError}</div> : null}

        {pwdResult ? (
          <div className="dataImportOk">
            <div><b>Terminé.</b></div>
            <div style={{ marginTop: 8 }}>
              ✓ {pwdResult.updated || 0} mot(s) de passe modifié(s)
              {typeof pwdResult.invalid === "number" ? ` — ${pwdResult.invalid} entrée(s) invalide(s)` : ""}
              {typeof pwdResult.notFoundCount === "number" ? ` — ${pwdResult.notFoundCount} non trouvé(s)` : ""}
            </div>
            {(pwdResult.notFoundSample || []).length ? (
              <div style={{ marginTop: 8 }} className="muted">
                Exemples non trouvés: {(pwdResult.notFoundSample || []).slice(0, 8).join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Section de migration des images */}
      <div className="dataImportCard glass" style={{ marginTop: 24 }}>
        <div className="dataImportTitleRow">
          <div className="dataImportTitle">
            <ImagePlus size={18} style={{ marginRight: 10 }} />
            Migration des Images
          </div>
        </div>

        <div className="dataImportHint">
          Cette fonctionnalité convertit les images encodées en base64 dans les fichiers JSON en fichiers image séparés.
          <br />
          Cela réduit considérablement la taille des payloads et résout les erreurs "Exceeded maximum allowed payload size".
          <br />
          <br />
          <strong>Concerné :</strong> 
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>Images des questions (champ <code>imageUrl</code>)</li>
            <li>Photos de profil des utilisateurs (champ <code>photoProfil</code>)</li>
          </ul>
        </div>

        <div className="dataImportActions">
          <button 
            className="btn" 
            type="button" 
            onClick={migrateImages} 
            disabled={migrating}
          >
            {migrating ? "Migration en cours..." : "Lancer la migration"}
          </button>
        </div>

        {migrationError ? (
          <div className="dataImportError">
            <strong>Erreur :</strong> {migrationError}
          </div>
        ) : null}

        {migrationResult ? (
          <div className="dataImportOk">
            <strong>Migration réussie !</strong>
            <div style={{ marginTop: 12 }}>
              <div>✓ Questions : {migrationResult.results?.questions || 0} image(s) migrée(s)</div>
              <div>✓ Utilisateurs : {migrationResult.results?.users || 0} photo(s) migrée(s)</div>
              <div style={{ marginTop: 8 }}>
                <strong>Total : {migrationResult.results?.total || 0} image(s) migrée(s)</strong>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: '0.9em', opacity: 0.8 }}>
              {migrationResult.message}
            </div>
          </div>
        ) : null}

        <div className="dataImportFooter muted">
          Note : Cette opération est idempotente. Vous pouvez la relancer sans problème si de nouvelles données avec des images base64 sont ajoutées.
        </div>
      </div>
    </div>
  );
}

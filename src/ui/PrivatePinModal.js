import React, { useState } from "react";
import Modal from "./Modal";

export default function PrivatePinModal({ onClose, onValidate, error }) {
  const [code, setCode] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code.trim()) {
      onValidate(code.trim());
    }
  };

  return (
    <Modal title="Accès au questionnaire privé" onClose={onClose}>
      <form onSubmit={handleSubmit} className="privateCodeModal">
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          Ce questionnaire est protégé. Veuillez saisir son code secret pour le déverrouiller.
        </p>
        <div className="field">
          <div className="label">Code secret</div>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex: BNI"
            autoFocus
          />
          {error ? <div className="errorText" style={{ marginTop: 8 }}>{error}</div> : null}
        </div>
        <div className="rowBtns" style={{ marginTop: 20 }}>
          <button className="btn btnGhost" onClick={onClose} type="button">
            Annuler
          </button>
          <button className="btn btnPrimary" type="submit" disabled={!code.trim()}>
            Déverrouiller
          </button>
        </div>
      </form>
    </Modal>
  );
}

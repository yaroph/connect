import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./ui.css";

export default function Modal({ title, children, onClose, wide = false, noClickOutside = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="modalOverlay" onMouseDown={noClickOutside ? undefined : onClose}>
      <div className={`modalCard glass ${wide ? "wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="iconBtn" onClick={onClose} aria-label="Fermer" type="button">
            <X size={18} />
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>,
    document.body
  );
}

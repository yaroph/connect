import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { playLaserClick } from "./soundEffects";
import "./ui.css";

export default function Modal({
  title,
  children,
  onClose,
  wide = false,
  noClickOutside = false,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        playLaserClick();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleBackdropClick = () => {
    if (!noClickOutside) {
      playLaserClick();
      onClose?.();
    }
  };

  const handleCloseBtn = () => {
    playLaserClick();
    onClose?.();
  };

  return createPortal(
    <div
      className="modalOverlay modalBackdrop"
      onMouseDown={handleBackdropClick}
    >
      <div
        className={`modalCard modalContent cyberHudPanel glass ${wide ? "wide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="hudBracket hudBracketTL" />
        <div className="hudBracket hudBracketTR" />
        <div className="hudBracket hudBracketBL" />
        <div className="hudBracket hudBracketBR" />

        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button
            className="iconBtn modalCloseBtn"
            onClick={handleCloseBtn}
            aria-label="Fermer"
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

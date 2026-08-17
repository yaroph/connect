import React, { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isSoundEnabled, toggleSound } from "./soundEffects";

export default function SoundToggle({ className = "" }) {
  const [enabled, setEnabled] = useState(isSoundEnabled());

  const handleToggle = () => {
    const next = toggleSound();
    setEnabled(next);
  };

  return (
    <button
      type="button"
      className={`btn btnGhost cyberSoundToggle ${className}`}
      onClick={handleToggle}
      title={enabled ? "Couper le son" : "Activer le son"}
      aria-label={enabled ? "Couper le son" : "Activer le son"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 12px",
        borderRadius: "10px",
        background: "rgba(0, 240, 255, 0.08)",
        border: "1px solid rgba(0, 240, 255, 0.25)",
        color: enabled ? "#00f0ff" : "var(--muted2)",
        transition: "all 0.15s ease",
      }}
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
      <span style={{ fontSize: "11px", fontWeight: 800, marginLeft: 6, letterSpacing: "0.5px" }}>
        {enabled ? "AUDIO ON" : "AUDIO OFF"}
      </span>
    </button>
  );
}

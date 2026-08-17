import React from "react";
import "./cyberLoader.css";

export default function CyberLoader({ message = "CONNEXION SÉCURISÉE AU RÉSEAU BNI…" }) {
  return (
    <div className="cyberLoaderRoot" aria-live="polite">
      <div className="cyberLoaderInner">
        <div className="cyberLoaderGraphic">
          <div className="cyberLoaderRingOuter" />
          <div className="cyberLoaderRingInner" />
          <img
            src="/bniconnect.png"
            alt="BNI Connect"
            className="cyberLoaderLogo"
          />
        </div>
        <div className="cyberLoaderText">{message}</div>
        <div className="cyberLoaderLine">
          <div className="cyberLoaderBar" />
        </div>
      </div>
    </div>
  );
}

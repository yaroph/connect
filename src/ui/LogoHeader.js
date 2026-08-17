import React from "react";
import SoundToggle from "./SoundToggle";
import { playLaserClick } from "./soundEffects";
import "./ui.css";

export default function LogoHeader({ onClick }) {
  return (
    <header className="headerLogoWrap">
      <img
        className={`headerLogo ${onClick ? "clickable" : ""}`}
        src="/bniconnect.png"
        alt="BNI Connect"
        onClick={(e) => {
          if (onClick) {
            playLaserClick();
            onClick(e);
          }
        }}
        title={onClick ? "Retourner aux questions aléatoires" : "BNI Connect"}
      />
      <div className="headerSoundWrap">
        <SoundToggle />
      </div>
    </header>
  );
}

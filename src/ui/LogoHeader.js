import React from "react";
import "./ui.css";

export default function LogoHeader({ onClick }) {
  return (
    <header className="headerLogoWrap">
      <img
        className={`headerLogo ${onClick ? "clickable" : ""}`}
        src="/bniconnect.png"
        alt="BNI Connect"
        onClick={onClick}
        title={onClick ? "Retourner aux questions aléatoires" : "BNI Connect"}
      />
    </header>
  );
}

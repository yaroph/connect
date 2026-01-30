import React from "react";
import "./ui.css";

export default function IconButton({ title, onClick, children, active, disabled }) {
  return (
    <button
      className={`iconBtn ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
      title={title}
      onClick={disabled ? undefined : onClick}
      type="button"
      disabled={disabled}
    >
      {children}
    </button>
  );
}

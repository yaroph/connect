import React from "react";
import "./ui.css";

export default function Toggle({ checked, onChange, label, disabled = false }) {
  const handleClick = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange?.(!checked);
  };

  return (
    <div
      className={`toggleRoot ${disabled ? "toggleDisabled" : ""}`}
      onClick={handleClick}
      role="switch"
      aria-checked={checked ? "true" : "false"}
      aria-disabled={disabled ? "true" : "false"}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onChange?.(!checked);
        }
      }}
    >
      <span className="toggleLabel">{label}</span>
      <span className={`toggle ${checked ? "on" : "off"} ${disabled ? "disabled" : ""}`}>
        <span className="knob" />
      </span>
    </div>
  );
}

import React from "react";
import "./ui.css";

export default function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`toggleRoot ${disabled ? "toggleDisabled" : ""}`}>
      <span className="toggleLabel">{label}</span>
      <span
        className={`toggle ${checked ? "on" : "off"} ${disabled ? "disabled" : ""}`}
        role="switch"
        aria-checked={checked ? "true" : "false"}
        aria-disabled={disabled ? "true" : "false"}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return;
          onChange?.(!checked);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") onChange?.(!checked);
        }}
      >
        <span className="knob" />
      </span>
    </label>
  );
}

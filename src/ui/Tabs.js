import React from "react";
import "./ui.css";
import { playLaserClick } from "./soundEffects";

export default function Tabs({ items, activeId, onChange, variant = "top" }) {
  return (
    <div className={`tabs tabs-${variant}`}>
      {items.map((it) => (
        <button
          key={it.id}
          className={`tabBtn ${activeId === it.id ? "active" : ""}`}
          onClick={() => {
            playLaserClick();
            onChange(it.id);
          }}
          type="button"
        >
          {it.icon ? <span className="tabIcon">{it.icon}</span> : null}
          <span>{it.label}</span>
          {it.badge != null && it.badge > 0 ? (
            <span className="tabBadge pill">{it.badge}</span>
          ) : null}
          {it.wip ? <span className="tabWip pill">WIP</span> : null}
        </button>
      ))}
    </div>
  );
}

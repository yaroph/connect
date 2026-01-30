import React from "react";
import "./ui.css";

export default function Tabs({ items, activeId, onChange, variant = "top" }) {
  return (
    <div className={`tabs tabs-${variant}`}>
      {items.map((it) => (
        <button
          key={it.id}
          className={`tabBtn ${activeId === it.id ? "active" : ""}`}
          onClick={() => onChange(it.id)}
          type="button"
        >
          <span>{it.label}</span>
          {it.wip ? <span className="tabWip pill">WIP</span> : null}
        </button>
      ))}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import "./noticeHost.css";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X, Check } from "lucide-react";
import { playLaserClick } from "./soundEffects";

export default function NoticeHost() {
  const [items, setItems] = useState([]);
  const [confirmData, setConfirmData] = useState(null);

  useEffect(() => {
    const onNotify = (e) => {
      const d = e?.detail || {};
      if (!d.message) return;
      const item = {
        id: d.id || `${Date.now()}`,
        type: d.type || "info",
        message: d.message,
      };
      setItems((prev) => [item, ...prev].slice(0, 3));
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, 4200);
    };

    const onConfirm = (e) => {
      const d = e?.detail || {};
      if (!d.message) return;
      setConfirmData(d);
    };

    window.addEventListener("bni_notify", onNotify);
    window.addEventListener("bni_confirm", onConfirm);
    return () => {
      window.removeEventListener("bni_notify", onNotify);
      window.removeEventListener("bni_confirm", onConfirm);
    };
  }, []);

  const handleConfirm = () => {
    playLaserClick();
    if (confirmData?.onConfirm) confirmData.onConfirm();
    setConfirmData(null);
  };

  const handleCancel = () => {
    playLaserClick();
    if (confirmData?.onCancel) confirmData.onCancel();
    setConfirmData(null);
  };

  return (
    <>
      {items.length > 0 && (
        <div className="noticeHost">
          {items.map((it) => (
            <div key={it.id} className={`noticeItem cyberHudPanel ${it.type}`} role="status">
              <div className="noticeIcon">
                {it.type === "success" ? (
                  <CheckCircle2 size={18} />
                ) : it.type === "error" ? (
                  <AlertCircle size={18} />
                ) : (
                  <Info size={18} />
                )}
              </div>
              <div className="noticeText">{it.message}</div>
            </div>
          ))}
        </div>
      )}

      {confirmData && (
        <div className="confirmOverlay" onClick={handleCancel}>
          <div className="confirmDialog cyberHudPanel" onClick={(e) => e.stopPropagation()}>
            <div className="hudBracket hudBracketTL" />
            <div className="hudBracket hudBracketTR" />
            <div className="hudBracket hudBracketBL" />
            <div className="hudBracket hudBracketBR" />

            <div className="confirmHeader">
              <div className="confirmIconWrap">
                <AlertTriangle size={20} />
              </div>
              <div className="confirmTitle">CONFIRMATION REQUISE</div>
            </div>

            <div className="confirmMessage">{confirmData.message}</div>

            <div className="confirmButtons">
              <button className="btn confirmButtonCancel" onClick={handleCancel} type="button">
                <X size={14} />
                <span>Annuler</span>
              </button>
              <button className="btn confirmButtonOk" onClick={handleConfirm} type="button">
                <Check size={14} />
                <span>Confirmer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

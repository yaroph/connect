import React, { useEffect, useState } from "react";
import "./noticeHost.css";

export default function NoticeHost() {
  const [items, setItems] = useState([]);
  const [confirmData, setConfirmData] = useState(null);

  useEffect(() => {
    const onNotify = (e) => {
      const d = e?.detail || {};
      if (!d.message) return;
      const item = { id: d.id || `${Date.now()}`, type: d.type || "info", message: d.message };
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
    if (confirmData?.onConfirm) confirmData.onConfirm();
    setConfirmData(null);
  };

  const handleCancel = () => {
    if (confirmData?.onCancel) confirmData.onCancel();
    setConfirmData(null);
  };

  return (
    <>
      {items.length > 0 && (
        <div className="noticeHost">
          {items.map((it) => (
            <div key={it.id} className={`noticeItem ${it.type}`} role="status">
              {it.message}
            </div>
          ))}
        </div>
      )}
      
      {confirmData && (
        <div className="confirmOverlay" onClick={handleCancel}>
          <div className="confirmDialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirmMessage">{confirmData.message}</div>
            <div className="confirmButtons">
              <button className="confirmButtonCancel" onClick={handleCancel}>
                Annuler
              </button>
              <button className="confirmButtonOk" onClick={handleConfirm}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

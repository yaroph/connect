import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, CheckCircle2 } from "lucide-react";
import { adminListPayments, adminValidatePayment, adminCancelPayment } from "../../data/storage";
import { confirmAction, notifySuccess, notifyError } from "../notify";

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="iconCopy"
      type="button"
      title="Copier"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value || ""));
          setOk(true);
          setTimeout(() => setOk(false), 700);
        } catch (e) {
          // ignore
        }
      }}
    >
      {ok ? <CheckCircle2 size={16} /> : <Copy size={16} />}
    </button>
  );
}

export default function AdminPayments({ onCountChange }) {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [processingId, setProcessingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListPayments();
      setPayments(r.payments || []);
      if (typeof onCountChange === "function") onCountChange((r.payments || []).length);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => payments.reduce((s, p) => s + Number(p.amount || 0), 0), [payments]);

  const removeLocal = useCallback((id) => {
    setPayments((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (typeof onCountChange === "function") onCountChange(next.length);
      return next;
    });
  }, [onCountChange]);

  return (
    <div>
      <div className="adminPayTotal">
        <div className="adminPayTotalLeft">
          <div className="adminPayTotalLabel">Total à payer</div>
          <div className="adminPayTotalValue">${total.toFixed(2)} au total</div>
        </div>
      </div>

      {loading ? <div className="muted">Chargement…</div> : null}

      <div className="adminPayList">
        {payments.length === 0 && !loading ? <div className="muted">Aucune demande</div> : null}
        {payments.map((p) => (
          <div key={p.id} className="adminPayCard">
            <div className="adminPayHead">
              <div>
                <div className="adminPayTitle">Paiement pour {p.fullName}</div>
                <div className="adminPaySub muted">Validé le {new Date(p.createdAt).toLocaleString()}</div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="adminPayCancel"
                  type="button"
                  disabled={processingId === p.id}
                  onClick={() => {
                    confirmAction(
                      "Êtes-vous sûr de vouloir annuler ce paiement ? L'argent sera remis dans la cagnotte \"Argent en attente\".",
                      async () => {
                        try {
                          setProcessingId(p.id);
                          // Retire la box immédiatement (UX)
                          removeLocal(p.id);
                          await adminCancelPayment(p.id);
                          notifySuccess("Paiement annulé avec succès");
                        } catch (error) {
                          notifyError("Erreur lors de l'annulation du paiement");
                          console.error(error);
                          // Re-sync en cas d'erreur
                          await load();
                        } finally {
                          setProcessingId(null);
                        }
                      }
                    );
                  }}
                >
                  ✕ Annuler
                </button>
                <button
                  className="adminPayValidate"
                  type="button"
                  disabled={processingId === p.id}
                  onClick={async () => {
                    try {
                      setProcessingId(p.id);
                      // Retire la box immédiatement (UX)
                      removeLocal(p.id);
                      await adminValidatePayment(p.id);
                      notifySuccess("Paiement validé avec succès");
                    } catch (error) {
                      notifyError("Erreur lors de la validation du paiement");
                      console.error(error);
                      // Re-sync en cas d'erreur
                      await load();
                    } finally {
                      setProcessingId(null);
                    }
                  }}
                >
                  € Payé
                </button>
              </div>
            </div>

            <div className="adminPayBody">
              <div className="adminPayRow">
                <div className="adminPayKey">Compte</div>
                <div className="adminPayVal">{p.compteBancaire}</div>
                <CopyBtn value={p.compteBancaire} />
              </div>
              <div className="adminPayRow">
                <div className="adminPayKey">Téléphone</div>
                <div className="adminPayVal">{p.telephone}</div>
                <CopyBtn value={p.telephone} />
              </div>
              <div className="adminPayRow">
                <div className="adminPayKey">Montant</div>
                <div className="adminPayVal adminPayValGreen">${Number(p.amount || 0).toFixed(2)}</div>
                <CopyBtn value={p.amount} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

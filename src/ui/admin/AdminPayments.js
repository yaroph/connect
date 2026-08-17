import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, CheckCircle2, Check, X, CreditCard, Phone, User, Calendar } from "lucide-react";
import {
  adminListPayments,
  adminValidatePayment,
  adminCancelPayment,
} from "../../data/storage";
import { confirmAction, notifySuccess, notifyError } from "../notify";
import { playLaserClick, playCreditEarned } from "../soundEffects";

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="iconCopy iconCopySm"
      type="button"
      title="Copier"
      onClick={async (e) => {
        e.stopPropagation();
        playLaserClick();
        try {
          await navigator.clipboard.writeText(String(value || ""));
          setOk(true);
          setTimeout(() => setOk(false), 800);
        } catch (e2) {
          // ignore
        }
      }}
    >
      {ok ? <CheckCircle2 size={13} style={{ color: "#34d399" }} /> : <Copy size={13} />}
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
      if (typeof onCountChange === "function")
        onCountChange((r.payments || []).length);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => payments.reduce((s, p) => s + Number(p.amount || 0), 0),
    [payments],
  );

  const removeLocal = useCallback(
    (id) => {
      setPayments((prev) => {
        const next = prev.filter((x) => x.id !== id);
        if (typeof onCountChange === "function") onCountChange(next.length);
        return next;
      });
    },
    [onCountChange],
  );

  return (
    <div className="adminPaymentsWrap">
      {/* Top Banner Total */}
      <div className="adminPayTotal">
        <div>
          <div className="adminPayTotalLabel">Total des virements en attente</div>
          <div className="adminPayTotalValue">$ {total.toFixed(2)}</div>
        </div>
        <div className="adminPayTotalCountBadge">
          {payments.length} demande{payments.length > 1 ? "s" : ""}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center" }} className="muted">
          Chargement des virements…
        </div>
      ) : null}

      {!loading && payments.length === 0 ? (
        <div className="adminEmptyPayments">
          <CheckCircle2 size={42} style={{ color: "#34d399", marginBottom: 8 }} />
          <div style={{ fontWeight: 800, fontSize: 16, color: "#f8fafc" }}>
            Aucun virement en attente
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Toutes les demandes de retrait ont été traitées !
          </div>
        </div>
      ) : null}

      <div className="adminPayList">
        {payments.map((p) => (
          <div key={p.id} className="adminPayCard">
            <div className="adminPayHeaderRow">
              <div className="adminPayUserIdentity">
                <div className="adminPayAvatarInitials">
                  <User size={18} />
                </div>
                <div>
                  <div className="adminPayCitizenName">{p.fullName}</div>
                  <div className="adminPayDate">
                    <Calendar size={11} />
                    <span>Demandé le {new Date(p.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="adminPayActionBtns">
                <button
                  className="btn adminPayCancelBtn"
                  type="button"
                  disabled={processingId === p.id}
                  onClick={() => {
                    playLaserClick();
                    confirmAction(
                      'Êtes-vous sûr de vouloir annuler ce paiement ? L\'argent sera remis dans la cagnotte "Argent en attente" du joueur.',
                      async () => {
                        try {
                          setProcessingId(p.id);
                          removeLocal(p.id);
                          await adminCancelPayment(p.id);
                          notifySuccess("Paiement annulé et recrédité");
                        } catch (error) {
                          notifyError("Erreur lors de l'annulation");
                          await load();
                        } finally {
                          setProcessingId(null);
                        }
                      },
                    );
                  }}
                >
                  <X size={14} />
                  <span>Rejeter</span>
                </button>

                <button
                  className="btn adminPayValidateBtn"
                  type="button"
                  disabled={processingId === p.id}
                  onClick={async () => {
                    playCreditEarned();
                    try {
                      setProcessingId(p.id);
                      removeLocal(p.id);
                      await adminValidatePayment(p.id);
                      notifySuccess(`Virement de $ ${Number(p.amount || 0).toFixed(2)} validé !`);
                    } catch (error) {
                      notifyError("Erreur lors de la validation");
                      await load();
                    } finally {
                      setProcessingId(null);
                    }
                  }}
                >
                  <Check size={15} />
                  <span>Valider le virement</span>
                </button>
              </div>
            </div>

            {/* Info Chips Grid */}
            <div className="adminPayChipsGrid">
              <div className="adminPayChip">
                <CreditCard size={14} className="adminPayChipIcon" />
                <span className="adminPayChipLabel">Compte :</span>
                <span className="adminPayChipVal">{p.compteBancaire || "N/A"}</span>
                {p.compteBancaire ? <CopyBtn value={p.compteBancaire} /> : null}
              </div>

              <div className="adminPayChip">
                <Phone size={14} className="adminPayChipIcon" />
                <span className="adminPayChipLabel">Téléphone :</span>
                <span className="adminPayChipVal">{p.telephone || "N/A"}</span>
                {p.telephone ? <CopyBtn value={p.telephone} /> : null}
              </div>

              <div className="adminPayChip adminPayChipEmerald">
                <span className="adminPayChipLabel">Montant :</span>
                <span className="adminPayChipVal">$ {Number(p.amount || 0).toFixed(2)}</span>
                <CopyBtn value={p.amount} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

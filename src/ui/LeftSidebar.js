import React, { useMemo } from "react";
import { Eye, Play, Lock, ShieldCheck, RotateCcw } from "lucide-react";
import "./leftSidebar.css";

export default function LeftSidebar({ user, pending, questionnaires, settings, questionnairesProgress, onStartQuestionnaire, onPreviewQuestionnaire, onRequestWithdraw, onOpenProfile }) {
  const earned = Number(user?.gagneSurBNI || 0);
  const status = user?.retrait?.status || "IDLE";
  const requestedAmount = Number(user?.retrait?.amount || 0);
  const minWithdrawal = Number(settings?.minimumWithdrawalAmount || 50);
  const canWithdraw = status !== "PENDING" && Number(pending || 0) >= minWithdrawal;
  const amountMissing = Math.max(0, minWithdrawal - Number(pending || 0));

  const initials = useMemo(() => {
    const p = (user?.prenom || "").trim();
    const n = (user?.nom || "").trim();
    const a = (p[0] || "").toUpperCase();
    const b = (n[0] || "").toUpperCase();
    return `${a}${b}` || "?";
  }, [user]);

  // Fonction pour obtenir l'état de progression d'un questionnaire
  const getQuestionnaireProgress = (qnId) => {
    if (!questionnairesProgress || !questionnairesProgress[qnId]) {
      return null;
    }
    return questionnairesProgress[qnId];
  };

  return (
    <aside className="leftSidebar glass">
      <div className="userBlock glassCard">
        <div className="userTop">
          <div className="avatar">
            {user?.photoProfil ? (
              <img className="avatarImg" alt="avatar" src={user.photoProfil} />
            ) : (
              initials
            )}
          </div>
          <button
            type="button"
            className="userName userNameBtn"
            onClick={() => onOpenProfile && onOpenProfile()}
          >
            {(user?.prenom || "") + " " + (user?.nom || "")}
          </button>
        </div>

        <div className="moneyRow">
          <div className="moneyBox">
            <div className="moneyLabel">Gagné sur BNI</div>
            <div className="moneyValue">$ {earned.toFixed(2)}</div>
          </div>
          <div className="moneyBox">
            <div className="moneyLabel">Argent en attente</div>
            <div className="moneyValue">$ {Number(pending || 0).toFixed(2)}</div>
          </div>
        </div>

        <button
          className={`btn wideBtn ${status === "PENDING" ? "btnWaiting" : "btnPrimary"}`}
          type="button"
          disabled={!canWithdraw}
          onClick={() => (canWithdraw ? onRequestWithdraw && onRequestWithdraw() : null)}
        >
          {status === "PENDING" ? (
            <span className="waitWrap">
              <span className="spinner" /> EN ATTENTE DE PAYEMENT ($ {requestedAmount.toFixed(2)})
            </span>
          ) : !canWithdraw ? (
            `RÉCUPÉRER MON ARGENT DANS $ ${amountMissing.toFixed(2)}`
          ) : (
            "RÉCUPÉRER MON ARGENT"
          )}
        </button>

        {user?.is_admin ? (
          <button
            className="btn wideBtn btnGhost"
            type="button"
            onClick={() => window.location.href = "/admin"}
            style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ShieldCheck size={16} style={{ marginRight: 8 }} />
            ACCÉDER AU PANEL ADMIN
          </button>
        ) : null}
      </div>

      <div className="sectionTitle">Questionnaires disponibles</div>

      <div className="qnList">
        {questionnaires.length === 0 ? (
          <div className="emptyHint">Aucun questionnaire disponible</div>
        ) : (
          questionnaires.map((qn) => {
            const progress = getQuestionnaireProgress(qn.id);
            const hasProgress = progress && progress.answeredCount > 0 && !progress.isCompleted;
            const totalQuestions = progress?.totalQuestions || (qn.questionOrder || []).length;
            const answeredCount = progress?.answeredCount || 0;
            const remaining = progress?.remaining || totalQuestions;
            
            return (
              <div key={qn.id} className="qnCard glassCard">
                <div className="qnNameRow">
                  <div className="qnName">{qn.name}</div>
                  {qn.isPrivate ? (
                    <span className="lockPill pill" title="Privé">
                      <Lock size={14} style={{ marginRight: 6 }} /> Privé
                    </span>
                  ) : null}
                </div>

                <div className="qnMetaRow">
                  <div className="qnMeta">
                    {hasProgress ? (
                      <span style={{ color: '#f59e0b' }}>
                        {remaining} question{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''}
                      </span>
                    ) : (
                      `${totalQuestions} question${totalQuestions > 1 ? 's' : ''}`
                    )}
                  </div>
                  <div className="qnPrice pill">€ {Number(qn.reward || 0).toFixed(2)}</div>
                </div>

                <div className="qnBtns">
                  <button 
                    className={`btn ${hasProgress ? 'btnContinue' : 'btnPrimary'}`} 
                    onClick={() => onStartQuestionnaire(qn.id)} 
                    type="button"
                  >
                    {hasProgress ? (
                      <>
                        <RotateCcw size={16} style={{ marginRight: 8 }} />
                        Continuer ({answeredCount}/{totalQuestions})
                      </>
                    ) : (
                      <>
                        <Play size={16} style={{ marginRight: 8 }} />
                        Commencer
                      </>
                    )}
                  </button>
                  <button className="btn btnGhost" type="button" onClick={() => onPreviewQuestionnaire && onPreviewQuestionnaire(qn.id)}>
                    <Eye size={16} style={{ marginRight: 8 }} />
                    Aperçu
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

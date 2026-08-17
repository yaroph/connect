import React, { useMemo } from "react";
import { Eye, Play, Lock, ShieldCheck, RotateCcw, Zap } from "lucide-react";
import "./leftSidebar.css";

export default function LeftSidebar({
  user,
  pending,
  questionnaires,
  settings,
  questionnairesProgress,
  onStartQuestionnaire,
  onPreviewQuestionnaire,
  onRequestWithdraw,
  onOpenProfile,
  className = "",
}) {
  const earned = Number(user?.gagneSurBNI || 0);
  const status = user?.retrait?.status || "IDLE";
  const requestedAmount = Number(user?.retrait?.amount || 0);
  const minWithdrawal = Number(settings?.minimumWithdrawalAmount || 50);
  const canWithdraw =
    status !== "PENDING" && Number(pending || 0) >= minWithdrawal;
  const amountMissing = Math.max(0, minWithdrawal - Number(pending || 0));

  const initials = useMemo(() => {
    const p = (user?.prenom || "").trim();
    const n = (user?.nom || "").trim();
    const a = (p[0] || "").toUpperCase();
    const b = (n[0] || "").toUpperCase();
    return `${a}${b}` || "?";
  }, [user]);

  const maskedAccount = useMemo(() => {
    const acc = String(user?.compteBancaire || "").trim();
    if (!acc) return "•••• •••• ••••";
    if (acc.length <= 4) return acc;
    return `BNI-••••-${acc.slice(-4)}`;
  }, [user]);

  const getQuestionnaireProgress = (qnId) => {
    if (!questionnairesProgress || !questionnairesProgress[qnId]) {
      return null;
    }
    return questionnairesProgress[qnId];
  };

  return (
    <aside className={`leftSidebar glass ${className}`.trim()}>
      {/* Carte Bancaire Cyber BNI */}
      <div className="cyberBankCard">
        <div className="cyberCardTop">
          <div className="cyberCardChip" />
          <div className="cyberCardBrand">BNI CONNECT</div>
        </div>

        <div className="cyberCardBalanceRow">
          <div className="cyberCardBalanceLabel">Cagnotte en attente</div>
          <div className="cyberCardBalanceValue">
            $ {Number(pending || 0).toFixed(2)}
          </div>
        </div>

        <div className="cyberCardFooter">
          <div className="cyberCardUserWrap" onClick={onOpenProfile} title="Modifier mon profil">
            <div className="cyberCardAvatar">
              {user?.photoProfil ? (
                <img className="cyberCardAvatarImg" alt="avatar" src={user.photoProfil} loading="lazy" />
              ) : (
                initials
              )}
            </div>
            <div>
              <div className="cyberCardHolder">
                {(user?.prenom || "") + " " + (user?.nom || "")}
              </div>
              <div className="cyberCardAccount">{maskedAccount}</div>
            </div>
          </div>
          <div className="cyberCardTotalEarned" title="Total gagné sur BNI">
            <span className="cyberCardTotalLabel">Total</span>
            <span className="cyberCardTotalVal">${earned.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Bouton de retrait / statut */}
      <button
        className={`btn wideBtn ${status === "PENDING" ? "btnWaiting" : canWithdraw ? "btnSuccess" : "btnPrimary"}`}
        type="button"
        disabled={!canWithdraw}
        onClick={() => (canWithdraw ? onRequestWithdraw && onRequestWithdraw() : null)}
      >
        {status === "PENDING" ? (
          <span className="waitWrap">
            <span className="spinner" /> EN ATTENTE DE PAIEMENT ($ {requestedAmount.toFixed(2)})
          </span>
        ) : !canWithdraw ? (
          `RÉCUPÉRER MON ARGENT DANS $ ${amountMissing.toFixed(2)}`
        ) : (
          <>
            <Zap size={16} /> ENCAISSER MA CAGNOTTE
          </>
        )}
      </button>

      {user?.is_admin ? (
        <button
          className="btn wideBtn btnGhost adminAccessBtn"
          type="button"
          onClick={() => (window.location.href = "/admin")}
        >
          <ShieldCheck size={16} />
          PANEL D'ADMINISTRATION
        </button>
      ) : null}

      <div className="sectionTitle">
        <span>Questionnaires disponibles</span>
        <span className="qnCountBadge">{questionnaires.length}</span>
      </div>

      <div className="qnList">
        {questionnaires.length === 0 ? (
          <div className="emptyHint">Aucun questionnaire disponible pour le moment</div>
        ) : (
          questionnaires.map((qn) => {
            const progress = getQuestionnaireProgress(qn.id);
            const hasProgress =
              progress && progress.answeredCount > 0 && !progress.isCompleted;
            const totalQuestions =
              progress?.totalQuestions || (qn.questionOrder || []).length;
            const answeredCount = progress?.answeredCount || 0;
            const percent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

            return (
              <div key={qn.id} className="qnCard glassCard">
                <div className="qnNameRow">
                  <div className="qnName">{qn.name}</div>
                  {qn.isPrivate ? (
                    <span className="lockPill pill" title="Questionnaire privé">
                      <Lock size={12} /> Privé
                    </span>
                  ) : null}
                </div>

                {hasProgress ? (
                  <div className="qnProgressBarContainer">
                    <div className="qnProgressBarFill" style={{ width: `${percent}%` }} />
                  </div>
                ) : null}

                <div className="qnMetaRow">
                  <div className="qnMeta">
                    {hasProgress ? (
                      <span className="qnProgressText">
                        {answeredCount}/{totalQuestions} questions ({percent}%)
                      </span>
                    ) : (
                      `${totalQuestions} question${totalQuestions > 1 ? "s" : ""}`
                    )}
                  </div>
                  <div className="qnPrice pill pill-emerald">
                    $ {Number(qn.reward || 0).toFixed(2)}
                  </div>
                </div>

                <div className="qnBtns">
                  <button
                    className={`btn ${hasProgress ? "btnContinue" : "btnPrimary"}`}
                    onClick={() => onStartQuestionnaire(qn.id)}
                    type="button"
                  >
                    {hasProgress ? (
                      <>
                        <RotateCcw size={15} />
                        Continuer
                      </>
                    ) : (
                      <>
                        <Play size={15} />
                        Commencer
                      </>
                    )}
                  </button>
                  <button
                    className="btn btnGhost"
                    type="button"
                    onClick={() =>
                      onPreviewQuestionnaire && onPreviewQuestionnaire(qn.id)
                    }
                  >
                    <Eye size={15} />
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

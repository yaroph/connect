import React, { useMemo } from "react";
import { Eye, Play, Lock, ShieldCheck, RotateCcw } from "lucide-react";
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

  const getQuestionnaireProgress = (qnId) => {
    if (!questionnairesProgress || !questionnairesProgress[qnId]) {
      return null;
    }
    return questionnairesProgress[qnId];
  };

  return (
    <aside className={`leftSidebar glass ${className}`.trim()}>
      <div className="userBlock glassCard">
        <div className="userTop">
          <div className="avatar" onClick={onOpenProfile} title="Modifier mon profil">
            {user?.photoProfil ? (
              <img className="avatarImg" alt="avatar" src={user.photoProfil} />
            ) : (
              initials
            )}
          </div>
          <div className="userHeaderDetails">
            <button
              type="button"
              className="userName userNameBtn"
              onClick={() => onOpenProfile && onOpenProfile()}
            >
              {(user?.prenom || "") + " " + (user?.nom || "")}
            </button>
            <div className="userSubRole">
              {user?.metier || "Citoyen"}
            </div>
          </div>
        </div>

        <div className="moneyRow">
          <div className="moneyBox">
            <div className="moneyLabel">Gagné au total</div>
            <div className="moneyValue">$ {earned.toFixed(2)}</div>
          </div>
          <div className="moneyBox">
            <div className="moneyLabel">Cagnotte en attente</div>
            <div className="moneyValue highlightPending">
              $ {Number(pending || 0).toFixed(2)}
            </div>
          </div>
        </div>

        <button
          className={`btn wideBtn ${status === "PENDING" ? "btnWaiting" : "btnPrimary"}`}
          type="button"
          disabled={!canWithdraw}
          onClick={() =>
            canWithdraw ? onRequestWithdraw && onRequestWithdraw() : null
          }
        >
          {status === "PENDING" ? (
            <span className="waitWrap">
              <span className="spinner" /> EN ATTENTE DE PAIEMENT ($ {requestedAmount.toFixed(2)})
            </span>
          ) : !canWithdraw ? (
            `RÉCUPÉRER MON ARGENT DANS $ ${amountMissing.toFixed(2)}`
          ) : (
            "RÉCUPÉRER MON ARGENT"
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
      </div>

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
                  <div className="qnPrice pill">
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

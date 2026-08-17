import React, { useMemo } from "react";
import Modal from "./Modal";
import { DollarSign } from "lucide-react";

export default function PreviewQuestionnaireModal({ db, questionnaireId, onClose }) {
  const questionnaire = useMemo(() => {
    if (!db || !questionnaireId) return null;
    return (db.questionnaires || []).find((q) => q.id === questionnaireId);
  }, [db, questionnaireId]);

  const questions = useMemo(() => {
    if (!db || !questionnaire) return [];

    if (questionnaire.questionOrder && questionnaire.questionOrder.length > 0) {
      const questionsMap = new Map();
      (db.questions || []).forEach((q) => {
        if (q.questionnaire === questionnaire.id) {
          questionsMap.set(q.id, q);
        }
      });

      return questionnaire.questionOrder
        .map((id) => questionsMap.get(id))
        .filter(Boolean);
    }

    return (db.questions || []).filter(
      (q) => q.questionnaire === questionnaire.id
    );
  }, [db, questionnaire]);

  if (!questionnaire) {
    return (
      <Modal title="Aperçu du questionnaire" onClose={onClose}>
        <div className="muted">Questionnaire introuvable</div>
      </Modal>
    );
  }

  return (
    <Modal title="Aperçu du questionnaire" onClose={onClose}>
      <div className="previewModal">
        <div className="previewHeader">
          <div className="previewTitle">{questionnaire.name}</div>
          <div className="previewMeta">
            <span className="previewBadge">
              {questions.length} question{questions.length > 1 ? "s" : ""}
            </span>
            <span className="previewRewardBadge">
              <DollarSign size={13} style={{ verticalAlign: "middle", marginRight: 2 }} />
              Récompense : $ {Number(questionnaire.reward || 0).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="previewQuestionsList">
          {questions.length === 0 ? (
            <div className="muted" style={{ padding: 16, textAlign: "center" }}>
              Aucune question dans ce questionnaire
            </div>
          ) : (
            questions.map((q, idx) => (
              <div key={q.id} className="previewQuestionItem">
                <div className="previewQuestionTitle">
                  <span className="previewQuestionIndex">{idx + 1}.</span> {q.title || "Sans titre"}
                </div>
                <div className="previewQuestionType">
                  Type : {q.type || "FREE_TEXT"}
                  {q.choices && q.choices.length > 0 ? ` • ${q.choices.length} choix` : ""}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button className="btn btnPrimary" onClick={onClose} type="button">
            Fermer l'aperçu
          </button>
        </div>
      </div>
    </Modal>
  );
}

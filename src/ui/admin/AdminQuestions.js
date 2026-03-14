import React, { useMemo, useState } from "react";
import { Search, Pencil, Eye, UserRound, Trash2 } from "lucide-react";
import Modal from "../Modal";
import Toggle from "../Toggle";
import IconButton from "../IconButton";
import QuestionCard from "../QuestionCard";
import QuestionEditorModal from "./QuestionEditorModal";
import ResponsesModal from "./ResponsesModal";
import { newId, isQuestionnaireActive } from "../../data/storage";
import { getQuestionnaireById, isPriorityActive, formatPriorityUntil } from "../../data/selectors";
import { confirmAction, notifySuccess } from "../notify";
import "./adminShared.css";
import "./questionsTab.css";

function getTypeLabel(q) {
  const t = String(q?.type || 'FREE_TEXT').toUpperCase();
  if (t === 'QCM') return 'QCM';
  if (t === 'DROPDOWN') return 'Déroulant';
  if (t === 'CHECKBOX') {
    const mode = String(q?.checkboxMode || '').toUpperCase();
    return mode === 'SINGLE' ? 'Checkbox (unique)' : 'Checkbox (multiple)';
  }
  if (t === 'SLIDER') {
    const a = q?.sliderMin;
    const b = q?.sliderMax;
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) return `Slider ${Math.min(Number(a), Number(b))}-${Math.max(Number(a), Number(b))}`;
    return 'Slider';
  }
  if (t === 'PHOTO') return 'Photo';
  return 'Texte libre';
}

export default function AdminQuestions({ db, onDBChange }) {
  const [qSearch, setQSearch] = useState("");
  const [filter, setFilter] = useState("ALL"); // ALL | INDIVIDUAL | QUESTIONNAIRE | CAPTCHA | PRIORITY

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [previewId, setPreviewId] = useState(null);
  const [answersQuestionId, setAnswersQuestionId] = useState(null);

  const qnById = useMemo(() => new Map((db.questionnaires || []).map((q) => [q.id, q])), [db]);
  const tagById = useMemo(() => new Map((db.tags || []).map((t) => [t.id, t])), [db]);

  const questions = useMemo(() => {
    const q = (qSearch || "").trim().toLowerCase();
    let base = Array.isArray(db.questions) ? [...db.questions] : [];

    // hide questions of PRIVATE questionnaires
    base = base.filter((x) => {
      if (!x.questionnaire) return true;
      const qn = qnById.get(x.questionnaire);
      return !(qn && qn.isPrivate);
    });

    // filter by origin
    if (filter === "INDIVIDUAL") base = base.filter((x) => !x.questionnaire);
    if (filter === "QUESTIONNAIRE") base = base.filter((x) => !!x.questionnaire);

    // filter by captcha / prioritaire
    if (filter === "CAPTCHA") base = base.filter((x) => String(x?.importance || "SENSIBLE").toUpperCase() === "CAPTCHA");
    if (filter === "PRIORITY") base = base.filter((x) => !x.questionnaire && isPriorityActive(x));

    // search
    if (q) base = base.filter((x) => (x.title || "").toLowerCase().includes(q));

    // newest first
    base.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return base;
  }, [db, qSearch, filter, qnById]);

  const editing = useMemo(
    () => (Array.isArray(db.questions) ? db.questions.find((q) => q.id === editingId) : null),
    [db, editingId]
  );

  const previewQ = useMemo(
    () => (Array.isArray(db.questions) ? db.questions.find((q) => q.id === previewId) : null),
    [db, previewId]
  );

  const openCreate = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (id) => {
    setEditingId(id);
    setEditorOpen(true);
  };

  const save = (payload, createdTag) => {
    onDBChange((draft) => {
      draft.tags = draft.tags || [];
      if (createdTag) draft.tags.unshift(createdTag);

      draft.questions = draft.questions || [];
      const now = new Date().toISOString();

      if (payload.id) {
        const idx = draft.questions.findIndex((q) => q.id === payload.id);
        if (idx >= 0) {
          // preserve questionnaire link if already present and payload doesn't override
          const existing = draft.questions[idx];
          const questionnaire = payload.questionnaire ?? existing.questionnaire ?? null;
          draft.questions[idx] = { ...existing, ...payload, questionnaire, updatedAt: now };
        }
      } else {
        const id = newId("q");
        draft.questions.unshift({
          ...payload,
          id,
          createdAt: now,
          updatedAt: now,
          active: true,
          questionnaire: null,
          forcedInactiveByQuestionnaire: false,
        });
      }

      // Ensure questionnaire.questionOrder contains the question (if linked)
      const qObj = payload.id
        ? (draft.questions || []).find((x) => x.id === payload.id)
        : draft.questions[0];

      if (qObj && qObj.questionnaire) {
        const qnIdx = (draft.questionnaires || []).findIndex((qn) => qn.id === qObj.questionnaire);
        if (qnIdx >= 0) {
          // Keep both keys in sync: UI uses questionOrder, persistence uses questionorder.
          draft.questionnaires[qnIdx].questionOrder = draft.questionnaires[qnIdx].questionOrder || [];
          draft.questionnaires[qnIdx].questionorder = draft.questionnaires[qnIdx].questionorder || draft.questionnaires[qnIdx].questionOrder || [];
          if (!draft.questionnaires[qnIdx].questionOrder.includes(qObj.id)) {
            draft.questionnaires[qnIdx].questionOrder.push(qObj.id);
          }
          if (!draft.questionnaires[qnIdx].questionorder.includes(qObj.id)) {
            draft.questionnaires[qnIdx].questionorder.push(qObj.id);
          }
        }
      }

      return draft;
    });

    setEditorOpen(false);
  };

  const deleteQuestion = (q) => {
    if (q.questionnaire) return; // disabled by design
    confirmAction(
      `Supprimer définitivement cette question ?\n\n${String(q?.title || "").trim() || "(sans titre)"}`,
      () => {
        onDBChange((draft) => {
          draft.questions = (draft.questions || []).filter((x) => x.id !== q.id);
          return draft;
        });
        notifySuccess("Question supprimée");
      }
    );
  };

  const toggleActive = (q, desired) => {
    const qn = q.questionnaire ? getQuestionnaireById(db, q.questionnaire) : null;
    const qnUnreleased = Boolean(qn && (qn.unrelease || qn.unreleased || String(qn.status || "").toLowerCase() === "unrelease"));
    const lockedByActiveQuestionnaire = q.questionnaire && qn && isQuestionnaireActive(qn);

    // Questions inside an unreleased questionnaire must always stay inactive in this tab
    if (qnUnreleased) return;

    if (lockedByActiveQuestionnaire) return;

    onDBChange((draft) => {
      const idx = (draft.questions || []).findIndex((x) => x.id === q.id);
      if (idx >= 0) draft.questions[idx].active = desired;
      return draft;
    });
  };

  return (
    <div>
      <div className="adminHeaderRow">
        <div>
          <div className="adminTitle">Questions</div>
          <div className="adminSub">
            L’endroit où on retrouve toutes les questions (individuelles + questionnaires).
          </div>
        </div>
        <button className="btn btnPrimary" onClick={openCreate}>
          Créer une question
        </button>
      </div>

      <div className="qToolsRow glass">
        <div className="qSearch">
          <Search size={16} />
          <input
            className="qSearchInput"
            placeholder="Rechercher par intitulé..."
            value={qSearch}
            onChange={(e) => setQSearch(e.target.value)}
          />
        </div>

        <div className="qFilterSelect">
          <button
            className={`btn btnGhost ${filter === "ALL" ? "activeBtn" : ""}`}
            onClick={() => setFilter("ALL")}
            type="button"
          >
            Toutes
          </button>
          <button
            className={`btn btnGhost ${filter === "INDIVIDUAL" ? "activeBtn" : ""}`}
            onClick={() => setFilter("INDIVIDUAL")}
            type="button"
          >
            Individuelles
          </button>
          <button
            className={`btn btnGhost ${filter === "QUESTIONNAIRE" ? "activeBtn" : ""}`}
            onClick={() => setFilter("QUESTIONNAIRE")}
            type="button"
          >
            Questionnaires
          </button>
          <button
            className={`btn btnGhost ${filter === "CAPTCHA" ? "activeBtn" : ""}`}
            onClick={() => setFilter("CAPTCHA")}
            type="button"
          >
            Capcha
          </button>
          <button
            className={`btn btnGhost ${filter === "PRIORITY" ? "activeBtn" : ""}`}
            onClick={() => setFilter("PRIORITY")}
            type="button"
          >
            Prioritaire
          </button>
        </div>
      </div>

      <div className="cardList" style={{ marginTop: 14 }}>
        {questions.map((q) => {
          const qn = q.questionnaire ? getQuestionnaireById(db, q.questionnaire) : null;
          const tagName = q.tagId ? (tagById.get(q.tagId)?.name || null) : null;
          const qnActive = qn ? isQuestionnaireActive(qn) : false;
          const qnUnreleased = Boolean(qn && (qn.unrelease || qn.unreleased || String(qn.status || "").toLowerCase() === "unrelease"));
          const toggleDisabled = Boolean(q.questionnaire && qn && (qnActive || qnUnreleased));
          const deleteDisabled = Boolean(q.questionnaire);

          return (
            <div key={q.id} className="adminCard glass">
              <div className="adminCardTop">
                <div className="adminCardTitle">{q.title}</div>
                <div className="adminCardTopRight">
                  <div className="adminRightPills">
                    <span className="pill">{getTypeLabel(q)}</span>
                      {tagName ? <span className="pill tagPill">{tagName}</span> : null}
                    {q.questionnaire && qn ? (
                      <span className="pill qnPill">Questionnaire: {qn.name}</span>
                    ) : (
                      <span className="pill">Individuelle</span>
                    )}
                    {isPriorityActive(q) && q.priorityUntil ? (
                      <span className="pill priorityPill">Prioritaire jusqu'au : {formatPriorityUntil(q.priorityUntil)}</span>
                    ) : null}
                  </div>
                  {/* Preview de l'image */}
                  {q.imageUrl && (
                    <div className="questionImagePreview">
                      <img src={q.imageUrl} alt="Preview" />
                    </div>
                  )}
                </div>
              </div>

              {/* Preview des choix QCM */}
              {["QCM","DROPDOWN","CHECKBOX"].includes(String(q.type||"").toUpperCase()) && q.choices && q.choices.length > 0 && (
                <div className="questionChoicesPreview">
                  <div className="questionChoicesTitle">Choix de réponse :</div>
                  <div className="questionChoicesList" data-count={q.choices.length}>
                    {q.choices.map((choice, idx) => (
                      <div key={choice.id || idx} className="questionChoice">
                        <span className="questionChoiceBullet">•</span>
                        <span className="questionChoiceText" title={choice.text || `Choix ${idx + 1}`}>
                          {choice.text || `Choix ${idx + 1}`}
                        </span>
                        {choice.isCorrect && <span className="questionChoiceCorrect">✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="adminCardBottom">
                <div className="adminIconRow">
                  <IconButton title="Modifier" onClick={() => openEdit(q.id)}><Pencil size={18} /></IconButton>
                  <IconButton title="Visualiser / tester" onClick={() => setPreviewId(q.id)}><Eye size={18} /></IconButton>
                  <IconButton title="Voir les réponses" onClick={() => setAnswersQuestionId(q.id)}><UserRound size={18} /></IconButton>
                  <IconButton title="Supprimer" onClick={() => deleteQuestion(q)} disabled={deleteDisabled}><Trash2 size={18} /></IconButton>
                </div>
                <div className="adminToggleWrap">
                  <Toggle
                    label={qnUnreleased ? "Inactif (non publié)" : (q.active ? "Actif" : "Inactif")}
                    checked={qnUnreleased ? false : !!q.active}
                    onChange={(v) => toggleActive(q, v)}
                    disabled={toggleDisabled}
                  />
                  {qnUnreleased ? (
                    <div className="muted autoHint">lié à un questionnaire non publié</div>
                  ) : toggleDisabled ? (
                    <div className="muted autoHint">lié à un questionnaire actif</div>
                  ) : null}
                </div>
              </div>
</div>
          );
        })}
        {questions.length === 0 ? (
          <div className="muted" style={{ padding: 14 }}>
            Aucune question.
          </div>
        ) : null}
      </div>

      {editorOpen && (
        <QuestionEditorModal
          db={db}
          question={editing}
          onClose={() => setEditorOpen(false)}
          onSave={save}
        />
      )}

      {previewId && previewQ && (
        <Modal title="Aperçu" onClose={() => setPreviewId(null)} wide>
          <QuestionCard question={previewQ} mode="RANDOM" onSubmitAnswer={() => {}} onRefreshRandom={() => {}} />
        </Modal>
      )}

      {answersQuestionId && (
        <ResponsesModal
          title="Réponses — Question"
          answers={(db.answers || []).filter((a) => a.questionId === answersQuestionId)}
          onClose={() => setAnswersQuestionId(null)}
          db={db}
        />
      )}
    </div>
  );
}

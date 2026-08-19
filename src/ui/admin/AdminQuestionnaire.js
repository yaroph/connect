import React, { useMemo, useRef, useState } from "react";
import { Eye, Pencil, UserRound, Trash2, Plus, AlertTriangle, Send, Check, Tag, HelpCircle, FileText, Save } from "lucide-react";
import Modal from "../Modal";
import Toggle from "../Toggle";
import IconButton from "../IconButton";
import { newId } from "../../data/storage";
import { getAnswersForQuestionnaire } from "../../data/selectors";
import QuestionEditorModal from "./QuestionEditorModal";
import ResponsesModal from "./ResponsesModal";
import QuestionCard from "../QuestionCard";
import { confirmAction, notifySuccess } from "../notify";
import "./adminShared.css";

function getTypeLabel(q) {
  const t = String(q?.type || "FREE_TEXT").toUpperCase();
  if (t === "QCM") return "QCM";
  if (t === "DROPDOWN") return "Déroulant";
  if (t === "CHECKBOX") {
    const mode = String(q?.checkboxMode || "").toUpperCase();
    return mode === "SINGLE" ? "Checkbox (unique)" : "Checkbox (multiple)";
  }
  if (t === "SLIDER") {
    const a = q?.sliderMin;
    const b = q?.sliderMax;
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b)))
      return `Slider ${Math.min(Number(a), Number(b))}-${Math.max(Number(a), Number(b))}`;
    return "Slider";
  }
  if (t === "PHOTO") return "Photo";
  return "Texte libre";
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminQuestionnaire({ db, onDBChange }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [responsesQnId, setResponsesQnId] = useState(null);
  const [previewQnId, setPreviewQnId] = useState(null);
  const [createQuestionOpen, setCreateQuestionOpen] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const onSaveTag = (name) => {
    if (!name || !name.trim()) return;
    onDBChange((draft) => {
      draft.tags = draft.tags || [];
      const exists = draft.tags.some(
        (t) => t.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (!exists) {
        draft.tags.unshift({
          id: newId(),
          name: name.trim(),
          createdAt: new Date().toISOString(),
        });
      }
      return draft;
    });
    setCreateTagOpen(false);
    setNewTagName("");
    notifySuccess(`Tag "${name.trim()}" créé avec succès`);
  };

  const questionnaires = useMemo(() => {
    return [...(db.questionnaires || [])].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    );
  }, [db]);

  const editing = useMemo(
    () => (db.questionnaires || []).find((q) => q.id === editingId) || null,
    [db, editingId],
  );

  const openCreate = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (id) => {
    setEditingId(id);
    setEditorOpen(true);
  };

  const upsertQuestionnaireAndQuestions = ({
    questionnaire,
    questions,
    removedQuestionIds,
    createdTags,
  }) => {
    onDBChange((draft) => {
      const now = new Date().toISOString();
      draft.questionnaires = draft.questionnaires || [];
      draft.questions = draft.questions || [];
      draft.tags = draft.tags || [];

      // add created tags if any
      (createdTags || []).forEach((t) => {
        if (!t) return;
        const exists = draft.tags.some(
          (x) => x.id === t.id || x.name.toLowerCase() === t.name.toLowerCase(),
        );
        if (!exists) draft.tags.unshift(t);
      });

      const qnIdx = draft.questionnaires.findIndex(
        (x) => x.id === questionnaire.id,
      );
      if (qnIdx >= 0) {
        draft.questionnaires[qnIdx] = {
          ...draft.questionnaires[qnIdx],
          ...questionnaire,
          updatedAt: now,
        };
      } else {
        // Nouveau questionnaire : statut "unrelease" par défaut
        draft.questionnaires.unshift({
          ...questionnaire,
          createdAt: now,
          updatedAt: now,
          unrelease: true, // Statut unrelease par défaut
          // Persisted order key on disk is `questionorder`.
          questionOrder:
            questionnaire.questionOrder || questionnaire.questionorder || [],
          questionorder:
            questionnaire.questionorder || questionnaire.questionOrder || [],
        });
      }

      const qnId = questionnaire.id;
      const ensureQn = draft.questionnaires.find((x) => x.id === qnId);
      ensureQn.questionOrder = ensureQn.questionOrder || [];
      ensureQn.questionorder =
        ensureQn.questionorder || ensureQn.questionOrder || [];

      // Upsert questions - preserve existing questions, don't recreate them
      (questions || []).forEach((q) => {
        const idx = draft.questions.findIndex((x) => x.id === q.id);
        const finalQ = {
          ...q,
          questionnaire: qnId,
          updatedAt: now,
          createdAt: q.createdAt || now,
        };
        if (idx >= 0) {
          draft.questions[idx] = { ...draft.questions[idx], ...finalQ };
        } else {
          draft.questions.push(finalQ);
        }
      });

      // Update question order to match the order of questions array
      const nextOrder = (questions || []).map((q) => q.id);
      ensureQn.questionOrder = nextOrder;
      ensureQn.questionorder = nextOrder;

      // unlink removed questions
      (removedQuestionIds || []).forEach((qid) => {
        const idx = draft.questions.findIndex((x) => x.id === qid);
        if (idx >= 0) {
          const belongs =
            draft.questions[idx].questionnaire === questionnaire.id;
          if (belongs) {
            draft.questions.splice(idx, 1);
          } else {
            draft.questions[idx].questionnaire = null;
            draft.questions[idx].forcedInactiveByQuestionnaire = false;
          }
        }
        ensureQn.questionOrder = (ensureQn.questionOrder || []).filter(
          (x) => x !== qid,
        );
        ensureQn.questionorder = (ensureQn.questionorder || []).filter(
          (x) => x !== qid,
        );
      });

      return draft;
    });

    setEditorOpen(false);
  };

  const deleteQuestionnaire = (id) => {
    const qnName =
      (db.questionnaires || []).find((q) => q.id === id)?.name || "(sans nom)";
    confirmAction(
      `Êtes-vous sûr de vouloir supprimer le questionnaire ?\n\n${String(qnName)}`,
      () => {
        onDBChange((draft) => {
          draft.questionnaires = (draft.questionnaires || []).filter(
            (q) => q.id !== id,
          );
          // unlink questions
          draft.questions = (draft.questions || []).map((q) =>
            q.questionnaire === id
              ? {
                  ...q,
                  questionnaire: null,
                  forcedInactiveByQuestionnaire: false,
                }
              : q,
          );
          return draft;
        });
        notifySuccess("Questionnaire supprimé");
      },
    );
  };

  return (
    <div className="adminOneCol">
      <div className="adminCol">
        <div className="adminHeaderRow">
          <div>
            <div className="adminTitle">Questionnaires</div>
            <div className="adminSub">
              Créer, éditer, et consulter les questionnaires, questions et tags.
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btn btnGhost"
              style={{ padding: "8px 14px", fontSize: 13, gap: 6 }}
              onClick={() => {
                setNewTagName("");
                setCreateTagOpen(true);
              }}
              type="button"
            >
              <Plus size={14} />
              <Tag size={13} />
              <span>Créer un tag</span>
            </button>

            <button
              className="btn btnGhost"
              style={{ padding: "8px 14px", fontSize: 13, gap: 6 }}
              onClick={() => setCreateQuestionOpen(true)}
              type="button"
            >
              <Plus size={14} />
              <HelpCircle size={13} />
              <span>Créer une question</span>
            </button>

            <button
              className="btn btnPrimary"
              style={{ padding: "8px 16px", fontSize: 13, gap: 6 }}
              onClick={openCreate}
              type="button"
            >
              <Plus size={14} />
              <FileText size={13} />
              <span>Créer un questionnaire</span>
            </button>
          </div>
        </div>

        <div className="cardList">
          {questionnaires.map((qn) => (
            <div key={qn.id} className="adminCard glass">
              <div className="adminCardTop">
                <div className="adminCardTitle">{qn.name}</div>
                <div className="adminRightPills">
                  {qn.isPrivate ? <span className="pill">Privé</span> : null}
                  {qn.unrelease ||
                  qn.unreleased ||
                  String(qn.status || "").toLowerCase() === "unrelease" ? (
                    <span className="pill statusUnreleased">NON PUBLIÉ</span>
                  ) : qn.visible ? (
                    <span className="pill statusOn">ACTIF</span>
                  ) : (
                    <span className="pill statusOff">INACTIF</span>
                  )}
                  <span className="pill moneyPill">
                    $ {Number(qn.reward || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="adminCardMeta">
                Créé le {formatDate(qn.createdAt)}
              </div>

              <div className="adminCardBottom">
                <div className="adminIconRow">
                  <IconButton title="Modifier" onClick={() => openEdit(qn.id)}>
                    <Pencil size={18} />
                  </IconButton>
                  <IconButton
                    title="Visualiser / tester"
                    onClick={() => setPreviewQnId(qn.id)}
                  >
                    <Eye size={18} />
                  </IconButton>
                  <IconButton
                    title="Voir les réponses"
                    onClick={() => setResponsesQnId(qn.id)}
                  >
                    <UserRound size={18} />
                  </IconButton>
                  <IconButton
                    title="Supprimer"
                    onClick={() => deleteQuestionnaire(qn.id)}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </div>

                {/* Si unrelease : bouton "Sortir le questionnaire", sinon toggle normal */}
                {qn.unrelease ||
                qn.unreleased ||
                String(qn.status || "").toLowerCase() === "unrelease" ? (
                  <button
                    className="btn btnRelease"
                    onClick={() => {
                      onDBChange((draft) => {
                        const i = (draft.questionnaires || []).findIndex(
                          (x) => x.id === qn.id,
                        );
                        if (i >= 0) {
                          draft.questionnaires[i].unrelease = false;
                          // Ne modifie pas visible : si le questionnaire était actif/inactif, on conserve.
                        }
                        return draft;
                      });
                    }}
                    type="button"
                  >
                    Sortir le questionnaire
                  </button>
                ) : (
                  <div className="adminToggleWrap">
                    <Toggle
                      label=""
                      checked={!!qn.visible}
                      onChange={(v) =>
                        onDBChange((draft) => {
                          const i = (draft.questionnaires || []).findIndex(
                            (x) => x.id === qn.id,
                          );
                          if (i >= 0) draft.questionnaires[i].visible = v;
                          return draft;
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editorOpen && (
        <QuestionnaireEditorModal
          db={db}
          editing={editing}
          onClose={() => setEditorOpen(false)}
          onSave={upsertQuestionnaireAndQuestions}
        />
      )}

      {previewQnId && (
        <QuestionnairePreviewModal
          db={db}
          questionnaireId={previewQnId}
          onClose={() => setPreviewQnId(null)}
        />
      )}

      {responsesQnId &&
        (() => {
          const qn = db.questionnaires?.find((q) => q.id === responsesQnId);
          const questionIds = qn?.questionOrder || qn?.questionorder || [];
          return (
            <ResponsesModal
              title="Réponses — Questionnaire"
              answers={getAnswersForQuestionnaire(db, responsesQnId)}
              onClose={() => setResponsesQnId(null)}
              db={db}
              questions={questionIds}
            />
          );
        })()}

      {createQuestionOpen ? (
        <QuestionEditorModal
          question={null}
          db={db}
          onClose={() => setCreateQuestionOpen(false)}
          onSave={(newQ) => {
            onDBChange((draft) => {
              const now = new Date().toISOString();
              draft.questions = draft.questions || [];
              draft.questions.unshift({ ...newQ, createdAt: now, updatedAt: now });
              return draft;
            });
            setCreateQuestionOpen(false);
            notifySuccess("Question créée avec succès");
          }}
        />
      ) : null}

      {createTagOpen ? (
        <Modal title="Créer un nouveau tag" onClose={() => setCreateTagOpen(false)}>
          <div className="authModalHint">
            Les tags permettent de catégoriser les questions et de cibler les sondages.
          </div>
          <div className="authField" style={{ marginTop: 12 }}>
            <label className="authLabel">Nom du tag</label>
            <input
              className="authInput"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Ex: Véhicule, Emploi, Santé, Entreprise..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTagName.trim()) onSaveTag(newTagName);
              }}
            />
          </div>

          <div className="rowBtns" style={{ marginTop: 22 }}>
            <button className="btn btnGhost" type="button" onClick={() => setCreateTagOpen(false)}>
              Annuler
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={() => onSaveTag(newTagName)}
              disabled={!newTagName.trim()}
            >
              Créer le tag
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function QuestionnaireEditorModal({ db, editing, onClose, onSave }) {
  const safeDb = useMemo(
    () => db || { questions: [], tags: [], questionnaires: [] },
    [db],
  );
  // Create an ID immediately so we can create questions "at the same time" without saving first.
  const qnIdRef = useRef(editing?.id || newId("qn"));
  const qnId = qnIdRef.current;

  const [name, setName] = useState(editing?.name || "Nouveau questionnaire");
  const [reward, setReward] = useState(String(editing?.reward ?? 0));
  const [visible, setVisible] = useState(Boolean(editing?.visible ?? true));
  const [unreleased, setUnreleased] = useState(
    Boolean(
      editing?.unrelease ??
      editing?.unreleased ??
      String(editing?.status || "").toLowerCase() === "unrelease" ??
      !editing,
    ),
  ); // unrelease par défaut pour nouveaux questionnaires
  const [endDate, setEndDate] = useState(
    editing?.endDate ? editing.endDate.slice(0, 10) : "",
  );
  const [isPrivate, setIsPrivate] = useState(Boolean(editing?.isPrivate));
  const [code, setCode] = useState(editing?.code || "");

  const originalQuestionIds = useMemo(() => {
    if (!editing) return new Set();
    const ids = new Set(editing.questionorder || editing.questionOrder || []);
    // also include any question linked by field
    (safeDb.questions || []).forEach((q) => {
      if (q.questionnaire === editing.id) ids.add(q.id);
    });
    return ids;
  }, [safeDb, editing]);

  const [localQuestions, setLocalQuestions] = useState(() => {
    const order = editing?.questionorder || editing?.questionOrder || [];
    if (!editing || !order || order.length === 0) {
      // No existing order, get all questions linked to this questionnaire
      return (safeDb.questions || []).filter((q) => q.questionnaire === qnId);
    }

    // Use questionOrder to determine the order
    const questionsMap = new Map();
    (safeDb.questions || []).forEach((q) => {
      if (q.questionnaire === qnId) {
        questionsMap.set(q.id, q);
      }
    });

    return order.map((id) => questionsMap.get(id)).filter(Boolean);
  });

  const [createdTags, setCreatedTags] = useState([]);

  const tagById = useMemo(() => {
    const m = new Map();
    (safeDb.tags || []).forEach((t) => m.set(t.id, t));
    (createdTags || []).forEach((t) => {
      if (t?.id) m.set(t.id, t);
    });
    return m;
  }, [safeDb, createdTags]);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);

  const openAddQuestion = () => {
    setEditingQuestionId(null);
    setQuestionModalOpen(true);
  };

  const openEditQuestion = (id) => {
    setEditingQuestionId(id);
    setQuestionModalOpen(true);
  };

  const removeQuestion = (id) => {
    // No browser confirm/popups: remove immediately
    setLocalQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const saveQuestionLocal = (payload, createdTag) => {
    if (createdTag) setCreatedTags((prev) => [...prev, createdTag]);

    setLocalQuestions((prev) => {
      const now = new Date().toISOString();
      if (payload.id) {
        return prev.map((q) =>
          q.id === payload.id
            ? { ...q, ...payload, questionnaire: qnId, updatedAt: now }
            : q,
        );
      }
      const id = newId("q");
      // Add new question at the END of the array
      return [
        ...prev,
        {
          ...payload,
          id,
          questionnaire: qnId,
          active: false,
          forcedInactiveByQuestionnaire: true,
          createdAt: now,
          updatedAt: now,
        },
      ];
    });

    setQuestionModalOpen(false);
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setLocalQuestions((prev) => {
      const newList = [...prev];
      const [draggedItem] = newList.splice(draggedIndex, 1);
      newList.splice(index, 0, draggedItem);
      return newList;
    });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const submit = () => {
    const questionOrder = localQuestions.map((q) => q.id);
    const qn = {
      id: qnId,
      name: (name || "").trim() || "Sans nom",
      reward: Number(reward || 0),
      visible: Boolean(visible),
      unrelease: Boolean(unreleased),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      isPrivate: Boolean(isPrivate),
      code: isPrivate ? (code || "").trim() : "",
      // Source of truth on disk: `questionorder`.
      questionorder: questionOrder,
      // Backward compatible key for UI.
      questionOrder,
    };

    // removed ids = original - current
    const removed = [];
    originalQuestionIds.forEach((id) => {
      if (!qn.questionOrder.includes(id)) removed.push(id);
    });

    onSave({
      questionnaire: qn,
      questions: localQuestions,
      removedQuestionIds: removed,
      createdTags,
    });
  };

  const releaseQuestionnaire = () => {
    setUnreleased(false);
    // Sauvegarder immédiatement
    const questionOrder = localQuestions.map((q) => q.id);
    const qn = {
      id: qnId,
      name: (name || "").trim() || "Sans nom",
      reward: Number(reward || 0),
      // Ne force pas actif/inactif : on conserve l'état existant.
      visible: Boolean(visible),
      unrelease: false,
      endDate: endDate ? new Date(endDate).toISOString() : null,
      isPrivate: Boolean(isPrivate),
      code: isPrivate ? (code || "").trim() : "",
      questionorder: questionOrder,
      questionOrder,
    };

    const removed = [];
    originalQuestionIds.forEach((id) => {
      if (!qn.questionOrder.includes(id)) removed.push(id);
    });

    onSave({
      questionnaire: qn,
      questions: localQuestions,
      removedQuestionIds: removed,
      createdTags,
    });
    onClose();
  };

  const editingQuestion = useMemo(() => {
    if (!editingQuestionId) return null;
    return localQuestions.find((q) => q.id === editingQuestionId) || null;
  }, [localQuestions, editingQuestionId]);

  return (
    <Modal
      title={editing ? "Modifier un questionnaire" : "Créer un questionnaire"}
      onClose={onClose}
      wide
      noClickOutside
    >
      {/* Top Sticky Action Bar */}
      <div className="editorTopActionBar">
        <div className="editorTopTitle">
          {editing ? `Édition : ${name || "Questionnaire"}` : "Nouveau questionnaire"}
        </div>
        <div className="editorTopActions">
          <button className="btn btnGhost" onClick={onClose} type="button">
            Annuler
          </button>
          <button className="btn btnPrimary" onClick={submit} type="button">
            <Save size={15} /> Enregistrer
          </button>
        </div>
      </div>

      <div className="editorFormTwoCols">
        {/* Colonne de gauche - Paramètres */}
        <div className="editorLeftCol">
          <div className="field">
            <div className="label">Nom</div>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="label">Récompense / prix</div>
            <input
              className="input"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
            />
          </div>

          <div className="glass miniCard">
            {unreleased && editing ? (
              <div className="unreleasedWarning">
                <div className="unreleasedWarningTitle">
                  <AlertTriangle size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
                  Questionnaire non publié
                </div>
                <div className="unreleasedWarningText">
                  Ce questionnaire n'est pas visible sur le site. Les questions
                  sont inactives dans "Question individuel".
                </div>
                <button
                  className="btn btnRelease"
                  onClick={releaseQuestionnaire}
                  type="button"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <Send size={15} /> Sortir le questionnaire
                </button>
              </div>
            ) : (
              <Toggle
                checked={visible}
                onChange={setVisible}
                label="Questionnaire actif"
              />
            )}

            <div className="field">
              <div className="label">Date de fin (optionnelle)</div>
              <input
                className="input"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <hr className="sep" />

            <Toggle
              checked={isPrivate}
              onChange={setIsPrivate}
              label="Mode privé"
            />
            {isPrivate ? (
              <div className="field">
                <div className="label">Code</div>
                <input
                  className="input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: LSPD"
                />
              </div>
            ) : null}
          </div>

          <div className="rowBtns" style={{ marginTop: "auto" }}>
            <button className="btn btnGhost" onClick={onClose} type="button">
              Annuler
            </button>
            <button className="btn btnPrimary" onClick={submit} type="button">
              Enregistrer
            </button>
          </div>
        </div>

        {/* Colonne de droite - Questions */}
        <div className="editorRightCol">
          <div className="questionsBlock">
            <div className="questionsHeader">
              <div className="adminTitle">
                Questions ({localQuestions.length})
              </div>
              <button
                className="btn btnPrimary"
                onClick={openAddQuestion}
                type="button"
              >
                <Plus size={16} style={{ marginRight: 6 }} />
                Ajouter
              </button>
            </div>

            <div className="qInlineList qInlineListScrollable">
              {localQuestions.map((q, index) => (
                <div
                  key={q.id}
                  className="qInline glass"
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{ cursor: "move" }}
                >
                  {/* Header avec titre, pills et image */}
                  <div className="qInlineHeader">
                    <div className="qInlineTitle">
                      {q.title || "Sans titre"}
                    </div>
                    <div className="qInlineHeaderRight">
                      <div className="qInlineMeta">
                        <span className="pill">{getTypeLabel(q)}</span>
                        <span className="pill">
                          {q.tagId && tagById.get(q.tagId)?.name
                            ? tagById.get(q.tagId).name
                            : "Sans tag"}
                        </span>
                      </div>
                      {/* Preview de l'image */}
                      {q.imageUrl && (
                        <div className="qInlineImagePreview">
                          <img src={q.imageUrl} alt="Preview" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview des choix QCM */}
                  {["QCM", "DROPDOWN", "CHECKBOX"].includes(
                    String(q.type || "").toUpperCase(),
                  ) &&
                    q.choices &&
                    q.choices.length > 0 && (
                      <div className="qInlineChoicesPreview">
                        <div className="qInlineChoicesTitle">Choix :</div>
                        <div
                          className="qInlineChoicesList"
                          data-count={q.choices.length}
                        >
                          {q.choices.map((choice, idx) => (
                            <div
                              key={choice.id || idx}
                              className="qInlineChoice"
                            >
                              <span className="qInlineChoiceBullet">•</span>
                              <span
                                className="qInlineChoiceText"
                                title={choice.text || `Choix ${idx + 1}`}
                              >
                                {choice.text || `Choix ${idx + 1}`}
                              </span>
                              {choice.isCorrect && (
                                <span className="qInlineChoiceCorrect">✓</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  <div className="qInlineActions">
                    <button
                      className="btn btnGhost"
                      onClick={() => openEditQuestion(q.id)}
                      type="button"
                    >
                      Modifier
                    </button>
                    <button
                      className="btn btnGhost danger"
                      onClick={() => removeQuestion(q.id)}
                      type="button"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
              {localQuestions.length === 0 ? (
                <div className="muted">Aucune question.</div>
              ) : null}
            </div>
          </div>
        </div>

        {questionModalOpen && (
          <QuestionEditorModal
            db={safeDb}
            question={editingQuestion}
            forcedQuestionnaireId={qnId}
            onClose={() => setQuestionModalOpen(false)}
            onSave={saveQuestionLocal}
          />
        )}
      </div>
    </Modal>
  );
}

function QuestionnairePreviewModal({ db, questionnaireId, onClose }) {
  const qn =
    ((db && db.questionnaires) || []).find((x) => x.id === questionnaireId) ||
    null;

  // Use questionOrder to determine order
  const questions = useMemo(() => {
    if (!db) return [];
    if (!qn || !qn.questionOrder || qn.questionOrder.length === 0) {
      // fallback: questions with questionnaire === id
      return (db.questions || []).filter(
        (q) => q.questionnaire === questionnaireId,
      );
    }

    // Use questionOrder
    const questionsMap = new Map();
    (db.questions || []).forEach((q) => {
      if (q.questionnaire === questionnaireId) {
        questionsMap.set(q.id, q);
      }
    });

    return qn.questionOrder.map((id) => questionsMap.get(id)).filter(Boolean);
  }, [db, questionnaireId, qn]);

  const [idx, setIdx] = React.useState(0);
  const [done, setDone] = React.useState(false);

  const current = questions[idx] || null;

  const onSubmit = () => {
    const last = idx >= questions.length - 1;
    if (last) {
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setIdx(0);
        onClose?.();
      }, 900);
      return;
    }
    setIdx((v) => v + 1);
  };

  return (
    <Modal
      title={qn ? `Tester — ${qn.name}` : "Tester — Questionnaire"}
      onClose={onClose}
      wide
    >
      {questions.length === 0 ? (
        <div className="muted">
          Ce questionnaire ne contient aucune question.
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div className="pill">
              {idx + 1}/{questions.length}
            </div>
            {qn?.isPrivate ? <div className="pill">Privé</div> : null}
          </div>
          <div className="glass" style={{ borderRadius: 22, padding: 12 }}>
            {/* Reuse the same UI as Main */}
            <div className="qnHeader" style={{ padding: "2px 8px 10px" }}>
              <div className="qnTitle">{qn?.name}</div>
              <div className="qnProgress pill">
                {idx + 1}/{questions.length}
              </div>
            </div>
            <div style={{ position: "relative" }}>
              {/* QuestionCard validates answer and then calls onSubmitAnswer */}
              <QuestionCard
                question={current}
                mode="QUESTIONNAIRE"
                onRefreshRandom={() => {}}
                onSubmitAnswer={onSubmit}
              />
              {done ? (
                <div className="qnDoneOverlay">
                  <div className="qnDoneInner">
                    <div className="qnDoneCheck"><Check size={28} /></div>
                    <div className="qnDoneText">Questionnaire terminé</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

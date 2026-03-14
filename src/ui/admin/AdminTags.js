import React, { useMemo, useState } from "react";
import { Eye, Pencil, Trash2, Search } from "lucide-react";
import Modal from "../Modal";
import IconButton from "../IconButton";
import ResponsesModal from "./ResponsesModal";
import { newId, adminListUsers } from "../../data/storage";
import { getAnswersForTag } from "../../data/selectors";
import { isUserVariableTag, getUserFieldForTagName, USER_VARIABLE_TAGS } from "../../data/userVariableTags";
import "./adminShared.css";
import "./tagsTab.css";


export default function AdminTags({ db, onDBChange }) {
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null); // {id?, name}
  const [answersModal, setAnswersModal] = useState(null); // {title, answers}
  const [filterMode, setFilterMode] = useState("ALL"); // "ALL" | "CLASSIC" | "USER_VARIABLE"

  const tags = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    
    // Filtrer les tags classiques pour exclure les variable.user (qui ne devraient pas être dans db.tags)
    const classicTags = (db.tags || []).filter((t) => !isUserVariableTag(t));
    
    // Appliquer le filtre de mode
    let filtered = [];
    if (filterMode === "ALL") {
      filtered = [...classicTags, ...USER_VARIABLE_TAGS];
    } else if (filterMode === "CLASSIC") {
      filtered = classicTags;
    } else if (filterMode === "USER_VARIABLE") {
      filtered = USER_VARIABLE_TAGS;
    }
    
    // Trier et filtrer par recherche
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((t) => t.name.toLowerCase().includes(q));
  }, [db, search, filterMode]);

  const openCreate = () => setEditor({ id: null, name: "" });
  const openEdit = (t) => {
    if (isUserVariableTag(t)) return;
    setEditor({ id: t.id, name: t.name });
  };

  const save = () => {
    const name = (editor?.name || "").trim();
    if (!name) return;
    if (name.toLowerCase().startsWith("variable.user.")) return;

    onDBChange((draft) => {
      draft.tags = draft.tags || [];
      const existing = draft.tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== editor.id);
      if (existing) return draft;

      if (editor.id) {
        const idx = draft.tags.findIndex((t) => t.id === editor.id);
        if (idx >= 0) draft.tags[idx].name = name;
      } else {
        draft.tags.unshift({ id: newId("t"), name, createdAt: new Date().toISOString() });
      }
      return draft;
    });

    setEditor(null);
  };
  const remove = (id) => {
    const t = (db.tags || []).find((x) => x.id === id);
    if (isUserVariableTag(t)) return;
    // No browser confirm/popups: delete immediately
    onDBChange((draft) => {
      draft.tags = (draft.tags || []).filter((t) => t.id !== id);
      draft.questions = (draft.questions || []).map((q) => (q.tagId === id ? { ...q, tagId: null } : q));
      return draft;
    });
  };

  return (
    <div>
      <div className="adminHeaderRow">
        <div>
          <div className="adminTitle">Tags</div>
          <div className="adminSub">Organisation / filtrage & consultation des réponses par tag.</div>
        </div>
        <button className="btn btnPrimary" onClick={openCreate} type="button">Créer un tag</button>
      </div>

      <div className="tagTools glass">
        <div className="tagSearch">
          <Search size={16} style={{ opacity: 0.8 }} />
          <input
            className="tagSearchInput"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="tagFilterButtons">
          <button 
            className={`btn btnGhost ${filterMode === "ALL" ? "activeBtn" : ""}`}
            onClick={() => setFilterMode("ALL")}
            type="button"
          >
            Tous
          </button>
          <button 
            className={`btn btnGhost ${filterMode === "CLASSIC" ? "activeBtn" : ""}`}
            onClick={() => setFilterMode("CLASSIC")}
            type="button"
          >
            Tags classiques
          </button>
          <button 
            className={`btn btnGhost ${filterMode === "USER_VARIABLE" ? "activeBtn" : ""}`}
            onClick={() => setFilterMode("USER_VARIABLE")}
            type="button"
          >
            Variables utilisateur
          </button>
        </div>
      </div>

      <div className="cardList" style={{ marginTop: 14 }}>
        {tags.map((t) => {
          const locked = isUserVariableTag(t);
          return (
            <div key={t.id} className="adminCard glassCard">
              <div className="adminCardTop">
                <div className="adminCardTitle">
                  {t.name}
</div>
                <div className="adminIconRow">
                  {!locked ? (
                    <>
                      <IconButton title="Modifier" onClick={() => openEdit(t)}><Pencil size={18} /></IconButton>
                      <IconButton title="Supprimer" onClick={() => remove(t.id)}>
                        <Trash2 size={18} />
                      </IconButton>
                    </>
                  ) : null}
                  <IconButton
                    title="Voir toutes les réponses"
                    onClick={async () => {
                      // For variable.user tags, show the corresponding field value for all users.
                      if (locked) {
                        try {
                          const field = getUserFieldForTagName(t.name);
                          const r = await adminListUsers();
                          const users = (r && r.users) || [];
                          // Ne montrer que les utilisateurs qui ont une valeur pour ce champ
                          const answers = users
                            .filter((u) => {
                              const value = field ? (u[field] ?? "") : "";
                              return String(value).trim() !== "";
                            })
                            .map((u) => ({
                              id: `vu_${t.id}_${u.id}`,
                              userId: u.id,
                              userName: u.fullName || `${u.prenom || ""} ${u.nom || ""}`.trim(),
                              answer: field ? (u[field] ?? "") : "",
                              createdAt: u.updatedAt || u.createdAt || new Date().toISOString(),
                            }));
                          setAnswersModal({ title: `Réponses — ${t.name}`, answers });
                        } catch {
                          setAnswersModal({ title: `Réponses — ${t.name}`, answers: [] });
                        }
                        return;
                      }
                      
                      // Pour les tags classiques, obtenir les questions associées ET les réponses des profils utilisateurs
                      try {
                        const tagQuestions = (db.questions || []).filter(q => q.tagId === t.id);
                        const questionIds = tagQuestions.map(q => q.id);
                        
                        // Récupérer les réponses des questions (db.answers)
                        const questionAnswers = getAnswersForTag(db, t.id);
                        
                        // Récupérer AUSSI les réponses des profils utilisateurs (sensibleAnswersTagged)
                        const r = await adminListUsers();
                        const users = (r && r.users) || [];
                        
                        const tagName = t.name;
                        const userProfileAnswers = [];
                        
                        users.forEach(u => {
                          const tagged = u.sensibleAnswersTagged || [];
                          tagged.forEach(ans => {
                            if (String(ans.tag || "").trim() === tagName && ans.answer) {
                              userProfileAnswers.push({
                                id: `profile_${u.id}_${ans.tag}`,
                                userId: u.id,
                                userName: u.fullName || `${u.prenom || ""} ${u.nom || ""}`.trim(),
                                answer: ans.answer,
                                createdAt: u.updatedAt || u.createdAt || new Date().toISOString(),
                              });
                            }
                          });
                        });
                        
                        // Combiner les deux sources de réponses
                        const allAnswers = [...questionAnswers, ...userProfileAnswers];
                        
                        setAnswersModal({ 
                          title: "Réponses — Tag", 
                          answers: allAnswers,
                          questions: questionIds.length > 0 ? questionIds : null
                        });
                      } catch {
                        // En cas d'erreur, afficher au moins les réponses des questions
                        const tagQuestions = (db.questions || []).filter(q => q.tagId === t.id);
                        const questionIds = tagQuestions.map(q => q.id);
                        
                        setAnswersModal({ 
                          title: "Réponses — Tag", 
                          answers: getAnswersForTag(db, t.id),
                          questions: questionIds.length > 0 ? questionIds : null
                        });
                      }
                    }}
                  >
                    <Eye size={18} />
                  </IconButton>
                </div>
              </div>
              <div className="adminCardMeta">—</div>
            </div>
          );
        })}
      </div>

      {editor && (
        <Modal title={editor.id ? "Modifier un tag" : "Créer un tag"} onClose={() => setEditor(null)}>
          <div className="field">
            <div className="label">Nom du tag</div>
            <input className="input" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
          </div>
          <div className="rowBtns">
            <button className="btn btnGhost" onClick={() => setEditor(null)} type="button">Annuler</button>
            <button className="btn btnPrimary" onClick={save} type="button">Enregistrer</button>
          </div>
        </Modal>
      )}

      {answersModal && (
        <ResponsesModal
          title={answersModal.title}
          answers={answersModal.answers}
          onClose={() => setAnswersModal(null)}
          db={db}
          questions={answersModal.questions || null}
        />
      )}
    </div>
  );
}

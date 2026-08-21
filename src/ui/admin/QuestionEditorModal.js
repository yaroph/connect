import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import { Save, Tag as TagIcon, Plus, X, Check } from "lucide-react";
import { newId } from "../../data/storage";
import { USER_VARIABLE_TAGS } from "../../data/userVariableTags";
import "./questionEditor.css";

function norm(str) {
  return (str || "").trim();
}

function ImportanceToggle({ value, onChange }) {
  const isCaptcha = value === "CAPTCHA";
  return (
    <div className="impRow">
      <div className="impLabel">Gestion de l&apos;importance</div>
      <div className="impControl">
        <span className={`impSide ${!isCaptcha ? "active" : ""}`}>
          Sensible
        </span>
        <button
          type="button"
          className={`impSwitch ${isCaptcha ? "on" : "off"}`}
          onClick={() => onChange(isCaptcha ? "SENSIBLE" : "CAPTCHA")}
          aria-label="Basculer l'importance"
        >
          <span className="impKnob" />
        </button>
        <span className={`impSide ${isCaptcha ? "active" : ""}`}>Captcha</span>
      </div>
    </div>
  );
}

export default function QuestionEditorModal({
  db,
  question,
  onClose,
  onSave,
  forcedQuestionnaireId = null,
}) {
  const safeDb = useMemo(
    () => db || { tags: [], questions: [], questionnaires: [] },
    [db],
  );
  const isEdit = Boolean(question?.id);
  const isIndividual =
    forcedQuestionnaireId === null && !question?.questionnaire;

  const [title, setTitle] = useState(question?.title || "");
  const [type, setType] = useState(question?.type || "FREE_TEXT");

  // Options spécifiques selon le type
  const [checkboxMode, setCheckboxMode] = useState(() => {
    const raw = String(question?.checkboxMode || question?.checkboxmode || "")
      .trim()
      .toUpperCase();
    if (raw === "SINGLE" || raw === "UNIQUE") return "SINGLE";
    if (raw === "MULTI" || raw === "MULTIPLE") return "MULTI";
    if (
      question?.checkboxMultiple === false ||
      question?.allowMultiple === false
    )
      return "SINGLE";
    return "MULTI";
  });

  const [sliderMin, setSliderMin] = useState(() => {
    const v = Number(
      question?.sliderMin ?? question?.slidermin ?? question?.start ?? 0,
    );
    return Number.isFinite(v) ? v : 0;
  });
  const [sliderMax, setSliderMax] = useState(() => {
    const v = Number(
      question?.sliderMax ?? question?.slidermax ?? question?.end ?? 10,
    );
    return Number.isFinite(v) ? v : 10;
  });

  // Bonne réponse OPTIONNELLE (texte libre uniquement)
  const [correctAnswer, setCorrectAnswer] = useState(
    question?.correctAnswer || "",
  );
  // Texte libre: option pour n'accepter que des chiffres
  const [digitsOnly, setDigitsOnly] = useState(
    Boolean(
      question?.digitsOnly ??
      question?.freeTextDigitsOnly ??
      question?.onlyDigits,
    ),
  );

  // Importance (MVP: sauvegarde uniquement, aucune logique)
  const [importance, setImportance] = useState(
    question?.importance || "SENSIBLE",
  );

  // Prioritaire (questions individuelles uniquement)
  const [priority, setPriority] = useState(Boolean(question?.priority));
  const [priorityUntil, setPriorityUntil] = useState(() => {
    const raw = question?.priorityUntil;
    if (!raw) return "";
    const s = String(raw);
    return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
  });

  // Image
  const [imageMode, setImageMode] = useState(
    question?.imageUrl ? "URL" : "NONE",
  );
  const [imageUrl, setImageUrl] = useState(question?.imageUrl || "");

  // Tag management
  const [selectedTagId, setSelectedTagId] = useState(question?.tagId || "");
  const [customTags, setCustomTags] = useState([]);
  const [tagSearch, setTagSearch] = useState("");
  const [newTagName, setNewTagName] = useState("");

  const [choices, setChoices] = useState(() => {
    if (["QCM", "DROPDOWN", "CHECKBOX"].includes(question?.type)) {
      return (question.choices || []).map((c) => ({ ...c }));
    }
    return [
      { id: newId("c"), text: "Choix A", isCorrect: false },
      { id: newId("c"), text: "Choix B", isCorrect: false },
    ];
  });

  const typeHasChoices =
    type === "QCM" || type === "DROPDOWN" || type === "CHECKBOX";
  const choicesMin = type === "CHECKBOX" ? 1 : 2;
  const choicesMax = type === "CHECKBOX" ? 8 : 999;

  // Combine standard tags, user variable tags, and any tags created locally in this session
  const allTags = useMemo(() => {
    const list = [...(safeDb.tags || []), ...customTags];
    return [...list, ...USER_VARIABLE_TAGS];
  }, [safeDb, customTags]);

  const standardTags = useMemo(() => {
    return [...(safeDb.tags || []), ...customTags];
  }, [safeDb, customTags]);

  const activeTag = useMemo(() => {
    if (!selectedTagId) return null;
    return allTags.find((t) => t.id === selectedTagId) || null;
  }, [allTags, selectedTagId]);

  const filteredStandardTags = useMemo(() => {
    const q = norm(tagSearch).toLowerCase();
    if (!q) return standardTags;
    return standardTags.filter((t) => (t.name || "").toLowerCase().includes(q));
  }, [standardTags, tagSearch]);

  const filteredVariableTags = useMemo(() => {
    const q = norm(tagSearch).toLowerCase();
    if (!q) return USER_VARIABLE_TAGS;
    return USER_VARIABLE_TAGS.filter((t) => (t.name || "").toLowerCase().includes(q));
  }, [tagSearch]);

  const handleCreateAndSelectTag = (nameToCreate) => {
    const name = norm(nameToCreate);
    if (!name) return;

    // Check if already exists in allTags
    const existing = allTags.find((t) => (t.name || "").toLowerCase() === name.toLowerCase());
    if (existing) {
      setSelectedTagId(existing.id);
      setNewTagName("");
      return;
    }

    const newTag = {
      id: newId("t"),
      name,
      createdAt: new Date().toISOString(),
    };
    setCustomTags((prev) => [...prev, newTag]);
    setSelectedTagId(newTag.id);
    setNewTagName("");
  };

  const onUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(String(reader.result || ""));
      setImageMode("UPLOAD");
    };
    reader.readAsDataURL(file);
  };

  const addChoice = () =>
    setChoices((prev) => {
      if (prev.length >= choicesMax) return prev;
      return [
        ...prev,
        { id: newId("c"), text: `Choix ${prev.length + 1}`, isCorrect: false },
      ];
    });

  const updateChoice = (id, patch) =>
    setChoices((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  const removeChoice = (id) =>
    setChoices((prev) =>
      prev.length <= choicesMin ? prev : prev.filter((c) => c.id !== id),
    );

  const [err, setErr] = useState("");

  const validate = () => {
    if (!norm(title)) return "Titre requis.";

    if (type === "QCM" || type === "DROPDOWN") {
      const nonEmpty = choices.filter((c) => norm(c.text));
      if (nonEmpty.length < 2) return "Min. 2 choix requis.";
    }

    if (type === "CHECKBOX") {
      const nonEmpty = choices.filter((c) => norm(c.text));
      if (nonEmpty.length < 1) return "Min. 1 choix requis (checkbox).";
      if (nonEmpty.length > 8) return "Max. 8 choix autorisés (checkbox).";
    }

    if (type === "SLIDER") {
      const a = Number(sliderMin);
      const b = Number(sliderMax);
      if (!Number.isFinite(a) || !Number.isFinite(b))
        return "Le slider doit avoir un début et une fin valides.";
      if (a === b)
        return "Le slider doit avoir une plage (début différent de fin).";
    }

    if (isIndividual && priority) {
      if (!String(priorityUntil || "").trim())
        return "Veuillez choisir une date de fin pour la priorité.";
    }

    return "";
  };

  const save = () => {
    const e = validate();
    if (e) {
      setErr(e);
      return;
    }
    setErr("");

    // Tag resolution
    let finalTagId = selectedTagId || null;
    let createdTag = null;

    if (norm(newTagName)) {
      const existing = allTags.find(
        (t) => (t.name || "").toLowerCase() === norm(newTagName).toLowerCase(),
      );
      if (existing) {
        finalTagId = existing.id;
      } else {
        createdTag = {
          id: newId("t"),
          name: norm(newTagName),
          createdAt: new Date().toISOString(),
        };
        finalTagId = createdTag.id;
      }
    }

    // Check if selected tag was in customTags
    if (!createdTag && selectedTagId) {
      const customMatch = customTags.find((t) => t.id === selectedTagId);
      if (customMatch) createdTag = customMatch;
    }

    const payload = {
      id: question?.id,
      title: norm(title),
      type,
      importance,
      priority: isIndividual ? Boolean(priority) : false,
      priorityUntil:
        isIndividual && priority
          ? String(priorityUntil || "").trim() || null
          : null,
      imageUrl: imageMode === "NONE" ? null : norm(imageUrl) || null,
      tagId: finalTagId,
      correctAnswer:
        type === "FREE_TEXT" && norm(correctAnswer)
          ? digitsOnly
            ? String(norm(correctAnswer)).replace(/\D+/g, "")
            : norm(correctAnswer)
          : null,
      digitsOnly: type === "FREE_TEXT" ? Boolean(digitsOnly) : false,
      checkboxMode: type === "CHECKBOX" ? checkboxMode : null,
      sliderMin:
        type === "SLIDER"
          ? Math.min(Number(sliderMin), Number(sliderMax))
          : null,
      sliderMax:
        type === "SLIDER"
          ? Math.max(Number(sliderMin), Number(sliderMax))
          : null,
      choices: typeHasChoices
        ? choices.map((c) => ({ ...c, text: norm(c.text) }))
        : [],
    };

    if (forcedQuestionnaireId !== null)
      payload.questionnaire = forcedQuestionnaireId;

    onSave?.(payload, createdTag);
  };

  return (
    <Modal
      title={isEdit ? "Modifier une question" : "Créer une question"}
      onClose={onClose}
      wide
    >
      {/* Top Sticky Action Bar */}
      <div className="editorTopActionBar">
        <div className="editorTopTitle">
          {isEdit ? `Édition : ${title || "Question"}` : "Nouvelle question"}
        </div>
        <div className="editorTopActions">
          <button className="btn btnGhost" onClick={onClose} type="button">
            Annuler
          </button>
          <button className="btn btnPrimary" onClick={save} type="button">
            <Save size={15} /> Enregistrer
          </button>
        </div>
      </div>

      <div className="qeGrid">
        <div className="qeLeft">
          <div className="field">
            <div className="label">Titre de la question</div>
            <textarea
              className="input qeTitleTextarea"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Entrez votre question..."
              rows={3}
            />
          </div>

          <div className="field">
            <div className="label">Type de réponse</div>
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="FREE_TEXT">Texte libre</option>
              <option value="QCM">QCM (Choix unique)</option>
              <option value="CHECKBOX">Cases à cocher (Checkbox)</option>
              <option value="DROPDOWN">Menu déroulant</option>
              <option value="SLIDER">Curseur numérique (Slider)</option>
              <option value="PHOTO">Photo (Upload / URL)</option>
            </select>
          </div>

          {type === "CHECKBOX" ? (
            <div className="field">
              <div className="label">Mode de sélection</div>
              <select
                className="select"
                value={checkboxMode}
                onChange={(e) => setCheckboxMode(e.target.value)}
              >
                <option value="MULTI">Choix multiple (plusieurs cases cochables)</option>
                <option value="SINGLE">Choix unique (1 seule case cochable max)</option>
              </select>
            </div>
          ) : null}

          {type === "SLIDER" ? (
            <div className="field">
              <div className="label">Plage de valeurs (Début - Fin)</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <input
                  className="input"
                  type="number"
                  value={sliderMin}
                  onChange={(e) => setSliderMin(e.target.value)}
                  placeholder="Début"
                />
                <input
                  className="input"
                  type="number"
                  value={sliderMax}
                  onChange={(e) => setSliderMax(e.target.value)}
                  placeholder="Fin"
                />
              </div>
            </div>
          ) : null}

          {type === "FREE_TEXT" ? (
            <div className="field">
              <div className="label">Bonne réponse (optionnelle)</div>
              <input
                className="input"
                value={correctAnswer}
                onChange={(e) => {
                  const v = e.target.value;
                  setCorrectAnswer(
                    digitsOnly ? String(v).replace(/\D+/g, "") : v,
                  );
                }}
                placeholder="Ex: sport"
              />

              <label
                className="muted"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  marginTop: 10,
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={digitsOnly}
                  onChange={(e) => {
                    const next = Boolean(e.target.checked);
                    setDigitsOnly(next);
                    if (next)
                      setCorrectAnswer((prev) =>
                        String(prev || "").replace(/\D+/g, ""),
                      );
                  }}
                />
                Chiffre seulement
              </label>
            </div>
          ) : null}

          {typeHasChoices ? (
            <div className="qeChoices glass">
              <div className="qeChoicesHeader">
                <div className="adminTitle">Choix ({choices.length})</div>
                <div className="pill">Min. {choicesMin}</div>
                {type === "CHECKBOX" ? (
                  <div className="pill">Max. 8</div>
                ) : null}
              </div>

              <div className="choiceList">
                {choices.map((c, idx) => (
                  <div key={c.id} className="choiceRow">
                    <input
                      className="input choiceInput"
                      value={c.text}
                      onChange={(e) =>
                        updateChoice(c.id, { text: e.target.value })
                      }
                      placeholder={`Choix ${idx + 1}`}
                    />
                    <button
                      className={`circlePick ${c.isCorrect ? "on" : ""}`}
                      title="Marquer comme bonne réponse (optionnel)"
                      onClick={() =>
                        updateChoice(c.id, { isCorrect: !c.isCorrect })
                      }
                      type="button"
                    />
                    <button
                      className="btn btnGhost small"
                      onClick={() => removeChoice(c.id)}
                      type="button"
                      disabled={choices.length <= choicesMin}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                className="btn btnPrimary"
                onClick={addChoice}
                type="button"
                style={{ marginTop: 10 }}
                disabled={choices.length >= choicesMax}
              >
                + Ajouter un choix
              </button>
            </div>
          ) : null}

          {isIndividual ? (
            <div className="field" style={{ marginTop: 10 }}>
              <div className="label">Prioritaire</div>
              <label
                className="muted"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!priority}
                  onChange={(e) => {
                    const next = Boolean(e.target.checked);
                    setPriority(next);
                    if (!next) setPriorityUntil("");
                  }}
                />
                Marquer cette question comme prioritaire
              </label>

              {priority ? (
                <div className="field" style={{ marginTop: 10 }}>
                  <div className="label">Date de fin</div>
                  <input
                    className="input"
                    type="date"
                    value={priorityUntil}
                    onChange={(e) => setPriorityUntil(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="qeRight">
          <div className="qeCard glass">
            <div className="adminTitle">Image (optionnelle)</div>

            <div className="imageModes">
              <button
                className={`btn btnGhost ${imageMode === "NONE" ? "activeBtn" : ""}`}
                onClick={() => {
                  setImageMode("NONE");
                  setImageUrl("");
                }}
                type="button"
              >
                Aucune
              </button>
              <button
                className={`btn btnGhost ${imageMode === "URL" ? "activeBtn" : ""}`}
                onClick={() => setImageMode("URL")}
                type="button"
              >
                Lien URL
              </button>
              <button
                className={`btn btnGhost ${imageMode === "UPLOAD" ? "activeBtn" : ""}`}
                onClick={() => setImageMode("UPLOAD")}
                type="button"
              >
                Upload
              </button>
            </div>

            {imageMode === "URL" ? (
              <div className="field">
                <div className="label">URL de l'image</div>
                <input
                  className="input"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            ) : null}

            {imageMode === "UPLOAD" ? (
              <div className="field">
                <div className="label">Fichier image</div>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onUpload(e.target.files?.[0] || null)}
                />
              </div>
            ) : null}

            {imageUrl ? (
              <div className="previewBox">
                <img src={imageUrl} alt="" />
              </div>
            ) : null}

            <hr className="sep" />

            <ImportanceToggle value={importance} onChange={setImportance} />

            <hr className="sep" />

            {/* TAG ASSOCIATION SECTION - ULTRA RELIABLE */}
            <div className="tagSectionWrap">
              <div className="tagSectionHeader">
                <div className="label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <TagIcon size={14} color="#00f0ff" />
                  <span>Associer un tag à la question</span>
                </div>
                {activeTag ? (
                  <button
                    type="button"
                    className="tagRemoveBtn"
                    onClick={() => setSelectedTagId("")}
                    title="Retirer le tag"
                  >
                    <X size={12} /> Retirer
                  </button>
                ) : null}
              </div>

              {/* Active Tag Display Badge */}
              <div className="activeTagDisplayRow">
                <span className="muted" style={{ fontSize: 12 }}>Tag actif :</span>
                {activeTag ? (
                  <span className="activeTagChip">
                    <Check size={12} color="#34d399" />
                    <b>{activeTag.name}</b>
                  </span>
                ) : (
                  <span className="noTagChip">Aucun tag associé</span>
                )}
              </div>

              {/* Tag Quick Selector Dropdown */}
              <div className="field" style={{ marginTop: 8 }}>
                <div className="label" style={{ fontSize: 11.5 }}>Choisir parmi les tags existants</div>
                <input
                  className="input"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="🔍 Filtrer les tags..."
                  style={{ marginBottom: 6, fontSize: 12 }}
                />
                <select
                  className="select"
                  value={selectedTagId}
                  onChange={(e) => setSelectedTagId(e.target.value)}
                >
                  <option value="">-- Sans tag (Aucun tag) --</option>
                  {filteredStandardTags.length > 0 ? (
                    <optgroup label="Tags de sondages">
                      {filteredStandardTags.map((t) => (
                        <option key={t.id} value={t.id}>
                          🏷️ {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {filteredVariableTags.length > 0 ? (
                    <optgroup label="Variables Citoyen (Profil RP)">
                      {filteredVariableTags.map((t) => (
                        <option key={t.id} value={t.id}>
                          👤 {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </div>

              {/* Create new tag inline */}
              <div className="field" style={{ marginTop: 8 }}>
                <div className="label" style={{ fontSize: 11.5 }}>Ou créer un nouveau tag</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="input"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Ex: Véhicule, Emploi, Santé..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        e.preventDefault();
                        handleCreateAndSelectTag(newTagName);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btnGhost"
                    onClick={() => handleCreateAndSelectTag(newTagName)}
                    disabled={!newTagName.trim()}
                    style={{ whiteSpace: "nowrap", padding: "6px 12px", fontSize: 12, gap: 4 }}
                  >
                    <Plus size={14} /> Créer
                  </button>
                </div>
              </div>
            </div>

            {err ? <div className="errorText" style={{ marginTop: 12 }}>{err}</div> : null}

            <div className="rowBtns" style={{ marginTop: 18 }}>
              <button className="btn btnGhost" onClick={onClose} type="button">
                Annuler
              </button>
              <button className="btn btnPrimary" onClick={save} type="button">
                <Save size={15} /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

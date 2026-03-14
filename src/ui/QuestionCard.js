import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { isPriorityActive, formatPriorityUntil } from "../data/selectors";
import { resizeImage } from "../data/storage";
import "./questionCard.css";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function answerTextFromIds(ids, choiceTextById) {
  return (ids || [])
    .map((id) => choiceTextById.get(id) || id)
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(",");
}

function validateAgainstCorrect(selectedSet, correctSet) {
  if (correctSet.size === 0) return { ok: true, msg: "" };

  const selected = Array.from(selectedSet);

  // Single-correct
  if (correctSet.size === 1) {
    if (selected.length !== 1) return { ok: false, msg: "Veuillez choisir une réponse." };
    const ok = correctSet.has(selected[0]);
    return ok ? { ok: true, msg: "" } : { ok: false, msg: "Mauvaise sélection." };
  }

  // Multi-correct
  const hasWrong = selected.some((id) => !correctSet.has(id));
  if (hasWrong) return { ok: false, msg: "Mauvaise sélection." };

  if (selectedSet.size !== correctSet.size) return { ok: false, msg: "Sélection incomplète." };
  return { ok: true, msg: "" };
}


export default function QuestionCard({
  question,
  mode = "RANDOM",
  onSubmitAnswer,
  onRefreshRandom,
  interactionLocked = false,
}) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [dropdownId, setDropdownId] = useState("");
  const [sliderVal, setSliderVal] = useState(0);

  const [photoMode, setPhotoMode] = useState("URL"); // URL | UPLOAD
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoData, setPhotoData] = useState("");

  const [err, setErr] = useState("");
  const submittedRef = useRef(false);
  const [locked, setLocked] = useState(false);

  const isDisabled = Boolean(interactionLocked || locked);

  const type = String(question?.type || "FREE_TEXT").trim().toUpperCase();
  const choices = useMemo(() => (Array.isArray(question?.choices) ? question.choices : []), [question?.choices]);
  const freeTextDigitsOnly = Boolean(question?.digitsOnly);

  useEffect(() => {
    submittedRef.current = false;
    setText("");
    setSelected(new Set());
    setDropdownId(choices?.[0]?.id || "");

    const a = Number(question?.sliderMin ?? 0);
    const b = Number(question?.sliderMax ?? 10);
    const min = Number.isFinite(a) && Number.isFinite(b) ? Math.min(a, b) : 0;
    setSliderVal(min);

    setPhotoMode("URL");
    setPhotoUrl("");
    setPhotoData("");

    setErr("");
    setLocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);

  const choiceTextById = useMemo(() => new Map(choices.map((c) => [c.id, c.text])), [choices]);

  const correctChoiceIds = useMemo(() => {
    if (!question) return new Set();
    if (!["QCM", "DROPDOWN", "CHECKBOX"].includes(type)) return new Set();
    return new Set((choices || []).filter((c) => c.isCorrect).map((c) => c.id));
  }, [question, choices, type]);

  const choiceCount = choices.length;
  const qcmColsClass = choiceCount > 6 ? "cols4" : "cols2";
  const checkboxColsClass = choiceCount > 4 ? "cols2" : "cols1";

  const submit = (answer) => {
    if (submittedRef.current) return;
    if (!question) return;
    setLocked(true);
    submittedRef.current = true;
    onSubmitAnswer?.({ questionId: question.id, answer, correct: true, mode });
  };

  const submitFreeText = () => {
    if (isDisabled) return;
    if (!question) return;
    const val = (text || "").trim();
    if (!val) {
      setErr("Veuillez entrer une réponse.");
      return;
    }
    setErr("");
    submit(val);
  };

  // --------------------
  // QCM (auto submit)
  // --------------------

  const tryAutoSubmitQCM = (nextSelected) => {
    if (submittedRef.current) return;
    if (!question) return;

    const answerText = (ids) => answerTextFromIds(ids, choiceTextById);

    // If no correct choices configured, accept first selection immediately.
    if (correctChoiceIds.size === 0) {
      setErr("");
      submit(answerText(Array.from(nextSelected)));
      return;
    }

    // Single-correct: validate immediately on click.
    if (correctChoiceIds.size === 1) {
      const picked = Array.from(nextSelected)[0];
      const ok = correctChoiceIds.has(picked);
      if (!ok) {
        setErr("Mauvaise sélection.");
        return;
      }
      setErr("");
      submit(answerText([picked]));
      return;
    }

    // Multi-correct: auto-validate once enough picks are selected.
    const arr = Array.from(nextSelected);
    const hasWrong = arr.some((id) => !correctChoiceIds.has(id));

    if (hasWrong) {
      setErr("Mauvaise sélection.");
      return;
    }

    if (nextSelected.size === correctChoiceIds.size) {
      setErr("");
      submit(answerText(arr));
      return;
    }

    // Still selecting
    setErr("");
  };

  const onChoiceClick = (id) => {
    if (isDisabled) return;
    setSelected((prev) => {
      const next = new Set(prev);

      // For single-correct (or no-correct), behave like radio: only one selected.
      if (correctChoiceIds.size <= 1) {
        next.clear();
        next.add(id);
      } else {
        // Multi-correct: toggle
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }

      // Auto-validate/submit
      tryAutoSubmitQCM(next);
      return next;
    });
  };

  // --------------------
  // Dropdown (validate button)
  // --------------------

  const submitDropdown = () => {
    if (isDisabled) return;
    if (!question) return;
    if (!dropdownId) {
      setErr("Veuillez choisir une option.");
      return;
    }

    const pick = new Set([dropdownId]);
    const v = validateAgainstCorrect(pick, correctChoiceIds);
    if (!v.ok) {
      setErr(v.msg || "Mauvaise sélection.");
      return;
    }

    setErr("");
    submit(answerTextFromIds([dropdownId], choiceTextById));
  };

  // --------------------
  // Checkbox (validate button)
  // --------------------

  const checkboxMode = String(question?.checkboxMode || "MULTI").toUpperCase() === "SINGLE" ? "SINGLE" : "MULTI";

  const toggleCheckbox = (id) => {
    if (isDisabled) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checkboxMode === "SINGLE") {
        next.clear();
        next.add(id);
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitCheckbox = () => {
    if (isDisabled) return;
    if (!question) return;
    if (selected.size < 1) {
      setErr("Veuillez choisir au moins une réponse.");
      return;
    }

    const v = validateAgainstCorrect(selected, correctChoiceIds);
    if (!v.ok) {
      setErr(v.msg || "Mauvaise sélection.");
      return;
    }

    setErr("");
    submit(answerTextFromIds(Array.from(selected), choiceTextById));
  };

  // --------------------
  // Slider (validate button)
  // --------------------

  const sliderMin = useMemo(() => {
    const a = Number(question?.sliderMin ?? 0);
    const b = Number(question?.sliderMax ?? 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.min(a, b);
  }, [question]);

  const sliderMax = useMemo(() => {
    const a = Number(question?.sliderMin ?? 0);
    const b = Number(question?.sliderMax ?? 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 10;
    return Math.max(a, b);
  }, [question]);

  const submitSlider = () => {
    if (isDisabled) return;
    if (!question) return;
    const n = Number(sliderVal);
    if (!Number.isFinite(n)) {
      setErr("Veuillez choisir une valeur.");
      return;
    }
    setErr("");
    submit(String(n));
  };

  // --------------------
  // Photo (validate button)
  // --------------------

  const onPickPhotoFile = async (file) => {
    if (!file) return;
    try {
      const data = await fileToDataUrl(file);
      // Redimensionner l'image à max 500px de hauteur
      const resizedData = await resizeImage(data, 500);
      setPhotoData(resizedData);
      setErr("");
    } catch (e) {
      console.error('Error processing image:', e);
      setErr("Impossible de lire ce fichier.");
    }
  };

  const submitPhoto = () => {
    if (isDisabled) return;
    if (!question) return;
    const val = photoMode === "URL" ? (photoUrl || "").trim() : (photoData || "").trim();
    if (!val) {
      setErr("Veuillez ajouter une photo (lien ou upload). ");
      return;
    }
    setErr("");
    submit(val);
  };

  const hasImage = Boolean(question?.imageUrl);
  const imgSrc = question?.imageUrl || null; 

  return (
    <div className="qcRoot">
      <div className="qcDevice glass">
        <div className={`qcScreen${hasImage ? " qcScreenHasImage" : ""}`}>
          {hasImage ? (
            <img className="qcImage" src={imgSrc} alt="" />
          ) : (
            <div className="qcPlaceholder">
              <img src="/bniconnect.png" alt="BNI Connect" />
              <div className="qcPlaceholderText">BNI CONNECT</div>
            </div>
          )}
        </div>
      </div>

      <div className="qcQuestionRow">
        <div className="qcQuestionText" style={{ whiteSpace: 'pre-wrap' }}>
          {question?.title || "Sans titre"}
        </div>
      </div>

      {isPriorityActive(question) && question?.priorityUntil ? (
        <div className="qcPillsRow">
          <span className="pill priorityPill">Prioritaire jusqu'au : {formatPriorityUntil(question.priorityUntil)}</span>
        </div>
      ) : null}

      <div className="qcAnswers">
        {type === "FREE_TEXT" ? (
          <div className="freeTextArea">
            <input
              className="input"
              placeholder="Votre réponse..."
              value={text}
              disabled={isDisabled}
              onChange={(e) => {
                const v = e.target.value;
                setText(freeTextDigitsOnly ? String(v).replace(/\D+/g, "") : v);
              }}
              inputMode={freeTextDigitsOnly ? "numeric" : undefined}
              pattern={freeTextDigitsOnly ? "[0-9]*" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitFreeText();
              }}
            />
            <button className="btn btnPrimary" onClick={submitFreeText} type="button" disabled={isDisabled}>
              Valider
            </button>
          </div>
        ) : type === "QCM" ? (
          <div className={`qcmGrid ${qcmColsClass}`}>
            {(choices || []).map((c) => (
              <button
                key={c.id}
                className={`qcmBtn ${selected.has(c.id) ? "selected" : ""}`}
                onClick={() => onChoiceClick(c.id)}
                type="button"
                disabled={isDisabled}
              >
                {c.text}
              </button>
            ))}
          </div>
        ) : type === "DROPDOWN" ? (
          <div className="dropdownArea">
            <select className="select" value={dropdownId} onChange={(e) => setDropdownId(e.target.value)} disabled={isDisabled}>
              {(choices || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.text}
                </option>
              ))}
            </select>
            <button className="btn btnPrimary" type="button" onClick={submitDropdown} disabled={isDisabled}>
              Valider
            </button>
          </div>
        ) : type === "CHECKBOX" ? (
          <div className="checkboxArea">
            <div className={`checkboxGrid ${checkboxColsClass}`}>
              {(choices || []).slice(0, 8).map((c) => (
                <label key={c.id} className={`checkboxItem ${selected.has(c.id) ? "on" : ""}`}>
                  <input
                    className="checkboxNative"
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleCheckbox(c.id)}
                    disabled={isDisabled}
                  />
                  <span className="checkboxBox" aria-hidden="true">
                    {selected.has(c.id) ? <span className="dot" /> : null}
                  </span>
                  <span className="checkboxText">{c.text}</span>
                </label>
              ))}
            </div>
            <div className="checkboxFooter">
              <button className="btn btnPrimary" type="button" onClick={submitCheckbox} disabled={isDisabled}>
                Valider
              </button>
            </div>
          </div>
        ) : type === "SLIDER" ? (
          <div className="sliderArea">
            <div className="sliderTop">
              <div className="sliderValue pill">{sliderVal}</div>
              <div className="sliderRange muted">{sliderMin} → {sliderMax}</div>
            </div>
            <input
              className="range"
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={1}
              value={sliderVal}
              onChange={(e) => setSliderVal(Number(e.target.value))}
              disabled={isDisabled}
            />
            <button className="btn btnPrimary" type="button" onClick={submitSlider} disabled={isDisabled}>
              Valider
            </button>
          </div>
         ) : type === "PHOTO" ? (
          <div className="photoArea">
            {((photoMode === "URL" ? photoUrl : photoData) || "").trim() ? (
              <div className="photoPreview photoPreviewSmall">
                <button
                  className="photoClear"
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    setPhotoUrl("");
                    setPhotoData("");
                  }}
                  aria-label="Supprimer la photo"
                  title="Supprimer"
                >
                  <X size={18} />
                </button>
                <img src={photoMode === "URL" ? photoUrl : photoData} alt="" />
              </div>
            ) : (
              <>
                <div className="photoModes">
                  <button
                    className={`btn btnGhost ${photoMode === "URL" ? "activeBtn" : ""}`}
                    type="button"
                    onClick={() => setPhotoMode("URL")}
                    disabled={isDisabled}
                  >
                    Lien
                  </button>
                  <button
                    className={`btn btnGhost ${photoMode === "UPLOAD" ? "activeBtn" : ""}`}
                    type="button"
                    onClick={() => setPhotoMode("UPLOAD")}
                    disabled={isDisabled}
                  >
                    Upload
                  </button>
                </div>

                {photoMode === "URL" ? (
                  <input
                    className="input"
                    placeholder="https://..."
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    disabled={isDisabled}
                  />
                ) : (
                  <input
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPickPhotoFile(e.target.files?.[0] || null)}
                    disabled={isDisabled}
                  />
                )}
              </>
            )}

            <button className="btn btnPrimary" type="button" onClick={submitPhoto} disabled={isDisabled}>
              Valider
            </button>
          </div>
        ) : (
          <div className="muted">Type non supporté.</div>
        )}

        {err ? <div className="errorText">{err}</div> : null}
      </div>

    </div>
  );
}

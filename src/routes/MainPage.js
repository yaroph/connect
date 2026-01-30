import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/main.css";
import { loadDB, loadDBProgressive, newId, earnRandom, skipRandom, earnQuestionnaire, recordSensible, requestWithdraw, setAuthToken, clearSavedCredentials, appendAnswer, appendCompletion, adminUpdateUser, authMe, loadSettings, getAnsweredQuestionsInQuestionnaire, getUserQuestionnairesProgress, validateQuestionnaire, markQuestionnaireCompleted, syncQuestionnaireAnswers, resizeImage, clearDBCache } from "../data/storage";
import {
  getVisibleQuestionnairesForUser,
  getQuestionnaireById,
  getQuestionById,
} from "../data/selectors";
import LeftSidebar from "../ui/LeftSidebar";
import QuestionCard from "../ui/QuestionCard";
import Modal from "../ui/Modal";
import LogoHeader from "../ui/LogoHeader";
import { notifyError } from "../ui/notify";
import { getUserFieldForTagId } from "../data/userVariableTags";

// Fonction pour obtenir une ou plusieurs questions aléatoires depuis le serveur avec cooldown
async function fetchRandomQuestions(userId, n = 1) {
  try {
    const count = Number.isFinite(Number(n)) ? Math.max(1, Math.min(10, Math.floor(Number(n)))) : 1;
    const url = count > 1 ? `/api/questions/random/${userId}?n=${count}` : `/api/questions/random/${userId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur fetchRandomQuestions:", e);
    return null;
  }
}

// Fonctions pour gérer la progression du questionnaire
function saveQuestionnaireProgress(questionnaireId, questionIndex, userId) {
  try {
    const key = `qn_progress_${questionnaireId}_${userId}`;
    localStorage.setItem(key, JSON.stringify({
      questionnaireId,
      questionIndex,
      userId,
      savedAt: Date.now()
    }));
  } catch (e) {
    console.error("Erreur sauvegarde progression:", e);
  }
}

function getQuestionnaireProgress(questionnaireId, userId) {
  try {
    const key = `qn_progress_${questionnaireId}_${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    
    const data = JSON.parse(raw);
    // Expirer après 7 jours
    if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    
    return data;
  } catch (e) {
    console.error("Erreur lecture progression:", e);
    return null;
  }
}

function clearQuestionnaireProgress(questionnaireId, userId) {
  try {
    const key = `qn_progress_${questionnaireId}_${userId}`;
    localStorage.removeItem(key);
  } catch (e) {
    console.error("Erreur suppression progression:", e);
  }
}

// ------------------------------------------------------------
// Local safety backup for questionnaire answers (per user)
// ------------------------------------------------------------

function qnLocalKey(questionnaireId, userId) {
  return `qn_local_${questionnaireId}_${userId}`;
}

function readQnLocal(questionnaireId, userId) {
  try {
    const key = qnLocalKey(questionnaireId, userId);
    const raw = localStorage.getItem(key);
    if (!raw) return { answeredIds: [], answersById: {}, syncedIds: [] };
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { answeredIds: [], answersById: {}, syncedIds: [] };
    const answeredIds = Array.isArray(data.answeredIds) ? data.answeredIds.map(String) : [];
    const syncedIds = Array.isArray(data.syncedIds) ? data.syncedIds.map(String) : [];
    const answersById = (data.answersById && typeof data.answersById === 'object') ? data.answersById : {};
    return { answeredIds, syncedIds, answersById };
  } catch {
    return { answeredIds: [], answersById: {}, syncedIds: [] };
  }
}

function writeQnLocal(questionnaireId, userId, next) {
  try {
    const key = qnLocalKey(questionnaireId, userId);
    localStorage.setItem(key, JSON.stringify({
      answeredIds: Array.from(new Set(next.answeredIds || [])).map(String),
      syncedIds: Array.from(new Set(next.syncedIds || [])).map(String),
      answersById: (next.answersById && typeof next.answersById === 'object') ? next.answersById : {},
      savedAt: Date.now(),
    }));
  } catch {
    // ignore
  }
}

function mergeServerAnsweredIntoLocal(questionnaireId, userId, serverAnsweredIds) {
  const local = readQnLocal(questionnaireId, userId);
  const answered = new Set(local.answeredIds || []);
  (serverAnsweredIds || []).forEach((id) => answered.add(String(id)));
  writeQnLocal(questionnaireId, userId, {
    ...local,
    answeredIds: Array.from(answered),
  });
  return answered;
}

function upsertLocalAnswer(questionnaireId, userId, { questionId, answer, questionTitle, isCaptcha }) {
  const qId = String(questionId || '').trim();
  if (!qId) return;
  const local = readQnLocal(questionnaireId, userId);
  const answered = new Set(local.answeredIds || []);
  answered.add(qId);

  const answersById = { ...(local.answersById || {}) };
  answersById[qId] = {
    questionId: qId,
    questionTitle: questionTitle || null,
    answer,
    isCaptcha: Boolean(isCaptcha),
    updatedAt: new Date().toISOString(),
  };

  writeQnLocal(questionnaireId, userId, {
    answeredIds: Array.from(answered),
    syncedIds: local.syncedIds || [],
    answersById,
  });
}

function markLocalSynced(questionnaireId, userId, questionId) {
  const qId = String(questionId || '').trim();
  if (!qId) return;
  const local = readQnLocal(questionnaireId, userId);
  const synced = new Set(local.syncedIds || []);
  synced.add(qId);
  writeQnLocal(questionnaireId, userId, { ...local, syncedIds: Array.from(synced) });
}

function getLocalAnswerList(questionnaireId, userId) {
  const local = readQnLocal(questionnaireId, userId);
  const byId = local.answersById || {};
  return Object.keys(byId).map((k) => byId[k]).filter(Boolean);
}

function clearQnLocal(questionnaireId, userId) {
  try {
    localStorage.removeItem(qnLocalKey(questionnaireId, userId));
  } catch {
    // ignore
  }
}

const RANDOM_PREFETCH_TARGET = 3;
const MIN_TRANSITION_MS = 1000;

// Prevent a "stuck" UI when a network request never resolves (serverless cold start, network drop...).
function withTimeout(promise, ms = 15000, label = "operation") {
  const timeout = new Promise((_, reject) => {
    const t = setTimeout(() => {
      try { clearTimeout(t); } catch {}
      reject(new Error(`Timeout (${label})`));
    }, Math.max(1000, Number(ms) || 15000));
  });
  return Promise.race([promise, timeout]);
}

// ----------
// Image preloading (stable + race-safe)
// ----------

function preloadImage(url, { timeoutMs = 12000 } = {}) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ ok: false, url: null });
      return;
    }

    const img = new Image();
    let settled = false;

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      if (t) clearTimeout(t);
    };

    const settle = (ok) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: Boolean(ok), url: ok ? url : null });
    };

    const t = timeoutMs
      ? setTimeout(() => {
          settle(false);
        }, timeoutMs)
      : null;

    img.onload = async () => {
      try {
        // Ensure the browser has decoded the image before we consider it "ready"
        // so text + image can appear in sync.
        if (typeof img.decode === "function") await img.decode();
      } catch {
        // ignore decode errors; the image is still in cache
      }
      settle(true);
    };

    img.onerror = () => settle(false);

    // Start loading.
    img.src = url;

    // If already cached, onload may not fire reliably in some cases.
    if (img.complete) {
      // If naturalWidth is 0, it's a broken image.
      if (img.naturalWidth > 0) {
        // Defer to allow handlers to attach.
        Promise.resolve().then(() => img.onload && img.onload());
      } else {
        settle(false);
      }
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}


function makeConfettiPieces(count = 44, spread = 190) {
  const pieces = [];
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const dist = (spread * 0.45) + Math.random() * (spread * 0.55);
    const x = Math.cos(a) * dist;
    const y = Math.sin(a) * dist - (60 + Math.random() * 90);
    pieces.push({
      x,
      y,
      rot: Math.random() * 360,
      delay: Math.random() * 120,
      dur: 700 + Math.random() * 800,
      scale: 0.7 + Math.random() * 1.0,
    });
  }
  return pieces;
}

export default function MainPage({ authUser, authPending }) {
  const nav = useNavigate();
  const [db, setDb] = useState(null);
  const [dbError, setDbError] = useState("");
  const [user, setUser] = useState(authUser || null);
  const [pending, setPending] = useState(Number(authPending || 0));
  const [limitMsg, setLimitMsg] = useState("");
  const [settings, setSettings] = useState(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDraft, setProfileDraft] = useState(null);
  const [profilePhotoModal, setProfilePhotoModal] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoUpload, setProfilePhotoUpload] = useState(null);

  const [mode, setMode] = useState("RANDOM"); // RANDOM | QUESTIONNAIRE
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [randomMeta, setRandomMeta] = useState(null); // daily/weekly remaining + limits (from API)
  
  // Compteur local pour la ProgressBar (ne dépend que des actions utilisateur, jamais écrasé)
  const [answeredInSession, setAnsweredInSession] = useState(0);
  const baselineRemainingRef = useRef(null); // Valeur initiale au chargement, jamais écrasée
  
  // Random questions: always keep a 3-items preloaded buffer (data + image fully ready)
  const [randomBuffer, setRandomBuffer] = useState([]);
  const randomBufferRef = useRef([]);
  const randomOpsRef = useRef(Promise.resolve()); // mutex: serialize all buffer ops to avoid race conditions
  const [randomReady, setRandomReady] = useState(false); // becomes true once the initial 3 are fully ready
	  const fallbackImagePreloadedRef = useRef(false);
  const lastShownRandomIdRef = useRef("");
  const [randomLoading, setRandomLoading] = useState(false);

  // Anti-spam refresh lock
  const [refreshLocked, setRefreshLocked] = useState(false);
  const refreshLockedRef = useRef(false);
  const [unlockWhenQuestionId, setUnlockWhenQuestionId] = useState(null);

  // Transition overlay (skip/validate) stays until the next question is actually visible
  const [transitionKind, setTransitionKind] = useState(null); // "SKIP" | "VALIDATE" | null
  const [transitionTargetId, setTransitionTargetId] = useState(null);
  const transitionFromIdRef = useRef(null);
  const transitionSeqRef = useRef(0);
  const [transitionMinElapsed, setTransitionMinElapsed] = useState(true);
  const [transitionConfetti, setTransitionConfetti] = useState([]);

  // Lock interactions during transitions (prevents spam / race conditions)
  const [answerLocked, setAnswerLocked] = useState(false);
  const answerLockedRef = useRef(false);

  const [quotaExceeded, setQuotaExceeded] = useState(null); // "daily" | "weekly" | null
  const [noQuestionsAvailable, setNoQuestionsAvailable] = useState(false);

  // Keep latest quota flags available inside timeouts/mutexed ops (avoids stale closures)
  const quotaExceededRef = useRef(null);
  const noQuestionsAvailableRef = useRef(false);
  useEffect(() => {
    quotaExceededRef.current = quotaExceeded;
  }, [quotaExceeded]);
  useEffect(() => {
    noQuestionsAvailableRef.current = noQuestionsAvailable;
  }, [noQuestionsAvailable]);

  const [currentQuestionnaireId, setCurrentQuestionnaireId] = useState(null);
  const [qnIndex, setQnIndex] = useState(0);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState(new Set());

  const [codePrompt, setCodePrompt] = useState(null); // {qnId, error}
  const [qnFinished, setQnFinished] = useState(false);
  const qnDoneConfetti = useMemo(() => (qnFinished ? makeConfettiPieces(54, 220) : []), [qnFinished]);
  const [previewQnId, setPreviewQnId] = useState(null);
  
  // Nouvel état pour la progression des questionnaires
  const [questionnairesProgress, setQuestionnairesProgress] = useState({});
  const [validatingQuestionnaire, setValidatingQuestionnaire] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false); // Bloque l'interface pendant la sauvegarde
  const [missingQuestions, setMissingQuestions] = useState([]);
  const [qnFinalizeError, setQnFinalizeError] = useState("");

  // Questionnaire overlays (same style as random skip/validate)
  const [qnOverlayKind, setQnOverlayKind] = useState(null); // "ANSWER_OK" | "VALIDATING" | null
  const [qnOverlaySub, setQnOverlaySub] = useState("");
  const [qnOverlayConfetti, setQnOverlayConfetti] = useState([]);
  const qnOverlaySeqRef = useRef(0);

  // When we detect that some questionnaire questions are missing (local check or server check),
  // we must force the UI + local backup to treat those questions as "unanswered".
  // Otherwise the UI may render 0 questions and get stuck on a finalization screen.
  const markQuestionnaireQuestionsUnanswered = (qnId, ids = []) => {
    const questionnaireId = String(qnId || '').trim();
    if (!questionnaireId || !user?.id) return;
    const idSet = new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean));
    if (idSet.size === 0) return;

    // Update UI state
    setAnsweredQuestionIds((prev) => {
      const next = new Set();
      (prev || new Set()).forEach((x) => {
        const id = String(x || '').trim();
        if (!idSet.has(id)) next.add(id);
      });
      return next;
    });

    // Update local backup (remove from answeredIds/syncedIds and delete saved answers)
    const local = readQnLocal(questionnaireId, user.id);
    const answeredIds = (local.answeredIds || []).map(String).filter((x) => !idSet.has(String(x)));
    const syncedIds = (local.syncedIds || []).map(String).filter((x) => !idSet.has(String(x)));
    const answersById = { ...(local.answersById || {}) };
    idSet.forEach((id) => {
      try {
        delete answersById[id];
      } catch {
        // ignore
      }
    });
    writeQnLocal(questionnaireId, user.id, { ...local, answeredIds, syncedIds, answersById });
  };

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const run = async () => {
      tries += 1;
      try {
        // Chargement progressif : d'abord les données minimales
        const minimalDb = await loadDBProgressive((fullDb) => {
          // Mettre à jour avec les données complètes quand elles arrivent
          if (!cancelled) {
            setDb(fullDb);
          }
        });
        
        if (cancelled) return;
        
        // Afficher immédiatement avec les données minimales
        setDb(minimalDb);
        setDbError("");
      } catch (e) {
        if (cancelled) return;
        // The server may still be booting / restarting (dev). Retry silently first.
        if (tries < 6) {
          setTimeout(run, 900);
          return;
        }
        const msg = "Impossible de charger la base de données. Lance bien le serveur (npm start).";
        setDbError(msg);
        notifyError(msg);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    randomBufferRef.current = randomBuffer;
  }, [randomBuffer]);

  useEffect(() => {
    setUser(authUser || null);
    setPending(Number(authPending || 0));
  }, [authUser, authPending]);

  useEffect(() => {
    loadSettings().then(setSettings).catch((e) => {
      console.error("Erreur chargement paramètres:", e);
      // Valeurs par défaut en cas d'erreur
      setSettings({
        randomQuestionsPerDay: 10,
        randomQuestionsPerWeek: 50,
        minimumWithdrawalAmount: 50, // en dollars
        earningsPerRandomQuestion: 0.10, // en dollars
        earningsPerQuestionnaire: 1.00, // en dollars
        maxWithdrawalsPerMonth: 5,
      });
    });
  }, []);

  // Charger la progression des questionnaires au démarrage et après chaque changement d'utilisateur
  useEffect(() => {
    if (!user?.id) {
      setQuestionnairesProgress({});
      return;
    }
    
    const loadProgress = async () => {
      try {
        const result = await getUserQuestionnairesProgress(user.id);
        if (result.ok) {
          setQuestionnairesProgress(result.progress);
          
          // Synchroniser les questionnaires complétés automatiquement
          // (cas où toutes les questions ont été répondues mais la completion n'a pas été enregistrée)
          for (const [qnId, progress] of Object.entries(result.progress)) {
            if (progress.isCompleted && progress.totalQuestions > 0 && 
                progress.answeredCount >= progress.totalQuestions) {
              // Marquer comme complété si ce n'est pas déjà fait
              markQuestionnaireCompleted(qnId, user.id).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.error("Erreur chargement progression questionnaires:", e);
      }
    };
    
    loadProgress();
  }, [user?.id]);

  const questionnaires = useMemo(() => {
    if (!db || !user) return [];
    // Passer la progression pour filtrer aussi les questionnaires totalement répondus
    const list = getVisibleQuestionnairesForUser(db, user.id, questionnairesProgress);
    // compute count from linked questions to avoid desync
    const counts = new Map();
    (db.questions || []).forEach((q) => {
      if (q.questionnaire) counts.set(q.questionnaire, (counts.get(q.questionnaire) || 0) + 1);
    });
    return list.map((qn) => ({ ...qn, questionsCount: counts.get(qn.id) || (qn.questionOrder ? qn.questionOrder.length : 0) }));
  }, [db, user, questionnairesProgress]);
  
  // Admin "tester comme utilisateur"
  useEffect(() => {
    if (!db) return;
    const testId = localStorage.getItem("bni_connect_test_qn");
    if (testId) {
      localStorage.removeItem("bni_connect_test_qn");
      const qn = getQuestionnaireById(db, testId);
      if (qn) {
        setMode("QUESTIONNAIRE");
        setCurrentQuestionnaireId(testId);
        setQnIndex(0);
      }
    }
  }, [db]);

  // Serialize all random-buffer operations to avoid race conditions
  const enqueueRandomOp = (fn) => {
    const run = async () => {
      try {
        return await fn();
      } catch (e) {
        console.error("Random buffer op error:", e);
        return null;
      }
    };
    randomOpsRef.current = randomOpsRef.current.then(run, run);
    return randomOpsRef.current;
  };

  const prepareRandomQuestion = async (q) => {
    if (!q) return null;
    const url = String(q.imageUrl || "").trim();
    if (!url) return { ...q, imageUrl: "" };
    const r = await preloadImage(url, { timeoutMs: 12000 });
    if (r.ok) return { ...q, imageUrl: url };
    // Fallback stable: keep behaviour consistent by showing the built-in placeholder
    return { ...q, imageUrl: "" };
  };

  const fillRandomBufferTo = (target, { isInit = false } = {}) =>
    enqueueRandomOp(async () => {
      if (!user) return null;
      if (mode !== "RANDOM") return null;
      if (quotaExceededRef.current || noQuestionsAvailableRef.current) return null;

	      // Preload the placeholder once so "no image" questions still render text+image in sync.
	      if (!fallbackImagePreloadedRef.current) {
	        await preloadImage("/bniconnect.png", { timeoutMs: 8000 });
	        fallbackImagePreloadedRef.current = true;
	      }

      let buf = [...(randomBufferRef.current || [])];
      if (isInit && buf.length === 0) setRandomLoading(true);

      const exclude = new Set(buf.map((q) => q?.id).filter(Boolean));
      if (lastShownRandomIdRef.current) exclude.add(lastShownRandomIdRef.current);

      let tries = 0;
      let relaxDuplicates = false;

      while (buf.length < target && tries < 10) {
        tries += 1;
        if (tries >= 5) relaxDuplicates = true; // last-resort: allow duplicates if stock is tiny

        const want = Math.max(1, Math.min(10, target - buf.length));
        const data = await fetchRandomQuestions(user.id, want);
        if (!data || !data.ok) break;

        // Init baseline once
        if (baselineRemainingRef.current === null && data.dailyRemaining !== undefined) {
          baselineRemainingRef.current = data.dailyRemaining;
        }

        // Update limits only (avoid stomping local progress)
        setRandomMeta((prev) => ({
          dailyRemaining: data.dailyRemaining ?? prev?.dailyRemaining,
          weeklyRemaining: data.weeklyRemaining ?? prev?.weeklyRemaining,
          dailyLimit: data.dailyLimit,
          weeklyLimit: data.weeklyLimit,
        }));

        if (data.quotaExceeded) {
          quotaExceededRef.current = data.quotaExceeded;
          setQuotaExceeded(data.quotaExceeded);
          setNoQuestionsAvailable(false);
          noQuestionsAvailableRef.current = false;
          buf = [];
          break;
        }
        if (data.noQuestionsAvailable) {
          noQuestionsAvailableRef.current = true;
          setNoQuestionsAvailable(true);
          setQuotaExceeded(null);
          quotaExceededRef.current = null;
          buf = [];
          break;
        }

        const batch = Array.isArray(data.questions) && data.questions.length
          ? data.questions
          : (data.question ? [data.question] : []);

        const picked = [];
        const pickedIds = new Set();

        for (const q of batch) {
          if (!q || !q.id) continue;
          const isDup = exclude.has(q.id);
          if (isDup && !relaxDuplicates) continue;
          if (pickedIds.has(q.id)) continue;
          pickedIds.add(q.id);
          if (!isDup) exclude.add(q.id);
          picked.push(q);
          if (picked.length >= want) break;
        }

        if (picked.length === 0) {
          // Avoid infinite loops on small pools
          if (relaxDuplicates) break;
          continue;
        }

        const prepared = (await Promise.all(picked.map(prepareRandomQuestion))).filter(Boolean);
        buf = buf.concat(prepared);
      }

      randomBufferRef.current = buf;
      setRandomBuffer(buf);

      if (buf.length > 0) {
        setQuotaExceeded(null);
        setNoQuestionsAvailable(false);
      }

      // At boot we wait for the full buffer to be ready so the first transitions
      // never reveal a non-preloaded question.
      if (isInit && buf.length >= target) setRandomReady(true);

      // Keep the loader visible until the buffer target is reached on init.
      if (isInit) setRandomLoading(buf.length < target);
      else setRandomLoading(false);
      return buf;
    });

  // Initial boot: wait until 3 questions (with images) are ready before displaying the first.
  useEffect(() => {
    if (!db || !user) return;
    if (mode !== "RANDOM") return;
    if (quotaExceeded || noQuestionsAvailable) return;
    if (randomReady && (randomBufferRef.current || []).length >= RANDOM_PREFETCH_TARGET) return;
    fillRandomBufferTo(RANDOM_PREFETCH_TARGET, { isInit: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, user, mode, quotaExceeded, noQuestionsAvailable, randomReady, randomBuffer.length]);

  // Maintenance: keep the buffer topped-up in the background.
  useEffect(() => {
    if (!db || !user) return;
    if (mode !== "RANDOM") return;
    if (quotaExceeded || noQuestionsAvailable) return;
    if (!randomReady) return;
    if ((randomBufferRef.current || []).length >= RANDOM_PREFETCH_TARGET) return;
    fillRandomBufferTo(RANDOM_PREFETCH_TARGET);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, user, mode, quotaExceeded, noQuestionsAvailable, randomBuffer.length, randomReady]);

  const currentQuestion = useMemo(() => {
    if (!db || !currentQuestionId) return null;
    return getQuestionById(db, currentQuestionId);
  }, [db, currentQuestionId]);

  const currentRandomQuestion = randomReady ? (randomBuffer?.[0] || null) : null;

  const currentQuestionnaire = useMemo(() => {
    if (!db || !currentQuestionnaireId) return null;
    return getQuestionnaireById(db, currentQuestionnaireId);
  }, [db, currentQuestionnaireId]);

  const questionnaireQuestions = useMemo(() => {
    // If we are in a "missing questions" recovery phase, only show missing questions
    // (do NOT re-filter by answeredQuestionIds here).
    if (missingQuestions && missingQuestions.length > 0) {
      // We want to re-display exactly the questions that are missing,
      // even if the local state *thought* they were answered.
      const uniq = new Map();
      (missingQuestions || []).forEach((q) => {
        if (!q) return;
        const id = String(q.id || '').trim();
        if (!id) return;
        if (!uniq.has(id)) uniq.set(id, q);
      });
      return Array.from(uniq.values());
    }
    
    if (!db || !currentQuestionnaire) return [];
    
    let allQuestions = [];
    
    // Use questionOrder if available
    if (currentQuestionnaire.questionOrder && currentQuestionnaire.questionOrder.length > 0) {
      const questionsMap = new Map();
      (db.questions || []).forEach(q => {
        if (q.questionnaire === currentQuestionnaire.id) {
          questionsMap.set(q.id, q);
        }
      });
      
      allQuestions = currentQuestionnaire.questionOrder
        .map(id => questionsMap.get(id))
        .filter(Boolean);
    } else {
      // Fallback: all questions linked to this questionnaire
      allQuestions = (db.questions || []).filter((q) => q.questionnaire === currentQuestionnaire.id);
    }
    
    // Only show unanswered questions. Answered questions are provided by the server
    // at load time, then tracked locally.
    return allQuestions.filter((q) => q && !answeredQuestionIds.has(q.id));
  }, [db, currentQuestionnaire, missingQuestions, answeredQuestionIds]);

  useEffect(() => {
    if (mode !== "QUESTIONNAIRE") return;
    const q = questionnaireQuestions[qnIndex];
    if (q) {
      console.log(`📍 Affichage de la question ${qnIndex}: ${q.title} (ID: ${q.id})`);
      setCurrentQuestionId(q.id);
    } else {
      console.warn(`⚠️ Pas de question à l'index ${qnIndex}`);
      setCurrentQuestionId(null);
    }
  }, [mode, qnIndex, questionnaireQuestions]);
  const startTransition = (kind) => {
    if (mode !== "RANDOM") return;
    const fromId = (randomBufferRef.current || [])[0]?.id || null;
    const targetId = (randomBufferRef.current || [])[1]?.id || null;
    transitionFromIdRef.current = fromId;
    setTransitionKind(kind);
    setTransitionTargetId(targetId);
    // Ultra-satisfying overlay confetti (rendered behind the badge/text but above the dim background)
    setTransitionConfetti(makeConfettiPieces(kind === "VALIDATE" ? 64 : 46, 260));
    // Used by the refresh unlock logic (skip) and by validate fallback
    setUnlockWhenQuestionId(targetId);

    answerLockedRef.current = true;
    setAnswerLocked(true);

    // Enforce a minimum visible animation duration to keep UX consistent.
    const seq = (transitionSeqRef.current += 1);
    setTransitionMinElapsed(false);
    setTimeout(() => {
      if (transitionSeqRef.current === seq) setTransitionMinElapsed(true);
    }, MIN_TRANSITION_MS);

    return seq;
  };

  const endTransition = () => {
    setTransitionKind(null);
    setTransitionTargetId(null);
    transitionFromIdRef.current = null;
    setTransitionConfetti([]);
    answerLockedRef.current = false;
    setAnswerLocked(false);
    setTransitionMinElapsed(true);
  };

  // Questionnaire overlay helpers
  const showQnOverlay = (kind, { sub = "", autoHide = true } = {}) => {
    setQnOverlayKind(kind);
    setQnOverlaySub(sub || "");
    setQnOverlayConfetti(makeConfettiPieces(kind === "VALIDATING" ? 46 : 64, 260));
    const seq = (qnOverlaySeqRef.current += 1);
    if (autoHide) {
      setTimeout(() => {
        if (qnOverlaySeqRef.current !== seq) return;
        setQnOverlayKind(null);
        setQnOverlaySub("");
        setQnOverlayConfetti([]);
      }, MIN_TRANSITION_MS);
    }
    return seq;
  };

  const hideQnOverlay = () => {
    qnOverlaySeqRef.current += 1;
    setQnOverlayKind(null);
    setQnOverlaySub("");
    setQnOverlayConfetti([]);
  };

  useEffect(() => {
    return () => {};
  }, []);


	const advanceRandom = (consumeQuota = true) => {
	  if (!user) return;
	  if (mode !== "RANDOM") return;

	  // 1) Update local progress instantly (UI only)
	  if (consumeQuota) setAnsweredInSession((prev) => prev + 1);

	  // 2) Shift the already-prepared buffer (serialized to avoid races)
	  enqueueRandomOp(async () => {
	    const prev = randomBufferRef.current || [];
	    if (prev.length > 0) lastShownRandomIdRef.current = prev[0]?.id || "";
	    const next = prev.slice(1);
	    randomBufferRef.current = next;
	    setRandomBuffer(next);
	    if (next.length === 0) setRandomLoading(true);
	    return next;
	  });

	  // 3) Immediately top-up back to 3 items (data + image ready) in the background
	  // (unless we already hit a quota / no questions)
	  if (!quotaExceededRef.current && !noQuestionsAvailableRef.current) {
	    fillRandomBufferTo(RANDOM_PREFETCH_TARGET);
	  }

	  // 4) Consume quota on the server only when the user *skips* (refresh)
	  // IMPORTANT: after an actual answer, quota is consumed via /api/earn/random
	  if (consumeQuota && !quotaExceededRef.current && !noQuestionsAvailableRef.current) {
	    skipRandom(user.id)
	      .then((r) => {
	        if (r && r.ok) return;
	        if (r && (r.reason === "DAILY_LIMIT" || r.reason === "WEEKLY_LIMIT")) {
	          const qx = r.reason === "DAILY_LIMIT" ? "daily" : "weekly";
	          quotaExceededRef.current = qx;
	          setQuotaExceeded(qx);
	          setNoQuestionsAvailable(false);
	          noQuestionsAvailableRef.current = false;
	          randomBufferRef.current = [];
	          setRandomBuffer([]);
	          setRandomReady(false);
	        }
	      })
	      .catch((e) => console.error("Erreur skip:", e));
	  }
	};

	const unlockRefresh = () => {
	  refreshLockedRef.current = false;
	  setRefreshLocked(false);
	  setUnlockWhenQuestionId(null);
	};

		const onRefreshClick = (e) => {
  if (answerLockedRef.current) return;
  if (refreshLockedRef.current) return;
		  // Disable instantly (even before React rerender)
		  if (e && e.currentTarget) e.currentTarget.disabled = true;
	  refreshLockedRef.current = true;
	  setRefreshLocked(true);
	  const seq = startTransition("SKIP");
	  // Keep the current question visible under the overlay for at least 1s,
	  // then consume from the buffer and refill.
	  setTimeout(() => {
	    // If a new transition started meanwhile, do nothing.
	    if (transitionSeqRef.current !== seq) return;
	    advanceRandom(true);
	  }, MIN_TRANSITION_MS);
	};


	useEffect(() => {
	  if (!refreshLocked) return;
	  // Don't unlock/end the transition before the minimum animation duration.
	  if (!transitionMinElapsed) return;
	  if (quotaExceeded || noQuestionsAvailable) {
	    unlockRefresh();
	    if (transitionKind === "SKIP") endTransition();
	    return;
	  }
	  const currentId = (randomBuffer?.[0] || null)?.id || null;
	  if (unlockWhenQuestionId) {
	    if (currentId === unlockWhenQuestionId) {
	      unlockRefresh();
	      if (transitionKind === "SKIP") endTransition();
	    }
	    return;
	  }
	  // If we didn't have a next id (buffer edge-case), unlock once a new question is visible.
	  if (currentId && !randomLoading) {
	    unlockRefresh();
	    if (transitionKind === "SKIP") endTransition();
	  }
	}, [refreshLocked, unlockWhenQuestionId, randomBuffer, randomLoading, quotaExceeded, noQuestionsAvailable, transitionKind, transitionMinElapsed]);
  // Keep the validation overlay until the next random question is actually visible
  useEffect(() => {
    if (mode !== "RANDOM") return;
    if (transitionKind !== "VALIDATE") return;

    // Ensure the overlay stays visible at least MIN_TRANSITION_MS.
    if (!transitionMinElapsed) return;

    if (quotaExceeded || noQuestionsAvailable) {
      endTransition();
      return;
    }

    const currentId = (randomBuffer?.[0] || null)?.id || null;
    const fromId = transitionFromIdRef.current || null;

    if (!currentId) return; // still loading the next question

    if (transitionTargetId) {
      if (currentId === transitionTargetId) endTransition();
      return;
    }

    if (fromId && currentId !== fromId) endTransition();
  }, [mode, transitionKind, transitionTargetId, randomBuffer, quotaExceeded, noQuestionsAvailable, transitionMinElapsed]);


  const startQuestionnaire = async (qnId) => {
    if (!db) return;
    const qn = getQuestionnaireById(db, qnId);
    if (!qn) return;

    if (qn.isPrivate) {
      setCodePrompt({ qnId, error: "" });
      return;
    }

    // Reset UI state
    setMissingQuestions([]);
    setValidatingQuestionnaire(false);
    setSavingAnswer(false);
    setQnFinished(false);
    setQnFinalizeError("");

    // Merge server progress into local backup, then compute the union as the source of truth.
    let answeredUnion = new Set();
    if (user?.id) {
      // Local first
      const local = readQnLocal(qnId, user.id);
      (local.answeredIds || []).forEach((id) => answeredUnion.add(String(id)));

      // Server
      try {
        const result = await getAnsweredQuestionsInQuestionnaire(qnId, user.id);
        if (result && result.ok) {
          if (result.completed) {
            alert("Vous avez déjà complété ce questionnaire !");
            setQuestionnairesProgress((prev) => ({
              ...prev,
              [qnId]: { ...prev[qnId], isCompleted: true },
            }));
            return;
          }

          answeredUnion = mergeServerAnsweredIntoLocal(qnId, user.id, result.answeredQuestionIds || []);
          // Also add local answers that may not have been synced yet
          const againLocal = readQnLocal(qnId, user.id);
          (againLocal.answeredIds || []).forEach((id) => answeredUnion.add(String(id)));
        } else {
          // Keep local only
        }
      } catch (e) {
        console.error("Erreur chargement questions répondues:", e);
      }
    }

    setAnsweredQuestionIds(new Set(answeredUnion));
    console.log(`📋 Questionnaire ${qnId}: ${answeredUnion.size} question(s) déjà répondue(s) (local + serveur)`);

    setMode("QUESTIONNAIRE");
    setCurrentQuestionnaireId(qnId);
    // Always start from the first unanswered question (we only display unanswered)
    setQnIndex(0);
  };

  const validatePrivateCode = async (code) => {
    if (!db || !codePrompt) return;
    const qn = getQuestionnaireById(db, codePrompt.qnId);
    if (!qn) return;

    if ((qn.code || "").trim().toLowerCase() !== (code || "").trim().toLowerCase()) {
      setCodePrompt({ ...codePrompt, error: "Code incorrect." });
      return;
    }

    // Reset UI state
    setMissingQuestions([]);
    setValidatingQuestionnaire(false);
    setSavingAnswer(false);
    setQnFinished(false);
    setQnFinalizeError("");

    // Merge server progress into local backup, then compute the union as the source of truth.
    let answeredUnion = new Set();
    if (user?.id) {
      // Local first
      const local = readQnLocal(qn.id, user.id);
      (local.answeredIds || []).forEach((id) => answeredUnion.add(String(id)));

      // Server
      try {
        const result = await getAnsweredQuestionsInQuestionnaire(qn.id, user.id);
        if (result && result.ok) {
          if (result.completed) {
            alert("Vous avez déjà complété ce questionnaire !");
            setCodePrompt(null);
            setQuestionnairesProgress((prev) => ({
              ...prev,
              [qn.id]: { ...prev[qn.id], isCompleted: true },
            }));
            return;
          }

          answeredUnion = mergeServerAnsweredIntoLocal(qn.id, user.id, result.answeredQuestionIds || []);
          const againLocal = readQnLocal(qn.id, user.id);
          (againLocal.answeredIds || []).forEach((id) => answeredUnion.add(String(id)));
        }
      } catch (e) {
        console.error("Erreur chargement questions répondues:", e);
      }
    }

    setAnsweredQuestionIds(new Set(answeredUnion));
    console.log(`📋 Questionnaire ${qn.id}: ${answeredUnion.size} question(s) déjà répondue(s) (local + serveur)`);

    setCodePrompt(null);
    setMode("QUESTIONNAIRE");
    setCurrentQuestionnaireId(qn.id);
    setQnIndex(0);
  };

  // Build the full ordered list of questions for a questionnaire (no filtering)
  const getAllQuestionsForQuestionnaire = (qnId) => {
    if (!db || !qnId) return [];
    const qn = getQuestionnaireById(db, qnId);
    if (!qn) return [];
    const questionsMap = new Map();
    (db.questions || []).forEach((q) => {
      if (q.questionnaire === qnId) questionsMap.set(q.id, q);
    });
    const order = (qn.questionOrder || qn.questionorder || []);
    const ordered = Array.isArray(order) && order.length
      ? order.map((id) => questionsMap.get(id)).filter(Boolean)
      : (db.questions || []).filter((q) => q.questionnaire === qnId);
    return ordered;
  };

  const finalizeQuestionnaireFlow = async (qnId) => {
    if (!user?.id || !qnId) return;
    const allQnQuestions = getAllQuestionsForQuestionnaire(qnId);

    setQnFinalizeError("");

    setValidatingQuestionnaire(true);
    setSavingAnswer(true);
    showQnOverlay("VALIDATING", { sub: "Sauvegarde finale…", autoHide: false });

    // 1) Sync local backup to server (safety-net)
    try {
      const localAnswers = getLocalAnswerList(qnId, user.id);
      if (localAnswers.length > 0) {
        await withTimeout(
          syncQuestionnaireAnswers(
            qnId,
            user.id,
            localAnswers,
            user.fullName || (user.prenom + " " + user.nom).trim()
          ),
          15000,
          "sync-answers"
        );
      }
    } catch (e) {
      console.error("Erreur sync finale questionnaire:", e);
      // Continue: local verification may still allow recovery UI.
    }

    // 2) Local verification: re-display only missing questions (local check)
    const local = readQnLocal(qnId, user.id);
    const localAnswered = new Set([...(local.answeredIds || [])]);
    // Also include answered IDs we got from server at load time
    answeredQuestionIds.forEach((id) => localAnswered.add(String(id)));

    const missing = allQnQuestions.filter((q) => q && !localAnswered.has(q.id));
    if (missing.length > 0) {
      console.warn(`⚠️ Local check: ${missing.length} question(s) manquante(s)`);
      // Force those questions to be considered unanswered (UI + local backup)
      markQuestionnaireQuestionsUnanswered(qnId, missing.map((q) => q?.id).filter(Boolean));
      setMissingQuestions(missing);
      setQnIndex(0);
      setValidatingQuestionnaire(false);
      setSavingAnswer(false);
      hideQnOverlay();
      setQnFinalizeError("");
      return;
    }

    // 3) Server validation (awards reward + marks completion)
    try {
      const validationResult = await withTimeout(
        validateQuestionnaire(qnId, user.id),
        15000,
        "validate-questionnaire"
      );

      if (validationResult && validationResult.ok && (validationResult.completed || validationResult.alreadyCompleted)) {
        setPending(Number(validationResult.pending || 0));
        clearDBCache();
        clearQnLocal(qnId, user.id);
        clearQuestionnaireProgress(qnId, user.id);
        setMissingQuestions([]);

        setQuestionnairesProgress((prev) => ({
          ...prev,
          [qnId]: {
            ...prev[qnId],
            isCompleted: true,
            answeredCount: prev[qnId]?.totalQuestions || prev[qnId]?.answeredCount || 0,
            remaining: 0,
          },
        }));

        hideQnOverlay();
        setValidatingQuestionnaire(false);
        setSavingAnswer(false);
        setQnFinished(true);

        setTimeout(() => {
          // Return to RANDOM mode.
          // Important: ensure we never render a null random question (which would show "Sans titre")
          // while the buffer is refilling.
          randomBufferRef.current = [];
          setRandomBuffer([]);
          setRandomReady(false);
          setRandomLoading(true);

          setQnFinished(false);
          setMode("RANDOM");
          setCurrentQuestionnaireId(null);
          setQnIndex(0);
          setCurrentQuestionId(null);
          setMissingQuestions([]);
          setAnsweredQuestionIds(new Set());
          setQnFinalizeError("");
        }, 2500);
        return;
      }

      // If server still says incomplete, re-display only the missing questions.
      if (validationResult && validationResult.incomplete) {
        const missingIdsRaw = Array.isArray(validationResult.missingQuestionIds)
          ? validationResult.missingQuestionIds
          : [];
        const missingIdSet = new Set(missingIdsRaw.map((x) => String(x || '').trim()).filter(Boolean));
        const byId = new Map(allQnQuestions.map((q) => [String(q?.id || '').trim(), q]));
        const missingByServer = Array.from(missingIdSet)
          .map((id) => byId.get(id))
          .filter(Boolean);
        if (missingByServer.length > 0) {
          // Force them as unanswered so the UI cannot get stuck with 0 questions.
          markQuestionnaireQuestionsUnanswered(qnId, Array.from(missingIdSet));
          setMissingQuestions(missingByServer);
          setQnIndex(0);
          hideQnOverlay();
          setValidatingQuestionnaire(false);
          setSavingAnswer(false);
          setQnFinalizeError("");
          notifyError("Certaines réponses n'ont pas été enregistrées. Merci de répondre aux questions manquantes.");
          return;
        }
      }

      hideQnOverlay();
      setValidatingQuestionnaire(false);
      setSavingAnswer(false);
      setQnFinalizeError("Impossible de valider le questionnaire pour le moment. Cliquez sur « Réessayer ».");
      notifyError("Erreur lors de la validation. Veuillez réessayer.");
    } catch (e) {
      console.error("Erreur validation questionnaire:", e);
      hideQnOverlay();
      setValidatingQuestionnaire(false);
      setSavingAnswer(false);
      setQnFinalizeError("Impossible de valider le questionnaire pour le moment. Cliquez sur « Réessayer ».");
      notifyError("Erreur lors de la validation. Veuillez réessayer.");
    }
  };

  const recordAnswerAndAdvance = async ({ questionId, answer, correct }) => {
    if (!db || !user) return;
    if (savingAnswer || validatingQuestionnaire) {
      console.warn('⚠️ Action bloquée (sauvegarde/validation en cours)');
      return;
    }

    const q = getQuestionById(db, questionId);
    const isCaptcha = q && q.importance === "CAPTCHA";
    const questionTitle = q?.title || null;

    const qnId = mode === "QUESTIONNAIRE" ? String(currentQuestionnaireId || "").trim() : null;

    // -----------------
    // QUESTIONNAIRE MODE (secure)
    // - Save locally immediately
    // - Send to server on each question
    // - At the last question: do a final bulk sync + local verification
    // -----------------
    if (mode === "QUESTIONNAIRE") {
      if (!qnId) {
        notifyError("Erreur: questionnaire introuvable.");
        return;
      }

      // Clear any previous finalize error as soon as the user interacts again.
      if (qnFinalizeError) setQnFinalizeError("");

      // 1) Local save first (safety)
      upsertLocalAnswer(qnId, user.id, { questionId, answer, questionTitle, isCaptcha });

      // Update local answered set for UI (we only display unanswered)
      const nextAnswered = new Set(answeredQuestionIds);
      nextAnswered.add(String(questionId));
      setAnsweredQuestionIds(new Set(nextAnswered));
      setQnIndex(0);

      // 2) Send to server
      setSavingAnswer(true);
      try {
        const r = await appendAnswer({
          id: newId("ans"),
          userId: user.id,
          userName: user.fullName || (user.prenom + " " + user.nom).trim(),
          questionnaireId: qnId,
          questionId,
          questionTitle,
          answer,
          isCaptcha,
          createdAt: new Date().toISOString(),
        });
        if (r && r.ok) {
          markLocalSynced(qnId, user.id, questionId);
        } else {
          throw new Error("Échec sauvegarde serveur");
        }
      } catch (e) {
        console.error("❌ Erreur sauvegarde serveur (questionnaire):", e);
        notifyError("Serveur indisponible : réponse sauvegardée localement. Elle sera renvoyée à la fin du questionnaire.");
      }

      // If the question has a tag, handle it (same behavior as before)
      if (q && !isCaptcha) {
        const userField = q.tagId ? getUserFieldForTagId(q.tagId) : null;
        if (userField) {
          adminUpdateUser(user.id, { [userField]: String(answer ?? "") })
            .then(async (r) => {
              if (r && r.ok) {
                try {
                  const me = await authMe();
                  if (me && me.ok) {
                    setUser(me.user);
                    setPending(Number(me.pending || 0));
                    return;
                  }
                } catch {}
                setUser(r.user);
              }
            })
            .catch(() => {});
        } else if (q.importance === "SENSIBLE") {
          const tagName = q.tagId ? (db.tags || []).find((t) => t.id === q.tagId)?.name || "" : "";
          recordSensible(user.id, tagName || null, answer, q?.id || null, q?.title || null).catch(() => {});
        }
      } else if (q && isCaptcha) {
        recordSensible(user.id, null, answer, q?.id || null, q?.title || null, true).catch(() => {});
      }

      // 3) Show "Réponse validée" overlay (replaces "Enregistrement en cours...")
      showQnOverlay("ANSWER_OK");

      // 4) Decide if we reached the end (local check)
      const allQnQuestions = getAllQuestionsForQuestionnaire(qnId);
      const local = readQnLocal(qnId, user.id);
      const localAnswered = new Set([...(local.answeredIds || [])]);
      nextAnswered.forEach((id) => localAnswered.add(String(id)));

      const remaining = allQnQuestions.filter((qq) => qq && !localAnswered.has(qq.id));

      // Unlock after the overlay minimum duration (keeps UX consistent)
      setTimeout(() => {
        setSavingAnswer(false);
      }, MIN_TRANSITION_MS);

      if (remaining.length === 0) {
        // Last question answered -> final validation phase (orange)
        setMissingQuestions([]);
        await finalizeQuestionnaireFlow(qnId);
      }
      return;
    }

    // -----------------
    // RANDOM MODE (unchanged)
    // -----------------

    appendAnswer({
      id: newId("ans"),
      userId: user.id,
      userName: user.fullName || (user.prenom + " " + user.nom).trim(),
      questionnaireId: null,
      questionId,
      questionTitle,
      answer,
      isCaptcha,
      createdAt: new Date().toISOString(),
    }).catch((e) => console.error("Erreur sauvegarde réponse:", e));

    // If the question has a tag, handle it.
    // Special case: "variable.user.*" tags update utilisateur.json fields instead of sensibleAnswersTagged.
    // IMPORTANT: Ne pas enregistrer les réponses CAPTCHA dans le profil utilisateur
    if (q && !isCaptcha) {
      const userField = q.tagId ? getUserFieldForTagId(q.tagId) : null;

      if (userField) {
        // Update internal user profile (same behavior as account edit)
        adminUpdateUser(user.id, { [userField]: String(answer ?? "") })
          .then(async (r) => {
            if (r && r.ok) {
              // refresh session snapshot so UI stays in sync
              try {
                const me = await authMe();
                if (me && me.ok) {
                  setUser(me.user);
                  setPending(Number(me.pending || 0));
                  return;
                }
              } catch {
                // ignore
              }
              setUser(r.user);
            }
          })
          .catch(() => {});
      } else if (q.importance === "SENSIBLE") {
        const tagName = q.tagId ? (db.tags || []).find((t) => t.id === q.tagId)?.name || "" : "";
        recordSensible(user.id, tagName || null, answer, q?.id || null, q?.title || null).catch(() => {});
      }
    } else if (q && isCaptcha) {
      // Pour les questions CAPTCHA, juste enregistrer dans le cooldown mais pas dans le profil
      recordSensible(user.id, null, answer, q?.id || null, q?.title || null, true).catch(() => {});
    }

    if (mode === "RANDOM") {
      startTransition("VALIDATE");

      // Incrémenter le compteur LOCAL pour la ProgressBar (instantané, jamais écrasé)
      setAnsweredInSession((prev) => prev + 1);

      // Ne bloque pas l'UI en attendant le serveur : gagne en arrière-plan
      earnRandom(user.id)
        .then((r) => {
          if (!r) return;
          if (r.ok) {
            setPending(Number(r.pending || 0));
            setLimitMsg("");
            // Keep UI limits in sync without resetting the local progress.
            if (r.dailyRemaining !== undefined || r.weeklyRemaining !== undefined) {
              setRandomMeta((prev) => ({
                dailyRemaining: r.dailyRemaining ?? prev?.dailyRemaining,
                weeklyRemaining: r.weeklyRemaining ?? prev?.weeklyRemaining,
                dailyLimit: prev?.dailyLimit,
                weeklyLimit: prev?.weeklyLimit,
              }));
            }
            return;
          }

          // Quota reached → show the "limite" screen immediately (no extra fetch)
          if (r.reason === "DAILY_LIMIT" || r.reason === "WEEKLY_LIMIT") {
            const qx = r.reason === "DAILY_LIMIT" ? "daily" : "weekly";
            quotaExceededRef.current = qx;
            setQuotaExceeded(qx);
            setNoQuestionsAvailable(false);
            noQuestionsAvailableRef.current = false;
            setRandomMeta((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                dailyRemaining: qx === "daily" ? 0 : prev.dailyRemaining,
                weeklyRemaining: qx === "weekly" ? 0 : prev.weeklyRemaining,
              };
            });
            randomBufferRef.current = [];
            setRandomBuffer([]);
            setRandomReady(false);
            setLimitMsg("");
            return;
          }

          // Legacy / fallback
          if (r.reason) setLimitMsg("Limite atteinte");
        })
        .catch(() => {});

      // After the minimum animation duration, consume the current question.
      setTimeout(() => advanceRandom(false), MIN_TRANSITION_MS);
      return;
    }
  };

  if (!db) {
    return (
      <div className="mainRoot">
        <LogoHeader />
        <div className="centerStage" style={{ padding: 24 }}>
          <div className="centerWrap glass serverLoading" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div className="serverLoadingTop">
              <div className="serverLoadingTitle">Connexion au serveur</div>
              <div className="serverLoadingSpinner" aria-hidden="true" />
            </div>

            <div className="serverLoadingText">
              {dbError ? dbError : (
                <>
                  Chargement…<span className="loadingDots" aria-hidden="true" />
                </>
              )}
            </div>

            <div className="serverLoadingBar" aria-hidden="true"><span /></div>
            {!dbError ? (
              <div className="serverLoadingHint">Ça peut prendre quelques secondes au premier lancement.</div>
            ) : null}

            {dbError ? (
              <div style={{ padding: 18, paddingTop: 0 }}>
                <button className="btn btnPrimary" type="button" onClick={() => window.location.reload()}>
                  Réessayer
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mainRoot">
      <LogoHeader />

      <div className="mainLayout">
        <LeftSidebar
          user={user}
          pending={pending}
          questionnaires={questionnaires}
          settings={settings}
          questionnairesProgress={questionnairesProgress}
          onStartQuestionnaire={startQuestionnaire}
          onPreviewQuestionnaire={(qnId) => setPreviewQnId(qnId)}
          onOpenProfile={() => {
            if (!user) return;
            setProfileDraft({ ...user });
            setProfilePhotoUrl("");
            setProfilePhotoUpload(null);
            setProfileOpen(true);
          }}
          onRequestWithdraw={async () => {
            if (!user) return;
            try {
              const r = await requestWithdraw(user.id);
              if (r && r.ok) {
                setPending(0);
                setUser((prev) => ({ ...prev, retrait: r.retrait }));
              }
            } catch (e) {
              // ignore
            }
          }}
        />

        <div className="centerStage">
          <div className="centerWrap glass">
            {mode === "QUESTIONNAIRE" && currentQuestionnaire ? (
              <div className="qnHeader">
                <div className="qnTitle">
                  {currentQuestionnaire.name}
                  {missingQuestions.length > 0 ? (
                    <span style={{ 
                      fontSize: 12, 
                      marginLeft: 10, 
                      color: '#f59e0b',
                      fontWeight: 600 
                    }}>
                      (Questions manquantes)
                    </span>
                  ) : null}
                </div>
                <div className="qnProgress pill" style={missingQuestions.length > 0 ? { background: 'rgba(245,158,11,0.3)' } : {}}>
                  {(() => {
                    const totalQuestions = (currentQuestionnaire.questionOrder || []).length || 
                      (db?.questions || []).filter(q => q.questionnaire === currentQuestionnaire.id).length;
                    const remaining = Array.isArray(questionnaireQuestions) ? questionnaireQuestions.length : 0;
                    const answered = Math.max(0, totalQuestions - remaining);

                    if (missingQuestions.length > 0) {
                      // Recovery phase: show only the missing unanswered questions
                      return `${remaining} restante${remaining > 1 ? 's' : ''}`;
                    }

                    const currentProgress = remaining > 0 ? Math.min(answered + 1, totalQuestions) : totalQuestions;
                    return `${currentProgress}/${totalQuestions}`;
                  })()}
                </div>
              </div>
            ) : mode === "RANDOM" && !quotaExceeded && !noQuestionsAvailable ? (
              <div className="randomHeader">
                <div className="randomProgressBar">
                  <div 
                    className="randomProgressFill" 
                    style={{ 
                      width: `${(() => {
                        const lim = Number(randomMeta?.dailyLimit ?? settings?.randomQuestionsPerDay ?? 10);
                        const baseline = baselineRemainingRef.current ?? lim;
                        const currentRemaining = Math.max(0, baseline - answeredInSession);
                        if (!Number.isFinite(lim) || lim <= 0) return 0;
                        const answered = lim - currentRemaining;
                        return Math.max(0, Math.min(100, (answered / lim) * 100));
                      })()}%` 
                    }}
                  />
                  <span className="randomProgressText">
                    {(() => {
                      const lim = Number(randomMeta?.dailyLimit ?? settings?.randomQuestionsPerDay ?? 10);
                      const baseline = baselineRemainingRef.current ?? lim;
                      const currentRemaining = Math.max(0, baseline - answeredInSession);
                      const answered = lim - currentRemaining;
                      return `${answered}/${lim} aujourd'hui`;
                    })()}
                  </span>
                </div>
                <button 
                  className="btn btnRefresh" 
                  type="button"
	                  onClick={onRefreshClick}
	                  disabled={refreshLocked || answerLocked || !currentRandomQuestion || randomLoading}
                  title="Passer cette question"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div className="qnHeader qnHeaderEmpty" />
            )}

            {mode === "RANDOM" && quotaExceeded === "daily" ? (
              <div className="errorCard successCard">
                <div className="errorEmoji successEmoji">:D</div>
                <div className="errorTitle">Bravo !</div>
                <div className="errorMessage">Vous avez répondu à toutes vos questions aujourd'hui.</div>
                <div className="errorHint">Revenez demain ou répondez aux questionnaires disponibles</div>
              </div>
            ) : mode === "RANDOM" && quotaExceeded === "weekly" ? (
              <div className="errorCard successCard">
                <div className="errorEmoji successEmoji">:D</div>
                <div className="errorTitle">Bravo !</div>
                <div className="errorMessage">Vous avez répondu à toutes vos questions cette semaine.</div>
                <div className="errorHint">Revenez la semaine prochaine ou répondez aux questionnaires disponibles</div>
              </div>
            ) : mode === "RANDOM" && noQuestionsAvailable ? (
              <div className="errorCard">
                <div className="errorEmoji">:(</div>
                <div className="errorTitle">Plus de questions disponibles</div>
                <div className="errorMessage">
                  Il n'y a plus de questions aléatoires disponibles pour le moment.<br />
                  Nos équipes travaillent à en ajouter de nouvelles !
                </div>
                <div className="errorHint">Vous pouvez répondre aux questionnaires disponibles en attendant.</div>
              </div>
            ) : (
              mode === "RANDOM" && !currentRandomQuestion ? (
                <div className="errorCard loadingCard" aria-live="polite">
                  <div className="loadingSpinnerBig" aria-hidden="true" />
                  <div className="errorTitle">Chargement des questions aléatoires…</div>
                  <div className="errorMessage">On prépare déjà vos prochaines questions.</div>
                  <div className="errorHint">Merci de patienter un instant.</div>
                </div>
              ) : mode === "QUESTIONNAIRE" && !currentQuestion ? (
                qnFinalizeError && !validatingQuestionnaire ? (
                  <div className="errorCard" aria-live="polite">
                    <div className="errorEmoji">:(</div>
                    <div className="errorTitle">Validation impossible</div>
                    <div className="errorMessage">{qnFinalizeError}</div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center", paddingTop: 10 }}>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        onClick={() => finalizeQuestionnaireFlow(String(currentQuestionnaireId || "").trim())}
                        disabled={!currentQuestionnaireId || savingAnswer || validatingQuestionnaire}
                      >
                        Réessayer
                      </button>
                      <button
                        className="btn btnGhost"
                        type="button"
                        onClick={() => {
                          // Let the user leave without losing the local backup.
                          setMode("RANDOM");
                          setCurrentQuestionnaireId(null);
                          setCurrentQuestionId(null);
                          setQnIndex(0);
                          setMissingQuestions([]);
                          setQnFinalizeError("");
                        }}
                        disabled={savingAnswer || validatingQuestionnaire}
                      >
                        Retour aux questions
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="errorCard loadingCard" aria-live="polite">
                    <div className="loadingSpinnerBig" aria-hidden="true" />
                    <div className="errorTitle">Finalisation du questionnaire…</div>
                    <div className="errorMessage">On vérifie et on sauvegarde vos réponses.</div>
                    <div className="errorHint">Merci de patienter un instant.</div>
                  </div>
                )
              ) : (
                <>
                  <QuestionCard
                    question={mode === "RANDOM" ? currentRandomQuestion : currentQuestion}
                    mode={mode}
                    onRefreshRandom={null}
                    onSubmitAnswer={recordAnswerAndAdvance}
                    interactionLocked={answerLocked || savingAnswer || validatingQuestionnaire}
                  />
                </>
              )
            )}

            {qnOverlayKind && mode === "QUESTIONNAIRE" ? (
              <div
                className={`skipOverlay ${qnOverlayKind === "VALIDATING" ? "skipOverlay--amber" : ""}`}
                aria-hidden="true"
              >
                <div className="skipConfetti" aria-hidden="true">
                  {(qnOverlayConfetti || []).map((p, i) => (
                    <span
                      key={i}
                      style={{
                        "--x": `${p.x}px`,
                        "--y": `${p.y}px`,
                        "--rot": `${p.rot}deg`,
                        "--delay": `${p.delay}ms`,
                        "--dur": `${p.dur}ms`,
                        "--scale": p.scale,
                      }}
                    />
                  ))}
                </div>

                <div className="skipOverlayInner">
                  <div className="skipBadge" aria-hidden="true">
                    {qnOverlayKind === "VALIDATING" ? (
                      <svg className="skipOverlayIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                      </svg>
                    ) : (
                      <svg className="skipOverlayIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                  <div className="skipOverlayText">{qnOverlayKind === "VALIDATING" ? "Validation en cours" : "Réponse validée"}</div>
                  {qnOverlaySub ? <div className="skipOverlaySub">{qnOverlaySub}</div> : null}
                </div>
              </div>
            ) : null}
{transitionKind && mode === "RANDOM" ? (
  <div
    className={`skipOverlay ${
      transitionKind === "VALIDATE" ? "skipOverlay--ok" : "skipOverlay--skip"
    }`}
    aria-hidden="true"
  >
    <div className="skipConfetti" aria-hidden="true">
      {(transitionConfetti || []).map((p, i) => (
        <span
          key={i}
          style={{
            "--x": `${p.x}px`,
            "--y": `${p.y}px`,
            "--rot": `${p.rot}deg`,
            "--delay": `${p.delay}ms`,
            "--dur": `${p.dur}ms`,
            "--scale": p.scale,
          }}
        />
      ))}
    </div>

    <div className="skipOverlayInner">
      <div className="skipBadge" aria-hidden="true">
        {transitionKind === "VALIDATE" ? (
          <svg className="skipOverlayIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg className="skipOverlayIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        )}
      </div>
      <div className="skipOverlayText">{transitionKind === "VALIDATE" ? "Réponse validée" : "Question passée"}</div>
      {!currentRandomQuestion ? <div className="skipOverlaySub">Chargement…</div> : null}
    </div>
  </div>
) : null}


            {mode === "RANDOM" && limitMsg ? (
              <div className="limitNotice">{limitMsg}</div>
            ) : null}

            {limitMsg ? <div className="limitMsg">{limitMsg}</div> : null}

            {qnFinished ? (
              <div className="qnDoneOverlay" aria-live="polite">
                <div className="qnDoneConfetti" aria-hidden="true">
                  {qnDoneConfetti.map((p, i) => (
                    <span
                      key={i}
                      style={{
                        "--x": `${p.x}px`,
                        "--y": `${p.y}px`,
                        "--rot": `${p.rot}deg`,
                        "--delay": `${p.delay}ms`,
                        "--dur": `${p.dur}ms`,
                        "--scale": p.scale,
                      }}
                    />
                  ))}
                </div>
                <div className="qnDoneInner">
                  <div className="qnDoneEmoji">🎉</div>
                  <div className="qnDoneText">Questionnaire validé</div>
                  <div className="qnDoneSub">Cagnotte mise à jour !</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {codePrompt ? (
        <Modal title="Accès au questionnaire privé" onClose={() => setCodePrompt(null)}>
          <p className="muted">Ce questionnaire est privé. Entrez le code pour y accéder.</p>
          <PrivateCodeForm
            error={codePrompt.error}
            onCancel={() => setCodePrompt(null)}
            onValidate={validatePrivateCode}
          />
        </Modal>
      ) : null}

      {profileOpen && profileDraft ? (
        <Modal title="Mon compte" onClose={() => setProfileOpen(false)}>
          <div className="profileModal">
            <div className="profileSection">
              <div className="profileSectionTitle">Compte</div>
              <div className="profileGrid">
                <ProfileField label="Prénom" value={profileDraft.prenom || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, prenom: v }))} />
                <ProfileField label="Nom" value={profileDraft.nom || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, nom: v }))} />
                <ProfileField label="Téléphone" value={profileDraft.telephone || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, telephone: v }))} />
                <ProfileField label="Date de naissance" value={profileDraft.dateNaissance || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, dateNaissance: v }))} />
                <ProfileField label="Numéro de compte" value={profileDraft.compteBancaire || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, compteBancaire: v }))} />
                <ProfileField label="Numéro de citoyen" value={profileDraft.numeroCitoyen || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, numeroCitoyen: v }))} />
                <ProfileField label="Mot de passe" value={profileDraft.motDePasse || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, motDePasse: v }))} />

                <div className="profileField" style={{ gridColumn: "1 / -1" }}>
                  <div className="profileLabel">Photo de profil (URL ou base64)</div>
                  <div className="profileRow">
                    <input
                      className="input"
                      value={profileDraft.photoProfil || ""}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, photoProfil: e.target.value }))}
                      placeholder="https://..."
                    />
                    <button className="btn btnGhost" type="button" onClick={() => setProfilePhotoModal(true)}>
                      Changer la photo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="profileSection">
              <div className="profileSectionTitle">Infos</div>
              <div className="profileGrid">
                <ProfileSelect label="Sexe" value={profileDraft.sexe || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, sexe: v }))} options={["Homme", "Femme", "Neutre"]} />
                <ProfileSelect label="Couleur de peau" value={profileDraft.couleurPeau || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, couleurPeau: v }))} options={["Claire", "Métisse", "Foncé", "Asiatique"]} />
                <ProfileSelect label="Couleur de cheveux" value={profileDraft.couleurCheveux || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, couleurCheveux: v }))} options={["Noir", "Chatain", "Blond", "Roux", "Gris", "Blanc", "Bleu", "Vert", "Jaune", "Rose", "Autre"]} />
                <ProfileSelect label="Longueur de cheveux" value={profileDraft.longueurCheveux || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, longueurCheveux: v }))} options={["Fantaisie", "Long", "Crépu", "Mi-long", "Court", "Tressé", "Chauve"]} />
                <ProfileSelect label="Style vestimentaire" value={profileDraft.styleVestimentaire || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, styleVestimentaire: v }))} options={["Corpo", "Chic", "Kikoo", "Street", "Schlag", "Neutre", "Sport", "Futuriste", "Fantaisie"]} />
                <ProfileSelect label="Métier" value={profileDraft.metier || ""} onChange={(v) => setProfileDraft((p) => ({ ...p, metier: v }))} options={[
                  "((Sans Emploi))",
                  "(A mon compte)",
                  "AGENT IMMOBILIER",
                  "APEX NIGHTCLUB",
                  "ARAKOSHI",
                  "ATELIS",
                  "AZUL PAWNSHOP",
                  "BNI",
                  "CASINO EMPIRE",
                  "CERBERUS",
                  "CHATEAU D'AMOUR",
                  "CLUB 77",
                  "COIFFEUR",
                  "DARNEL",
                  "EREBOS",
                  "FIVE STAR RECORD",
                  "GOUVERNEMENT",
                  "HOPITAL (Mordechai)",
                  "HOPITAL (Nova Life)",
                  "HOPITAL (publique)",
                  "LA HAUTE",
                  "LE CERCLE",
                  "LIFEINVADER",
                  "LSPD POLICE DEP",
                  "LTD LOTUS QUARTER",
                  "LTD VERDANT",
                  "LUCHETTI'S",
                  "LUXXX CLUB",
                  "MAZZARI MOTORS",
                  "MIDNIGHT CLUB",
                  "MLAD & KO",
                  "POMPIER (LSFD)",
                  "PREMIUM DELUXE MOTORSPORT",
                  "SECRET SERVICE",
                  "SIA",
                  "TATOUEUR",
                  "TRIAD RECORD",
                  "WEAZEL NEWS",
                  "WESTBROOK MOTORSPORT",
                  "WESTBROOK SECURITY",
                  "((Autre))",
                ]} />
              </div>
            </div>

            <div className="profileFooter">
              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  setAuthToken("");
                  clearSavedCredentials();
                  nav("/login", { replace: true });
                }}
              >
                Se déconnecter
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btnGhost" type="button" disabled={profileSaving} onClick={() => setProfileOpen(false)}>
                Retour
              </button>
              <button
                className="btn btnPrimary"
                type="button"
                disabled={profileSaving}
                onClick={async () => {
                  try {
                    setProfileSaving(true);
                    // Re-use the SAME update strategy as the admin page:
                    // send a full user payload to /api/admin/users/:id.
                    // This avoids any accidental wipe from partial/undefined fields.
                    if (!user) throw new Error("no user");

                    const base = user || {};
                    const draft = profileDraft || {};
                    const keys = [
                      "prenom",
                      "nom",
                      "telephone",
                      "dateNaissance",
                      "compteBancaire",
                      "motDePasse",
                      "photoProfil",
                      "numeroCitoyen",
                      "sexe",
                      "couleurPeau",
                      "couleurCheveux",
                      "longueurCheveux",
                      "styleVestimentaire",
                      "metier",
                    ];

                    const core = new Set(["prenom", "nom", "telephone", "dateNaissance", "compteBancaire", "motDePasse"]);
                    const payload = { ...base };
                    keys.forEach((k) => {
                      const v = draft[k];
                      if (v === undefined || v === null) return;
                      if (core.has(k) && typeof v === "string" && v.trim() === "") return; // never wipe required fields
                      payload[k] = v;
                    });

                    const r = await adminUpdateUser(user.id, payload);
                    if (r && r.ok) {
                      // refresh session user from /auth/me so UI state stays consistent
                      const me = await authMe();
                      if (me && me.ok) {
                        setUser(me.user);
                        setPending(Number(me.pending || 0));
                        setProfileDraft({ ...me.user });
                      } else {
                        setUser(r.user);
                        setProfileDraft({ ...r.user });
                      }
                      setProfileOpen(false);
                    }
                  } catch (e) {
                    notifyError("Sauvegarde impossible");
                  } finally {
                    setProfileSaving(false);
                  }
                }}
              >
                {profileSaving ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {profilePhotoModal ? (
        <Modal title="Photo de profil" onClose={() => setProfilePhotoModal(false)}>
          <div className="field">
            <div className="label">Upload</div>
            <input
              className="input"
              style={{ padding: 10 }}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setProfilePhotoUpload(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setProfilePhotoUrl("");
              }}
            />
          </div>
          <div className="field">
            <div className="label">Ou lien (URL)</div>
            <input
              className="input"
              value={profilePhotoUrl}
              onChange={(e) => {
                setProfilePhotoUrl(e.target.value);
                if (e.target.value) setProfilePhotoUpload(null);
              }}
              placeholder="https://..."
            />
          </div>
          <div className="rowBtns" style={{ marginTop: 14 }}>
            <button className="btn btnGhost" type="button" onClick={() => setProfilePhotoModal(false)}>
              Annuler
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={async () => {
                try {
                  let next = (profilePhotoUrl || "").trim();
                  if (profilePhotoUpload) {
                    const photoData = await fileToDataUrl(profilePhotoUpload);
                    // Redimensionner l'image à max 500px de hauteur
                    next = await resizeImage(photoData, 500);
                  }
                  setProfileDraft((p) => ({ ...p, photoProfil: next }));
                } catch (e) {
                  console.error('Error processing profile photo:', e);
                } finally {
                  setProfilePhotoModal(false);
                }
              }}
            >
              Valider
            </button>
          </div>
        </Modal>
      ) : null}

      {previewQnId ? (
        <Modal title="Aperçu du questionnaire" onClose={() => setPreviewQnId(null)}>
          <PreviewQuestionnaire db={db} questionnaireId={previewQnId} />
          <div style={{ marginTop: 20, textAlign: "right" }}>
            <button className="btn btnPrimary" onClick={() => setPreviewQnId(null)} type="button">
              Fermer
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function ProfileField({ label, value, onChange }) {
  const onlyDigits = (v) => String(v || "").replace(/\D+/g, "");
  const toDateInputValue = (v) => {
    const s = String(v || "").trim();
    if (!s) return "";
    // Already ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...)
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    // Legacy FR format DD/MM/YYYY
    const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
    return "";
  };

  const isDigitsOnly = label === "Téléphone" || label === "Numéro de compte" || label === "Numéro de citoyen";
  const isBirthDate = label === "Date de naissance";

  return (
    <div className="profileField">
      <div className="profileLabel">{label}</div>
      <input
        className="input"
        type={isBirthDate ? "date" : "text"}
        value={isBirthDate ? toDateInputValue(value) : (isDigitsOnly ? onlyDigits(value) : value)}
        onChange={(e) => {
          const next = e.target.value;
          if (isDigitsOnly) onChange(onlyDigits(next));
          else onChange(next);
        }}
        inputMode={isDigitsOnly ? "numeric" : undefined}
        pattern={isDigitsOnly ? "[0-9]*" : undefined}
      />
    </div>
  );
}

function ProfileSelect({ label, value, onChange, options }) {
  return (
    <div className="profileField">
      <div className="profileLabel">{label}</div>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(options || []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function PrivateCodeForm({ onValidate, onCancel, error }) {
  const [code, setCode] = useState("");
  return (
    <div>
      <div className="field">
        <div className="label">Code</div>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex: LSPD" />
        {error ? <div className="errorText">{error}</div> : null}
      </div>
      <div className="rowBtns">
        <button className="btn btnGhost" onClick={onCancel} type="button">Annuler</button>
        <button className="btn btnPrimary" onClick={() => onValidate(code)} type="button">Valider</button>
      </div>
    </div>
  );
}

function PreviewQuestionnaire({ db, questionnaireId }) {
  const questionnaire = useMemo(() => {
    if (!db || !questionnaireId) return null;
    return (db.questionnaires || []).find((q) => q.id === questionnaireId);
  }, [db, questionnaireId]);

  const questions = useMemo(() => {
    if (!db || !questionnaire) return [];
    
    if (questionnaire.questionOrder && questionnaire.questionOrder.length > 0) {
      const questionsMap = new Map();
      (db.questions || []).forEach(q => {
        if (q.questionnaire === questionnaire.id) {
          questionsMap.set(q.id, q);
        }
      });
      
      return questionnaire.questionOrder
        .map(id => questionsMap.get(id))
        .filter(Boolean);
    }
    
    return (db.questions || []).filter((q) => q.questionnaire === questionnaire.id);
  }, [db, questionnaire]);

  if (!questionnaire) {
    return <div className="muted">Questionnaire introuvable</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          {questionnaire.name}
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {questions.length} question{questions.length > 1 ? 's' : ''} • Récompense : $ {Number(questionnaire.reward || 0).toFixed(2)}
        </div>
      </div>

      <div style={{ 
        maxHeight: 400, 
        overflowY: 'auto', 
        padding: 12, 
        background: 'rgba(0,0,0,0.1)', 
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {questions.length === 0 ? (
          <div className="muted">Aucune question dans ce questionnaire</div>
        ) : (
          questions.map((q, idx) => (
            <div 
              key={q.id} 
              style={{ 
                padding: 12, 
                marginBottom: 8, 
                background: 'rgba(255,255,255,0.05)', 
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {idx + 1}. {q.title || "Sans titre"}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                Type : {q.type || "FREE_TEXT"}
                {q.choices && q.choices.length > 0 ? ` • ${q.choices.length} choix` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/admin.css";
import LogoHeader from "../ui/LogoHeader";
import Tabs from "../ui/Tabs";
import { loadDB, updateDB, saveDB, adminListPayments } from "../data/storage";
import AdminQuestionnaire from "../ui/admin/AdminQuestionnaire";
import AdminQuestions from "../ui/admin/AdminQuestions";
import AdminTags from "../ui/admin/AdminTags";
import AdminUsers from "../ui/admin/AdminUsers";
import AdminPayments from "../ui/admin/AdminPayments";
import AdminSearch from "../ui/admin/AdminSearch";
import AdminStatistics from "../ui/admin/AdminStatistics";
import AdminSettings from "../ui/admin/AdminSettings";
import { notifyError } from "../ui/notify";

export default function AdminPage() {
  const [db, setDb] = useState(null);
  const [dbError, setDbError] = useState("");
  const [paymentCount, setPaymentCount] = useState(0);
  const saveSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const run = async () => {
      tries += 1;
      try {
        const r = await loadDB();
        if (cancelled) return;
        setDb(r);
        setDbError("");
      } catch (e) {
        if (cancelled) return;
        // Retry silently first (server boot / restart).
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

  // Keep payment badge count up to date
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const r = await adminListPayments();
        if (!cancelled) setPaymentCount((r.payments || []).length);
      } catch {
        // ignore
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const [topTab, setTopTab] = useState("Questionnaire");
  const [subTab, setSubTab] = useState("Questionnaire");

  const topTabs = useMemo(
    () => {
      const payLabel = paymentCount > 0 ? `Payments (${paymentCount})` : "Payments";
      return [
        { id: "Utilisateur", label: "Utilisateur", wip: false },
        { id: "Recherche", label: "Recherche", wip: false },
        { id: "Questionnaire", label: "Questionnaire", wip: false },
        { id: "Payment", label: payLabel, wip: false },
        { id: "Statistique", label: "Statistique", wip: false },
        { id: "Paramètres", label: "Paramètres", wip: false },
      ];
    },
    [paymentCount]
  );

  const subTabs = useMemo(
    () => [
      { id: "Questionnaire", label: "Questionnaires" },
      { id: "Question individuel", label: "Question individuel" },
      { id: "Tags", label: "Tags" },
    ],
    []
  );

  const onDBChange = (updater) => {
    if (!db) return;

    // 1) Optimistic UI update (instant)
    const next = updateDB(db, updater);
    setDb(next);

    // 2) Persist, then apply the PUT response as the single source of truth.
    // This avoids the "1 seconde puis ça disparaît" caused by read-after-write
    // returning stale data (cache / réplication Netlify).
    const seq = ++saveSeqRef.current;
    saveDB(next)
      .then((saved) => {
        // Ignore out-of-order responses
        if (saveSeqRef.current !== seq) return;
        setDb(saved);
      })
      .catch((e) => {
        console.error(e);
        notifyError("Échec de l'enregistrement. Recharge la page et réessaie.");
      });
  };

  if (!db) {
  return (
    <div className="adminRoot">
      <LogoHeader />
      <div className="adminBody">
        <div className="glass adminPanel" style={{ maxWidth: 820, margin: "0 auto" }}>
          <div className="adminContent" style={{ padding: 0 }}>
            <div className="serverLoading" style={{ margin: 0 }}>
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
                <div className="serverLoadingHint">Initialisation de l&apos;interface d&apos;administration…</div>
              ) : null}

              <div style={{ padding: 18, paddingTop: 14 }}>
                <button className="btn btnPrimary" type="button" onClick={() => window.location.reload()}>
                  Réessayer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

  return (
    <div className="adminRoot">
      <LogoHeader />

      <div className="adminTop">
        <div className="adminTopTabsWrap glass">
          <Tabs
            items={topTabs}
            activeId={topTab}
            onChange={(id) => setTopTab(id)}
            variant="top"
          />
        </div>
      </div>

      <div className="adminBody">
        {topTab === "Utilisateur" ? (
          <div className="glass adminPanel">
            <div className="adminContent">
              <AdminUsers />
            </div>
          </div>
        ) : topTab === "Recherche" ? (
          <div className="glass adminPanel">
            <div className="adminContent">
              <AdminSearch />
            </div>
          </div>
        ) : topTab === "Payment" ? (
          <div className="glass adminPanel">
            <div className="adminContent">
              <AdminPayments onCountChange={setPaymentCount} />
            </div>
          </div>
        ) : topTab === "Statistique" ? (
          <div className="glass adminPanel">
            <div className="adminContent">
              <AdminStatistics />
            </div>
          </div>
        ) : topTab === "Paramètres" ? (
          <div className="glass adminPanel">
            <div className="adminContent">
              <AdminSettings />
            </div>
          </div>
        ) : topTab !== "Questionnaire" ? (
          <div className="glass adminWip">
            <div className="adminWipTitle">{topTab}</div>
            <p className="muted">WIP — UI only</p>
          </div>
        ) : (
          <div className="glass adminPanel">
            <div className="adminSubTabs">
              <Tabs items={subTabs} activeId={subTab} onChange={setSubTab} variant="sub" />
            </div>

            <div className="adminContent">
              {subTab === "Questionnaire" ? <AdminQuestionnaire db={db} onDBChange={onDBChange} /> : null}
              {subTab === "Question individuel" ? <AdminQuestions db={db} onDBChange={onDBChange} /> : null}
              {subTab === "Tags" ? <AdminTags db={db} onDBChange={onDBChange} /> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

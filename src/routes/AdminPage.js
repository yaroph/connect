import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/admin.css";
import LogoHeader from "../ui/LogoHeader";
import Tabs from "../ui/Tabs";
import CyberBackground from "../ui/CyberBackground";
import CyberLoader from "../ui/CyberLoader";
import {
  Users,
  Search,
  FileText,
  CreditCard,
  BarChart3,
  Settings,
  Layers,
  HelpCircle,
  Tag,
} from "lucide-react";
import {
  loadDB,
  updateDB,
  saveDB,
  adminListPayments,
  clearDBCache,
} from "../data/storage";
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
        const msg =
          "Impossible de charger la base de données. Vérifiez que le serveur est bien lancé.";
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
    return () => {
      cancelled = true;
    };
  }, []);

  const [topTab, setTopTab] = useState("Utilisateur");
  const [subTab, setSubTab] = useState("Questionnaire");

  // Refresh data when switching top-level tabs
  useEffect(() => {
    clearDBCache();

    let cancelled = false;
    loadDB({ force: true })
      .then((r) => {
        if (!cancelled && r) setDb(r);
      })
      .catch(() => {});

    adminListPayments()
      .then((r) => {
        if (!cancelled) setPaymentCount((r.payments || []).length);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [topTab]);

  const topTabs = useMemo(() => {
    return [
      { id: "Utilisateur", label: "Utilisateurs", icon: <Users size={16} />, wip: false },
      { id: "Recherche", label: "Recherche", icon: <Search size={16} />, wip: false },
      { id: "Questionnaire", label: "Questionnaires", icon: <FileText size={16} />, wip: false },
      { id: "Payment", label: "Paiements", icon: <CreditCard size={16} />, badge: paymentCount, wip: false },
      { id: "Statistique", label: "Statistiques", icon: <BarChart3 size={16} />, wip: false },
      { id: "Paramètres", label: "Paramètres", icon: <Settings size={16} />, wip: false },
    ];
  }, [paymentCount]);

  const subTabs = useMemo(
    () => [
      { id: "Questionnaire", label: "Questionnaires", icon: <Layers size={14} /> },
      { id: "Question individuel", label: "Questions individuelles", icon: <HelpCircle size={14} /> },
      { id: "Tags", label: "Tags & Métadonnées", icon: <Tag size={14} /> },
    ],
    [],
  );

  const onDBChange = (updater) => {
    if (!db) return;

    const next = updateDB(db, updater);
    setDb(next);

    const seq = ++saveSeqRef.current;
    saveDB(next)
      .then((saved) => {
        if (saveSeqRef.current !== seq) return;
        setDb(saved);
      })
      .catch((e) => {
        console.error(e);
        notifyError("Échec de l'enregistrement. Rechargez la page.");
      });
  };

  if (!db) {
    if (dbError) {
      return (
        <div className="adminRoot">
          <LogoHeader />
          <div className="adminBody">
            <div className="adminPanel cyberHudPanel" style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
              <div className="adminTitle" style={{ color: "#ef4444", marginBottom: 12 }}>
                Erreur de chargement
              </div>
              <div className="adminSub" style={{ marginBottom: 20 }}>
                {dbError}
              </div>
              <button
                className="btn btnPrimary"
                type="button"
                onClick={() => window.location.reload()}
              >
                Réessayer
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <CyberLoader message="INITIALISATION DU PANEL ADMINISTRATEUR BNI…" />;
  }

  return (
    <div className="adminRoot">
      <CyberBackground />
      <LogoHeader />

      <div className="adminTop">
        <div className="adminTopTabsWrap cyberHudNav">
          <Tabs
            items={topTabs}
            activeId={topTab}
            onChange={(id) => setTopTab(id)}
            variant="top"
          />
        </div>
      </div>

      <div className="adminBody">
        <div className="adminPanel cyberHudPanel">
          <div className="hudBracket hudBracketTL" />
          <div className="hudBracket hudBracketTR" />
          <div className="hudBracket hudBracketBL" />
          <div className="hudBracket hudBracketBR" />

          {topTab === "Utilisateur" ? (
            <div className="adminContent">
              <AdminUsers />
            </div>
          ) : topTab === "Recherche" ? (
            <div className="adminContent">
              <AdminSearch />
            </div>
          ) : topTab === "Payment" ? (
            <div className="adminContent">
              <AdminPayments onCountChange={setPaymentCount} />
            </div>
          ) : topTab === "Statistique" ? (
            <div className="adminContent">
              <AdminStatistics />
            </div>
          ) : topTab === "Paramètres" ? (
            <div className="adminContent">
              <AdminSettings />
            </div>
          ) : (
            <>
              <div className="adminSubTabs">
                <Tabs
                  items={subTabs}
                  activeId={subTab}
                  onChange={setSubTab}
                  variant="sub"
                />
              </div>

              <div className="adminContent">
                {subTab === "Questionnaire" ? (
                  <AdminQuestionnaire db={db} onDBChange={onDBChange} />
                ) : null}
                {subTab === "Question individuel" ? (
                  <AdminQuestions db={db} onDBChange={onDBChange} />
                ) : null}
                {subTab === "Tags" ? (
                  <AdminTags db={db} onDBChange={onDBChange} />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState, useRef } from "react";
import { notifyError } from "../notify";
import { adminGetStatistics, adminListUsers, loadDB } from "../../data/storage";
import {
  Users,
  DollarSign,
  Wallet,
  HelpCircle,
  CheckCircle2,
  UserPlus,
  LogIn,
  Trophy,
  TrendingUp,
  Award,
  Layers,
} from "lucide-react";
import "./adminStatistics.css";

function initials(u) {
  const a = (u?.prenom || "")[0] || "?";
  const b = (u?.nom || "")[0] || "";
  return `${String(a).toUpperCase()}${String(b).toUpperCase()}`;
}

export default function AdminStatistics() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [dbData, setDbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState("randomAnswers");
  const lineChartRef = useRef(null);
  const lineChartInstance = useRef(null);
  const sexeRef = useRef(null);
  const couleurPeauRef = useRef(null);
  const couleurCheveuxRef = useRef(null);
  const longueurCheveuxRef = useRef(null);
  const styleVestimentaireRef = useRef(null);
  const metierRef = useRef(null);

  const chartRefs = useMemo(
    () => ({
      sexe: sexeRef,
      couleurPeau: couleurPeauRef,
      couleurCheveux: couleurCheveuxRef,
      longueurCheveux: longueurCheveuxRef,
      styleVestimentaire: styleVestimentaireRef,
      metier: metierRef,
    }),
    [
      sexeRef,
      couleurPeauRef,
      couleurCheveuxRef,
      longueurCheveuxRef,
      styleVestimentaireRef,
      metierRef,
    ],
  );
  const chartInstances = useRef({});

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      try {
        const [statsRes, usersRes, dbRes] = await Promise.all([
          adminGetStatistics(),
          adminListUsers().catch(() => ({ users: [] })),
          loadDB().catch(() => null),
        ]);
        if (!cancelled) {
          setStats(statsRes.statistics);
          setUsers(usersRes.users || []);
          setDbData(dbRes);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Erreur lors du chargement des statistiques:", e);
          notifyError("Impossible de charger les statistiques");
          setLoading(false);
        }
      }
    };
    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // Extra computed insights
  const extraStats = useMemo(() => {
    if (!users || users.length === 0) return null;

    const totalEarned = users.reduce((acc, u) => acc + Number(u.gagneSurBNI || 0), 0);
    const totalPending = users.reduce((acc, u) => acc + Number(u.pending || 0), 0);
    const avgEarned = totalEarned / (users.length || 1);

    const sortedByEarned = [...users].sort(
      (a, b) => Number(b.gagneSurBNI || 0) - Number(a.gagneSurBNI || 0),
    );

    const top5Earners = sortedByEarned.slice(0, 5);
    const maxEarned = Number(sortedByEarned[0]?.gagneSurBNI || 0);

    const totalQuestions = (dbData?.questions || []).length;
    const totalQuestionnaires = (dbData?.questionnaires || []).length;
    const totalTags = (dbData?.tags || []).length;

    return {
      totalEarned,
      totalPending,
      avgEarned,
      maxEarned,
      top5Earners,
      totalQuestions,
      totalQuestionnaires,
      totalTags,
    };
  }, [users, dbData]);

  // Chart.js line chart for 7-day evolution
  useEffect(() => {
    if (!stats || !stats.last7Days) return;

    const loadChartJS = async () => {
      if (window.Chart) return;
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      script.async = true;
      return new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    loadChartJS()
      .then(() => {
        if (lineChartInstance.current) {
          lineChartInstance.current.destroy();
        }

        const canvas = lineChartRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        const metricData = {
          randomAnswers: {
            label: "Réponses aléatoires",
            data: stats.last7Days.randomAnswers,
            color: "#00f0ff",
            bgColor: "rgba(0, 240, 255, 0.15)",
          },
          questionnairesCompleted: {
            label: "Questionnaires complétés",
            data: stats.last7Days.questionnairesCompleted,
            color: "#10b981",
            bgColor: "rgba(16, 185, 129, 0.15)",
          },
          inscriptions: {
            label: "Inscriptions",
            data: stats.last7Days.inscriptions,
            color: "#ffd600",
            bgColor: "rgba(255, 214, 0, 0.15)",
          },
          connexions: {
            label: "Connexions",
            data: stats.last7Days.connexions,
            color: "#a855f7",
            bgColor: "rgba(168, 85, 247, 0.15)",
          },
        };

        const selectedData = metricData[selectedMetric];
        const labels = stats.last7Days.dates.map((dateStr) => {
          const parts = dateStr.split("-");
          return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : dateStr;
        });

        lineChartInstance.current = new window.Chart(ctx, {
          type: "line",
          data: {
            labels: labels,
            datasets: [
              {
                label: selectedData.label,
                data: selectedData.data,
                borderColor: selectedData.color,
                backgroundColor: selectedData.bgColor,
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: selectedData.color,
                pointBorderColor: "#fff",
                pointHoverRadius: 6,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: {
                  color: "#f8fafc",
                  font: { weight: "bold", size: 12 },
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { color: "#94a3b8" },
                grid: { color: "rgba(255, 255, 255, 0.06)" },
              },
              x: {
                ticks: { color: "#94a3b8" },
                grid: { color: "rgba(255, 255, 255, 0.06)" },
              },
            },
          },
        });
      })
      .catch((err) => {
        console.error("Erreur lors du chargement de Chart.js:", err);
      });

    return () => {
      if (lineChartInstance.current) lineChartInstance.current.destroy();
    };
  }, [stats, selectedMetric]);

  // Demographic Charts
  useEffect(() => {
    if (!stats || !stats.userStats) return;

    const loadChartJS = async () => {
      if (window.Chart) return;
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      script.async = true;
      return new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    loadChartJS()
      .then(() => {
        Object.values(chartInstances.current).forEach((chart) => {
          if (chart) chart.destroy();
        });
        chartInstances.current = {};

        const colors = [
          "rgba(0, 240, 255, 0.8)",
          "rgba(16, 185, 129, 0.8)",
          "rgba(255, 214, 0, 0.8)",
          "rgba(168, 85, 247, 0.8)",
          "rgba(239, 68, 68, 0.8)",
          "rgba(56, 189, 248, 0.8)",
        ];

        Object.keys(chartRefs).forEach((category, index) => {
          const canvas = chartRefs[category].current;
          if (!canvas) return;

          const data = stats.userStats[category];
          if (!data || Object.keys(data).length === 0) return;

          const labels = Object.keys(data);
          const values = Object.values(data);

          const ctx = canvas.getContext("2d");
          chartInstances.current[category] = new window.Chart(ctx, {
            type: index % 2 === 0 ? "pie" : "bar",
            data: {
              labels: labels,
              datasets: [
                {
                  label: category,
                  data: values,
                  backgroundColor: colors.slice(0, labels.length),
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.15)",
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { color: "#94a3b8", font: { size: 11 } },
                },
                title: {
                  display: true,
                  text: category.charAt(0).toUpperCase() + category.slice(1),
                  color: "#f8fafc",
                  font: { size: 14, weight: "bold" },
                },
              },
              ...(index % 2 !== 0 && {
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { color: "#94a3b8" },
                    grid: { color: "rgba(255, 255, 255, 0.06)" },
                  },
                  x: {
                    ticks: { color: "#94a3b8" },
                    grid: { color: "rgba(255, 255, 255, 0.06)" },
                  },
                },
              }),
            },
          });
        });
      })
      .catch((err) => {
        console.error("Erreur lors du chargement de Chart.js:", err);
      });

    return () => {
      Object.values(chartInstances.current).forEach((chart) => {
        if (chart) chart.destroy();
      });
    };
  }, [stats, chartRefs]);

  if (loading) {
    return (
      <div className="adminStatsLoading">
        <div className="spinner"></div>
        <p>Chargement du centre d'analyses statistiques…</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="adminStatsError">
        <p>Impossible de charger les statistiques</p>
      </div>
    );
  }

  return (
    <div className="adminStatsContainer">
      <div className="adminHeaderRow">
        <div>
          <div className="adminTitle">Statistiques & Métriques Globales</div>
          <div className="adminSub">
            Analyses financières, démographiques et activité en temps réel du serveur
          </div>
        </div>
      </div>

      {/* Cartes Principales Économie & Population */}
      <div className="statsMainCardsGrid">
        <div className="statsMainCard">
          <div className="statsCardIcon cyan"><Users size={24} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Total Citoyens Inscrits</div>
            <div className="statsCardValue">{stats.totalUsers || users.length || 0}</div>
          </div>
        </div>

        <div className="statsMainCard">
          <div className="statsCardIcon emerald"><DollarSign size={24} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Total Distribué aux Joueurs</div>
            <div className="statsCardValue emerald">
              $ {Number(extraStats?.totalEarned || stats.totalGagneSurBNI || 0).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="statsMainCard">
          <div className="statsCardIcon gold"><Wallet size={24} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Total en Attente / Cagnottes</div>
            <div className="statsCardValue gold">
              $ {Number(extraStats?.totalPending || stats.totalCagnotte || 0).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="statsMainCard">
          <div className="statsCardIcon purple"><TrendingUp size={24} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Gain Moyen / Citoyen</div>
            <div className="statsCardValue">
              $ {Number(extraStats?.avgEarned || 0).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="statsMainCard">
          <div className="statsCardIcon amber"><Trophy size={24} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Record Gain Citoyen</div>
            <div className="statsCardValue amber">
              $ {Number(extraStats?.maxEarned || 0).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="statsMainCard">
          <div className="statsCardIcon blue"><Layers size={24} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Contenus Indexés</div>
            <div className="statsCardValue">
              {extraStats?.totalQuestions || 0} Qs • {extraStats?.totalQuestionnaires || 0} Qns
            </div>
          </div>
        </div>
      </div>

      {/* Section Leaderboard Top Citoyens */}
      {extraStats?.top5Earners && extraStats.top5Earners.length > 0 ? (
        <div className="statsLeaderboardSection">
          <div className="statsLeaderboardHeader">
            <Award size={18} className="leaderboardIcon" />
            <div className="statsLeaderboardTitle">Classement Top 5 des Citoyens Rémunérés</div>
          </div>
          <div className="statsLeaderboardGrid">
            {extraStats.top5Earners.map((u, i) => (
              <div key={u.id} className={`leaderboardCard rank${i + 1}`}>
                <div className="leaderboardRankBadge">
                  {i === 0 ? "🥇 #1" : i === 1 ? "🥈 #2" : i === 2 ? "🥉 #3" : `#${i + 1}`}
                </div>
                <div className="leaderboardAvatar">
                  {u.photoProfil ? <img alt="" src={u.photoProfil} /> : initials(u)}
                </div>
                <div className="leaderboardInfo">
                  <div className="leaderboardName">{u.prenom} {u.nom}</div>
                  <div className="leaderboardEarnings">
                    $ {Number(u.gagneSurBNI || 0).toFixed(2)} gagnés
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Section Aujourd'hui - Cartes cliquables */}
      <h3 className="adminStatsSubtitle">Activité Aujourd'hui & Évolution sur 7 jours</h3>
      <div className="statsTodayCardsGrid">
        <div
          className={`statsTodayCard ${selectedMetric === "randomAnswers" ? "active" : ""}`}
          onClick={() => setSelectedMetric("randomAnswers")}
        >
          <div className="statsCardIcon cyan"><HelpCircle size={20} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Réponses Aléatoires</div>
            <div className="statsCardValue">{stats.today?.randomAnswers || 0}</div>
          </div>
        </div>

        <div
          className={`statsTodayCard ${selectedMetric === "questionnairesCompleted" ? "active" : ""}`}
          onClick={() => setSelectedMetric("questionnairesCompleted")}
        >
          <div className="statsCardIcon emerald"><CheckCircle2 size={20} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Questionnaires Complétés</div>
            <div className="statsCardValue">{stats.today?.questionnairesCompleted || 0}</div>
          </div>
        </div>

        <div
          className={`statsTodayCard ${selectedMetric === "inscriptions" ? "active" : ""}`}
          onClick={() => setSelectedMetric("inscriptions")}
        >
          <div className="statsCardIcon gold"><UserPlus size={20} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Nouvelles Inscriptions</div>
            <div className="statsCardValue">{stats.today?.inscriptions || 0}</div>
          </div>
        </div>

        <div
          className={`statsTodayCard ${selectedMetric === "connexions" ? "active" : ""}`}
          onClick={() => setSelectedMetric("connexions")}
        >
          <div className="statsCardIcon purple"><LogIn size={20} /></div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Connexions Citoyens</div>
            <div className="statsCardValue">{stats.today?.connexions || 0}</div>
          </div>
        </div>
      </div>

      {/* Courbe d'évolution */}
      <div className="evolutionChartContainer">
        <canvas ref={lineChartRef} />
      </div>

      {/* Graphiques Démographiques */}
      <h3 className="adminStatsSubtitle">Profils & Démographie des Citoyens</h3>
      <div className="chartsGrid">
        {Object.keys(chartRefs).map((category) => {
          const data = stats.userStats?.[category];
          if (!data || Object.keys(data).length === 0) return null;

          return (
            <div key={category} className="chartCard">
              <div className="chartCardInner">
                <canvas ref={chartRefs[category]} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState, useRef } from "react";
import { notifyError } from "../notify";
import "./adminStatistics.css";

// Fonction pour récupérer les statistiques depuis l'API
async function fetchStatistics() {
  const res = await fetch("/api/admin/statistics");
  if (!res.ok) {
    throw new Error(`Erreur ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export default function AdminStatistics() {
  const [stats, setStats] = useState(null);
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

  const chartRefs = useMemo(() => ({
    sexe: sexeRef,
    couleurPeau: couleurPeauRef,
    couleurCheveux: couleurCheveuxRef,
    longueurCheveux: longueurCheveuxRef,
    styleVestimentaire: styleVestimentaireRef,
    metier: metierRef,
  }), [sexeRef, couleurPeauRef, couleurCheveuxRef, longueurCheveuxRef, styleVestimentaireRef, metierRef]);
  const chartInstances = useRef({});

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const data = await fetchStatistics();
        if (!cancelled) {
          setStats(data.statistics);
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
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  // Créer la courbe d'évolution
  useEffect(() => {
    if (!stats || !stats.last7Days) return;

    // Charger Chart.js dynamiquement
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

    loadChartJS().then(() => {
      // Détruire le graphique existant
      if (lineChartInstance.current) {
        lineChartInstance.current.destroy();
      }

      const canvas = lineChartRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      
      // Données selon la métrique sélectionnée
      const metricData = {
        randomAnswers: {
          label: "Réponses aléatoires",
          data: stats.last7Days.randomAnswers,
          color: "rgba(255, 99, 132, 1)",
          bgColor: "rgba(255, 99, 132, 0.2)"
        },
        questionnairesCompleted: {
          label: "Questionnaires complétés",
          data: stats.last7Days.questionnairesCompleted,
          color: "rgba(54, 162, 235, 1)",
          bgColor: "rgba(54, 162, 235, 0.2)"
        },
        inscriptions: {
          label: "Inscriptions",
          data: stats.last7Days.inscriptions,
          color: "rgba(75, 192, 192, 1)",
          bgColor: "rgba(75, 192, 192, 0.2)"
        },
        connexions: {
          label: "Connexions",
          data: stats.last7Days.connexions,
          color: "rgba(153, 102, 255, 1)",
          bgColor: "rgba(153, 102, 255, 0.2)"
        }
      };

      const selectedData = metricData[selectedMetric];

      // Formater les dates
      const labels = stats.last7Days.dates.map(dateStr => {
        const [, month, day] = dateStr.split('-');
        return `${day}/${month}`;
      });

      lineChartInstance.current = new window.Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: selectedData.label,
            data: selectedData.data,
            borderColor: selectedData.color,
            backgroundColor: selectedData.bgColor,
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: selectedData.color,
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: "top",
              labels: {
                color: "#fff",
                font: {
                  size: 14,
                  weight: "bold",
                },
                padding: 20,
              },
            },
            title: {
              display: true,
              text: "Évolution sur les 7 derniers jours",
              color: "#fff",
              font: {
                size: 18,
                weight: "bold",
              },
              padding: {
                top: 10,
                bottom: 20,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: "#fff",
                font: {
                  size: 12,
                },
                stepSize: 1,
              },
              grid: {
                color: "rgba(255, 255, 255, 0.1)",
              },
            },
            x: {
              ticks: {
                color: "#fff",
                font: {
                  size: 12,
                },
              },
              grid: {
                color: "rgba(255, 255, 255, 0.1)",
              },
            },
          },
        },
      });
    }).catch(err => {
      console.error("Erreur lors du chargement de Chart.js:", err);
      notifyError("Impossible de charger les graphiques");
    });

    return () => {
      if (lineChartInstance.current) {
        lineChartInstance.current.destroy();
      }
    };
  }, [stats, selectedMetric]);

  // Créer les graphiques démographiques
  useEffect(() => {
    if (!stats || !stats.userStats) return;

    // Charger Chart.js dynamiquement
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

    loadChartJS().then(() => {
      // Détruire les graphiques existants
      Object.values(chartInstances.current).forEach(chart => {
        if (chart) chart.destroy();
      });
      chartInstances.current = {};

      // Palette de couleurs
      const colors = [
        "rgba(255, 99, 132, 0.8)",
        "rgba(54, 162, 235, 0.8)",
        "rgba(255, 206, 86, 0.8)",
        "rgba(75, 192, 192, 0.8)",
        "rgba(153, 102, 255, 0.8)",
        "rgba(255, 159, 64, 0.8)",
        "rgba(199, 199, 199, 0.8)",
        "rgba(83, 102, 255, 0.8)",
        "rgba(255, 99, 255, 0.8)",
        "rgba(99, 255, 132, 0.8)",
      ];

      // Créer un graphique pour chaque catégorie
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
            datasets: [{
              label: category,
              data: values,
              backgroundColor: colors.slice(0, labels.length),
              borderColor: colors.slice(0, labels.length).map(c => c.replace("0.8", "1")),
              borderWidth: 1,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                position: "bottom",
                labels: {
                  color: "#fff",
                  font: {
                    size: 12,
                  },
                },
              },
              title: {
                display: true,
                text: category.charAt(0).toUpperCase() + category.slice(1),
                color: "#fff",
                font: {
                  size: 16,
                  weight: "bold",
                },
              },
            },
            ...(index % 2 !== 0 && {
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    color: "#fff",
                  },
                  grid: {
                    color: "rgba(255, 255, 255, 0.1)",
                  },
                },
                x: {
                  ticks: {
                    color: "#fff",
                  },
                  grid: {
                    color: "rgba(255, 255, 255, 0.1)",
                  },
                },
              },
            }),
          },
        });
      });
    }).catch(err => {
      console.error("Erreur lors du chargement de Chart.js:", err);
    });

    return () => {
      Object.values(chartInstances.current).forEach(chart => {
        if (chart) chart.destroy();
      });
    };
  }, [stats, chartRefs]);

  if (loading) {
    return (
      <div className="adminStatsContainer">
        <div className="adminStatsLoading">
          <div className="spinner"></div>
          <p>Chargement des statistiques...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="adminStatsContainer">
        <div className="adminStatsError">
          <p>Impossible de charger les statistiques</p>
        </div>
      </div>
    );
  }

  return (
    <div className="adminStatsContainer">
      <h2 className="adminStatsTitle">Statistiques du site</h2>
      
      {/* Cartes principales - 3 sur la première ligne */}
      <div className="statsMainCardsGrid">
        <div className="statsMainCard">
          <div className="statsCardIcon">👨‍👩‍👧‍👦</div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Total utilisateurs</div>
            <div className="statsCardValue">{stats.totalUsers}</div>
          </div>
        </div>

        <div className="statsMainCard">
          <div className="statsCardIcon">💰</div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Total cagnottes</div>
            <div className="statsCardValue">{stats.totalCagnotte.toFixed(2)} €</div>
          </div>
        </div>

        <div className="statsMainCard">
          <div className="statsCardIcon">💸</div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Gagné sur BNI</div>
            <div className="statsCardValue">{stats.totalGagneSurBNI.toFixed(2)} €</div>
          </div>
        </div>
      </div>

      {/* Section Aujourd'hui */}
      <h3 className="adminStatsSubtitle">Aujourd'hui</h3>
      <div className="statsTodayCardsGrid">
        <div 
          className={`statsTodayCard ${selectedMetric === 'randomAnswers' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('randomAnswers')}
        >
          <div className="statsCardIcon">🎲</div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Réponses aléatoires</div>
            <div className="statsCardValue">{stats.today.randomAnswers}</div>
          </div>
        </div>

        <div 
          className={`statsTodayCard ${selectedMetric === 'questionnairesCompleted' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('questionnairesCompleted')}
        >
          <div className="statsCardIcon">✅</div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Questionnaires complétés</div>
            <div className="statsCardValue">{stats.today.questionnairesCompleted}</div>
          </div>
        </div>

        <div 
          className={`statsTodayCard ${selectedMetric === 'inscriptions' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('inscriptions')}
        >
          <div className="statsCardIcon">👥</div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Inscriptions</div>
            <div className="statsCardValue">{stats.today.inscriptions}</div>
          </div>
        </div>

        <div 
          className={`statsTodayCard ${selectedMetric === 'connexions' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('connexions')}
        >
          <div className="statsCardIcon">🔗</div>
          <div className="statsCardContent">
            <div className="statsCardLabel">Connexions</div>
            <div className="statsCardValue">{stats.today.connexions}</div>
          </div>
        </div>
      </div>

      {/* Courbe d'évolution */}
      <div className="evolutionChartContainer">
        <canvas ref={lineChartRef} />
      </div>

      {/* Graphiques des données utilisateurs */}
      <h3 className="adminStatsSubtitle">Données démographiques des utilisateurs</h3>
      <div className="chartsGrid">
        {Object.keys(chartRefs).map((category) => {
          const data = stats.userStats[category];
          if (!data || Object.keys(data).length === 0) return null;
          
          return (
            <div key={category} className="chartCard">
              <canvas ref={chartRefs[category]} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

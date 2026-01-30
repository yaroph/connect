import React, { useEffect, useMemo, useState, useRef } from "react";
import { Download, BarChart3, PieChart, Trash2 } from "lucide-react";
import Modal from "../Modal";
import "./responses.css";
import { adminDeleteAnswer } from "../../data/storage";

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function fmtDate(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("fr-FR");
  } catch {
    return "";
  }
}

function getUserName(r, userMap) {
  const direct = String(r.userName || r.userFullName || r.user || r.name || "").trim();
  if (direct && direct !== "Utilisateur") return direct;
  const uid = String(r.userId || "").trim();
  if (uid && userMap && userMap[uid]) return userMap[uid];
  return direct || "Utilisateur";
}

function getQuestionTitle(r) {
  return String(r.questionTitle || r.title || "Question");
}

function isProbablyImageAnswer(value) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  if (s.startsWith("data:image/")) return true;
  if (s.startsWith("blob:")) return true;
  if (/^https?:\/\//i.test(s)) return true;
  return false;
}

function renderAnswer(value) {
  const s = String(value ?? "").trim();
  if (!s) return <span className="muted">—</span>;
  if (isProbablyImageAnswer(s)) {
    return (
      <a className="respImgLink" href={s} target="_blank" rel="noreferrer">
        <img className="respImgThumb" src={s} alt="" />
      </a>
    );
  }
  return <span>{s}</span>;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Extraire les mots-clés d'un texte (pour texte libre)
function extractKeywords(texts) {
  const stopWords = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'à', 'au', 'aux',
    'et', 'ou', 'mais', 'donc', 'car', 'ni', 'que', 'qui', 'quoi', 'dont',
    'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
    'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on',
    'me', 'te', 'se', 'lui', 'en', 'y', 'est', 'sont', 'a', 'ai', 'as',
    'avec', 'sans', 'pour', 'par', 'dans', 'sur', 'sous', 'vers', 'chez'
  ]);

  const wordCount = {};
  
  texts.forEach(text => {
    const words = String(text || '')
      .toLowerCase()
      .replace(/[^\wàâäéèêëïîôùûüÿæœç\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });

  // Ne garder que les mots avec au moins 2 occurrences
  return Object.entries(wordCount)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15); // Top 15 mots-clés
}

export default function ResponsesModal({ title, answers, onClose, questions = null, db = null }) {
  const [userMap, setUserMap] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" ou "chart"
  const [chartType, setChartType] = useState("pie"); // "pie" ou "bar"
  const chartRefs = useRef({});
  const chartInstances = useRef({});
  const [deletedAnswerIds, setDeletedAnswerIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const list = await fetchJSON("/api/admin/users");
        const map = {};
        for (const u of (list.users || list || [])) {
          const id = String(u.id || "");
          if (!id) continue;
          const name = String(u.fullName || `${u.prenom || ""} ${u.nom || ""}`.trim()).trim();
          if (name) map[id] = name;
        }
        if (!cancelled) setUserMap(map);
      } catch {
        // ignore
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    return (answers || [])
      .filter((a) => !deletedAnswerIds.has(a.id))
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });
  }, [answers, deletedAnswerIds]);

  const isQuestionnaire = useMemo(() => rows.some((r) => Boolean(r.questionnaireId)), [rows]);

  const byUser = useMemo(() => {
    if (!isQuestionnaire) return null;
    const map = new Map();
    for (const r of rows) {
      const name = getUserName(r, userMap);
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(r);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      map.set(k, list);
    }
    return map;
  }, [rows, isQuestionnaire, userMap]);

  // Obtenir les informations de la question
  const questionInfo = useMemo(() => {
    if (!db || !db.questions) return null;
    
    if (isQuestionnaire && questions) {
      // Pour les questionnaires, on a plusieurs questions
      return questions.map(qId => {
        const q = db.questions.find(x => x.id === qId);
        return q || null;
      }).filter(Boolean);
    } else if (rows.length > 0 && rows[0].questionId) {
      // Pour une question individuelle
      const q = db.questions.find(x => x.id === rows[0].questionId);
      return q ? [q] : null;
    }
    return null;
  }, [db, rows, isQuestionnaire, questions]);

  // Détecter si c'est un tag variable.user
  const isVariableUserTag = useMemo(() => {
    if (rows.length === 0) return false;
    // Les réponses de variable.user n'ont pas de questionId mais ont des données utilisateur
    return rows.some(r => !r.questionId && r.userId && r.answer !== undefined);
  }, [rows]);

  // Analyser les données pour les graphiques
  const chartData = useMemo(() => {
    // Cas 1: Questions normales
    if (questionInfo && questionInfo.length > 0) {
      return questionInfo.map(question => {
        const qType = String(question.type || "FREE_TEXT").toUpperCase();
        const qId = question.id;
        const qTitle = question.title || "Question";

        // Filtrer les réponses pour cette question
        const qAnswers = rows.filter(r => r.questionId === qId);

        if (qType === "PHOTO") {
          return { questionId: qId, title: qTitle, type: "PHOTO", data: null };
        }

        if (qType === "FREE_TEXT") {
          // Extraire les mots-clés
          const texts = qAnswers.map(a => a.answer);
          const keywords = extractKeywords(texts);
          
          if (keywords.length === 0) {
            return { questionId: qId, title: qTitle, type: "FREE_TEXT", data: null };
          }

          return {
            questionId: qId,
            title: qTitle,
            type: "FREE_TEXT",
            data: {
              labels: keywords.map(([word]) => word),
              values: keywords.map(([_, count]) => count)
            }
          };
        }

        // Pour QCM, DROPDOWN, CHECKBOX, SLIDER
        const answerCounts = {};
        qAnswers.forEach(a => {
          const ans = String(a.answer || "").trim();
          if (ans) {
            answerCounts[ans] = (answerCounts[ans] || 0) + 1;
          }
        });

        if (Object.keys(answerCounts).length === 0) {
          return { questionId: qId, title: qTitle, type: qType, data: null };
        }

        const sortedEntries = Object.entries(answerCounts).sort((a, b) => b[1] - a[1]);

        return {
          questionId: qId,
          title: qTitle,
          type: qType,
          data: {
            labels: sortedEntries.map(([label]) => label),
            values: sortedEntries.map(([_, count]) => count)
          }
        };
      });
    }

    // Cas 2: Tag variable.user (pas de questions)
    if (isVariableUserTag) {
      const answerCounts = {};
      rows.forEach(a => {
        const ans = String(a.answer || "").trim();
        if (ans) {
          answerCounts[ans] = (answerCounts[ans] || 0) + 1;
        }
      });

      if (Object.keys(answerCounts).length === 0) {
        return null;
      }

      const sortedEntries = Object.entries(answerCounts).sort((a, b) => b[1] - a[1]);

      return [{
        questionId: "variable_user",
        title: title || "Réponses",
        type: "VARIABLE_USER",
        data: {
          labels: sortedEntries.map(([label]) => label),
          values: sortedEntries.map(([_, count]) => count)
        }
      }];
    }

    return null;
  }, [questionInfo, rows, isVariableUserTag, title]);

  // Créer les graphiques avec Chart.js
  useEffect(() => {
    if (viewMode !== "chart" || !chartData) return;

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

      chartData.forEach((item, index) => {
        if (!item.data) return;

        const canvas = chartRefs.current[item.questionId];
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const bgColors = colors.slice(0, item.data.labels.length);

        chartInstances.current[item.questionId] = new window.Chart(ctx, {
          type: chartType,
          data: {
            labels: item.data.labels,
            datasets: [{
              label: "Nombre de réponses",
              data: item.data.values,
              backgroundColor: bgColors,
              borderColor: bgColors.map(c => c.replace("0.8", "1")),
              borderWidth: 1,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                display: chartType === "pie",
                position: "bottom",
                labels: {
                  color: "#fff",
                  font: { size: 11 },
                },
              },
              title: {
                display: true,
                text: item.title,
                color: "#fff",
                font: { size: 14, weight: "bold" },
              },
            },
            ...(chartType === "bar" && {
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    color: "#fff",
                    stepSize: 1,
                  },
                  grid: {
                    color: "rgba(255, 255, 255, 0.1)",
                  },
                },
                x: {
                  ticks: {
                    color: "#fff",
                    maxRotation: 45,
                    minRotation: 45,
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
  }, [viewMode, chartData, chartType]);

  const deleteAnswer = async (answerId) => {
    if (!answerId) return;
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette réponse ?")) return;
    
    try {
      const result = await adminDeleteAnswer(answerId);
      if (result && result.ok) {
        // Ajouter l'ID à la liste des réponses supprimées
        setDeletedAnswerIds(prev => new Set([...prev, answerId]));
      } else {
        alert("Erreur lors de la suppression de la réponse.");
      }
    } catch (e) {
      console.error("Erreur suppression réponse:", e);
      alert("Erreur lors de la suppression de la réponse.");
    }
  };

  const handleExport = () => {
    if (rows.length === 0) return;

    let content = `${title}\n`;
    content += `${"=".repeat(title.length)}\n\n`;
    content += `Date d'export : ${new Date().toLocaleString("fr-FR")}\n`;
    content += `Nombre total de réponses : ${rows.length}\n\n`;

    if (isQuestionnaire && byUser) {
      content += `--- RÉPONSES PAR UTILISATEUR ---\n\n`;
      Array.from(byUser.entries()).forEach(([userName, userAnswers], index) => {
        if (index > 0) content += `\n${"-".repeat(60)}\n\n`;
        content += `Utilisateur : ${userName}\n`;
        content += `Date de dernière réponse : ${fmtDate(userAnswers[userAnswers.length - 1]?.createdAt)}\n\n`;
        userAnswers.forEach((a, i) => {
          content += `  ${i + 1}. ${getQuestionTitle(a)}\n`;
          content += `     Réponse : ${String(a.answer ?? "")}\n`;
          if (i < userAnswers.length - 1) content += `\n`;
        });
      });
    } else {
      content += `--- RÉPONSES ---\n\n`;
      rows.forEach((a, index) => {
        if (index > 0) content += `\n`;
        content += `${index + 1}. ${getUserName(a, userMap)} : ${String(a.answer ?? "")}\n`;
        content += `   Date : ${fmtDate(a.createdAt)}\n`;
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const filename = `export_reponses_${timestamp}.txt`;
    downloadTextFile(filename, content);
  };

  const canShowChart = chartData && chartData.some(item => item.data !== null);

  return (
    <Modal title={title} onClose={onClose} wide>
      {rows.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn btnPrimary" onClick={handleExport} type="button">
            <Download size={16} style={{ marginRight: 8 }} />
            Exporter en TXT
          </button>
          
          {canShowChart && (
            <>
              <button 
                className={`btn ${viewMode === "list" ? "btnPrimary" : "btnGhost"}`}
                onClick={() => setViewMode("list")} 
                type="button"
              >
                Afficher la liste
              </button>
              <button 
                className={`btn ${viewMode === "chart" ? "btnPrimary" : "btnGhost"}`}
                onClick={() => setViewMode("chart")} 
                type="button"
              >
                <BarChart3 size={16} style={{ marginRight: 8 }} />
                Afficher en diagramme
              </button>

              {viewMode === "chart" && (
                <>
                  <button 
                    className={`btn ${chartType === "pie" ? "btnPrimary" : "btnGhost"}`}
                    onClick={() => setChartType("pie")} 
                    type="button"
                  >
                    <PieChart size={16} style={{ marginRight: 8 }} />
                    Camembert
                  </button>
                  <button 
                    className={`btn ${chartType === "bar" ? "btnPrimary" : "btnGhost"}`}
                    onClick={() => setChartType("bar")} 
                    type="button"
                  >
                    <BarChart3 size={16} style={{ marginRight: 8 }} />
                    Barres
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {viewMode === "chart" && canShowChart ? (
        <div className="chartsGridResponses">
          {chartData.map(item => {
            if (item.type === "PHOTO") {
              return (
                <div key={item.questionId} className="chartCardResponse">
                  <div className="chartCardTitle">{item.title}</div>
                  <div className="chartNoData">Pas de diagramme pour les photos</div>
                </div>
              );
            }

            if (!item.data) {
              return (
                <div key={item.questionId} className="chartCardResponse">
                  <div className="chartCardTitle">{item.title}</div>
                  <div className="chartNoData">Aucune donnée à afficher</div>
                </div>
              );
            }

            return (
              <div key={item.questionId} className="chartCardResponse">
                <canvas 
                  ref={el => chartRefs.current[item.questionId] = el}
                  style={{ maxWidth: "100%", maxHeight: "350px" }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="respWrap">
          {rows.length === 0 ? (
            <div className="muted">Aucune réponse pour le moment.</div>
          ) : isQuestionnaire ? (
            Array.from(byUser.entries()).map(([name, list]) => (
              <div key={name} className="respCard glassCard">
                <div className="respTop">
                  <div className="respTitle">{name}</div>
                  <div className="pill">{fmtDate(list[list.length - 1]?.createdAt)}</div>
                </div>
                <div className="respAnswer" style={{ paddingTop: 8 }}>
                  {list.map((a) => (
                    <div 
                      key={(a.id || "a") + "_" + (a.questionId || "q") + "_" + (a.createdAt || "t")} 
                      className="respLine" 
                      style={{ marginBottom: 8, position: 'relative' }}
                      onMouseEnter={(e) => {
                        const btn = e.currentTarget.querySelector('.deleteAnswerBtn');
                        if (btn) btn.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        const btn = e.currentTarget.querySelector('.deleteAnswerBtn');
                        if (btn) btn.style.opacity = '0';
                      }}
                    >
                      <button
                        className="deleteAnswerBtn"
                        type="button"
                        onClick={() => deleteAnswer(a.id)}
                        style={{
                          position: 'absolute',
                          top: '0',
                          right: '0',
                          padding: '4px',
                          background: 'rgba(255, 68, 68, 0.9)',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          opacity: '0',
                          transition: 'opacity 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10
                        }}
                        title="Supprimer cette réponse"
                      >
                        <Trash2 size={14} color="white" />
                      </button>
                      <div className="muted" style={{ fontSize: 12 }}>{getQuestionTitle(a)}</div>
                      <div className="respValue">{renderAnswer(a.answer)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            rows.map((a) => (
              <div 
                key={(a.id || "a") + "_" + (a.userId || "u") + "_" + (a.createdAt || "t")} 
                className="respCard glassCard"
                style={{ position: 'relative' }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget.querySelector('.deleteAnswerBtn');
                  if (btn) btn.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget.querySelector('.deleteAnswerBtn');
                  if (btn) btn.style.opacity = '0';
                }}
              >
                <button
                  className="deleteAnswerBtn"
                  type="button"
                  onClick={() => deleteAnswer(a.id)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '6px',
                    background: 'rgba(255, 68, 68, 0.9)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    opacity: '0',
                    transition: 'opacity 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10
                  }}
                  title="Supprimer cette réponse"
                >
                  <Trash2 size={16} color="white" />
                </button>
                <div className="respTop">
                  <div className="respTitle">{getUserName(a, userMap)}</div>
                  <div className="pill">{fmtDate(a.createdAt)}</div>
                </div>
                <div className="respAnswer">{renderAnswer(a.answer)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

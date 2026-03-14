import React, { useEffect, useMemo, useState } from "react";
import { X, Search as SearchIcon, Plus, Trash2, Download } from "lucide-react";
import { adminListUsers, loadDB } from "../../data/storage";
import { USER_VARIABLE_TAGS } from "../../data/userVariableTags";
import "./searchTab.css";

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

function initials(u) {
  const a = (u?.prenom || "")[0] || "?";
  const b = (u?.nom || "")[0] || "";
  return `${String(a).toUpperCase()}${String(b).toUpperCase()}`;
}

export default function AdminSearch() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [db, setDb] = useState(null);
  const [filters, setFilters] = useState([]);
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [filterInputs, setFilterInputs] = useState({}); // Pour stocker le texte de recherche de chaque filtre

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [usersRes, dbRes] = await Promise.all([
          adminListUsers(),
          loadDB()
        ]);
        setUsers(usersRes.users || []);
        setDb(dbRes || null);
        setAllTags((dbRes?.tags || []).map((t) => ({ id: t.id, name: String(t?.name || "").trim() })).filter(t => t.name));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Combine regular tags + user variable tags for filter selection
  const availableFilters = useMemo(() => {
    // Créer un Set avec les noms des variables utilisateur pour détecter les doublons
    const userVariableNames = new Set(USER_VARIABLE_TAGS.map(v => v.name.toLowerCase()));
    
    // Filtrer les tags réguliers pour exclure ceux qui sont des variables utilisateur
    const regularTags = allTags
      .filter(t => !userVariableNames.has(t.name.toLowerCase()))
      .map(t => ({ type: 'tag', id: t.id, name: t.name }));
    
    // Ajouter les variables utilisateur
    const variableTags = USER_VARIABLE_TAGS.map(v => ({ 
      type: 'variable', 
      id: v.id, 
      name: v.name, 
      field: v.field 
    }));
    
    return [...regularTags, ...variableTags].sort((a, b) => a.name.localeCompare(b.name));
  }, [allTags]);

  // Get all possible values for a given filter
  const getValuesForFilter = (filter) => {
    const valuesSet = new Set();
    
    users.forEach(user => {
      if (filter.type === 'tag') {
        // For tags, look in sensibleAnswersTagged
        const tagged = user.sensibleAnswersTagged || [];
        tagged.forEach(ans => {
          if (String(ans.tag || "").trim() === filter.name && ans.answer) {
            valuesSet.add(String(ans.answer).trim());
          }
        });
      } else if (filter.type === 'variable') {
        // For variables, look in user fields directly
        const value = user[filter.field];
        if (value !== null && value !== undefined && value !== '') {
          const strValue = String(value).trim();
          if (strValue) {
            valuesSet.add(strValue);
          }
        }
      }
    });
    
    return Array.from(valuesSet).sort();
  };

  const addFilter = () => {
    setFilters([...filters, { id: Date.now(), filterId: null, value: null }]);
  };

  const removeFilter = (id) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const updateFilter = (id, field, value) => {
    setFilters(filters.map(f => {
      if (f.id === id) {
        if (field === 'filterId') {
          // Reset value when changing filter
          return { ...f, filterId: value, value: null };
        }
        return { ...f, [field]: value };
      }
      return f;
    }));
  };

  const updateFilterInput = (id, text) => {
    setFilterInputs(prev => ({ ...prev, [id]: text }));
  };

  const selectFilterSuggestion = (filterId, suggestionId) => {
    updateFilter(filterId, 'filterId', suggestionId);
    setFilterInputs(prev => ({ ...prev, [filterId]: '' }));
  };

  const getFilterSuggestions = (filterId) => {
    const searchText = (filterInputs[filterId] || '').toLowerCase().trim();
    if (!searchText) return [];
    
    return availableFilters.filter(f => 
      f.name.toLowerCase().includes(searchText)
    ).slice(0, 10); // Limiter à 10 suggestions
  };

  const runSearch = () => {
    // Filter out incomplete filters
    const validFilters = filters.filter(f => f.filterId && f.value);
    
    if (validFilters.length === 0) {
      setResults([]);
      setHasSearched(true);
      return;
    }

    // Calculate match percentage for each user
    const scoredUsers = users.map(user => {
      let matchCount = 0;
      
      validFilters.forEach(filter => {
        const selectedFilter = availableFilters.find(af => af.id === filter.filterId);
        if (!selectedFilter) return;
        
        if (selectedFilter.type === 'tag') {
          const tagged = user.sensibleAnswersTagged || [];
          const match = tagged.find(ans => 
            String(ans.tag || "").trim() === selectedFilter.name && 
            String(ans.answer || "").trim() === filter.value
          );
          if (match) matchCount++;
        } else if (selectedFilter.type === 'variable') {
          const userValue = String(user[selectedFilter.field] || "").trim();
          if (userValue === filter.value) matchCount++;
        }
      });
      
      const percentage = validFilters.length > 0 ? Math.round((matchCount / validFilters.length) * 100) : 0;
      
      return {
        user,
        matchCount,
        percentage
      };
    });

    // Filter users with at least one match and sort by percentage (descending)
    const filtered = scoredUsers
      .filter(su => su.matchCount > 0)
      .sort((a, b) => b.percentage - a.percentage);

    setResults(filtered);
    setHasSearched(true);
  };

  const exportResults = () => {
    let content = `RÉSULTATS DE RECHERCHE\n`;
    content += `======================\n\n`;
    content += `Date : ${new Date().toLocaleString("fr-FR")}\n`;
    content += `Nombre de filtres : ${filters.filter(f => f.filterId && f.value).length}\n`;
    content += `Nombre de résultats : ${results.length}\n\n`;

    content += `FILTRES APPLIQUÉS :\n`;
    filters.filter(f => f.filterId && f.value).forEach((filter, i) => {
      const selectedFilter = availableFilters.find(af => af.id === filter.filterId);
      if (selectedFilter) {
        content += `${i + 1}. ${selectedFilter.name} = ${filter.value}\n`;
      }
    });
    content += `\n`;

    content += `RÉSULTATS :\n`;
    content += `-----------\n\n`;
    
    results.forEach((result, i) => {
      const u = result.user;
      content += `${i + 1}. ${u.prenom || ""} ${u.nom || ""} (${result.percentage}%)\n`;
      content += `   ID : ${u.id}\n`;
      content += `   Téléphone : ${u.telephone || "—"}\n`;
      content += `   Email : ${u.email || "—"}\n`;
      content += `   Correspondance : ${result.matchCount}/${filters.filter(f => f.filterId && f.value).length} filtres\n\n`;
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const filename = `recherche_utilisateurs_${timestamp}.txt`.replace(/\s+/g, "_");
    downloadTextFile(filename, content);
  };

  const exportAllUsers = () => {
    let content = `EXPORT UTILISATEURS\n`;
    content += `==================\n\n`;
    content += `Date : ${new Date().toLocaleString("fr-FR")}\n`;
    content += `Nombre d'utilisateurs : ${users.length}\n\n`;

    // Build a lookup: tagName -> question title(s)
    const questions = Array.isArray(db?.questions) ? db.questions : [];
    const tags = Array.isArray(db?.tags) ? db.tags : [];

    const tagIdByNameLower = new Map(
      tags
        .map((t) => ({ id: t?.id, name: String(t?.name || "").trim() }))
        .filter((t) => t.id && t.name)
        .map((t) => [t.name.toLowerCase(), String(t.id)])
    );

    const titlesByTagId = new Map();
    questions.forEach((q) => {
      const tagId = q?.tagId ? String(q.tagId) : "";
      if (!tagId) return;
      const title = String(q?.title || "").trim();
      if (!title) return;
      const list = titlesByTagId.get(tagId) || [];
      if (!list.includes(title)) list.push(title);
      titlesByTagId.set(tagId, list);
    });

    const getQuestionTitleForTagName = (tagName) => {
      const name = String(tagName || "").trim();
      if (!name) return "";
      const tagId = tagIdByNameLower.get(name.toLowerCase());
      if (!tagId) return "";
      const titles = titlesByTagId.get(tagId) || [];
      if (titles.length === 0) return "";
      if (titles.length === 1) return titles[0];
      return titles.join(" | ");
    };

    users.forEach((u, i) => {
      content += `----- UTILISATEUR ${i + 1}/${users.length} -----\n`;

      // Add question title above "tag" for sensibleAnswersTagged entries
      const copy = { ...u };
      if (Array.isArray(u?.sensibleAnswersTagged)) {
        copy.sensibleAnswersTagged = u.sensibleAnswersTagged.map((a) => {
          const tag = String(a?.tag || "").trim();
          const questionTitle = getQuestionTitleForTagName(tag);

          const out = {};
          if (questionTitle) out.questionTitle = questionTitle;
          // keep original keys, but ensure tag is below questionTitle
          out.tag = a?.tag;
          out.answer = a?.answer;

          // preserve any extra keys that might exist
          Object.keys(a || {}).forEach((k) => {
            if (k === "tag" || k === "answer") return;
            if (k === "questionTitle") return;
            out[k] = a[k];
          });

          return out;
        });
      }

      content += JSON.stringify(copy, null, 2);
      content += `\n\n`;
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const filename = `utilisateurs_${timestamp}.txt`;
    downloadTextFile(filename, content);
  };

  if (loading) {
    return (
      <div className="searchRoot">
        <div className="muted">Chargement des données...</div>
      </div>
    );
  }

  return (
    <div className="searchRoot">
      <div className="searchHeader">
        <div className="searchHeaderRow">
          <div>
            <div className="searchTitle">Recherche avancée</div>
            <div className="muted">Filtrez les utilisateurs par tags et variables</div>
          </div>
          <div className="searchHeaderActions">
            <button className="btn btnGhost btnSmall" type="button" onClick={exportAllUsers} disabled={users.length === 0}>
              <Download size={16} style={{ marginRight: 6 }} />
              Exporter tous les utilisateurs (TXT)
            </button>
          </div>
        </div>
      </div>

      <div className="searchFiltersSection">
        <div className="searchSectionTitle">
          Filtres
          <button className="btn btnGhost btnSmall" type="button" onClick={addFilter}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Ajouter un filtre
          </button>
        </div>

        {filters.length === 0 ? (
          <div className="searchEmptyState">
            <div className="muted">Aucun filtre. Ajoutez un filtre pour commencer votre recherche.</div>
          </div>
        ) : (
          <div className="searchFiltersList">
            {filters.map((filter) => {
              const selectedFilter = filter.filterId ? availableFilters.find(af => af.id === filter.filterId) : null;
              const availableValues = selectedFilter ? getValuesForFilter(selectedFilter) : [];
              const suggestions = getFilterSuggestions(filter.id);
              const showSuggestions = !selectedFilter && suggestions.length > 0;

              return (
                <div key={filter.id} className="searchFilterRow">
                  <div className="searchFilterInputs">
                    <div className="searchAutocompleteWrapper">
                      {selectedFilter ? (
                        <div className="searchFilterSelected">
                          <span className="searchFilterSelectedText">{selectedFilter.name}</span>
                          <button
                            className="searchFilterClear"
                            type="button"
                            onClick={() => {
                              updateFilter(filter.id, 'filterId', null);
                              setFilterInputs(prev => ({ ...prev, [filter.id]: '' }));
                            }}
                            title="Changer de filtre"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            className="searchFilterInput"
                            type="text"
                            value={filterInputs[filter.id] || ''}
                            onChange={(e) => updateFilterInput(filter.id, e.target.value)}
                            placeholder="Rechercher un filtre... (ex: cheveux)"
                            autoComplete="off"
                          />
                          {showSuggestions && (
                            <div className="searchSuggestions">
                              {suggestions.map(suggestion => (
                                <div
                                  key={suggestion.id}
                                  className="searchSuggestionItem"
                                  onClick={() => selectFilterSuggestion(filter.id, suggestion.id)}
                                >
                                  <span className="searchSuggestionName">{suggestion.name}</span>
                                  <span className="searchSuggestionType">
                                    {suggestion.type === 'variable' ? 'Variable' : 'Tag'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {selectedFilter && (
                      <>
                        <span className="searchFilterEquals">=</span>
                        <select
                          className="searchFilterSelect"
                          value={filter.value || ""}
                          onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                          disabled={availableValues.length === 0}
                        >
                          <option value="">
                            {availableValues.length === 0 
                              ? "Aucune valeur disponible" 
                              : "Sélectionner une valeur..."}
                          </option>
                          {availableValues.map(val => (
                            <option key={val} value={val}>
                              {val}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>

                  <button
                    className="searchFilterRemove"
                    type="button"
                    onClick={() => removeFilter(filter.id)}
                    title="Supprimer ce filtre"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="searchActionsRow">
          <button
            className="btn btnPrimary"
            type="button"
            onClick={runSearch}
            disabled={filters.filter(f => f.filterId && f.value).length === 0}
          >
            <SearchIcon size={16} style={{ marginRight: 8 }} />
            Lancer la recherche
          </button>
          {filters.length > 0 && (
            <button
              className="btn btnGhost"
              type="button"
              onClick={() => {
                setFilters([]);
                setResults([]);
                setHasSearched(false);
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {hasSearched && (
        <div className="searchResultsSection">
          <div className="searchSectionTitle">
            Résultats
            {results.length > 0 && (
              <button className="btn btnGhost btnSmall" type="button" onClick={exportResults}>
                <Download size={16} style={{ marginRight: 6 }} />
                Exporter en TXT
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="searchEmptyState">
              <div className="muted">Aucun utilisateur ne correspond aux filtres sélectionnés.</div>
            </div>
          ) : (
            <div className="searchResultsList">
              <div className="searchResultsHeader">
                <div className="searchResultsCount">
                  {results.length} utilisateur{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}
                </div>
              </div>

              <div className="searchUsersList">
                {results.map((result) => {
                  const u = result.user;
                  return (
                    <div key={u.id} className="searchUserCard">
                      <div className="searchUserLeft">
                        <div className="searchUserAvatar">
                          {u.photoProfil ? (
                            <img src={u.photoProfil} alt="" />
                          ) : (
                            <div className="searchUserAvatarPlaceholder">
                              {initials(u)}
                            </div>
                          )}
                        </div>
                        <div className="searchUserInfo">
                          <div className="searchUserName">
                            {u.prenom || ""} {u.nom || ""}
                          </div>
                          <div className="searchUserMeta">
                            {u.telephone && <span>{u.telephone}</span>}
                            {u.email && <span>{u.email}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="searchUserRight">
                        <div className="searchUserMatch">
                          <div className="searchMatchPercentage">{result.percentage}%</div>
                          <div className="searchMatchLabel">
                            {result.matchCount}/{filters.filter(f => f.filterId && f.value).length} filtres
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

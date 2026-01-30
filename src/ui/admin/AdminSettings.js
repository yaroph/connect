import React, { useState, useEffect } from "react";
import { loadSettings, saveSettings } from "../../data/storage";
import { notifySuccess, notifyError } from "../notify";

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    try {
      const data = await loadSettings();
      setSettings(data);
      setLoading(false);
    } catch (error) {
      notifyError("Erreur lors du chargement des paramètres");
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(settings);
      notifySuccess("Paramètres sauvegardés avec succès");
      setSaving(false);
    } catch (error) {
      notifyError("Erreur lors de la sauvegarde des paramètres");
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div className="muted">Chargement des paramètres...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 24, fontSize: 24, fontWeight: 700 }}>
        Paramètres du système
      </h2>

      <div style={{ maxWidth: 700 }}>
        {/* Questions aléatoires par jour */}
        <div className="settingGroup" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
            Nombre de questions aléatoires par jour
          </label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Limite quotidienne de questions aléatoires qu'un utilisateur peut répondre
          </p>
          <input
            type="number"
            min="1"
            max="100"
            value={settings.randomQuestionsPerDay || 10}
            onChange={(e) => handleChange("randomQuestionsPerDay", parseInt(e.target.value) || 1)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              width: 150,
            }}
          />
        </div>

        {/* Questions aléatoires par semaine */}
        <div className="settingGroup" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
            Nombre de questions aléatoires par semaine
          </label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Limite hebdomadaire de questions aléatoires qu'un utilisateur peut répondre
          </p>
          <input
            type="number"
            min="1"
            max="500"
            value={settings.randomQuestionsPerWeek || 50}
            onChange={(e) => handleChange("randomQuestionsPerWeek", parseInt(e.target.value) || 1)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              width: 150,
            }}
          />
        </div>

        {/* Montant minimum pour retrait */}
        <div className="settingGroup" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
            Montant minimum de cagnotte pour retrait ($)
          </label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Montant minimum que l'utilisateur doit avoir dans sa cagnotte pour pouvoir effectuer un retrait (en dollars)
          </p>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={settings.minimumWithdrawalAmount || 50}
            onChange={(e) => handleChange("minimumWithdrawalAmount", parseFloat(e.target.value) || 0.01)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              width: 150,
            }}
          />
        </div>

        {/* Gains par question aléatoire */}
        <div className="settingGroup" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
            Gains par question aléatoire répondue ($)
          </label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Montant gagné par l'utilisateur pour chaque question aléatoire répondue (en dollars, exemple : 500 = $ 500)
          </p>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={settings.earningsPerRandomQuestion || 0.10}
            onChange={(e) => handleChange("earningsPerRandomQuestion", parseFloat(e.target.value) || 0.01)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              width: 150,
            }}
          />
        </div>

        {/* Gains par questionnaire complété */}
        <div className="settingGroup" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
            Gains par questionnaire complété ($)
          </label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Montant gagné par l'utilisateur pour chaque questionnaire complété (en dollars)
          </p>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={settings.earningsPerQuestionnaire || 1.00}
            onChange={(e) => handleChange("earningsPerQuestionnaire", parseFloat(e.target.value) || 0.01)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              width: 150,
            }}
          />
        </div>

        {/* Nombre maximum de tentatives de retrait par mois */}
        <div className="settingGroup" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
            Nombre maximum de demandes de retrait par mois
          </label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Limite mensuelle de demandes de retrait par utilisateur
          </p>
          <input
            type="number"
            min="1"
            max="50"
            value={settings.maxWithdrawalsPerMonth || 5}
            onChange={(e) => handleChange("maxWithdrawalsPerMonth", parseInt(e.target.value) || 1)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ddd",
              borderRadius: 6,
              width: 150,
            }}
          />
        </div>

        {/* Bouton de sauvegarde */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #eee" }}>
          <button
            className="btn btnPrimary"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 24px",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {saving ? "Sauvegarde en cours..." : "Sauvegarder les paramètres"}
          </button>
        </div>
      </div>
    </div>
  );
}

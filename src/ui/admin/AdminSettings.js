import React, { useState, useEffect } from "react";
import { loadSettings, saveSettings } from "../../data/storage";
import { notifySuccess, notifyError } from "../notify";
import { Calendar, DollarSign, ShieldCheck, Save } from "lucide-react";
import { playLaserClick } from "../soundEffects";

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
    playLaserClick();
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
      <div style={{ padding: 24, textAlign: "center" }}>
        <div className="muted">Chargement des paramètres...</div>
      </div>
    );
  }

  return (
    <div className="adminSettingsWrap">
      <div className="adminHeaderRow">
        <div>
          <div className="adminTitle">Paramètres du système</div>
          <div className="adminSub">Configurez les règles de rémunération et les quotas du serveur</div>
        </div>
        <button
          className="btn btnPrimary authBtn"
          style={{ width: "auto", margin: 0, padding: "10px 20px" }}
          onClick={handleSave}
          disabled={saving}
          type="button"
        >
          <Save size={16} />
          <span>{saving ? "Sauvegarde en cours…" : "Sauvegarder les paramètres"}</span>
        </button>
      </div>

      <div className="adminSettingsGrid">
        {/* Card 1: Quotas & Limites */}
        <div className="adminSettingCard">
          <div className="settingCardHeader">
            <Calendar size={18} className="settingCardIcon" />
            <div className="settingCardTitle">Limites & Quotas de Questions</div>
          </div>

          <div className="settingFields">
            <div className="settingField">
              <label className="settingLabel">Questions aléatoires par jour</label>
              <div className="settingDesc">Limite quotidienne par citoyen</div>
              <input
                className="authInput settingInput"
                type="number"
                min="1"
                max="100"
                value={settings.randomQuestionsPerDay || 10}
                onChange={(e) =>
                  handleChange("randomQuestionsPerDay", parseInt(e.target.value) || 1)
                }
              />
            </div>

            <div className="settingField">
              <label className="settingLabel">Questions aléatoires par semaine</label>
              <div className="settingDesc">Limite hebdomadaire maximale</div>
              <input
                className="authInput settingInput"
                type="number"
                min="1"
                max="500"
                value={settings.randomQuestionsPerWeek || 50}
                onChange={(e) =>
                  handleChange("randomQuestionsPerWeek", parseInt(e.target.value) || 1)
                }
              />
            </div>
          </div>
        </div>

        {/* Card 2: Rémunération */}
        <div className="adminSettingCard">
          <div className="settingCardHeader">
            <DollarSign size={18} className="settingCardIcon" />
            <div className="settingCardTitle">Rémunérations ($)</div>
          </div>

          <div className="settingFields">
            <div className="settingField">
              <label className="settingLabel">Gain par question aléatoire</label>
              <div className="settingDesc">Montant crédité par question répondue</div>
              <div className="settingInputPrefixWrap">
                <span className="settingPrefix">$</span>
                <input
                  className="authInput settingInput withPrefix"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={settings.earningsPerRandomQuestion || 100}
                  onChange={(e) =>
                    handleChange("earningsPerRandomQuestion", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>

            <div className="settingField">
              <label className="settingLabel">Gain par questionnaire complet</label>
              <div className="settingDesc">Bonus additionnel lors de la finalisation</div>
              <div className="settingInputPrefixWrap">
                <span className="settingPrefix">$</span>
                <input
                  className="authInput settingInput withPrefix"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.earningsPerQuestionnaire || 0.01}
                  onChange={(e) =>
                    handleChange("earningsPerQuestionnaire", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Virements & Retraits */}
        <div className="adminSettingCard">
          <div className="settingCardHeader">
            <ShieldCheck size={18} className="settingCardIcon" />
            <div className="settingCardTitle">Plafonds & Sécurité des Retraits</div>
          </div>

          <div className="settingFields">
            <div className="settingField">
              <label className="settingLabel">Seuil minimum pour retrait ($)</label>
              <div className="settingDesc">Montant minimal de cagnotte requis</div>
              <div className="settingInputPrefixWrap">
                <span className="settingPrefix">$</span>
                <input
                  className="authInput settingInput withPrefix"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={settings.minimumWithdrawalAmount || 50}
                  onChange={(e) =>
                    handleChange("minimumWithdrawalAmount", parseFloat(e.target.value) || 0.01)
                  }
                />
              </div>
            </div>

            <div className="settingField">
              <label className="settingLabel">Demandes de retrait max / mois</label>
              <div className="settingDesc">Limite mensuelle par citoyen</div>
              <input
                className="authInput settingInput"
                type="number"
                min="1"
                max="30"
                value={settings.maxWithdrawalRequestsPerMonth || 5}
                onChange={(e) =>
                  handleChange("maxWithdrawalRequestsPerMonth", parseInt(e.target.value) || 1)
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

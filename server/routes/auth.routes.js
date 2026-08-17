const express = require("express");
const router = express.Router();

const {
  readUsers,
  writeUsers,
  readCagnotte,
  writeCagnotte,
  normalizeUser,
  runStateExclusive,
  invalidateCache,
} = require("../storage/store");
const { isBase64Image, storeImage } = require("../storage/images");
const {
  decryptPassword,
  encryptPassword,
  formatUserForAdmin,
  genToken,
  genId,
} = require("../utils/crypto");
const { nameKey, dateOnlyKey, markUserLogin, nowIso } = require("../utils/helpers");
const { requireAuth } = require("../middleware/auth");

router.post("/register", async (req, res) => {
  try {
    const b = req.body || {};
    const required = ["prenom", "nom", "compteBancaire", "dateNaissance", "telephone", "motDePasse"];
    for (const k of required) {
      if (!String(b[k] || "").trim()) {
        return res.status(400).json({ error: `Champ obligatoire manquant: ${k}` });
      }
    }

    let photoProfil = b.photoProfil || "";
    if (photoProfil && isBase64Image(photoProfil)) {
      const imageId = `user_${Date.now()}_${genId("photo")}`;
      photoProfil = await storeImage(photoProfil, imageId);
    }

    const token = genToken();
    const user = markUserLogin(
      normalizeUser({
        prenom: b.prenom,
        nom: b.nom,
        compteBancaire: b.compteBancaire,
        dateNaissance: b.dateNaissance,
        telephone: b.telephone,
        motDePasse: b.motDePasse,
        photoProfil,
        numeroCitoyen: b.numeroCitoyen || "",
        sexe: b.sexe || "",
        couleurPeau: b.couleurPeau || "",
        couleurCheveux: b.couleurCheveux || "",
        longueurCheveux: b.longueurCheveux || "",
        styleVestimentaire: b.styleVestimentaire || "",
        metier: b.metier || "",
        token,
      })
    );

    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const key = `${String(b.prenom).trim().toLowerCase()}|${String(b.nom).trim().toLowerCase()}|${String(b.telephone).trim()}`;
      const exists = users.some(
        (u) => `${u.prenom.toLowerCase()}|${u.nom.toLowerCase()}|${u.telephone}` === key
      );
      if (exists) return { error: "Ce compte existe déjà.", status: 409 };

      const next = await writeUsers([...users, user]);
      const cagnotte = await readCagnotte();
      cagnotte[user.id] = cagnotte[user.id] || { pending: 0, randomByDay: {}, randomByWeek: {} };
      await writeCagnotte(cagnotte);
      invalidateCache("users");
      invalidateCache("cagnotte");
      const saved = next.find((u) => u.id === user.id);
      return { token, user: formatUserForAdmin(saved) };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json({ ok: true, token: result.token, user: result.user });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/login", async (req, res) => {
  try {
    const b = req.body || {};
    const prenom = String(b.prenom || "").trim();
    const nom = String(b.nom || "").trim();
    const motDePasse = String(b.motDePasse || "").trim();
    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const idx = users.findIndex(
        (x) =>
          x.prenom.toLowerCase() === prenom.toLowerCase() &&
          x.nom.toLowerCase() === nom.toLowerCase() &&
          decryptPassword(x.motDePasse) === motDePasse
      );
      if (idx === -1) return { error: "Identifiants invalides.", status: 401 };

      let u = users[idx];
      if (!u.token) {
        u = { ...u, token: genToken() };
      }
      u = markUserLogin(u);
      users[idx] = normalizeUser(u);
      await writeUsers(users);
      invalidateCache("users");
      return { token: users[idx].token, user: formatUserForAdmin(users[idx]) };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json({ ok: true, token: result.token, user: result.user });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const u = req.authUser;
    const cagnotte = await readCagnotte();
    const pending = Number((cagnotte[u.id] && cagnotte[u.id].pending) || 0);
    res.json({ ok: true, user: formatUserForAdmin(u), pending });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/password-reset/verify", async (req, res) => {
  try {
    const b = req.body || {};
    const prenom = nameKey(b.prenom);
    const nom = nameKey(b.nom);
    const compteBancaire = String(b.compteBancaire || b.bankAccount || "").replace(/\D+/g, "");
    const dateNaissance = dateOnlyKey(b.dateNaissance);

    if (!prenom || !nom || !compteBancaire || !dateNaissance) {
      return res.status(400).json({ error: "Champs manquants" });
    }

    const users = await readUsers();
    const u = users.find(
      (x) =>
        nameKey(x.prenom) === prenom &&
        nameKey(x.nom) === nom &&
        String(x.compteBancaire || "").replace(/\D+/g, "") === compteBancaire &&
        dateOnlyKey(x.dateNaissance) === dateNaissance
    );

    if (!u) return res.status(401).json({ error: "Informations invalides" });
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

router.post("/password-reset", async (req, res) => {
  try {
    const b = req.body || {};
    const prenom = nameKey(b.prenom);
    const nom = nameKey(b.nom);
    const compteBancaire = String(b.compteBancaire || b.bankAccount || "").replace(/\D+/g, "");
    const dateNaissance = dateOnlyKey(b.dateNaissance);
    const nouveauMotDePasse = String(b.nouveauMotDePasse || b.newPassword || "").trim();

    if (!prenom || !nom || !compteBancaire || !dateNaissance || !nouveauMotDePasse) {
      return res.status(400).json({ error: "Champs manquants" });
    }
    if (nouveauMotDePasse.length < 3) {
      return res.status(400).json({ error: "Mot de passe trop court" });
    }

    const result = await runStateExclusive(async () => {
      const users = await readUsers();
      const idx = users.findIndex(
        (x) =>
          nameKey(x.prenom) === prenom &&
          nameKey(x.nom) === nom &&
          String(x.compteBancaire || "").replace(/\D+/g, "") === compteBancaire &&
          dateOnlyKey(x.dateNaissance) === dateNaissance
      );

      if (idx === -1) return { error: "Informations invalides", status: 401 };

      users[idx] = {
        ...users[idx],
        motDePasse: encryptPassword(nouveauMotDePasse),
        token: genToken(),
        updatedAt: nowIso(),
      };
      await writeUsers(users);
      invalidateCache("users");
      return { ok: true };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

module.exports = router;

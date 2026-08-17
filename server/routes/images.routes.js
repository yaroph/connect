const express = require("express");
const path = require("path");
const router = express.Router();

const { getImage, storeImage, isBase64Image } = require("../storage/images");
const {
  readJson,
  writeJson,
  readUsers,
  keyOrPath,
  QUESTIONS_PATH,
  USERS_PATH,
} = require("../storage/store");
const { ALLOWED_DATA_FILES } = require("../config/constants");
const { genId } = require("../utils/crypto");
const { requireAdmin } = require("../middleware/auth");

// Serve image with security & caching
router.get("/images/:filename", async (req, res) => {
  try {
    const filename = path.basename(String(req.params.filename || ""));
    if (!filename) return res.status(400).json({ error: "Filename required" });
    const image = await getImage(filename);

    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(image.buffer);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Upload image
router.post("/images/upload", async (req, res) => {
  try {
    const { base64Data, id } = req.body || {};

    if (!base64Data) {
      return res.status(400).json({ error: "No image data provided" });
    }

    const imageId = id || genId("img");
    const imageUrl = await storeImage(base64Data, imageId);

    res.json({
      ok: true,
      imageUrl,
      imageId,
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Migrate base64 images in storage to file/blobs
router.post("/admin/migrate-images", requireAdmin, async (req, res) => {
  try {
    let migratedCount = 0;
    const results = {
      questions: 0,
      users: 0,
      total: 0,
    };

    // Migrate questions
    const questions = await readJson(QUESTIONS_PATH, []);
    const questionsProcessed = [];

    for (const question of questions) {
      const processed = { ...question };

      if (processed.imageUrl && isBase64Image(processed.imageUrl)) {
        const imageId = `q_${question.id}_img`;
        try {
          processed.imageUrl = await storeImage(processed.imageUrl, imageId);
          results.questions++;
          migratedCount++;
        } catch (e) {
          console.error(`[migrate] Failed to migrate question image ${question.id}:`, e);
        }
      }

      questionsProcessed.push(processed);
    }

    if (results.questions > 0) {
      await writeJson(QUESTIONS_PATH, questionsProcessed);
    }

    // Migrate users
    const users = await readUsers();
    const usersProcessed = [];

    for (const user of users) {
      const processed = { ...user };

      if (processed.photoProfil && isBase64Image(processed.photoProfil)) {
        const imageId = `user_${user.id}_photo`;
        try {
          processed.photoProfil = await storeImage(processed.photoProfil, imageId);
          results.users++;
          migratedCount++;
        } catch (e) {
          console.error(`[migrate] Failed to migrate user photo ${user.id}:`, e);
        }
      }

      usersProcessed.push(processed);
    }

    if (results.users > 0) {
      await writeJson(USERS_PATH, usersProcessed);
    }

    results.total = migratedCount;

    res.json({
      ok: true,
      message: `Migration completed. ${migratedCount} images migrated.`,
      results,
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Data import (admin only)
router.post("/data/import", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) return res.status(400).json({ error: "Aucun fichier" });

    const results = [];
    for (const f of files) {
      const name = String(f && (f.name || f.filename || f.key) ? f.name || f.filename || f.key : "").trim();
      if (!name) continue;

      const base = name.split("/").pop().split("\\").pop();
      if (!ALLOWED_DATA_FILES.has(base)) {
        results.push({ name: base, ok: false, error: "Nom de fichier non autorisé" });
        continue;
      }

      const data = f && Object.prototype.hasOwnProperty.call(f, "data") ? f.data : null;
      if (data === null || data === undefined) {
        results.push({ name: base, ok: false, error: "Contenu manquant" });
        continue;
      }

      await writeJson(keyOrPath(base), data);
      results.push({ name: base, ok: true });
    }

    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

module.exports = router;

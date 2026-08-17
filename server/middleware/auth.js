const { readUsers } = require("../storage/store");

async function extractUser(req) {
  try {
    const rawHeader = String(req.headers.authorization || "").trim();
    const token = rawHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    const users = await readUsers();
    return users.find((x) => x.token === token) || null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  try {
    const user = await extractUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }
    req.authUser = user;
    next();
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await extractUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }
    if (!user.is_admin) {
      return res.status(403).json({ error: "Accès refusé : administrateur requis" });
    }
    req.authUser = user;
    next();
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}

async function requireSelfOrAdmin(req, res, next) {
  try {
    const user = await extractUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }
    const targetUserId = req.params.userId || req.params.id || (req.body && req.body.userId);
    if (!user.is_admin && targetUserId && String(user.id) !== String(targetUserId)) {
      return res.status(403).json({ error: "Accès non autorisé pour cet utilisateur" });
    }
    req.authUser = user;
    next();
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}

module.exports = {
  extractUser,
  requireAuth,
  requireAdmin,
  requireSelfOrAdmin,
};

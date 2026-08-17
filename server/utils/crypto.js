const crypto = require("crypto");
const { APP_ENCRYPTION_SECRET } = require("../config/constants");

const CIPHER_KEY = crypto.createHash("sha256").update(APP_ENCRYPTION_SECRET).digest();

function encryptPassword(plain) {
  const str = String(plain || "");
  if (!str) return "";
  if (str.startsWith("enc:")) return str; // already encrypted
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", CIPHER_KEY, iv);
    let enc = cipher.update(str, "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return `enc:${iv.toString("hex")}:${tag}:${enc}`;
  } catch (e) {
    console.error("[crypto] Encryption error:", e);
    return str;
  }
}

function decryptPassword(encryptedOrPlain) {
  const str = String(encryptedOrPlain || "");
  if (!str) return "";
  if (!str.startsWith("enc:")) return str; // legacy plain text
  try {
    const parts = str.split(":");
    if (parts.length !== 4) return str;
    const iv = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const ciphertext = parts[3];
    const decipher = crypto.createDecipheriv("aes-256-gcm", CIPHER_KEY, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(ciphertext, "hex", "utf8");
    dec += decipher.final("utf8");
    return dec;
  } catch (e) {
    console.error("[crypto] Decryption error:", e);
    return str;
  }
}

function formatUserForAdmin(u) {
  if (!u) return u;
  return {
    ...u,
    motDePasse: decryptPassword(u.motDePasse),
  };
}

function genToken() {
  return `tok_${crypto.randomBytes(32).toString("hex")}_${Date.now()}`;
}

function genId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}_${Date.now()}`;
}

module.exports = {
  encryptPassword,
  decryptPassword,
  formatUserForAdmin,
  genToken,
  genId,
};

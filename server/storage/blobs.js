let USE_BLOBS =
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT) ||
  Boolean(process.env.NETLIFY_BLOBS_CONTEXT) ||
  Boolean(process.env.SITE_ID) ||
  Boolean(process.env.NETLIFY_SITE_ID) ||
  Boolean(process.env.SITE_NAME) ||
  Boolean(process.env.URL) ||
  Boolean(process.env.NETLIFY) ||
  Boolean(process.env.NETLIFY_DEV) ||
  Boolean(process.env.USE_NETLIFY_BLOBS);

let BLOBS_DISABLED = false;

function decodeNetlifyBlobsContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) return null;

  const tryParse = (s) => {
    try {
      const ctx = JSON.parse(String(s));
      return ctx && typeof ctx === "object" ? ctx : null;
    } catch (_) {
      return null;
    }
  };

  // 1) base64 JSON
  try {
    const json = Buffer.from(String(raw), "base64").toString("utf8");
    const parsed = tryParse(json);
    if (parsed) return parsed;
  } catch (_) {
    // ignore
  }

  // 2) plain JSON
  return tryParse(raw);
}

let blobsModulePromise = null;
async function loadBlobsModule() {
  if (blobsModulePromise) return blobsModulePromise;
  blobsModulePromise = (async () => {
    try {
      // eslint-disable-next-line global-require
      return require("@netlify/blobs");
    } catch (e) {
      const mod = await import("@netlify/blobs");
      return mod;
    }
  })();
  return blobsModulePromise;
}

function pickGetStore(mod) {
  return mod?.getStore || mod?.default?.getStore || null;
}

function createStoreCompat(getStore, name, options) {
  try {
    return getStore(name, options);
  } catch (e1) {
    try {
      return getStore({ name, ...(options || {}) });
    } catch (e2) {
      const msg1 = String(e1 && e1.message ? e1.message : e1);
      const msg2 = String(e2 && e2.message ? e2.message : e2);
      throw new Error(`${msg1} (fallback: ${msg2})`);
    }
  }
}

async function getBlobsStore() {
  if (!USE_BLOBS || BLOBS_DISABLED) return null;

  const storeName = process.env.BLOBS_STORE_NAME || "bni-data";
  const mod = await loadBlobsModule();
  const getStore = pickGetStore(mod);
  if (!getStore) {
    throw new Error("Netlify Blobs: impossible de trouver getStore dans @netlify/blobs");
  }

  const ctx0 = decodeNetlifyBlobsContext() || null;
  const apiURL0 = ctx0 && (ctx0.apiURL || ctx0.apiUrl) ? (ctx0.apiURL || ctx0.apiUrl) : undefined;
  const edgeURL0 = ctx0 && (ctx0.edgeURL || ctx0.edgeUrl) ? (ctx0.edgeURL || ctx0.edgeUrl) : undefined;
  const uncachedEdgeURL0 =
    ctx0 && (ctx0.uncachedEdgeURL || ctx0.uncachedEdgeUrl)
      ? (ctx0.uncachedEdgeURL || ctx0.uncachedEdgeUrl)
      : undefined;

  const consistency0 = uncachedEdgeURL0 ? "strong" : "eventual";

  try {
    return createStoreCompat(getStore, storeName, { consistency: consistency0 });
  } catch (e1) {
    const msg = String(e1 && e1.message ? e1.message : e1);
    const ctx = ctx0;

    const siteID =
      process.env.SITE_ID ||
      process.env.NETLIFY_SITE_ID ||
      process.env.BLOBS_SITE_ID ||
      (ctx && (ctx.siteID || ctx.siteId)) ||
      "";

    const token =
      (ctx && ctx.token) ||
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      process.env.NETLIFY_ACCESS_TOKEN ||
      process.env.BLOBS_TOKEN ||
      "";

    const apiURL = apiURL0;
    const edgeURL = edgeURL0;
    const uncachedEdgeURL = uncachedEdgeURL0;

    if (siteID && token) {
      try {
        return createStoreCompat(getStore, storeName, {
          siteID,
          token,
          apiURL,
          edgeURL,
          uncachedEdgeURL,
          consistency: consistency0,
        });
      } catch (e2) {
        const msg2 = String(e2 && e2.message ? e2.message : e2);
        throw new Error(
          "Netlify Blobs store non initialisé (fallback). " +
            msg2 +
            " | erreur initiale: " +
            msg
        );
      }
    }

    throw new Error(
      "Netlify Blobs store non initialisé. " +
        "Sur Netlify, l'environnement doit fournir NETLIFY_BLOBS_CONTEXT automatiquement. " +
        "Si vous exécutez hors Netlify, fournissez SITE_ID et NETLIFY_AUTH_TOKEN (PAT). " +
        "Erreur originale: " +
        msg
    );
  }
}

function isBlobsEnabled() {
  return USE_BLOBS && !BLOBS_DISABLED;
}

function disableBlobs() {
  BLOBS_DISABLED = true;
  USE_BLOBS = false;
}

module.exports = {
  getBlobsStore,
  isBlobsEnabled,
  disableBlobs,
};

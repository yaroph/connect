const path = require("path");
let fs = null;
try {
  fs = require("fs/promises");
} catch (_) {
  // safe fallback
}

const { DATA_DIR } = require("../config/constants");
const { getBlobsStore, isBlobsEnabled, disableBlobs } = require("./blobs");

async function ensureImagesDir() {
  if (!fs) throw new Error("Filesystem persistence requested but fs/promises is not available");
  const imagesDir = path.join(DATA_DIR, "images");
  await fs.mkdir(imagesDir, { recursive: true });
  return imagesDir;
}

function isBase64Image(str) {
  if (typeof str !== "string") return false;
  return /^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(str);
}

async function storeImage(base64Data, imageId) {
  if (!base64Data || typeof base64Data !== "string") {
    throw new Error("Invalid base64 data");
  }

  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    console.error("[storeImage] Invalid base64 format, data starts with:", base64Data.substring(0, 50));
    throw new Error("Invalid base64 format");
  }

  const mediaType = matches[1];
  const base64Content = matches[2];
  const ext = mediaType.split("/")[1] || "png";
  const imageKey = `images/${imageId}.${ext}`;

  const shouldDisableBlobs = (err) => {
    const msg = String(err && err.message ? err.message : err);
    return (
      /MissingBlobsEnvironmentError/i.test(msg) ||
      /environment has not been configured to use Netlify Blobs/i.test(msg) ||
      (/Netlify Blobs store non initialisé/i.test(msg) && /SITE_ID|token/i.test(msg))
    );
  };

  if (isBlobsEnabled()) {
    const store = await getBlobsStore();
    if (!store) {
      console.error("[storeImage] Blobs store not initialized - falling back to filesystem");
      disableBlobs();
    } else {
      try {
        const buffer = Buffer.from(base64Content, "base64");
        await store.set(imageKey, buffer, {
          metadata: { contentType: mediaType },
        });

        const verified = await store.getWithMetadata(imageKey, { type: "arrayBuffer" });
        if (!verified || !verified.data || verified.data.byteLength <= 0) {
          throw new Error(`Image stored but verification failed for ${imageKey}`);
        }

        return `/api/images/${imageId}.${ext}`;
      } catch (e) {
        console.error("[storeImage] Blobs error:", e);
        if (shouldDisableBlobs(e)) {
          console.error("[storeImage] Disabling Blobs due to missing/invalid Blobs environment");
          disableBlobs();
        } else {
          throw e;
        }
      }
    }
  }

  // Filesystem fallback
  const imagesDir = await ensureImagesDir();
  const imagePath = path.join(imagesDir, `${imageId}.${ext}`);
  const buffer = Buffer.from(base64Content, "base64");
  await fs.writeFile(imagePath, buffer);
  return `/api/images/${imageId}.${ext}`;
}

async function getImage(imageFilename) {
  const safeFilename = path.basename(String(imageFilename || ""));
  if (!safeFilename) return null;
  const imageKey = `images/${safeFilename}`;

  if (isBlobsEnabled()) {
    try {
      const store = await getBlobsStore();
      if (store) {
        const getter =
          typeof store.getWithMetadata === "function"
            ? (k) => store.getWithMetadata(k, { type: "arrayBuffer" })
            : async (k) => {
                const data = await store.get(k, { type: "arrayBuffer" });
                return data ? { data, metadata: {} } : null;
              };

        const entry = await getter(imageKey);
        if (entry && entry.data) {
          const ext = safeFilename.split(".").pop().toLowerCase();
          const typeMap = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
          };
          const contentType =
            (entry.metadata && entry.metadata.contentType) || typeMap[ext] || "image/png";

          return {
            buffer: Buffer.from(entry.data),
            contentType,
          };
        }
      }
    } catch (e) {
      console.error("[getImage] Blobs error:", e);
    }
  }

  // Filesystem fallback
  const imagePath = path.join(DATA_DIR, "images", safeFilename);
  try {
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(safeFilename).slice(1).toLowerCase();
    const typeMap = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    const contentType = typeMap[ext] || "application/octet-stream";
    return { buffer, contentType };
  } catch (e) {
    return null;
  }
}

module.exports = {
  isBase64Image,
  storeImage,
  getImage,
};

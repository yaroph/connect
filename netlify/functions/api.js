const serverless = require("serverless-http");

// IMPORTANT (Netlify Blobs):
// This function runs in **Lambda compatibility mode** (exports.handler).
// In this mode, Netlify does NOT auto-configure the Blobs environment.
// Netlify's recommended fix is to call `connectLambda(event)` right before
// calling `getStore()` / `getDeployStore()`.
// Ref: Netlify support + docs.
let connectLambdaCached = null;
async function getConnectLambda() {
  if (connectLambdaCached) return connectLambdaCached;
  try {
    // eslint-disable-next-line global-require
    const mod = require("@netlify/blobs");
    connectLambdaCached = mod.connectLambda || (mod.default && mod.default.connectLambda) || null;
    return connectLambdaCached;
  } catch (_) {
    const mod = await import("@netlify/blobs");
    connectLambdaCached = mod.connectLambda || (mod.default && mod.default.connectLambda) || null;
    return connectLambdaCached;
  }
}

// Reuse the existing Express app.
const app = require("../../server/index.js");

// IMPORTANT: Binary responses (images) in AWS Lambda / Netlify Functions.
// Without declaring binary content-types, `serverless-http` may treat Buffers
// as UTF-8 strings and the browser will get corrupted data -> broken images.
// We explicitly enable binary passthrough for common image types.
const expressHandler = serverless(app, {
  binary: [
    "image/*",
    "application/octet-stream",
  ],
});

module.exports.handler = async (event, context) => {
  try {
    const connectLambda = await getConnectLambda();
    if (typeof connectLambda === "function") {
      // Must be called per-invocation, as early as possible.
      connectLambda(event);
    }
  } catch (e) {
    // If this fails, the routes will return a clearer error downstream.
    // Don't crash the whole function here.
  }
  return expressHandler(event, context);
};

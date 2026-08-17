function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Une erreur interne est survenue.";

  // Log serveur propre
  if (status >= 500) {
    console.error(`[Server Error 500] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(status).json({
    ok: false,
    error: message,
    status,
  });
}

module.exports = errorHandler;

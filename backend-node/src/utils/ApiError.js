/**
 * Error with an HTTP status and a stable machine-readable code. The message is
 * always safe to show to the client; never put secrets or stack traces in it.
 */
class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code || defaultCode(status);
    this.details = details;
  }
}

function defaultCode(status) {
  return (
    {
      400: "bad_request",
      401: "unauthenticated",
      403: "forbidden",
      404: "not_found",
      409: "conflict",
      413: "payload_too_large",
      415: "unsupported_media_type",
      422: "validation_failed",
      429: "rate_limited",
      503: "unavailable",
    }[status] || "error"
  );
}

module.exports = ApiError;

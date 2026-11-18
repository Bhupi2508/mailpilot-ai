/**
 * ProviderError.kind tells the delivery queue what is safe to do next:
 *
 *  transient - the provider definitely did NOT accept the message and asked us
 *              to try later (e.g. SMTP 4xx, HTTP 429). Safe to retry.
 *  permanent - rejected for this recipient (e.g. SMTP 550). Do not retry.
 *  fatal     - affects every message (bad credentials, quota exhausted). Stop
 *              the batch; remaining recipients are marked "skipped".
 *  unknown   - the connection failed after the message may have been
 *              transmitted. Never retried automatically, to avoid duplicates.
 */
class ProviderError extends Error {
  constructor(kind, message, { code, retryAfterMs } = {}) {
    super(message);
    this.kind = kind;
    this.code = code || kind;
    this.retryAfterMs = retryAfterMs;
  }
}

module.exports = { ProviderError };

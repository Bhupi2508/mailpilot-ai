/**
 * /api/emails: preview, send (creates a batch), batch status, history, retry.
 * All routes require a signed-in user; users only ever see their own batches.
 */
const { Router } = require("express");
const ApiError = require("../utils/ApiError");
const { requireAuth, uploadMiddleware } = require("../middleware");

const BATCH_STATUSES = ["sending", "completed", "partial", "failed"];

function emailRoutes({ config, batchService, limiters }) {
  const router = Router();
  router.use(requireAuth);

  router.get("/senders", async (req, res) => {
    res.json(await batchService.senders(req.user));
  });

  router.post("/preview", async (req, res) => {
    res.json(await batchService.preview(req.user, req.body || {}));
  });

  router.post("/send", limiters.send, uploadMiddleware(config), async (req, res) => {
    const result = await batchService.create(req.user, req.body || {}, req.files || [], req.get("idempotency-key"));
    if (result.replayed) res.set("Idempotent-Replayed", "true");
    res.status(result.replayed ? 200 : 202).json(result);
  });

  router.get("/stats", async (req, res) => {
    res.json(await batchService.stats(req.user));
  });

  router.get("/batches", async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && !BATCH_STATUSES.includes(status)) {
      throw new ApiError(422, `status must be one of: ${BATCH_STATUSES.join(", ")}.`);
    }
    res.json(await batchService.list(req.user, { page, limit, search, status }));
  });

  router.get("/batches/:id", async (req, res) => {
    res.json({ batch: await batchService.get(req.user, req.params.id) });
  });

  router.post("/batches/:id/retry", limiters.send, async (req, res) => {
    res.status(202).json(await batchService.retry(req.user, req.params.id));
  });

  return router;
}

module.exports = { emailRoutes };

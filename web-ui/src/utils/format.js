/** Display helpers shared by pages. */

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const DELIVERY_STATUS = {
  queued: { label: "Queued", tone: "" },
  sending: { label: "Sending", tone: "info" },
  accepted: { label: "Accepted", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  skipped: { label: "Not sent", tone: "warn" },
  unknown: { label: "Unknown", tone: "warn" },
};

export const BATCH_STATUS = {
  sending: { label: "Sending", tone: "info" },
  completed: { label: "Completed", tone: "ok" },
  partial: { label: "Partly failed", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
};

export const PROVIDER_LABEL = { demo: "Demo (simulated)", smtp: "SMTP", gmail: "Gmail API" };

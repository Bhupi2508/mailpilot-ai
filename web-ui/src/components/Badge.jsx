import { BATCH_STATUS, DELIVERY_STATUS } from "../utils/format";

/** Generic badge. Tones: ok, bad, warn, info, demo, or "" (neutral). */
export function Badge({ tone = "", plain = false, children, title }) {
  return (
    <span className={`badge${tone ? ` badge--${tone}` : ""}${plain ? " badge--plain" : ""}`} title={title}>
      {children}
    </span>
  );
}

export function DeliveryBadge({ status, simulated }) {
  const s = DELIVERY_STATUS[status] || { label: status, tone: "" };
  return <Badge tone={s.tone}>{status === "accepted" && simulated ? "Simulated" : s.label}</Badge>;
}

export function BatchBadge({ status }) {
  const s = BATCH_STATUS[status] || { label: status, tone: "" };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export default Badge;

/** A single number tile on the dashboard. tone: "ok" | "bad" | undefined. */
function StatCard({ label, value, tone, hint }) {
  return (
    <div className="stat">
      <div className={`stat__value${tone ? ` stat__value--${tone}` : ""}`}>{value}</div>
      <div className="stat__label">{label}</div>
      {hint && <div className="faint">{hint}</div>}
    </div>
  );
}

export default StatCard;

import "./StatCard.css";

/** A single statistics card used on the dashboard. */
function StatCard({ label, value, icon, tone = "sky" }) {
  return (
    <div className={`mp-statcard mp-statcard--${tone}`}>
      <div className="mp-statcard__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="mp-statcard__body">
        <span className="mp-statcard__value">{value}</span>
        <span className="mp-statcard__label">{label}</span>
      </div>
    </div>
  );
}

export default StatCard;

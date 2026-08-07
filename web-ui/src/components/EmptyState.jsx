import "./EmptyState.css";

/** Empty/error state placeholder with an icon, title, and optional action. */
function EmptyState({ icon = "📭", title, message, action }) {
  return (
    <div className="mp-empty">
      <div className="mp-empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export default EmptyState;

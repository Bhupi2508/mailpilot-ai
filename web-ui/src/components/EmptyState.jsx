/** Empty/error placeholder with an icon, title, message and optional action. */
function EmptyState({ icon = "📭", title, message, action }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export default EmptyState;

import "./Badge.css";

/** Status/mode badge. Tones: success, danger, pending, info, muted. */
function Badge({ tone = "muted", children }) {
  return <span className={`mp-badge mp-badge--${tone}`}>{children}</span>;
}

export default Badge;

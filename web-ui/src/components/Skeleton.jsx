import "./Skeleton.css";

/**
 * Loading skeleton placeholder.
 * Render with `variant` ('text' | 'card' | 'table' | 'circle') and optional
 * `width` / `height` style overrides.
 */
function Skeleton({ variant = "text", width, height, rows = 1 }) {
  if (variant === "table") {
    return (
      <div className="mp-skeleton mp-skeleton--table" style={{ width, height }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div className="mp-skeleton__row" key={i}>
            <span className="mp-skeleton mp-skeleton--text" />
            <span className="mp-skeleton mp-skeleton--text" />
            <span className="mp-skeleton mp-skeleton--text" />
            <span className="mp-skeleton mp-skeleton--text" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "circle") {
    return (
      <div
        className="mp-skeleton mp-skeleton--circle"
        style={{ width: width || 40, height: height || 40 }}
      />
    );
  }

  return (
    <div
      className={`mp-skeleton mp-skeleton--${variant}`}
      style={{ width, height }}
    />
  );
}

export default Skeleton;

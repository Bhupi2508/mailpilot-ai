/** MailPilot compass mark. Inherits color from `currentColor`. */
export default function Logo({ size = 30 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <path d="M20 6 L25 20 L20 34 L15 20 Z" fill="currentColor" />
      <circle cx="20" cy="20" r="3" fill="var(--navy)" />
    </svg>
  );
}

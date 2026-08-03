import { Bug, Star } from "lucide-react";
import { useState } from "react";
import { downloadDiagnosticReport } from "../../lib/diagnostics";

export function Brand(): React.ReactElement {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Star aria-hidden="true" size={15} fill="currentColor" />
      </span>
      <span>Plex Rating Quest</span>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  type = "button",
}: {
  readonly children: React.ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly variant?: "primary" | "secondary" | "ghost" | "danger";
  readonly type?: "button" | "submit";
}): React.ReactElement {
  return (
    <button
      className={`button button-${variant}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function DiagnosticsButton(): React.ReactElement {
  return (
    <button
      className="diagnostics-button"
      type="button"
      onClick={downloadDiagnosticReport}
      aria-label="Download privacy-safe diagnostics"
    >
      <Bug size={14} /> Diagnostics
    </button>
  );
}

export function Shell({
  children,
  compact = false,
}: {
  readonly children: React.ReactNode;
  readonly compact?: boolean;
}): React.ReactElement {
  return (
    <main className={`app-shell${compact ? " compact" : ""}`}>
      <div className="noise" />
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      {children}
      <DiagnosticsButton />
    </main>
  );
}

export function StarPicker({
  value,
  onChange,
  compact = false,
}: {
  readonly value: number | null;
  readonly onChange: (value: number) => void;
  readonly compact?: boolean;
}): React.ReactElement {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? value ?? 0;
  return (
    <div
      className={`star-picker${compact ? " compact" : ""}`}
      role="group"
      aria-label="Rating"
    >
      {[2, 4, 6, 8, 10].map((starValue, index) => (
        <button
          key={starValue}
          aria-label={`${index + 1} stars`}
          onMouseEnter={() => setHovered(starValue)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(starValue)}
          onBlur={() => setHovered(null)}
          onClick={() => onChange(starValue)}
        >
          <Star fill={active >= starValue ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

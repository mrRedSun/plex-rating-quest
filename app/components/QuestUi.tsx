import { Bug, LogOut, Star, UserRound } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { downloadDiagnosticReport } from "../../lib/diagnostics";
import { useQuestStore } from "../../store/quest-store";
import { LanguageControl } from "./Localization";

export { LanguageControl };

export const Brand = observer(function Brand(): React.ReactElement {
  const hasLoadedData = useQuestStore((state) => state.media.length > 0);
  const setStage = useQuestStore((state) => state.setStage);
  const destination = hasLoadedData ? "/quests" : "/";
  return (
    <a
      className="brand"
      href={destination}
      onClick={(event) => {
        event.preventDefault();
        setStage(hasLoadedData ? "mode" : "welcome");
      }}
      aria-label="Plex Rating Quest home"
    >
      <span className="brand-mark">
        <Star aria-hidden="true" size={15} fill="currentColor" />
      </span>
      <span>Plex Rating Quest</span>
    </a>
  );
});

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

export const AccountControls = observer(
  function AccountControls(): React.ReactElement | null {
    const accessToken = useQuestStore((state) => state.accessToken);
    const userName = useQuestStore((state) => state.userName);
    const serverName = useQuestStore(
      (state) => state.selectedServer?.name ?? null,
    );
    const logout = useQuestStore((state) => state.logout);
    if (accessToken === null) return null;
    return (
      <div className="account-controls" aria-label="Connected Plex account">
        <UserRound aria-hidden="true" size={16} />
        <span>
          <strong>{userName}</strong>
          {serverName === null ? null : <small>{serverName}</small>}
        </span>
        <button
          type="button"
          onClick={logout}
          aria-label={`Log out ${userName}`}
        >
          <LogOut aria-hidden="true" size={15} />
          <span>Log out</span>
        </button>
      </div>
    );
  },
);

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
      <footer className="shell-utilities">
        <AccountControls />
        <LanguageControl />
        <DiagnosticsButton />
      </footer>
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

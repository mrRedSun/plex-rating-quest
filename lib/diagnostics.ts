const STORAGE_KEY = "plex-rating-quest-diagnostics";
const MAX_EVENTS = 400;
const MAX_TEXT_LENGTH = 240;
const SENSITIVE_KEY = /auth|code|credential|password|pin|secret|token|uri|url/i;
const SENSITIVE_TEXT =
  /(bearer\s+)[^\s]+|([?&](?:authToken|token|X-Plex-Token)=)[^&\s]+/gi;

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";
type DiagnosticValue = boolean | number | string | null;
type DiagnosticContext = Readonly<Record<string, DiagnosticValue>>;

export interface DiagnosticEvent {
  readonly timestamp: string;
  readonly level: DiagnosticLevel;
  readonly event: string;
  readonly context: DiagnosticContext;
}

function redactText(value: string): string {
  return value
    .replaceAll(SENSITIVE_TEXT, "$1$2[redacted]")
    .slice(0, MAX_TEXT_LENGTH);
}

function sanitizeContext(context: DiagnosticContext): DiagnosticContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? "[redacted]"
        : typeof value === "string"
          ? redactText(value)
          : value,
    ]),
  );
}

function readEvents(): DiagnosticEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed.slice(-MAX_EVENTS) as DiagnosticEvent[])
      : [];
  } catch {
    return [];
  }
}

function writeEvents(events: readonly DiagnosticEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_EVENTS)),
    );
  } catch {
    // Diagnostics must never interfere with the rating flow.
  }
}

export function logEvent(
  event: string,
  context: DiagnosticContext = {},
  level: DiagnosticLevel = "info",
): void {
  const entry: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    level,
    event: redactText(event),
    context: sanitizeContext(context),
  };
  writeEvents([...readEvents(), entry]);
}

export function logError(
  event: string,
  reason: unknown,
  context: DiagnosticContext = {},
): void {
  logEvent(
    event,
    {
      ...context,
      errorType: reason instanceof Error ? reason.name : "UnknownError",
      errorMessage:
        reason instanceof Error
          ? redactText(reason.message)
          : "Unknown failure",
    },
    "error",
  );
}

export function createDiagnosticReport(): string {
  const viewport =
    typeof window === "undefined"
      ? null
      : `${window.innerWidth}x${window.innerHeight}`;
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      application: "Plex Rating Quest",
      version: "1.0.0",
      environment: {
        online: typeof navigator === "undefined" ? null : navigator.onLine,
        language: typeof navigator === "undefined" ? null : navigator.language,
        viewport,
        reducedMotion:
          typeof window === "undefined" ||
          typeof window.matchMedia !== "function"
            ? null
            : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      },
      privacy:
        "Tokens, PINs, credentials, server addresses, and URLs are never intentionally recorded.",
      events: readEvents(),
    },
    null,
    2,
  );
}

export function downloadDiagnosticReport(): void {
  const blob = new Blob([createDiagnosticReport()], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `plex-rating-quest-diagnostics-${new Date().toISOString().replaceAll(":", "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  logEvent("diagnostics.exported", { eventCount: readEvents().length });
}

export function clearDiagnostics(): void {
  if (typeof window !== "undefined")
    window.sessionStorage.removeItem(STORAGE_KEY);
}

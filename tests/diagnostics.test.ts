import { beforeEach, describe, expect, it } from "vitest";
import { createDiagnosticReport, logError, logEvent } from "../lib/diagnostics";

describe("privacy-safe diagnostics", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("redacts sensitive keys and query parameters", () => {
    logEvent("auth.test", { token: "secret-value", serverUrl: "https://private.example", count: 2 });
    logError("request.failed", new Error("Failed at https://example.test/?X-Plex-Token=top-secret"));

    const report = createDiagnosticReport();
    expect(report).not.toContain("secret-value");
    expect(report).not.toContain("private.example");
    expect(report).not.toContain("top-secret");
    expect(report).toContain("[redacted]");
    expect(report).toContain('"count": 2');
  });

  it("keeps event history bounded", () => {
    for (let index = 0; index < 450; index += 1) logEvent("bounded.event", { index }, "debug");
    const parsed = JSON.parse(createDiagnosticReport()) as { events: readonly unknown[] };
    expect(parsed.events).toHaveLength(400);
  });
});

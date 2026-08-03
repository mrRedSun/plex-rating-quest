import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingPlexPin,
  readPendingPlexPin,
  savePendingPlexPin,
} from "../lib/plex-client";

describe("resumable Plex authentication", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores a pending PIN after navigation without logging its value", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    savePendingPlexPin({ id: 42, code: "private-pin" });

    expect(readPendingPlexPin()).toEqual({ id: 42, code: "private-pin" });
    expect(
      window.sessionStorage.getItem("plex-rating-quest-diagnostics"),
    ).not.toContain("private-pin");
  });

  it("removes expired pending authentication", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(700_001);
    savePendingPlexPin({ id: 42, code: "expired-pin" });

    expect(readPendingPlexPin()).toBeNull();
    expect(
      window.localStorage.getItem("plex-rating-quest-pending-pin"),
    ).toBeNull();
  });

  it("clears pending authentication after completion", () => {
    savePendingPlexPin({ id: 42, code: "private-pin" });
    clearPendingPlexPin();

    expect(readPendingPlexPin()).toBeNull();
  });
});

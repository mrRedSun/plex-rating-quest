import { describe, expect, it } from "vitest";
import {
  HISTORY_STAGE_KEY,
  legalPageFromPath,
  pathForStage,
  stageFromHistoryState,
} from "../lib/navigation";

describe("browser navigation", () => {
  it("uses stable website paths for app screens", () => {
    expect(pathForStage("welcome")).toBe("/");
    expect(pathForStage("tier-list")).toBe("/tier-list");
    expect(pathForStage("review")).toBe("/review");
    expect(pathForStage("dashboard")).toBe("/ratings");
  });

  it("accepts only known app history entries", () => {
    expect(stageFromHistoryState({ [HISTORY_STAGE_KEY]: "filters" })).toBe(
      "filters",
    );
    expect(
      stageFromHistoryState({ [HISTORY_STAGE_KEY]: "unknown" }),
    ).toBeNull();
    expect(stageFromHistoryState(null)).toBeNull();
  });

  it("recognizes only supported legal page paths", () => {
    expect(legalPageFromPath("/privacy")).toBe("privacy");
    expect(legalPageFromPath("/terms")).toBe("terms");
    expect(legalPageFromPath("/privacy/extra")).toBeNull();
  });
});

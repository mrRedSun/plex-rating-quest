import type { QuestStage } from "./types";

const STAGE_PATHS: Readonly<Record<QuestStage, string>> = {
  welcome: "/",
  mode: "/quests",
  filters: "/filters",
  rating: "/rating",
  review: "/review",
  applying: "/applying",
  complete: "/complete",
  dashboard: "/ratings",
  "tier-list": "/tier-list",
};

export const HISTORY_STAGE_KEY = "plexRatingQuestStage";

export function pathForStage(stage: QuestStage): string {
  return STAGE_PATHS[stage];
}

export function stageFromHistoryState(state: unknown): QuestStage | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as Record<string, unknown>)[HISTORY_STAGE_KEY];
  return Object.hasOwn(STAGE_PATHS, String(candidate))
    ? (candidate as QuestStage)
    : null;
}

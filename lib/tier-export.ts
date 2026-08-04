import { logEvent } from "./diagnostics";
import { getLocale } from "./localization";
import { createTierListMarkdown, RANKED_TIERS, showsInTier } from "./tier-list";
import type { MediaItem, TierAssignments } from "./types";

const TIER_COLORS = [
  "#e5a00d",
  "#d85f75",
  "#9b6fd3",
  "#4d8ed8",
  "#52616f",
] as const;

function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTierListMarkdown(
  items: readonly MediaItem[],
  assignments: TierAssignments,
): void {
  const markdown = createTierListMarkdown(items, assignments);
  downloadBlob(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    "plex-show-tier-list.md",
  );
  logEvent("tier_list.exported", {
    format: "markdown",
    showCount: items.length,
  });
}

function wrapTitles(
  context: CanvasRenderingContext2D,
  titles: readonly string[],
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const title of titles) {
    const candidate = line.length === 0 ? title : `${line}  ·  ${title}`;
    if (context.measureText(candidate).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = title;
    } else line = candidate;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export async function downloadTierListImage(
  items: readonly MediaItem[],
  assignments: TierAssignments,
): Promise<void> {
  const ukrainian = getLocale() === "uk";
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  const measuringContext = canvas.getContext("2d");
  if (measuringContext === null)
    throw new Error("Image export is unavailable in this browser.");
  measuringContext.font = "600 24px system-ui, sans-serif";
  const rows = RANKED_TIERS.map((tier) => {
    const tierItems = showsInTier(items, assignments, tier);
    const lines = wrapTitles(
      measuringContext,
      tierItems.map((item) => item.title),
      1180,
    );
    return { tier, lines, height: Math.max(145, lines.length * 36 + 54) };
  });
  canvas.height =
    270 + rows.reduce((total, row) => total + row.height + 13, 0) + 90;
  const context = canvas.getContext("2d");
  if (context === null)
    throw new Error("Image export is unavailable in this browser.");

  const gradient = context.createLinearGradient(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  gradient.addColorStop(0, "#08070b");
  gradient.addColorStop(0.55, "#17101a");
  gradient.addColorStop(1, "#291426");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffc84b";
  context.font = "700 26px system-ui, sans-serif";
  context.fillText("PLEX RATING QUEST", 90, 90);
  context.fillStyle = "#f6f0df";
  context.font = "700 64px system-ui, sans-serif";
  context.fillText(
    ukrainian ? "Мій тірліст серіалів" : "My Show Tier List",
    90,
    165,
  );
  context.fillStyle = "#aaa3ad";
  context.font = "24px system-ui, sans-serif";
  context.fillText(
    ukrainian
      ? `${items.length} переглянутих серіалів · створено локально у браузері`
      : `${items.length} watched shows · built locally in your browser`,
    92,
    212,
  );

  let rowY = 270;
  rows.forEach(({ tier, lines, height }, index) => {
    context.fillStyle = "rgba(255,255,255,.055)";
    context.fillRect(90, rowY, 1420, height);
    context.fillStyle = TIER_COLORS[index] ?? "#e5a00d";
    context.fillRect(90, rowY, 150, height);
    context.fillStyle = "#120d14";
    context.font = "800 58px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(tier, 165, rowY + height / 2 + 20);
    context.textAlign = "left";
    context.fillStyle = "#f6f0df";
    context.font = "600 24px system-ui, sans-serif";
    lines.forEach((line, lineIndex) =>
      context.fillText(line, 280, rowY + 48 + lineIndex * 36),
    );
    rowY += height + 13;
  });

  context.fillStyle = "#827b84";
  context.font = "20px system-ui, sans-serif";
  context.fillText(
    ukrainian
      ? "Експорт містить лише назви — без облікових даних, токенів чи інформації про сервер Plex."
      : "Export contains titles only — no Plex credentials, tokens, or server details.",
    90,
    canvas.height - 38,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result === null)
        reject(new Error("The tier-list image could not be encoded."));
      else resolve(result);
    }, "image/png");
  });
  downloadBlob(blob, "plex-show-tier-list.png");
  logEvent("tier_list.exported", { format: "png", showCount: items.length });
}

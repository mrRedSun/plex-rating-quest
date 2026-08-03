import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlexRatingQuest } from "../app/components/PlexRatingQuest";
import "../app/globals.css";
import { logError, logEvent } from "../lib/diagnostics";
import { questStore } from "../store/quest-store";

window.addEventListener("error", (event) => {
  logError("runtime.window.error", event.error, { source: "window" });
});
window.addEventListener("unhandledrejection", (event) => {
  logError("runtime.promise.unhandled", event.reason, { source: "promise" });
});
window.addEventListener("online", () => logEvent("runtime.network.online"));
window.addEventListener("offline", () =>
  logEvent("runtime.network.offline", {}, "warn"),
);

const rootElement = document.querySelector<HTMLDivElement>("#root");
if (rootElement === null) throw new Error("Application root is missing");

logEvent("application.started", { build: import.meta.env.MODE });
questStore.startPersistence();
createRoot(rootElement).render(
  <StrictMode>
    <PlexRatingQuest />
  </StrictMode>,
);

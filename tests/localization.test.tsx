import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalizationRuntime } from "../app/components/Localization";
import { PlexRatingQuest } from "../app/components/PlexRatingQuest";
import { getLocale, setLocale, translate } from "../lib/localization";
import { questStore } from "../store/quest-store";

describe("Ukrainian localization", () => {
  beforeEach(() => {
    window.localStorage.clear();
    questStore.logout();
  });

  afterEach(() => {
    cleanup();
    questStore.logout();
    document.documentElement.lang = "en";
  });

  it("persists Ukrainian and translates centralized product copy", () => {
    setLocale("uk");

    expect(getLocale()).toBe("uk");
    expect(translate("Choose your quest")).toBe("Оберіть квест");
    expect(translate("Log out")).toBe("Вийти");
  });

  it("switches the rendered login flow between Ukrainian and English", async () => {
    render(
      <>
        <LocalizationRuntime />
        <PlexRatingQuest />
      </>,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "uk" },
    });

    expect(
      await screen.findByRole("button", { name: /увійти через plex/i }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "uk");
    expect(getLocale()).toBe("uk");

    fireEvent.change(screen.getByRole("combobox", { name: "Мова" }), {
      target: { value: "en" },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /continue with plex/i }),
      ).toBeInTheDocument(),
    );
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });
});

import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getLocale,
  setLocale,
  subscribeToLocale,
  translate,
  type Locale,
} from "../../lib/localization";

const translatedText = new WeakMap<
  Text,
  { original: string; rendered: string }
>();
const translatedAttributes = new WeakMap<
  Element,
  Map<string, { original: string; rendered: string }>
>();
const LOCALIZED_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;

function translateDynamic(value: string, locale: Locale): string {
  if (locale === "en") return value;
  const replacements: readonly [RegExp, string][] = [
    [/^Welcome, (.+)$/u, "Вітаємо, $1"],
    [
      /^(\d[\d,. ]*) movies · (\d[\d,. ]*) shows ready to rate$/u,
      "$1 фільмів · $2 серіалів готові до оцінювання",
    ],
    [/^(\d[\d,. ]*) titles$/u, "$1 тайтлів"],
    [/^of (\d+) ranked$/u, "із $1 розташовано"],
    [/^Drop here · (\d+) in trash$/u, "Перетягніть сюди · у кошику: $1"],
    [/^Tier for (.+)$/u, "Рівень для $1"],
    [
      /^Restore (.+) to the unranked queue$/u,
      "Повернути $1 до черги без рейтингу",
    ],
    [/^Remove (.+) from this tier list$/u, "Видалити $1 із цього тірліста"],
    [/^(movie|show) · (.+)$/u, "$1 · $2"],
    [/^watched (\d+)×$/u, "переглянуто $1×"],
    [/^(\d+) min$/u, "$1 хв"],
    [/^(\d+)% · (\d+) remaining$/u, "$1% · залишилося: $2"],
    [/^(\d+(?:\.\d+)?) out of 5$/u, "$1 із 5"],
    [/^(\d+) shown$/u, "показано: $1"],
    [/^Apply (\d+) ratings$/u, "Застосувати оцінки: $1"],
    [/^(\d+) ratings added\.$/u, "Додано оцінок: $1."],
    [/^Remove (.+) from batch$/u, "Видалити $1 із пакета"],
    [/^(.+) poster$/u, "Постер $1"],
    [/^(movie|show) · watched (\d+)×$/u, "$1 · переглянуто $2×"],
    [/^(\d+)h (\d+)m$/u, "$1 год $2 хв"],
  ];
  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

function localizeValue(value: string, locale: Locale): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  const localized = translateDynamic(translate(trimmed, locale), locale);
  return value.replace(trimmed, localized);
}

function localizeTextNode(node: Text, locale: Locale): void {
  const previous = translatedText.get(node);
  const current = node.data;
  const original = previous?.rendered === current ? previous.original : current;
  const rendered = localizeValue(original, locale);
  translatedText.set(node, { original, rendered });
  if (current !== rendered) node.data = rendered;
}

function localizeAttributes(element: Element, locale: Locale): void {
  const records =
    translatedAttributes.get(element) ??
    new Map<string, { original: string; rendered: string }>();
  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (current === null) continue;
    const previous = records.get(attribute);
    const original =
      previous?.rendered === current ? previous.original : current;
    const rendered = localizeValue(original, locale);
    records.set(attribute, { original, rendered });
    if (current !== rendered) element.setAttribute(attribute, rendered);
  }
  translatedAttributes.set(element, records);
}

function localizeTree(root: Node, locale: Locale): void {
  if (root instanceof Text) localizeTextNode(root, locale);
  if (root instanceof Element) localizeAttributes(root, locale);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node !== null) {
    if (node instanceof Text) localizeTextNode(node, locale);
    else if (node instanceof Element) localizeAttributes(node, locale);
    node = walker.nextNode();
  }
}

export function LocalizationRuntime(): null {
  useEffect(() => {
    let locale = getLocale();
    localizeTree(document.body, locale);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData")
          localizeTree(mutation.target, locale);
        else for (const node of mutation.addedNodes) localizeTree(node, locale);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const unsubscribe = subscribeToLocale((nextLocale) => {
      locale = nextLocale;
      document.documentElement.lang = locale === "uk" ? "uk" : "en";
      localizeTree(document.body, locale);
    });
    document.documentElement.lang = locale === "uk" ? "uk" : "en";
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);
  return null;
}

export function LanguageControl(): React.ReactElement {
  const [locale, updateLocale] = useState<Locale>(getLocale);
  useEffect(() => subscribeToLocale(updateLocale), []);
  return (
    <label className="language-control">
      <Languages aria-hidden="true" size={14} />
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </label>
  );
}

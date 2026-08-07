export const LOCALES = ["en", "uk"] as const;
export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = "plex-rating-quest-locale";
const CHANGE_EVENT = "plex-rating-quest-locale-change";

const UKRAINIAN: Readonly<Record<string, string>> = {
  "Protected session · self-hosted": "Захищена сесія · власний сервер",
  "Your watch history, reimagined": "Ваша історія переглядів по-новому",
  "Rate your library.": "Оцініть свою медіатеку.",
  "Finish the quest.": "Завершіть квест.",
  "Turn a mountain of watched titles into a fast, cinematic rating game. Nothing reaches Plex until you say so.":
    "Перетворіть гору переглянутих тайтлів на швидку кінематографічну гру з оцінюванням. Нічого не потрапить у Plex без вашого підтвердження.",
  "Your self-hosted container connects to Plex for you. Plex tokens are encrypted in its persistent volume and never exposed to browser JavaScript. Your browser receives only a secure, HttpOnly session cookie; logging out deletes the server-side session.":
    "Ваш власний контейнер підключається до Plex від вашого імені. Токени Plex зберігаються зашифрованими в постійному томі й ніколи не передаються JavaScript у браузері. Браузер отримує лише захищений HttpOnly cookie сесії; вихід видаляє серверну сесію.",
  "Continue with Plex": "Увійти через Plex",
  "Waiting for Plex": "Очікуємо на Plex",
  "Load my Plex data": "Завантажити мої дані Plex",
  "Loading Plex data": "Завантажуємо дані Plex",
  "Explore demo": "Переглянути демо",
  "Official PIN sign-in": "Офіційний вхід за PIN",
  "Batch confirmation": "Пакетне підтвердження",
  "Local queue": "Локальна черга",
  "NOW RATING · 142 / 643": "ЗАРАЗ ОЦІНЮЄМО · 142 / 643",
  "Sci-Fi · Drama · 2h 28m": "Фантастика · Драма · 2 год 28 хв",
  "🔥 27 streak": "🔥 серія 27",
  "63% complete": "63% завершено",
  "Choose your server": "Оберіть сервер",
  "We found more than one Plex Media Server.":
    "Знайдено кілька серверів Plex Media Server.",
  "Step 1 of 2": "Крок 1 із 2",
  "Choose your quest": "Оберіть квест",
  titles: "тайтлів",
  Recommended: "Рекомендовано",
  "Watched only": "Лише переглянуте",
  "The titles you know best.": "Тайтли, які ви знаєте найкраще.",
  "Unrated only": "Лише без оцінки",
  "Clear your rating backlog.": "Розберіть чергу неоцінених тайтлів.",
  Everything: "Усе",
  "Revisit every title.": "Поверніться до кожного тайтлу.",
  "Movies only": "Лише фільми",
  "A feature-length quest.": "Повнометражний квест.",
  "Shows only": "Лише серіали",
  "Rate the series, skip the episodes.": "Оцінюйте серіали, а не епізоди.",
  "Open ratings dashboard": "Відкрити панель оцінок",
  "Review and copy ratings for recommendations":
    "Переглядайте й копіюйте оцінки для рекомендацій",
  "Build a show tier list": "Створити тірліст серіалів",
  "Rank watched shows and export it":
    "Розташуйте переглянуті серіали та експортуйте результат",
  "Set your filters": "Налаштувати фільтри",
  "Your taste profile": "Ваш профіль уподобань",
  "Ratings dashboard": "Панель оцінок",
  "Your Plex ratings, ready to explore or share with an agent.":
    "Ваші оцінки Plex — для аналізу або передачі ШІ-агенту.",
  "Copy shows for AI": "Копіювати серіали для ШІ",
  Copied: "Скопійовано",
  "Rated titles": "Оцінені тайтли",
  "Rated shows": "Оцінені серіали",
  Average: "Середня оцінка",
  "No Plex ratings yet": "У Plex ще немає оцінок",
  "Rate a few titles, then reload your Plex data.":
    "Оцініть кілька тайтлів і знову завантажте дані Plex.",
  "Back to quests": "Назад до квестів",
  "Year unknown": "Рік невідомий",
  "Step 2 of 2": "Крок 2 із 2",
  "Build your challenge": "Створіть своє випробування",
  "Shape the quest.": "Налаштуйте квест.",
  "Pick a vibe, sharpen the rules, then chase the streak.":
    "Оберіть настрій, уточніть правила й нарощуйте серію.",
  "ratings / min": "оцінок / хв",
  "Speed run": "Швидкий забіг",
  "Everything eligible": "Усе доступне",
  "Deep cuts": "Улюблена класика",
  "Rewatched classics": "Переглянута повторно класика",
  "Modern hits": "Сучасні хіти",
  "Set the rules": "Встановіть правила",
  "Every choice updates your quest forecast instantly.":
    "Кожен вибір миттєво оновлює прогноз квесту.",
  "Minimum watches": "Мінімум переглядів",
  "Watched mode always requires 1+": "Режим переглянутого завжди вимагає 1+",
  "Zero includes unwatched titles": "Нуль включає непереглянуті тайтли",
  Library: "Медіатека",
  "Choose your arena": "Оберіть свою арену",
  "All libraries": "Усі медіатеки",
  "From year": "Від року",
  "Start of the era": "Початок епохи",
  "Through year": "До року",
  "End of the era": "Кінець епохи",
  Genre: "Жанр",
  "Follow your current mood": "Орієнтуйтеся на свій настрій",
  "Surprise me — all genres": "Здивуйте мене — усі жанри",
  "Skip documentaries": "Пропускати документальні",
  "Keep it fictional": "Залишити лише художнє",
  "Grown-up mode": "Дорослий режим",
  "Hide kids & family": "Сховати дитяче та сімейне",
  "titles await": "тайтлів очікують",
  "Estimated run": "Орієнтовний час",
  "Mode lock": "Обраний режим",
  "Plex changes": "Зміни в Plex",
  "Final checkpoint": "Фінальне підтвердження",
  "First milestone at 25 ratings": "Перша ціль — 25 оцінок",
  "Start rating": "Почати оцінювання",
  "Reset filters": "Скинути фільтри",
  "No titles found": "Тайтлів не знайдено",
  "Try widening your filters or choosing another quest.":
    "Розширте фільтри або оберіть інший квест.",
  "Back to filters": "Назад до фільтрів",
  "Change filters": "Змінити фільтри",
  remaining: "залишилося",
  AUDIENCE: "ГЛЯДАЧІ",
  CRITICS: "КРИТИКИ",
  "LAST WATCHED": "ОСТАННІЙ ПЕРЕГЛЯД",
  "What did you think?": "Що ви думаєте?",
  Pause: "Пауза",
  "Take a breather.": "Зробіть перепочинок.",
  "Your ratings are saved on this device.":
    "Ваші оцінки збережено на цьому пристрої.",
  "Pause quest": "Призупинити квест",
  "Choose a rating": "Оберіть оцінку",
  Skip: "Пропустити",
  Space: "Пробіл",
  "Remove rating": "Видалити оцінку",
  Rate: "Оцінити",
  Navigate: "Навігація",
  Previous: "Назад",
  Next: "Далі",
  "Quest paused": "Квест призупинено",
  "Keep this tab open. Your queue is safe.":
    "Не закривайте вкладку. Ваша черга збережена.",
  Resume: "Продовжити",
  "Review & finish": "Перевірити й завершити",
  "Leave quest": "Вийти з квесту",
  "End quest": "Завершити квест",
  "Review your ratings": "Перевірте свої оцінки",
  "Make any last changes before committing this batch to Plex.":
    "Внесіть останні зміни перед застосуванням цього пакета в Plex.",
  "pending changes": "змін очікують",
  "No matching ratings.": "Відповідних оцінок немає.",
  shown: "показано",
  "Keep rating": "Продовжити оцінювання",
  "One batch. Your control.": "Один пакет. Усе під вашим контролем.",
  "You’ll see progress and any failures.": "Ви побачите прогрес і всі помилки.",
  "Committing your quest": "Застосовуємо ваш квест",
  "Applying ratings…": "Застосовуємо оцінки…",
  "Nothing changes in Plex until you confirm this batch.":
    "У Plex нічого не зміниться, доки ви не підтвердите пакет.",
  "Search your ratings": "Пошук серед оцінок",
  "Apply ratings to Plex": "Застосувати оцінки в Plex",
  "Saving to Plex": "Зберігаємо в Plex",
  "Applying your ratings…": "Застосовуємо ваші оцінки…",
  "Quest complete": "Квест завершено",
  "ratings added.": "оцінок додано.",
  "Your library has never looked more personal.":
    "Ваша медіатека ще ніколи не була настільки особистою.",
  "Average rating": "Середня оцінка",
  "Top genre": "Улюблений жанр",
  "Five-star titles": "Тайтли з п’ятьма зірками",
  "Completed in": "Завершено за",
  Rerated: "Переоцінено",
  Skipped: "Пропущено",
  "Start another quest": "Почати інший квест",
  "Rank your watched shows.": "Розташуйте переглянуті серіали.",
  "Tier List Studio": "Студія тірлістів",
  "Turn taste into a map": "Перетворіть уподобання на мапу",
  "Drag shows into tiers or use the accessible tier menu. Your draft stays on this device.":
    "Перетягуйте серіали між рівнями або скористайтеся доступним меню. Чернетка зберігається на цьому пристрої.",
  "Export MD": "Експортувати MD",
  "Minimum plays": "Мінімум переглядів",
  "Minimum year": "Мінімальний рік",
  "Maximum year": "Максимальний рік",
  "Hide documentaries": "Сховати документальні",
  "Hide kids & family titles": "Сховати дитячі та сімейні тайтли",
  "All-time favorites": "Улюблені назавжди",
  Excellent: "Відмінні",
  Great: "Чудові",
  "Good enough": "Непогані",
  "Not for me": "Не для мене",
  Unranked: "Без рейтингу",
  Trash: "Кошик",
  "All show libraries": "Усі медіатеки серіалів",
  "All genres": "Усі жанри",
  "Drop a show here": "Перетягніть серіал сюди",
  "Unranked queue": "Черга без рейтингу",
  "Find a show…": "Знайти серіал…",
  "No unranked shows match.": "Немає відповідних серіалів.",
  "Removed shows": "Видалені серіали",
  Open: "Відкрити",
  Close: "Закрити",
  "Trash is empty.": "Кошик порожній.",
  "Export image": "Експортувати зображення",
  "Export Markdown": "Експортувати Markdown",
  "Clear tier list": "Очистити тірліст",
  "Log out": "Вийти",
  Diagnostics: "Діагностика",
  Rating: "Оцінка",
  Never: "Ніколи",
  movie: "фільм",
  show: "серіал",
  "Plex ratings": "Оцінки Plex",
  "Search ratings": "Пошук оцінок",
  Language: "Мова",
  English: "Англійська",
  "Download privacy-safe diagnostics":
    "Завантажити діагностику без приватних даних",
  "Connected Plex account": "Підключений обліковий запис Plex",
  "Quest presets": "Шаблони квесту",
  "Unranked shows drop area": "Зона для серіалів без рейтингу",
  "Removed shows drop area": "Зона для видалених серіалів",
  "Search unranked shows": "Пошук серіалів без рейтингу",
  "Hide kids and family titles": "Сховати дитячі та сімейні тайтли",
  "Recommend shows based on my Plex ratings. Avoid recommending titles already listed unless explaining a close comparison.":
    "Порекомендуй серіали на основі моїх оцінок у Plex. Не рекомендуй уже перелічені тайтли, хіба що для пояснення близького порівняння.",
  "My rated shows:": "Мої оцінені серіали:",
  "Copy failed. Allow clipboard access and try again.":
    "Не вдалося скопіювати. Дозвольте доступ до буфера обміну та повторіть спробу.",
  "Your browser blocked the Plex sign-in window. Allow pop-ups for this site and try again.":
    "Браузер заблокував вікно входу Plex. Дозвольте спливні вікна для цього сайту та повторіть спробу.",
  "No reachable Plex Media Server was found.":
    "Не знайдено доступного Plex Media Server.",
  "No Plex server was selected.": "Сервер Plex не вибрано.",
  "None of this Plex server's connections are reachable from this browser.":
    "Жодне підключення до цього сервера Plex не доступне з цього браузера.",
  "Plex connection failed.": "Не вдалося підключитися до Plex.",
  "Plex data pull failed.": "Не вдалося завантажити дані Plex.",
  "Image export failed.": "Не вдалося експортувати зображення.",
};

export function getLocale(): Locale {
  return window.localStorage.getItem(STORAGE_KEY) === "uk" ? "uk" : "en";
}

export function setLocale(locale: Locale): void {
  window.localStorage.setItem(STORAGE_KEY, locale);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: locale }));
}

export function subscribeToLocale(
  listener: (locale: Locale) => void,
): () => void {
  const handleChange = (event: Event): void => {
    listener((event as CustomEvent<Locale>).detail);
  };
  window.addEventListener(CHANGE_EVENT, handleChange);
  return () => window.removeEventListener(CHANGE_EVENT, handleChange);
}

export function translate(value: string, locale = getLocale()): string {
  if (locale === "en") return value;
  return UKRAINIAN[value] ?? value;
}

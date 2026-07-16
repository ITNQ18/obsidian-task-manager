export type LanguageSetting = "system" | "zh-CN" | "en";
export type UiLanguage = "zh-CN" | "en";

const ZH_WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
] as const;

const ZH_SHORT_WEEKDAYS = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
] as const;

const EN_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const EN_SHORT_WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export function resolveLanguage(
  setting: LanguageSetting,
  obsidianLocale: string | undefined,
): UiLanguage {
  if (setting !== "system") {
    return setting;
  }

  return obsidianLocale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function normalizeVaultFolderInput(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

export function isIgnoredVaultPath(value: string): boolean {
  const normalized = normalizeVaultFolderInput(value);
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments.some((segment) => {
    const lower = segment.toLowerCase();
    return (
      segment.startsWith(".") ||
      lower === "node_modules" ||
      lower === "plugins"
    );
  });
}

export function insertTextAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insertion: string,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  return {
    value: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
    cursor: start + insertion.length,
  };
}

export function getDefaultFilenamePattern(language: UiLanguage): string {
  return language === "zh-CN"
    ? "{YYYY}.{M}.{D}（{weekday}）日报"
    : "{YYYY}-{MM}-{DD} Daily Report";
}

export function getDefaultTemplate(language: UiLanguage): string {
  if (language === "zh-CN") {
    return [
      "## 完成工作",
      "",
      "-",
      "",
      "## 遗留问题",
      "",
      "-",
      "",
      "## 后续计划",
      "",
      "- [ ] ~",
    ].join("\n");
  }

  return [
    "## Completed work",
    "",
    "-",
    "",
    "## Remaining issues",
    "",
    "-",
    "",
    "## Next steps",
    "",
    "- [ ] ~",
  ].join("\n");
}

export function getDefaultTitleTemplate(language: UiLanguage): string {
  return language === "zh-CN"
    ? "# {{date}}（{{weekday}}）日报"
    : "# {{date}} Daily Report";
}

export function filenameContainsDateParts(
  filename: string,
  date: Date,
): boolean {
  const available = new Map<number, number>();
  for (const token of filename.match(/\d+/gu) ?? []) {
    const number = Number(token);
    available.set(number, (available.get(number) ?? 0) + 1);
  }

  for (const expected of [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ]) {
    const count = available.get(expected) ?? 0;
    if (count < 1) {
      return false;
    }
    available.set(expected, count - 1);
  }
  return true;
}

export function formatFilename(
  pattern: string,
  date: Date,
  language: UiLanguage,
): string {
  const values = getDateValues(date, language);
  let filename = replaceTokens(pattern, {
    YYYY: values.year,
    YY: values.shortYear,
    M: values.month,
    MM: values.paddedMonth,
    D: values.day,
    DD: values.paddedDay,
    weekday: values.weekday,
    weekdayShort: values.weekdayShort,
    weekdayEn: values.weekdayEn,
    weekdayEnShort: values.weekdayEnShort,
  });

  filename = filename
    .replace(/[<>:"/\\|?*]/g, "-")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!filename || filename.startsWith(".")) {
    return "";
  }

  return filename.toLowerCase().endsWith(".md")
    ? filename
    : `${filename}.md`;
}

export function renderTemplate(
  template: string,
  date: Date,
  language: UiLanguage,
  filename: string,
): string {
  const values = getDateValues(date, language);
  const dateText =
    language === "zh-CN"
      ? `${values.year}.${values.month}.${values.day}`
      : `${values.year}-${values.paddedMonth}-${values.paddedDay}`;

  return replaceDoubleBraceTokens(template, {
    date: dateText,
    year: values.year,
    month: values.month,
    day: values.day,
    weekday: values.weekday,
    time: `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`,
    filename,
  });
}

function getDateValues(date: Date, language: UiLanguage) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1);
  const day = String(date.getDate());
  const weekdayIndex = date.getDay();

  return {
    year,
    shortYear: year.slice(-2),
    month,
    paddedMonth: month.padStart(2, "0"),
    day,
    paddedDay: day.padStart(2, "0"),
    weekday:
      language === "zh-CN"
        ? ZH_WEEKDAYS[weekdayIndex]
        : EN_WEEKDAYS[weekdayIndex],
    weekdayShort:
      language === "zh-CN"
        ? ZH_SHORT_WEEKDAYS[weekdayIndex]
        : EN_SHORT_WEEKDAYS[weekdayIndex],
    weekdayEn: EN_WEEKDAYS[weekdayIndex],
    weekdayEnShort: EN_SHORT_WEEKDAYS[weekdayIndex],
  };
}

function replaceTokens(
  value: string,
  replacements: Record<string, string>,
): string {
  return value.replace(/\{([A-Za-z]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(replacements, key)
      ? replacements[key]
      : match,
  );
}

function replaceDoubleBraceTokens(
  value: string,
  replacements: Record<string, string>,
): string {
  return value.replace(/\{\{([A-Za-z]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(replacements, key)
      ? replacements[key]
      : match,
  );
}

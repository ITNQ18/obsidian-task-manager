export interface ParsedIncompleteTask {
  text: string;
  dueDate: string | null;
  dueTime: string | null;
  createdDate: string | null;
}

export interface TaskRecord extends ParsedIncompleteTask {
  path: string;
  line: number;
  rawLine: string;
  sourceDate: string;
  dailyDate: string | null;
}

export interface TaskBuckets {
  today: TaskRecord[];
  recent: TaskRecord[];
  future: TaskRecord[];
  stale: TaskRecord[];
  overdue: TaskRecord[];
}

const TASK_LINE_PATTERN = /^(\s*(?:[-*+]|\d+[.)])\s+)\[\s\]\s*(.*)$/u;
const DUE_DATE_PATTERN = /📅\s*(\d{4}-\d{2}-\d{2})/u;
const DUE_TIME_PATTERN = /⏰\s*([01]\d|2[0-3]):([0-5]\d)/u;
const CREATED_DATE_PATTERN = /➕\s*(\d{4}-\d{2}-\d{2})/u;

export function parseIncompleteTaskLine(
  line: string,
): ParsedIncompleteTask | null {
  const taskMatch = line.match(TASK_LINE_PATTERN);
  if (!taskMatch) {
    return null;
  }

  const body = taskMatch[2];
  const dueDate = validDateKey(body.match(DUE_DATE_PATTERN)?.[1] ?? null);
  const dueTimeMatch = body.match(DUE_TIME_PATTERN);
  const dueTime = dueTimeMatch
    ? `${dueTimeMatch[1]}:${dueTimeMatch[2]}`
    : null;
  const createdDate = validDateKey(
    body.match(CREATED_DATE_PATTERN)?.[1] ?? null,
  );
  const text = body
    .replace(DUE_DATE_PATTERN, "")
    .replace(DUE_TIME_PATTERN, "")
    .replace(CREATED_DATE_PATTERN, "")
    .trim();

  if (!text || text === "~") {
    return null;
  }

  return { text, dueDate, dueTime, createdDate };
}

export function extractDateKey(value: string): string | null {
  const match = value.match(
    /(?:^|\D)(\d{4})[.-](\d{1,2})[.-](\d{1,2})(?!\d)/u,
  );
  if (!match) {
    return null;
  }
  return validDateKey(
    `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`,
  );
}

export function extractDateKeyFromFilename(
  value: string,
  referenceDate: Date,
): string | null {
  const ordered = extractDateKey(value);
  if (ordered) {
    return ordered;
  }

  const tokens = (value.match(/\d+/gu) ?? []).map(Number);
  const candidates: string[] = [];
  for (let yearIndex = 0; yearIndex < tokens.length; yearIndex += 1) {
    const year = tokens[yearIndex];
    if (year < 1900 || year > 9999) {
      continue;
    }
    for (let firstIndex = 0; firstIndex < tokens.length; firstIndex += 1) {
      if (firstIndex === yearIndex) {
        continue;
      }
      for (let secondIndex = 0; secondIndex < tokens.length; secondIndex += 1) {
        if (secondIndex === yearIndex || secondIndex === firstIndex) {
          continue;
        }
        const candidate = validDateKey(
          `${year}-${String(tokens[firstIndex]).padStart(2, "0")}-${String(
            tokens[secondIndex],
          ).padStart(2, "0")}`,
        );
        if (candidate && !candidates.includes(candidate)) {
          candidates.push(candidate);
        }
      }
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort(
    (a, b) =>
      Math.abs(dateKeyToTimestamp(a) - referenceDate.getTime()) -
      Math.abs(dateKeyToTimestamp(b) - referenceDate.getTime()),
  )[0];
}

export function formatLocalDateKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function categorizeTasks(
  tasks: TaskRecord[],
  now: Date,
  staleDays: number,
): TaskBuckets {
  const todayKey = formatLocalDateKey(now);
  const buckets: TaskBuckets = {
    today: [],
    recent: [],
    future: [],
    stale: [],
    overdue: [],
  };

  for (const task of tasks) {
    const dueAt = getDueTimestamp(task.dueDate, task.dueTime);
    if (dueAt !== null && now.getTime() > dueAt) {
      buckets.overdue.push(task);
      continue;
    }

    if (task.dueDate === todayKey) {
      buckets.today.push(task);
      continue;
    }

    if (task.dueDate && task.dueDate > todayKey) {
      buckets.future.push(task);
      continue;
    }

    if (task.dailyDate) {
      const plannedDate = addDaysToDateKey(task.dailyDate, 1);
      if (plannedDate > todayKey) {
        continue;
      }
      if (plannedDate === todayKey) {
        buckets.today.push(task);
        continue;
      }
      const overdueDays = daysBetweenDateKeys(plannedDate, todayKey);
      if (overdueDays >= staleDays) {
        buckets.stale.push(task);
      } else if (overdueDays > 0) {
        buckets.recent.push(task);
      }
      continue;
    }

    const pendingDays = daysBetweenDateKeys(task.sourceDate, todayKey);
    if (pendingDays === 1) {
      buckets.today.push(task);
    } else if (pendingDays >= staleDays) {
      buckets.stale.push(task);
    } else if (pendingDays > 1) {
      buckets.recent.push(task);
    }
  }

  buckets.today.sort(compareTasks);
  buckets.recent.sort((a, b) =>
    a.sourceDate.localeCompare(b.sourceDate) || compareTasks(a, b),
  );
  buckets.future.sort((a, b) =>
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || compareTasks(a, b),
  );
  buckets.stale.sort((a, b) =>
    a.sourceDate.localeCompare(b.sourceDate) || compareTasks(a, b),
  );
  buckets.overdue.sort((a, b) =>
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
    (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59") ||
    compareTasks(a, b),
  );
  return buckets;
}

function addDaysToDateKey(value: string, days: number): string {
  const parts = parseDateKey(value);
  if (!parts) {
    return value;
  }
  const date = new Date(parts.year, parts.month - 1, parts.day + days);
  return formatLocalDateKey(date);
}

function dateKeyToTimestamp(value: string): number {
  const parts = parseDateKey(value);
  return parts
    ? new Date(parts.year, parts.month - 1, parts.day).getTime()
    : Number.POSITIVE_INFINITY;
}

export function daysBetweenDateKeys(from: string, to: string): number {
  const fromParts = parseDateKey(from);
  const toParts = parseDateKey(to);
  if (!fromParts || !toParts) {
    return 0;
  }
  const fromUtc = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toUtc = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.max(0, Math.floor((toUtc - fromUtc) / 86_400_000));
}

export function markTaskLineComplete(
  line: string,
  completedAt: Date,
): string | null {
  if (!TASK_LINE_PATTERN.test(line)) {
    return null;
  }
  const completedLine = line.replace(
    /^(\s*(?:[-*+]|\d+[.)])\s+)\[\s\]/u,
    "$1[x]",
  );
  const date = formatLocalDateKey(completedAt);
  const time = `${String(completedAt.getHours()).padStart(2, "0")}:${String(
    completedAt.getMinutes(),
  ).padStart(2, "0")}`;
  return `${completedLine.trimEnd()} ✅ ${date} ${time}`;
}

export function insertFutureTaskLine(
  markdown: string,
  taskLine: string,
): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/u);
  const placeholderIndex = lines.findIndex((line) =>
    /^\s*-\s*\[\s\]\s*~\s*$/u.test(line),
  );
  if (placeholderIndex >= 0) {
    lines[placeholderIndex] = taskLine;
    return lines.join(newline);
  }

  const headingIndex = lines.findIndex((line) =>
    /^##\s+(?:待完成|To do)\s*$/u.test(line),
  );
  if (headingIndex < 0) {
    const trimmed = markdown.replace(/\s+$/u, "");
    return `${trimmed}${newline}${newline}${taskLine}${newline}`;
  }

  let insertIndex = lines.findIndex(
    (line, index) => index > headingIndex && /^##\s+/u.test(line),
  );
  if (insertIndex < 0) {
    insertIndex = lines.length;
  }
  while (
    insertIndex > headingIndex + 1 &&
    lines[insertIndex - 1].trim().length === 0
  ) {
    insertIndex -= 1;
  }
  lines.splice(insertIndex, 0, taskLine, "");
  return lines.join(newline);
}

function getDueTimestamp(
  dueDate: string | null,
  dueTime: string | null,
): number | null {
  if (!dueDate) {
    return null;
  }
  const parts = parseDateKey(dueDate);
  if (!parts) {
    return null;
  }
  const [hours, minutes] = dueTime
    ? dueTime.split(":").map(Number)
    : [23, 59];
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    hours,
    minutes,
    dueTime ? 0 : 59,
    dueTime ? 0 : 999,
  ).getTime();
}

function compareTasks(a: TaskRecord, b: TaskRecord): number {
  return a.path.localeCompare(b.path) || a.line - b.line;
}

function validDateKey(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parts = parseDateKey(value);
  if (!parts) {
    return null;
  }
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return date.getFullYear() === parts.year &&
    date.getMonth() === parts.month - 1 &&
    date.getDate() === parts.day
    ? value
    : null;
}

function parseDateKey(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

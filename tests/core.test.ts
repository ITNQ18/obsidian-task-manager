import assert from "node:assert/strict";
import test from "node:test";
import {
  formatFilename,
  filenameContainsDateParts,
  getDefaultTemplate,
  insertTextAtSelection,
  isIgnoredVaultPath,
  normalizeVaultFolderInput,
  renderTemplate,
  resolveLanguage,
} from "../src/core";
import {
  categorizeTasks,
  extractDateKeyFromFilename,
  insertFutureTaskLine,
  markTaskLineComplete,
  parseIncompleteTaskLine,
  type TaskRecord,
} from "../src/tasks";

const sampleDate = new Date(2026, 6, 16, 9, 5);

test("system language uses Chinese only for Chinese Obsidian locales", () => {
  assert.equal(resolveLanguage("system", "zh-cn"), "zh-CN");
  assert.equal(resolveLanguage("system", "zh-tw"), "zh-CN");
  assert.equal(resolveLanguage("system", "en"), "en");
  assert.equal(resolveLanguage("system", "fr"), "en");
  assert.equal(resolveLanguage("system", undefined), "en");
});

test("explicit language overrides the Obsidian locale", () => {
  assert.equal(resolveLanguage("en", "zh-cn"), "en");
  assert.equal(resolveLanguage("zh-CN", "de"), "zh-CN");
});

test("formats the requested Chinese filename", () => {
  assert.equal(
    formatFilename("{YYYY}.{M}.{D}（{weekday}）日报", sampleDate, "zh-CN"),
    "2026.7.16（星期四）日报.md",
  );
});

test("supports padded dates and English weekday tokens", () => {
  assert.equal(
    formatFilename(
      "{YYYY}-{MM}-{DD}_{weekdayEnShort}",
      sampleDate,
      "zh-CN",
    ),
    "2026-07-16_Thu.md",
  );
});

test("removes invalid filename characters and avoids duplicate extensions", () => {
  assert.equal(
    formatFilename("Report: {YYYY}/{M}/{D}.md", sampleDate, "en"),
    "Report- 2026-7-16.md",
  );
});

test("rejects dot-prefixed daily report filenames", () => {
  assert.equal(formatFilename(".{YYYY}-report", sampleDate, "en"), "");
  assert.equal(formatFilename(".hidden.md", sampleDate, "en"), "");
  assert.equal(
    formatFilename("Report.{YYYY}", sampleDate, "en"),
    "Report.2026.md",
  );
});

test("recognizes daily report filenames by unordered year month and day", () => {
  assert.equal(
    filenameContainsDateParts(
      "2026.7.17 机器人项目日报.md",
      new Date(2026, 6, 17),
    ),
    true,
  );
  assert.equal(
    filenameContainsDateParts(
      "项目总结-17-2026-07.md",
      new Date(2026, 6, 17),
    ),
    true,
  );
  assert.equal(
    filenameContainsDateParts(
      "2026.7.16 日报.md",
      new Date(2026, 6, 17),
    ),
    false,
  );
  assert.equal(
    extractDateKeyFromFilename(
      "项目总结-17-2026-07.md",
      new Date(2026, 6, 17),
    ),
    "2026-07-17",
  );
});

test("default Chinese template uses bullets for issues and tasks for plans", () => {
  const template = getDefaultTemplate("zh-CN");
  assert.equal(
    template,
    "## 完成工作\n\n-\n\n## 遗留问题\n\n-\n\n## 后续计划\n\n- [ ] ~",
  );
  assert.doesNotMatch(template, /发布与验证/);
});

test("renders daily report variables", () => {
  assert.equal(
    renderTemplate(
      "{{date}} {{weekday}} {{time}} {{filename}}",
      sampleDate,
      "zh-CN",
      "report.md",
    ),
    "2026.7.16 星期四 09:05 report.md",
  );
});

test("normalizes vault folder input like Obsidian paths", () => {
  assert.equal(
    normalizeVaultFolderInput(" /Work\\Reports//Daily/ "),
    "Work/Reports/Daily",
  );
  assert.equal(normalizeVaultFolderInput("///Projects"), "Projects");
});

test("rejects Obsidian-style hidden folders but allows dots inside names", () => {
  assert.equal(isIgnoredVaultPath(".obsidian/Daily"), true);
  assert.equal(isIgnoredVaultPath("Work/.cache/Daily"), true);
  assert.equal(isIgnoredVaultPath("Work/Reports.v2/Daily"), false);
  assert.equal(isIgnoredVaultPath("Work/Reports/Daily"), false);
  assert.equal(isIgnoredVaultPath("Work/Plugins/task-manager/src"), true);
  assert.equal(isIgnoredVaultPath("Projects/app/node_modules/cache"), true);
});

test("inserts markers at the current selection", () => {
  assert.deepEqual(insertTextAtSelection("Report-.md", 7, 7, "{YYYY}"), {
    value: "Report-{YYYY}.md",
    cursor: 13,
  });
  assert.deepEqual(insertTextAtSelection("abcXYZdef", 3, 6, "{{date}}"), {
    value: "abc{{date}}def",
    cursor: 11,
  });
});

test("parses incomplete tasks with an optional deadline and time", () => {
  assert.deepEqual(
    parseIncompleteTaskLine(
      "- [ ] 提交版本 📅 2026-07-20 ⏰ 18:30 ➕ 2026-07-16",
    ),
    {
      text: "提交版本",
      dueDate: "2026-07-20",
      dueTime: "18:30",
      createdDate: "2026-07-16",
    },
  );
  assert.equal(parseIncompleteTaskLine("- [ ] ~"), null);
  assert.equal(parseIncompleteTaskLine("- [x] 已完成"), null);
});

test("categorizes today, recent, future, stale, and overdue tasks", () => {
  const task = (
    text: string,
    sourceDate: string,
    dueDate: string | null = null,
    dueTime: string | null = null,
    dailyDate: string | null = null,
  ): TaskRecord => ({
    text,
    sourceDate,
    dueDate,
    dueTime,
    createdDate: null,
    dailyDate,
    path: `${text}.md`,
    line: 0,
    rawLine: `- [ ] ${text}`,
  });
  const buckets = categorizeTasks(
    [
      task("today-daily-ignored", "2026-07-17", null, null, "2026-07-17"),
      task("today-deadline", "2026-07-16", "2026-07-17"),
      task("yesterday", "2026-07-16", null, null, "2026-07-16"),
      task("recent", "2026-07-15", null, null, "2026-07-15"),
      task("future", "2026-07-17", "2026-07-20"),
      task("stale", "2026-07-09", null, null, "2026-07-09"),
      task("overdue-date", "2026-07-16", "2026-07-16"),
      task("overdue-time", "2026-07-17", "2026-07-17", "10:00"),
    ],
    new Date(2026, 6, 17, 12, 0),
    7,
  );
  assert.deepEqual(buckets.today.map(({ text }) => text).sort(), [
    "today-deadline",
    "yesterday",
  ]);
  assert.deepEqual(buckets.recent.map(({ text }) => text), ["recent"]);
  assert.deepEqual(buckets.future.map(({ text }) => text), ["future"]);
  assert.deepEqual(buckets.stale.map(({ text }) => text), ["stale"]);
  assert.deepEqual(buckets.overdue.map(({ text }) => text).sort(), [
    "overdue-date",
    "overdue-time",
  ]);
  const visible = Object.values(buckets).flat().map(({ text }) => text);
  assert.equal(visible.includes("today-daily-ignored"), false);
});

test("reclassifies daily and dated tasks when the current date advances", () => {
  const task = (
    text: string,
    sourceDate: string,
    dueDate: string | null = null,
    dailyDate: string | null = null,
  ): TaskRecord => ({
    text,
    sourceDate,
    dueDate,
    dueTime: null,
    createdDate: null,
    dailyDate,
    path: `${text}.md`,
    line: 0,
    rawLine: `- [ ] ${text}`,
  });
  const tasks = [
    task("daily", "2026-07-17", null, "2026-07-17"),
    task("dated", "2026-07-17", "2026-07-20"),
  ];

  const nextDay = categorizeTasks(tasks, new Date(2026, 6, 18, 12), 7);
  assert.deepEqual(nextDay.today.map(({ text }) => text), ["daily"]);
  assert.deepEqual(nextDay.future.map(({ text }) => text), ["dated"]);

  const recent = categorizeTasks(tasks, new Date(2026, 6, 19, 12), 7);
  assert.deepEqual(recent.recent.map(({ text }) => text), ["daily"]);
  assert.deepEqual(recent.future.map(({ text }) => text), ["dated"]);

  const dueToday = categorizeTasks(tasks, new Date(2026, 6, 20, 12), 7);
  assert.deepEqual(dueToday.today.map(({ text }) => text), ["dated"]);

  const later = categorizeTasks(tasks, new Date(2026, 6, 25, 12), 7);
  assert.deepEqual(later.stale.map(({ text }) => text), ["daily"]);
  assert.deepEqual(later.overdue.map(({ text }) => text), ["dated"]);
});

test("completes a task using native checkbox syntax and a timestamp", () => {
  assert.equal(
    markTaskLineComplete("- [ ] 提交版本", new Date(2026, 6, 17, 15, 30)),
    "- [x] 提交版本 ✅ 2026-07-17 15:30",
  );
});

test("adds future tasks by replacing the template placeholder", () => {
  assert.equal(
    insertFutureTaskLine(
      "# 未来任务\n\n## 待完成\n\n- [ ] ~\n",
      "- [ ] 发布版本 📅 2026-07-22 ⏰ 18:30",
    ),
    "# 未来任务\n\n## 待完成\n\n- [ ] 发布版本 📅 2026-07-22 ⏰ 18:30\n",
  );
});

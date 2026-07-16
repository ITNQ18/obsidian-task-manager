# Task Manager

[English](README.md) | [简体中文](README.zh-CN.md)

Task Manager is an Obsidian community plugin for organizing daily work reports, unfinished tasks, overdue items, and future plans from a compact right-sidebar view.

## Features

- Create or open today's daily report from the right sidebar without overwriting an existing note.
- Configure the daily-report folder, filename pattern, Markdown template, and optional title.
- Recognize renamed daily reports when they remain under the configured folder and their filename contains the matching year, month, and day.
- Collect standard Markdown tasks (`- [ ]`) from daily reports and organize them by planned completion date.
- Treat tasks in yesterday's daily report as today's planned work while excluding tasks from today's report.
- Separate recent unfinished tasks, long-unfinished tasks, and explicitly overdue tasks.
- Store future tasks in one configurable `未来任务.md` file using `📅 YYYY-MM-DD` and optional `⏰ HH:mm` markers.
- Complete a task from the sidebar and write `- [x]` plus a `✅ YYYY-MM-DD HH:mm` completion timestamp back to the source note.
- Add localized native context-menu submenus for filename markers, template variables, and common Markdown while preserving the original edit actions.
- Follow Obsidian's language automatically, with manual Simplified Chinese and English overrides.
- Ignore hidden folders, `node_modules`, and plugin source folders when choosing report or future-task locations.
- Work entirely inside the local vault without analytics, telemetry, or network requests.

## Task formats

Use a standard Markdown task for daily-report plans:

```markdown
- [ ] Prepare the weekly summary
```

Use a date marker for an explicit deadline or a future task:

```markdown
- [ ] Publish version 0.1.0 📅 2026-07-20
- [ ] Run the release review 📅 2026-07-20 ⏰ 18:30
```

Completed tasks are written back in Obsidian's native checkbox syntax:

```markdown
- [x] Publish version 0.1.0 ✅ 2026-07-20 17:40
```

## Daily-report behavior

The default Simplified Chinese report body is:

```markdown
## 完成工作

-

## 遗留问题

-

## 后续计划

- [ ] ~
```

The English interface uses the corresponding English template. The plugin does not include a default report folder; you choose a vault folder the first time you create a report.

## Installation

### Obsidian Community plugins

After the plugin is accepted into the official catalog:

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse** and search for **Task Manager**.
3. Select **Install**, then **Enable**.

### GitHub release

1. Download `task-manager.zip` from the latest GitHub release. Do not download GitHub's automatically generated source-code archives.
2. Extract the `task-manager` folder into `<vault>/.obsidian/plugins/`.
3. Confirm that the folder contains `main.js`, `manifest.json`, and `styles.css`.
4. Refresh or restart Obsidian, then enable **Task Manager** under **Settings → Community plugins**.

## Development

Requirements:

- Node.js 18 or later
- npm

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

`npm run build` type-checks the source and generates the production `main.js` file. Copy `main.js`, `manifest.json`, and `styles.css` to a test vault's `.obsidian/plugins/task-manager/` folder for manual testing.

## Privacy

Task Manager reads and updates Markdown files only inside the current Obsidian vault. It does not collect analytics, send vault content to external services, or make network requests.

## License

[MIT](LICENSE)

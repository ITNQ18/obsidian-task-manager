import {
  MarkdownView,
  Notice,
  Plugin,
  TFolder,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import {
  LanguageSetting,
  UiLanguage,
  filenameContainsDateParts,
  formatFilename,
  getDefaultFilenamePattern,
  getDefaultTemplate,
  getDefaultTitleTemplate,
  renderTemplate,
  resolveLanguage,
  isIgnoredVaultPath,
} from "./core";
import { FolderSelectionModal } from "./folder-modal";
import { CompletionTimeModal } from "./completion-modal";
import {
  FutureTaskModal,
  type FutureTaskInput,
} from "./future-task-modal";
import { translate, type TranslationKey } from "./i18n";
import { TaskManagerSettingTab } from "./settings";
import {
  TaskManagerView,
  VIEW_TYPE_TASK_MANAGER,
} from "./view";
import {
  categorizeTasks,
  extractDateKey,
  extractDateKeyFromFilename,
  formatLocalDateKey,
  insertFutureTaskLine,
  markTaskLineComplete,
  parseIncompleteTaskLine,
  type TaskBuckets,
  type TaskRecord,
} from "./tasks";

export interface TaskManagerSettings {
  language: LanguageSetting;
  staleTaskDays: number;
  askCompletionTime: boolean;
  dailyFolder: string;
  futureTaskFolder: string;
  filenamePattern: string;
  customTemplate: string;
  includeTitle: boolean;
}

const DEFAULT_SETTINGS: TaskManagerSettings = {
  language: "system",
  staleTaskDays: 7,
  askCompletionTime: false,
  dailyFolder: "",
  futureTaskFolder: "",
  filenamePattern: "",
  customTemplate: "",
  includeTitle: true,
};

export default class TaskManagerPlugin extends Plugin {
  settings: TaskManagerSettings = { ...DEFAULT_SETTINGS };
  private currentDateKey = formatLocalDateKey(new Date());

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_TASK_MANAGER,
      (leaf) => new TaskManagerView(leaf, this),
    );

    this.addSettingTab(new TaskManagerSettingTab(this.app, this));

    this.addCommand({
      id: "open-sidebar",
      name: this.t("commandOpenManager"),
      callback: () => void this.activateView(true),
    });

    this.addCommand({
      id: "open-or-create-today-daily-report",
      name: this.t("commandOpenDaily"),
      callback: () => void this.openOrCreateTodayReport(),
    });

    this.addCommand({
      id: "open-or-create-future-task-file",
      name: this.t("commandOpenFutureTask"),
      callback: () => this.openFutureTaskFile(),
    });

    const refreshTaskManagerState = (): void => this.refreshViews();
    this.registerEvent(this.app.vault.on("create", refreshTaskManagerState));
    this.registerEvent(this.app.vault.on("delete", refreshTaskManagerState));
    this.registerEvent(this.app.vault.on("rename", refreshTaskManagerState));
    this.registerEvent(this.app.vault.on("modify", refreshTaskManagerState));

    this.registerInterval(
      window.setInterval(() => this.refreshViewsWhenDateChanges(), 60_000),
    );
    this.registerDomEvent(window, "focus", () =>
      this.refreshViewsWhenDateChanges(),
    );
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.refreshViewsWhenDateChanges();
      }
    });

    this.app.workspace.onLayoutReady(() => {
      void this.activateView(false);
    });
  }

  t(key: TranslationKey, variables: Record<string, string> = {}): string {
    return translate(this.getCurrentLanguage(), key, variables);
  }

  getCurrentLanguage(): UiLanguage {
    const obsidianLocale = (
      window as Window & { moment?: { locale: () => string } }
    ).moment?.locale?.();
    return resolveLanguage(this.settings.language, obsidianLocale);
  }

  getTodayFilename(date = new Date()): string {
    const language = this.getCurrentLanguage();
    const pattern =
      this.settings.filenamePattern || getDefaultFilenamePattern(language);
    return formatFilename(pattern, date, language);
  }

  getTodayPath(date = new Date()): string {
    const filename = this.getTodayFilename(date);
    if (!filename || !this.settings.dailyFolder) {
      return "";
    }
    return normalizePath(`${this.settings.dailyFolder}/${filename}`);
  }

  todayReportExists(date = new Date()): boolean {
    return this.findDailyReportForDate(date) !== null;
  }

  findDailyReportForDate(date = new Date()): TFile | null {
    const exactPath = this.getTodayPath(date);
    const exact = exactPath
      ? this.app.vault.getAbstractFileByPath(exactPath)
      : null;
    if (exact instanceof TFile) {
      return exact;
    }
    return (
      this.getMarkdownFilesInFolder(this.settings.dailyFolder).find((file) =>
        this.isDailyReportFileForDate(file, date),
      ) ?? null
    );
  }

  getFutureTaskPath(): string {
    if (!this.settings.futureTaskFolder) {
      return "";
    }
    return normalizePath(`${this.settings.futureTaskFolder}/未来任务.md`);
  }

  futureTaskFileExists(): boolean {
    const path = this.getFutureTaskPath();
    return Boolean(
      path && this.app.vault.getAbstractFileByPath(path) instanceof TFile,
    );
  }

  async getTaskBuckets(now = new Date()): Promise<TaskBuckets> {
    const futureTaskPath = this.getFutureTaskPath();
    const sources = new Map<
      string,
      { file: TFile; dailyDate: string | null; isFutureTaskFile: boolean }
    >();

    for (const file of this.getMarkdownFilesInFolder(
      this.settings.dailyFolder,
    )) {
      const dailyDate = this.getDailyReportDate(file);
      if (dailyDate) {
        sources.set(file.path, {
          file,
          dailyDate,
          isFutureTaskFile: file.path === futureTaskPath,
        });
      }
    }

    const futureTaskFile = futureTaskPath
      ? this.app.vault.getAbstractFileByPath(futureTaskPath)
      : null;
    if (futureTaskFile instanceof TFile) {
      sources.set(futureTaskFile.path, {
        file: futureTaskFile,
        dailyDate: null,
        isFutureTaskFile: true,
      });
    }

    const taskGroups = await Promise.all(
      Array.from(sources.values()).map(async (source): Promise<TaskRecord[]> => {
        const { file, dailyDate, isFutureTaskFile } = source;
        const content = await this.app.vault.cachedRead(file);
        const fallbackDate =
          dailyDate ??
          extractDateKey(file.basename) ??
          formatLocalDateKey(new Date(file.stat.ctime));
        return content
          .split(/\r?\n/u)
          .map((line, lineNumber): TaskRecord | null => {
            const task = parseIncompleteTaskLine(line);
            if (!task) {
              return null;
            }
            if (isFutureTaskFile && !task.dueDate) {
              return null;
            }
            return {
              ...task,
              path: file.path,
              line: lineNumber,
              rawLine: line,
              sourceDate: task.createdDate ?? fallbackDate,
              dailyDate,
            };
          })
          .filter((task): task is TaskRecord => task !== null);
      }),
    );
    return categorizeTasks(
      taskGroups.flat(),
      now,
      Math.max(1, this.settings.staleTaskDays),
    );
  }

  private getMarkdownFilesInFolder(folderPath: string): TFile[] {
    if (!folderPath) {
      return [];
    }
    const normalized = normalizePath(folderPath.replace(/^\/+|\/+$/gu, ""));
    const root = this.app.vault.getAbstractFileByPath(normalized);
    if (!(root instanceof TFolder)) {
      return [];
    }

    const files: TFile[] = [];
    const visit = (folder: TFolder): void => {
      for (const child of folder.children) {
        if (isIgnoredVaultPath(child.path)) {
          continue;
        }
        if (child instanceof TFolder) {
          visit(child);
        } else if (child instanceof TFile && child.extension === "md") {
          files.push(child);
        }
      }
    };
    visit(root);
    return files;
  }

  private refreshViewsWhenDateChanges(): void {
    const dateKey = formatLocalDateKey(new Date());
    if (dateKey === this.currentDateKey) {
      return;
    }
    this.currentDateKey = dateKey;
    this.refreshViews();
  }

  private isDailyReportFileForDate(file: TFile, date: Date): boolean {
    if (!this.settings.dailyFolder) {
      return false;
    }
    const folder = normalizePath(
      this.settings.dailyFolder.replace(/^\/+|\/+$/gu, ""),
    );
    return (
      file.path.startsWith(`${folder}/`) &&
      filenameContainsDateParts(file.basename, date)
    );
  }

  private getDailyReportDate(file: TFile): string | null {
    if (!this.settings.dailyFolder) {
      return null;
    }
    const folder = normalizePath(
      this.settings.dailyFolder.replace(/^\/+|\/+$/gu, ""),
    );
    if (!file.path.startsWith(`${folder}/`)) {
      return null;
    }
    return extractDateKeyFromFilename(
      file.basename,
      new Date(file.stat.ctime),
    );
  }

  openFutureTaskFile(): void {
    if (!this.settings.futureTaskFolder) {
      this.promptFutureTaskFolder(() => this.openFutureTaskFile());
      return;
    }
    void this.openOrCreateFutureTaskFile();
  }

  addFutureTask(): void {
    if (!this.settings.futureTaskFolder) {
      this.promptFutureTaskFolder(() => this.addFutureTask());
      return;
    }
    void this.openFutureTaskInput();
  }

  async openOrCreateFutureTaskFile(): Promise<void> {
    try {
      const { file, created } = await this.ensureFutureTaskFile();
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(
        this.t(created ? "createdFutureTaskFile" : "openedFutureTaskFile"),
      );
      this.refreshViews();
    } catch (error) {
      new Notice(
        this.t("createFutureTaskFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private promptFutureTaskFolder(afterConfigured: () => void): void {
    new FolderSelectionModal(
      this.app,
      this,
      async (path) => {
        this.settings.futureTaskFolder = path;
        await this.saveSettings();
        new Notice(this.t("futureTaskFolderConfigured", { path }));
        afterConfigured();
      },
      {
        initialPath: this.settings.futureTaskFolder,
        title: this.t("futureTaskFolderModalTitle"),
        description: this.t("futureTaskFolderModalDescription"),
        placeholder: this.t("futureTaskFolderPlaceholder"),
        label: this.t("futureTaskFolderLabel"),
        requiredMessage: this.t("futureTaskFolderRequired"),
      },
    ).open();
  }

  private async openFutureTaskInput(): Promise<void> {
    try {
      const { file } = await this.ensureFutureTaskFile();
      new FutureTaskModal(this.app, this, (input) =>
        this.appendFutureTask(file, input),
      ).open();
    } catch (error) {
      new Notice(
        this.t("createFutureTaskFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async appendFutureTask(
    file: TFile,
    input: FutureTaskInput,
  ): Promise<boolean> {
    const taskLine = `- [ ] ${input.text} 📅 ${input.dueDate}${
      input.dueTime ? ` ⏰ ${input.dueTime}` : ""
    }`;
    try {
      await this.app.vault.process(file, (content) =>
        insertFutureTaskLine(content, taskLine),
      );
      new Notice(this.t("futureTaskAdded"));
      this.refreshViews();
      return true;
    } catch (error) {
      new Notice(
        this.t("futureTaskAddFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    }
  }

  private async ensureFutureTaskFile(): Promise<{
    file: TFile;
    created: boolean;
  }> {
    const folder = this.settings.futureTaskFolder;
    const path = this.getFutureTaskPath();
    await this.ensureFolder(folder);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      return { file: existing, created: false };
    }
    if (existing) {
      throw new Error(`A folder already exists at ${path}`);
    }

    const content =
      this.getCurrentLanguage() === "zh-CN"
        ? [
            "# 未来任务",
            "",
            "> [!tip] 必须使用的任务格式",
            "> 每项必须使用 `- [ ] 任务内容 📅 YYYY-MM-DD`。可选具体时间：`⏰ HH:mm`。",
            "",
            "## 待完成",
            "",
            "- [ ] ~",
            "",
          ].join("\n")
        : [
            "# Future tasks",
            "",
            "> [!tip] Required task format",
            "> Every item must use `- [ ] Task 📅 YYYY-MM-DD`. An exact time is optional: `⏰ HH:mm`.",
            "",
            "## To do",
            "",
            "- [ ] ~",
            "",
          ].join("\n");
    const file = await this.app.vault.create(path, content);
    return { file, created: true };
  }

  async completeTask(task: TaskRecord): Promise<boolean> {
    const completedAt = this.settings.askCompletionTime
      ? await this.requestCompletionTime()
      : new Date();
    if (!completedAt) {
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice(this.t("taskSourceMissing"));
      return false;
    }

    let changed = false;
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/u);
      if (lines[task.line] !== task.rawLine) {
        return content;
      }
      const completedLine = markTaskLineComplete(
        lines[task.line],
        completedAt,
      );
      if (!completedLine) {
        return content;
      }
      lines[task.line] = completedLine;
      changed = true;
      return lines.join(newline);
    });

    if (!changed) {
      new Notice(this.t("taskChanged"));
      return false;
    }
    new Notice(this.t("taskCompleted"));
    this.refreshViews();
    return true;
  }

  async openTaskSource(task: TaskRecord): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice(this.t("taskSourceMissing"));
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    if (leaf.view instanceof MarkdownView) {
      const position = { line: task.line, ch: 0 };
      leaf.view.editor.setCursor(position);
      leaf.view.editor.scrollIntoView(
        { from: position, to: { line: task.line, ch: task.rawLine.length } },
        true,
      );
    }
  }

  private requestCompletionTime(): Promise<Date | null> {
    return new Promise((resolve) => {
      let settled = false;
      new CompletionTimeModal(
        this.app,
        this,
        (date) => {
          settled = true;
          resolve(date);
        },
        () => {
          if (!settled) {
            resolve(null);
          }
        },
      ).open();
    });
  }

  async openOrCreateTodayReport(): Promise<void> {
    if (!this.settings.dailyFolder) {
      new FolderSelectionModal(this.app, this, async (path) => {
        this.settings.dailyFolder = path;
        await this.saveSettings();
        new Notice(this.t("folderConfigured", { path }));
        await this.openOrCreateTodayReport();
      }).open();
      return;
    }

    const date = new Date();
    const filename = this.getTodayFilename(date);
    if (!filename) {
      new Notice(this.t("filenameInvalid"));
      return;
    }

    try {
      await this.ensureFolder(this.settings.dailyFolder);
      const recognizedExisting = this.findDailyReportForDate(date);
      if (recognizedExisting) {
        await this.app.workspace.getLeaf(false).openFile(recognizedExisting);
        new Notice(this.t("openedExisting"));
        this.refreshViews();
        return;
      }
      const path = normalizePath(`${this.settings.dailyFolder}/${filename}`);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(existing);
        new Notice(this.t("openedExisting"));
        this.refreshViews();
        return;
      }

      if (existing) {
        throw new Error(`A folder already exists at ${path}`);
      }

      const language = this.getCurrentLanguage();
      const bodyTemplate =
        this.settings.customTemplate || getDefaultTemplate(language);
      const renderedBody = renderTemplate(
        bodyTemplate,
        date,
        language,
        filename,
      );
      const title = this.settings.includeTitle
        ? renderTemplate(
            getDefaultTitleTemplate(language),
            date,
            language,
            filename,
          )
        : "";
      const content = [title, renderedBody]
        .filter((part) => part.length > 0)
        .join("\n\n")
        .replace(/\s+$/u, "")
        .concat("\n");

      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(this.t("createdReport"));
      this.refreshViews();
    } catch (error) {
      new Notice(
        this.t("createFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async ensureFolder(path: string): Promise<TFolder> {
    const normalized = normalizePath(path.replace(/^\/+|\/+$/g, ""));
    if (isIgnoredVaultPath(normalized)) {
      throw new Error(this.t("folderIgnored"));
    }
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) {
      return existing;
    }
    if (existing) {
      throw new Error(`A file already exists at ${normalized}`);
    }

    let current = "";
    for (const segment of normalized.split("/")) {
      current = current ? `${current}/${segment}` : segment;
      const item = this.app.vault.getAbstractFileByPath(current);
      if (item instanceof TFolder) {
        continue;
      }
      if (item) {
        throw new Error(`A file already exists at ${current}`);
      }
      await this.app.vault.createFolder(current);
    }

    const created = this.app.vault.getAbstractFileByPath(normalized);
    if (!(created instanceof TFolder)) {
      throw new Error(`Folder was not created: ${normalized}`);
    }
    return created;
  }

  async activateView(reveal: boolean): Promise<void> {
    let leaf: WorkspaceLeaf | null =
      this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_MANAGER)[0] ??
      null;

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        return;
      }
      await leaf.setViewState({
        type: VIEW_TYPE_TASK_MANAGER,
        active: reveal,
      });
    }

    if (reveal) {
      await this.app.workspace.revealLeaf(leaf);
    }
  }

  openSettings(): void {
    const setting = (
      this.app as typeof this.app & {
        setting: { open: () => void; openTabById: (id: string) => void };
      }
    ).setting;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  async loadSettings(): Promise<void> {
    const stored: unknown = await this.loadData();
    if (!isRecord(stored)) {
      this.settings = { ...DEFAULT_SETTINGS };
      return;
    }

    this.settings = {
      language:
        stored.language === "system" ||
        stored.language === "zh-CN" ||
        stored.language === "en"
          ? stored.language
          : DEFAULT_SETTINGS.language,
      staleTaskDays:
        typeof stored.staleTaskDays === "number" &&
        Number.isInteger(stored.staleTaskDays) &&
        stored.staleTaskDays >= 1 &&
        stored.staleTaskDays <= 3650
          ? stored.staleTaskDays
          : DEFAULT_SETTINGS.staleTaskDays,
      askCompletionTime:
        typeof stored.askCompletionTime === "boolean"
          ? stored.askCompletionTime
          : DEFAULT_SETTINGS.askCompletionTime,
      dailyFolder:
        typeof stored.dailyFolder === "string"
          ? stored.dailyFolder
          : DEFAULT_SETTINGS.dailyFolder,
      futureTaskFolder:
        typeof stored.futureTaskFolder === "string"
          ? stored.futureTaskFolder
          : DEFAULT_SETTINGS.futureTaskFolder,
      filenamePattern:
        typeof stored.filenamePattern === "string"
          ? stored.filenamePattern
          : DEFAULT_SETTINGS.filenamePattern,
      customTemplate:
        typeof stored.customTemplate === "string"
          ? stored.customTemplate
          : DEFAULT_SETTINGS.customTemplate,
      includeTitle:
        typeof stored.includeTitle === "boolean"
          ? stored.includeTitle
          : DEFAULT_SETTINGS.includeTitle,
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshViews();
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(
      VIEW_TYPE_TASK_MANAGER,
    )) {
      const view = leaf.view;
      if (view instanceof TaskManagerView) {
        void view.render();
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

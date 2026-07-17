import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type { TaskBuckets, TaskRecord } from "./tasks";
import type TaskManagerPlugin from "./main";

export const VIEW_TYPE_TASK_MANAGER = "task-manager-view";

type ActiveModule = "home" | "daily" | "future";

export class TaskManagerView extends ItemView {
  private activeModule: ActiveModule = "home";
  private expandedSections = new Set<string>();
  private renderGeneration = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: TaskManagerPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TASK_MANAGER;
  }

  getDisplayText(): string {
    return this.plugin.t("viewTitle");
  }

  getIcon(): string {
    return "list-todo";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const generation = ++this.renderGeneration;
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("task-manager-view");
    this.renderToolbar(container);

    if (this.activeModule === "daily") {
      this.renderDailyReport(container);
      return;
    }
    if (this.activeModule === "future") {
      await this.renderFutureTasks(container, generation);
      return;
    }
    await this.renderHome(container, generation);
  }

  private renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({
      cls: "task-manager-toolbar",
      attr: {
        role: "toolbar",
        "aria-label": this.plugin.t("moduleNavigation"),
      },
    });
    this.createModuleButton(toolbar, "home", "home", this.plugin.t("homePage"));
    this.createModuleButton(
      toolbar,
      "daily",
      "calendar-days",
      this.plugin.t("dailyReport"),
    );
    this.createModuleButton(
      toolbar,
      "future",
      "calendar-plus",
      this.plugin.t("futureTaskModule"),
    );

    const settings = toolbar.createEl("button", {
      cls: "clickable-icon task-manager-toolbar-button",
      attr: {
        type: "button",
        "aria-label": this.plugin.t("openSettings"),
        "data-tooltip-position": "bottom",
      },
    });
    setIcon(settings, "settings");
    settings.addEventListener("click", () => this.plugin.openSettings());
  }

  private createModuleButton(
    toolbar: HTMLElement,
    module: ActiveModule,
    icon: string,
    label: string,
  ): void {
    const button = toolbar.createEl("button", {
      cls: `clickable-icon task-manager-toolbar-button${
        this.activeModule === module ? " is-active" : ""
      }`,
      attr: {
        type: "button",
        "aria-label": label,
        "aria-pressed": String(this.activeModule === module),
        "data-tooltip-position": "bottom",
      },
    });
    setIcon(button, icon);
    button.addEventListener("click", () => {
      if (this.activeModule === module) {
        return;
      }
      this.activeModule = module;
      void this.render();
    });
  }

  private async renderHome(
    container: HTMLElement,
    generation: number,
  ): Promise<void> {
    const home = container.createDiv({ cls: "task-manager-home" });
    const loading = home.createDiv({
      cls: "task-manager-loading",
      text: this.plugin.t("taskDashboardLoading"),
    });
    const buckets = await this.plugin.getTaskBuckets();
    if (
      generation !== this.renderGeneration ||
      this.activeModule !== "home"
    ) {
      return;
    }
    loading.remove();
    this.renderTodaySection(home, buckets);
    this.renderTaskSection(
      home,
      "stale",
      this.plugin.t("staleTasks"),
      "history",
      buckets.stale,
    );
    this.renderTaskSection(
      home,
      "overdue",
      this.plugin.t("overdueTasks"),
      "triangle-alert",
      buckets.overdue,
      true,
    );
  }

  private async renderFutureTasks(
    container: HTMLElement,
    generation: number,
  ): Promise<void> {
    const future = container.createDiv({ cls: "task-manager-home" });
    this.renderFutureTaskFileModule(future);
    const loading = future.createDiv({
      cls: "task-manager-loading",
      text: this.plugin.t("taskDashboardLoading"),
    });
    const buckets = await this.plugin.getTaskBuckets();
    if (
      generation !== this.renderGeneration ||
      this.activeModule !== "future"
    ) {
      return;
    }
    loading.remove();
    this.renderTaskSection(
      future,
      "future",
      this.plugin.t("futureTasks"),
      "calendar-clock",
      buckets.future,
    );
  }

  private renderTodaySection(
    parent: HTMLElement,
    buckets: TaskBuckets,
  ): void {
    const section = this.createTaskSection(
      parent,
      this.plugin.t("todayPending"),
      "calendar-check-2",
      buckets.today.length,
    );
    const list = section.createDiv({ cls: "task-manager-task-list" });
    if (buckets.today.length > 0) {
      this.renderTaskRows(list, buckets.today, "today");
    } else {
      list.createDiv({
        cls: "task-manager-empty-state",
        text: this.plugin.t("noTasks"),
      });
    }

    if (buckets.recent.length > 0) {
      const recent = section.createDiv({ cls: "task-manager-task-subsection" });
      const recentHeader = recent.createDiv({
        cls: "task-manager-task-subsection-header",
      });
      recentHeader.createSpan({
        text: this.plugin.t("recentPending", {
          days: String(this.plugin.settings.staleTaskDays),
        }),
      });
      recentHeader.createSpan({
        cls: "task-manager-task-count",
        text: String(buckets.recent.length),
      });
      this.renderTaskRows(recent, buckets.recent, "recent");
    }
  }

  private renderFutureTaskFileModule(parent: HTMLElement): void {
    const statusCard = parent.createDiv({ cls: "task-manager-status-card" });
    this.renderField(
      statusCard,
      this.plugin.t("futureTaskFolderLabel"),
      this.plugin.settings.futureTaskFolder ||
        this.plugin.t("folderUnconfigured"),
    );
    this.renderField(
      statusCard,
      this.plugin.t("futureTaskFilenameLabel"),
      "未来任务.md",
    );

    const fileExists = this.plugin.futureTaskFileExists();
    const state = statusCard.createDiv({ cls: "task-manager-file-state" });
    const stateIcon = state.createSpan({ cls: "task-manager-state-icon" });
    setIcon(stateIcon, fileExists ? "circle-check" : "circle-dashed");
    state.createSpan({
      text: this.plugin.t(
        fileExists ? "futureTaskFileExists" : "futureTaskFileNotExists",
      ),
    });

    const button = parent.createEl("button", {
      text: this.plugin.t(
        fileExists ? "openFutureTaskFile" : "createFutureTaskFile",
      ),
      cls: "mod-cta task-manager-primary-button",
      attr: { type: "button" },
    });
    button.addEventListener("click", () => this.plugin.openFutureTaskFile());
    const addButton = parent.createEl("button", {
      text: this.plugin.t("addFutureTask"),
      cls: "task-manager-secondary-button",
      attr: { type: "button" },
    });
    addButton.addEventListener("click", () => this.plugin.addFutureTask());
    this.renderFormatHint(
      parent,
      this.plugin.t("futureTaskFormatTitle"),
      this.plugin.t("futureTaskFormatDescription"),
    );
  }

  private renderTaskSection(
    parent: HTMLElement,
    key: string,
    title: string,
    iconName: string,
    tasks: TaskRecord[],
    isWarning = false,
  ): void {
    const section = this.createTaskSection(
      parent,
      title,
      iconName,
      tasks.length,
      isWarning,
    );
    const list = section.createDiv({ cls: "task-manager-task-list" });
    if (tasks.length === 0) {
      list.createDiv({
        cls: "task-manager-empty-state",
        text: this.plugin.t("noTasks"),
      });
      return;
    }
    this.renderTaskRows(list, tasks, key, isWarning);
  }

  private createTaskSection(
    parent: HTMLElement,
    title: string,
    iconName: string,
    count: number,
    isWarning = false,
  ): HTMLElement {
    const section = parent.createDiv({
      cls: `task-manager-task-section${isWarning ? " is-warning" : ""}`,
    });
    const header = section.createDiv({ cls: "task-manager-task-section-header" });
    const titleGroup = header.createDiv({
      cls: "task-manager-task-section-title-group",
    });
    const icon = titleGroup.createSpan({ cls: "task-manager-task-section-icon" });
    setIcon(icon, iconName);
    titleGroup.createSpan({
      cls: "task-manager-task-section-title",
      text: title,
    });
    header.createSpan({
      cls: "task-manager-task-count",
      text: String(count),
    });
    return section;
  }

  private renderTaskRows(
    parent: HTMLElement,
    tasks: TaskRecord[],
    sectionKey: string,
    isWarning = false,
  ): void {
    const expanded = this.expandedSections.has(sectionKey);
    const visibleTasks = expanded ? tasks : tasks.slice(0, 5);

    for (const task of visibleTasks) {
      const row = parent.createDiv({ cls: "task-manager-task-row" });
      const completeButton = row.createEl("button", {
        cls: "clickable-icon task-manager-task-complete",
        attr: {
          type: "button",
          "aria-label": this.plugin.t("completeTaskAria", { task: task.text }),
        },
      });
      setIcon(completeButton, "circle-dashed");
      const completeTask = async (): Promise<void> => {
        completeButton.disabled = true;
        completeButton.addClass("is-completing");
        setIcon(completeButton, "circle-check");
        const completed = await this.plugin.completeTask(task);
        if (!completed) {
          setIcon(completeButton, "circle-dashed");
          completeButton.removeClass("is-completing");
          completeButton.disabled = false;
        }
      };
      completeButton.addEventListener("click", () => void completeTask());

      const taskButton = row.createEl("button", {
        cls: "task-manager-task-content",
        attr: {
          type: "button",
          "aria-label": this.plugin.t("openTaskSourceAria", { task: task.text }),
          "data-tooltip-position": "top",
        },
      });
      taskButton.createDiv({ cls: "task-manager-task-text", text: task.text });
      const meta = taskButton.createDiv({ cls: "task-manager-task-meta" });
      meta.createSpan({
        text: this.plugin.t("createdDateLabel", {
          date: this.formatTaskDate(task.sourceDate),
        }),
      });
      if (task.dueDate) {
        const dueText = task.dueTime
          ? `${this.formatTaskDate(task.dueDate)} ${task.dueTime}`
          : this.formatTaskDate(task.dueDate);
        meta.createSpan({
          cls: isWarning ? "is-warning" : "",
          text: this.plugin.t("dueDateLabel", { date: dueText }),
        });
      }
      taskButton.addEventListener("click", () => {
        void this.plugin.openTaskSource(task);
      });
    }

    if (tasks.length > 5) {
      const remaining = tasks.length - 5;
      const expandButton = parent.createEl("button", {
        cls: "task-manager-task-expand",
        attr: { type: "button" },
      });
      setIcon(expandButton, expanded ? "chevron-up" : "ellipsis");
      expandButton.createSpan({
        text: expanded
          ? this.plugin.t("showFewerTasks")
          : this.plugin.t("showMoreTasks", { count: String(remaining) }),
      });
      expandButton.addEventListener("click", () => {
        if (expanded) {
          this.expandedSections.delete(sectionKey);
        } else {
          this.expandedSections.add(sectionKey);
        }
        void this.render();
      });
    }
  }

  private renderDailyReport(container: HTMLElement): void {
    const statusCard = container.createDiv({ cls: "task-manager-status-card" });
    this.renderField(
      statusCard,
      this.plugin.t("folderLabel"),
      this.plugin.settings.dailyFolder || this.plugin.t("folderUnconfigured"),
    );

    const recognizedReport = this.plugin.findDailyReportForDate();
    const filename = recognizedReport?.name ?? this.plugin.getTodayFilename();
    this.renderField(statusCard, this.plugin.t("filenameLabel"), filename || "—");

    const fileExists = this.plugin.todayReportExists();
    const state = statusCard.createDiv({ cls: "task-manager-file-state" });
    const stateIcon = state.createSpan({ cls: "task-manager-state-icon" });
    setIcon(stateIcon, fileExists ? "circle-check" : "circle-dashed");
    state.createSpan({
      text: this.plugin.t(fileExists ? "fileExists" : "fileNotExists"),
    });

    const primaryButton = container.createEl("button", {
      text: this.plugin.t(fileExists ? "openToday" : "createToday"),
      cls: "mod-cta task-manager-primary-button",
      attr: { type: "button" },
    });
    const openDailyReport = async (): Promise<void> => {
      primaryButton.disabled = true;
      try {
        await this.plugin.openOrCreateTodayReport();
      } finally {
        primaryButton.disabled = false;
        await this.render();
      }
    };
    primaryButton.addEventListener("click", () => void openDailyReport());
    this.renderFormatHint(
      container,
      this.plugin.t("dailyTaskRecognitionTitle"),
      this.plugin.t("dailyTaskRecognitionDescription", {
        folder:
          this.plugin.settings.dailyFolder || this.plugin.t("folderUnconfigured"),
        date: this.formatDisplayDate(new Date()),
      }),
    );
  }

  private formatDisplayDate(date: Date): string {
    return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  }

  private formatTaskDate(dateKey: string): string {
    const [year, month, day] = dateKey.split("-").map(Number);
    return `${year}.${month}.${day}`;
  }

  private renderFormatHint(
    parent: HTMLElement,
    title: string,
    description: string,
  ): void {
    const hint = parent.createDiv({ cls: "task-manager-format-hint" });
    const icon = hint.createSpan({ cls: "task-manager-format-hint-icon" });
    setIcon(icon, "info");
    const content = hint.createDiv({ cls: "task-manager-format-hint-content" });
    content.createDiv({ cls: "task-manager-format-hint-title", text: title });
    content.createDiv({
      cls: "task-manager-format-hint-description",
      text: description,
    });
  }

  private renderField(
    parent: HTMLElement,
    label: string,
    value: string,
  ): void {
    const field = parent.createDiv({ cls: "task-manager-status-field" });
    field.createDiv({ cls: "task-manager-status-label", text: label });
    field.createDiv({ cls: "task-manager-status-value", text: value });
  }
}

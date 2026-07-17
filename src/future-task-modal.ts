import { App, Modal, Notice, Setting } from "obsidian";
import { formatLocalDateKey } from "./tasks";
import type TaskManagerPlugin from "./main";

export interface FutureTaskInput {
  text: string;
  dueDate: string;
  dueTime: string;
}

export class FutureTaskModal extends Modal {
  private taskText = "";
  private dueDate = formatLocalDateKey(tomorrow());
  private dueTime = "";
  private submitting = false;

  constructor(
    app: App,
    private readonly plugin: TaskManagerPlugin,
    private readonly onSubmit: (input: FutureTaskInput) => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.plugin.t("addFutureTaskTitle") });

    new Setting(contentEl)
      .setName(this.plugin.t("futureTaskContentName"))
      .setDesc(this.plugin.t("futureTaskContentDescription"))
      .addText((text) => {
        text.setPlaceholder(this.plugin.t("futureTaskContentPlaceholder"));
        text.onChange((value) => {
          this.taskText = value;
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });

    new Setting(contentEl)
      .setName(this.plugin.t("futureTaskDueDateName"))
      .setDesc(this.plugin.t("futureTaskDueDateDescription"))
      .addText((text) => {
        text.setValue(this.dueDate).onChange((value) => {
          this.dueDate = value;
        });
        text.inputEl.type = "date";
        text.inputEl.min = formatLocalDateKey(new Date());
      });

    new Setting(contentEl)
      .setName(this.plugin.t("futureTaskDueTimeName"))
      .setDesc(this.plugin.t("futureTaskDueTimeDescription"))
      .addText((text) => {
        text.onChange((value) => {
          this.dueTime = value;
        });
        text.inputEl.type = "time";
        text.inputEl.step = "60";
      });

    const actions = contentEl.createDiv({ cls: "task-manager-modal-actions" });
    actions
      .createEl("button", {
        text: this.plugin.t("cancel"),
        attr: { type: "button" },
      })
      .addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", {
      text: this.plugin.t("addFutureTask"),
      cls: "mod-cta",
      attr: { type: "button" },
    });
    const submit = async (): Promise<void> => {
      if (this.submitting) {
        return;
      }
      const taskText = this.taskText.replace(/\s+/gu, " ").trim();
      if (!taskText) {
        new Notice(this.plugin.t("futureTaskContentRequired"));
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(this.dueDate)) {
        new Notice(this.plugin.t("futureTaskDueDateRequired"));
        return;
      }
      this.submitting = true;
      confirm.disabled = true;
      try {
        const added = await this.onSubmit({
          text: taskText,
          dueDate: this.dueDate,
          dueTime: this.dueTime,
        });
        if (added) {
          this.close();
        }
      } finally {
        this.submitting = false;
        confirm.disabled = false;
      }
    };
    confirm.addEventListener("click", () => void submit());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

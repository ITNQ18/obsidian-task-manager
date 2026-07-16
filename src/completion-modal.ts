import { App, Modal, Setting } from "obsidian";
import type TaskManagerPlugin from "./main";

export class CompletionTimeModal extends Modal {
  private selectedValue: string;
  private submitted = false;

  constructor(
    app: App,
    private readonly plugin: TaskManagerPlugin,
    private readonly onSubmit: (date: Date) => void,
    private readonly onCancel: () => void,
  ) {
    super(app);
    this.selectedValue = toDateTimeLocalValue(new Date());
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.plugin.t("completionTimeTitle") });

    new Setting(contentEl)
      .setName(this.plugin.t("completionTimeName"))
      .setDesc(this.plugin.t("completionTimeDescription"))
      .addText((text) => {
        text.setValue(this.selectedValue).onChange((value) => {
          this.selectedValue = value;
        });
        text.inputEl.type = "datetime-local";
        text.inputEl.step = "60";
      });

    const actions = contentEl.createDiv({ cls: "task-manager-modal-actions" });
    const cancel = actions.createEl("button", {
      text: this.plugin.t("cancel"),
      attr: { type: "button" },
    });
    const confirm = actions.createEl("button", {
      text: this.plugin.t("confirmCompletion"),
      cls: "mod-cta",
      attr: { type: "button" },
    });

    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", () => {
      const date = new Date(this.selectedValue);
      if (Number.isNaN(date.getTime())) {
        return;
      }
      this.submitted = true;
      this.onSubmit(date);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.submitted) {
      this.onCancel();
    }
  }
}

function toDateTimeLocalValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

import {
  AbstractInputSuggest,
  App,
  Modal,
  Notice,
  TFolder,
  TextComponent,
  normalizePath,
} from "obsidian";
import { isIgnoredVaultPath, normalizeVaultFolderInput } from "./core";
import type TaskManagerPlugin from "./main";

export interface FolderSelectionModalOptions {
  initialPath: string;
  title: string;
  description: string;
  placeholder: string;
  label: string;
  requiredMessage: string;
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private readonly input: HTMLInputElement;

  constructor(app: App, input: HTMLInputElement) {
    super(app, input);
    this.input = input;
  }

  getSuggestions(query: string): TFolder[] {
    const normalizedQuery = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => folder.path !== "/")
      .filter((folder) => !isIgnoredVaultPath(folder.path))
      .filter((folder) => folder.path.toLowerCase().includes(normalizedQuery))
      .slice(0, 50);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.input.value = folder.path;
    this.input.dispatchEvent(new Event("input"));
    this.close();
  }
}

export class FolderSelectionModal extends Modal {
  private inputComponent: TextComponent | null = null;

  constructor(
    app: App,
    private readonly plugin: TaskManagerPlugin,
    private readonly onSelected: (path: string) => Promise<void>,
    private readonly options?: FolderSelectionModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const t = this.plugin.t.bind(this.plugin);
    contentEl.addClass("task-manager-folder-modal");
    this.setTitle(this.options?.title ?? t("folderModalTitle"));

    const inputRow = contentEl.createDiv({
      cls: "task-manager-folder-input-row",
    });
    const text = new TextComponent(inputRow);
    this.inputComponent = text;
    text
      .setPlaceholder(this.options?.placeholder ?? t("folderPlaceholder"))
      .setValue(
        normalizeVaultFolderInput(
          this.options?.initialPath ?? this.plugin.settings.dailyFolder,
        ),
      );
    text.inputEl.setAttribute(
      "aria-label",
      this.options?.label ?? t("folderLabel"),
    );
    new FolderSuggest(this.app, text.inputEl);
    text.inputEl.addEventListener("input", () => {
      const normalized = text.inputEl.value
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/{2,}/g, "/");
      if (normalized !== text.inputEl.value) {
        text.inputEl.value = normalized;
      }
    });
    text.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.submit();
      }
    });

    contentEl.createEl("p", {
      text: this.options?.description ?? t("folderModalDescription"),
      cls: "setting-item-description task-manager-folder-help",
    });

    const actions = contentEl.createDiv({ cls: "task-manager-modal-actions" });
    const cancelButton = actions.createEl("button", { text: t("cancel") });
    cancelButton.addEventListener("click", () => this.close());
    const confirmButton = actions.createEl("button", {
      text: t("confirm"),
      cls: "mod-cta",
    });
    confirmButton.addEventListener("click", () => void this.submit());

    window.setTimeout(() => this.inputComponent?.inputEl.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    const rawPath = this.inputComponent?.getValue().trim() ?? "";
    const path = normalizePath(normalizeVaultFolderInput(rawPath));
    if (!path || path === "/") {
      new Notice(
        this.options?.requiredMessage ?? this.plugin.t("folderRequired"),
      );
      return;
    }
    if (isIgnoredVaultPath(path)) {
      new Notice(this.plugin.t("folderIgnored"));
      return;
    }

    try {
      await this.plugin.ensureFolder(path);
      await this.onSelected(path);
      this.close();
    } catch (error) {
      new Notice(
        this.plugin.t("folderCreateFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

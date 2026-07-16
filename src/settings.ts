import {
  App,
  MarkdownRenderer,
  Notice,
  PluginSettingTab,
  Setting,
  TextAreaComponent,
  type TextComponent,
} from "obsidian";
import {
  getDefaultFilenamePattern,
  getDefaultTemplate,
  getDefaultTitleTemplate,
  formatFilename,
  renderTemplate,
} from "./core";
import { FolderSelectionModal } from "./folder-modal";
import type { TranslationKey } from "./i18n";
import {
  attachNativeContextMenu,
  insertIntoTextControl,
  type InsertGroup,
  type InsertItem,
} from "./native-context-menu";
import type TaskManagerPlugin from "./main";

const FILENAME_TOKENS = [
  "{YYYY}",
  "{YY}",
  "{M}",
  "{MM}",
  "{D}",
  "{DD}",
  "{weekday}",
  "{weekdayShort}",
  "{weekdayEn}",
  "{weekdayEnShort}",
] as const;

const TEMPLATE_VARIABLES = [
  "{{date}}",
  "{{year}}",
  "{{month}}",
  "{{day}}",
  "{{weekday}}",
  "{{time}}",
  "{{filename}}",
] as const;

const FILENAME_TOKEN_DESCRIPTION_KEYS: Record<
  (typeof FILENAME_TOKENS)[number],
  TranslationKey
> = {
  "{YYYY}": "filenameTokenYYYY",
  "{YY}": "filenameTokenYY",
  "{M}": "filenameTokenM",
  "{MM}": "filenameTokenMM",
  "{D}": "filenameTokenD",
  "{DD}": "filenameTokenDD",
  "{weekday}": "filenameTokenWeekday",
  "{weekdayShort}": "filenameTokenWeekdayShort",
  "{weekdayEn}": "filenameTokenWeekdayEn",
  "{weekdayEnShort}": "filenameTokenWeekdayEnShort",
};

const TEMPLATE_VARIABLE_DESCRIPTION_KEYS: Record<
  (typeof TEMPLATE_VARIABLES)[number],
  TranslationKey
> = {
  "{{date}}": "templateVariableDate",
  "{{year}}": "templateVariableYear",
  "{{month}}": "templateVariableMonth",
  "{{day}}": "templateVariableDay",
  "{{weekday}}": "templateVariableWeekday",
  "{{time}}": "templateVariableTime",
  "{{filename}}": "templateVariableFilename",
};

export class TaskManagerSettingTab extends PluginSettingTab {
  private templatePreviewMode = false;

  constructor(app: App, private readonly plugin: TaskManagerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const t = this.plugin.t.bind(this.plugin);
    containerEl.empty();
    containerEl.addClass("task-manager-settings");
    new Setting(containerEl).setName(t("settingsTitle")).setHeading();

    new Setting(containerEl)
      .setName(t("languageName"))
      .setDesc(t("languageDescription"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("system", t("languageSystem"))
          .addOption("zh-CN", t("languageChinese"))
          .addOption("en", t("languageEnglish"))
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as
              | "system"
              | "zh-CN"
              | "en";
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl).setName(t("taskHomeHeading")).setHeading();
    new Setting(containerEl)
      .setName(t("staleTaskDaysName"))
      .setDesc(t("staleTaskDaysDescription"))
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.staleTaskDays))
          .onChange(async (value) => {
            const days = Number(value);
            if (!Number.isInteger(days) || days < 1 || days > 3650) {
              return;
            }
            this.plugin.settings.staleTaskDays = days;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "3650";
        text.inputEl.step = "1";
      });
    new Setting(containerEl)
      .setName(t("askCompletionTimeName"))
      .setDesc(t("askCompletionTimeDescription"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.askCompletionTime)
          .onChange(async (value) => {
            this.plugin.settings.askCompletionTime = value;
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t("deadlineFormatName"))
      .setDesc(t("deadlineFormatDescription"));

    new Setting(containerEl)
      .setName(t("futureTaskSettingsHeading"))
      .setHeading();
    new Setting(containerEl)
      .setName(t("futureTaskFolderLabel"))
      .setDesc(t("futureTaskStorageDescription"))
      .addText((text) => {
        text
          .setPlaceholder(t("folderUnconfigured"))
          .setValue(this.plugin.settings.futureTaskFolder);
        text.inputEl.readOnly = true;
      })
      .addButton((button) =>
        button.setButtonText(t("chooseFolder")).onClick(() => {
          new FolderSelectionModal(
            this.app,
            this.plugin,
            async (path) => {
              this.plugin.settings.futureTaskFolder = path;
              await this.plugin.saveSettings();
              new Notice(t("futureTaskFolderConfigured", { path }));
              this.display();
            },
            {
              initialPath: this.plugin.settings.futureTaskFolder,
              title: t("futureTaskFolderModalTitle"),
              description: t("futureTaskFolderModalDescription"),
              placeholder: t("futureTaskFolderPlaceholder"),
              label: t("futureTaskFolderLabel"),
              requiredMessage: t("futureTaskFolderRequired"),
            },
          ).open();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText(t("clearFolder"))
          .setWarning()
          .setDisabled(!this.plugin.settings.futureTaskFolder)
          .onClick(async () => {
            this.plugin.settings.futureTaskFolder = "";
            await this.plugin.saveSettings();
            new Notice(t("futureTaskFolderCleared"));
            this.display();
          }),
      );

    new Setting(containerEl).setName(t("storageHeading")).setHeading();
    new Setting(containerEl)
      .setName(t("folderLabel"))
      .setDesc(t("storageDescription"))
      .addText((text) => {
        text
          .setPlaceholder(t("folderUnconfigured"))
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.readOnly = true;
      })
      .addButton((button) =>
        button.setButtonText(t("chooseFolder")).onClick(() => {
          new FolderSelectionModal(this.app, this.plugin, async (path) => {
            this.plugin.settings.dailyFolder = path;
            await this.plugin.saveSettings();
            new Notice(t("folderConfigured", { path }));
            this.display();
          }).open();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText(t("clearFolder"))
          .setWarning()
          .setDisabled(!this.plugin.settings.dailyFolder)
          .onClick(async () => {
            this.plugin.settings.dailyFolder = "";
            await this.plugin.saveSettings();
            new Notice(t("folderCleared"));
            this.display();
          }),
      );

    this.renderFilenameSettings(containerEl);
    this.renderTemplateSettings(containerEl);
  }

  private renderFilenameSettings(containerEl: HTMLElement): void {
    const t = this.plugin.t.bind(this.plugin);
    new Setting(containerEl).setName(t("filenameHeading")).setHeading();

    let filenameText: TextComponent | null = null;
    const filenameSetting = new Setting(containerEl)
      .setName(t("filenamePatternName"))
      .setDesc(t("filenamePatternDescription"));
    filenameSetting.settingEl.addClass("task-manager-filename-setting");
    filenameSetting.addText((text) => {
      filenameText = text;
      text
        .setPlaceholder(
          getDefaultFilenamePattern(this.plugin.getCurrentLanguage()),
        )
        .setValue(this.plugin.settings.filenamePattern)
        .onChange(async (value) => {
          this.plugin.settings.filenamePattern = value;
          await this.plugin.saveSettings();
          preview.setText(
            t("filenamePreview", {
              filename:
                this.plugin.getTodayFilename() || t("filenameInvalidPreview"),
            }),
          );
        });

      attachNativeContextMenu(text.inputEl, t, () => [
        {
          title: t("filenameMarkersGroup"),
          items: this.getFilenameTokenItems(),
        },
      ]);
    });
    filenameSetting.addButton((button) =>
      button.setButtonText(t("resetFilename")).onClick(async () => {
        this.plugin.settings.filenamePattern = "";
        await this.plugin.saveSettings();
        this.display();
      }),
    );

    const insertPanel = containerEl.createDiv({
      cls: "task-manager-insert-panel",
    });
    insertPanel.createEl("p", {
      text: t("filenameInsertHint"),
      cls: "setting-item-description task-manager-insert-hint",
    });
    const chips = insertPanel.createDiv({ cls: "task-manager-token-list" });
    for (const token of FILENAME_TOKENS) {
      this.createInsertChip(chips, token, token, () => {
        if (filenameText) {
          insertIntoTextControl(filenameText.inputEl, token);
        }
      });
    }

    const preview = containerEl.createEl("p", {
      text: t("filenamePreview", {
        filename:
          this.plugin.getTodayFilename() || t("filenameInvalidPreview"),
      }),
      cls: "task-manager-preview",
    });
  }

  private renderTemplateSettings(containerEl: HTMLElement): void {
    const t = this.plugin.t.bind(this.plugin);
    const language = this.plugin.getCurrentLanguage();
    new Setting(containerEl).setName(t("templateHeading")).setHeading();
    new Setting(containerEl)
      .setName(t("includeTitleName"))
      .setDesc(t("includeTitleDescription"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeTitle)
          .onChange(async (value) => {
            this.plugin.settings.includeTitle = value;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    const markdownItems = this.getMarkdownInsertItems();
    const contextGroups = (): InsertGroup[] => [
      {
        title: t("templateVariablesGroup"),
        items: this.getTemplateVariableItems(),
      },
      { title: t("markdownSnippetsGroup"), items: markdownItems },
    ];

    const templateRow = containerEl.createDiv({
      cls: "setting-item task-manager-template-setting",
    });
    const info = templateRow.createDiv({ cls: "setting-item-info" });
    info.createDiv({ cls: "setting-item-name", text: t("templateName") });
    info.createDiv({
      cls: "setting-item-description",
      text: t("templateDescription"),
    });
    info.createEl("p", {
      cls: "setting-item-description task-manager-insert-hint",
      text: t("templateInsertHint"),
    });

    const variableGroup = info.createDiv({ cls: "task-manager-quick-group" });
    variableGroup.createDiv({
      cls: "task-manager-quick-group-title",
      text: t("templateVariablesGroup"),
    });
    const variableChips = variableGroup.createDiv({
      cls: "task-manager-token-list",
    });

    const markdownGroup = info.createDiv({ cls: "task-manager-quick-group" });
    markdownGroup.createDiv({
      cls: "task-manager-quick-group-title",
      text: t("markdownSnippetsGroup"),
    });
    const markdownChips = markdownGroup.createDiv({
      cls: "task-manager-token-list",
    });

    const control = templateRow.createDiv({ cls: "setting-item-control" });
    const editorHost = control.createDiv({ cls: "task-manager-template-editor" });
    const textArea = new TextAreaComponent(editorHost);
    let templateValue =
      this.plugin.settings.customTemplate || getDefaultTemplate(language);
    textArea.setValue(templateValue).onChange(async (value) => {
      templateValue = value;
      const localizedDefault = getDefaultTemplate(
        this.plugin.getCurrentLanguage(),
      );
      this.plugin.settings.customTemplate =
        value === localizedDefault ? "" : value;
      await this.plugin.saveSettings();
    });
    textArea.inputEl.rows = 16;
    textArea.inputEl.spellcheck = false;
    textArea.inputEl.setAttribute("aria-label", t("templateName"));
    attachNativeContextMenu(textArea.inputEl, t, contextGroups);

    const previewEl = editorHost.createDiv({
      cls: "task-manager-template-preview is-hidden",
      attr: { "aria-label": t("templatePreviewLabel") },
    });
    const previewContentEl = previewEl.createDiv({
      cls: "task-manager-template-preview-content markdown-rendered markdown-preview-view",
    });

    const actionRow = control.createDiv({ cls: "task-manager-template-actions" });
    const modeButton = actionRow.createEl("button", { attr: { type: "button" } });
    const resetButton = actionRow.createEl("button", {
      text: t("resetTemplate"),
      attr: { type: "button" },
    });

    const renderPreview = async (): Promise<void> => {
      const date = new Date();
      const filename = this.plugin.getTodayFilename(date);
      const body = renderTemplate(
        templateValue,
        date,
        this.plugin.getCurrentLanguage(),
        filename,
      );
      const title = this.plugin.settings.includeTitle
        ? renderTemplate(
            getDefaultTitleTemplate(this.plugin.getCurrentLanguage()),
            date,
            this.plugin.getCurrentLanguage(),
            filename,
          )
        : "";
      const content = [title, body].filter(Boolean).join("\n\n");
      previewContentEl.empty();
      await MarkdownRenderer.render(
        this.app,
        content,
        previewContentEl,
        this.plugin.getTodayPath(date) || filename,
        this.plugin,
      );
    };

    const updateMode = async (): Promise<void> => {
      textArea.inputEl.toggleClass("is-hidden", this.templatePreviewMode);
      previewEl.toggleClass("is-hidden", !this.templatePreviewMode);
      modeButton.setText(
        t(this.templatePreviewMode ? "editTemplate" : "previewTemplate"),
      );
      if (this.templatePreviewMode) {
        await renderPreview();
      }
    };

    const insertTemplateText = (value: string): void => {
      if (this.templatePreviewMode) {
        this.templatePreviewMode = false;
        void updateMode();
      }
      insertIntoTextControl(textArea.inputEl, value);
    };

    for (const variable of TEMPLATE_VARIABLES) {
      this.createInsertChip(variableChips, variable, variable, () =>
        insertTemplateText(variable),
      );
    }
    for (const item of markdownItems) {
      this.createInsertChip(markdownChips, item.label, item.value, () =>
        insertTemplateText(item.value),
      );
    }

    modeButton.addEventListener("click", () => {
      this.templatePreviewMode = !this.templatePreviewMode;
      void updateMode();
    });
    resetButton.addEventListener("click", async () => {
      this.plugin.settings.customTemplate = "";
      templateValue = getDefaultTemplate(this.plugin.getCurrentLanguage());
      textArea.setValue(templateValue);
      await this.plugin.saveSettings();
      if (this.templatePreviewMode) {
        await renderPreview();
      }
    });

    void updateMode();
  }

  private createInsertChip(
    parent: HTMLElement,
    label: string,
    value: string,
    onClick: () => void,
  ): void {
    const chip = parent.createEl("button", {
      text: label,
      cls: "task-manager-insert-chip",
      attr: {
        type: "button",
        title: value,
        "aria-label": `${label}: ${value}`,
      },
    });
    chip.addEventListener("click", onClick);
  }

  private getMarkdownInsertItems(): InsertItem[] {
    const t = (key: TranslationKey): string => this.plugin.t(key);
    const isChinese = this.plugin.getCurrentLanguage() === "zh-CN";
    return [
      {
        label: t("markdownInternalLink"),
        value: isChinese ? "[[笔记名称]]" : "[[Note name]]",
      },
      {
        label: t("markdownEmbed"),
        value: isChinese ? "![[文件名称]]" : "![[File name]]",
      },
      { label: t("markdownTag"), value: isChinese ? "#标签" : "#tag" },
      { label: t("markdownTask"), value: "- [ ] " },
      { label: t("markdownBullet"), value: "- " },
      {
        label: t("markdownHeading"),
        value: isChinese ? "## 标题" : "## Heading",
      },
      {
        label: t("markdownCallout"),
        value: isChinese
          ? "> [!info] 标题\n> 内容"
          : "> [!info] Title\n> Content",
      },
      {
        label: t("markdownBold"),
        value: isChinese ? "**文本**" : "**Text**",
      },
    ];
  }

  private getFilenameTokenItems(): InsertItem[] {
    const language = this.plugin.getCurrentLanguage();
    const now = new Date();
    return FILENAME_TOKENS.map((token) => {
      const example = formatFilename(token, now, language).replace(/\.md$/i, "");
      return {
        label: token,
        value: token,
        menuLabel: `${token}    ${this.plugin.t(
          FILENAME_TOKEN_DESCRIPTION_KEYS[token],
        )} · ${example}`,
      };
    });
  }

  private getTemplateVariableItems(): InsertItem[] {
    const language = this.plugin.getCurrentLanguage();
    const now = new Date();
    const filename = this.plugin.getTodayFilename(now);
    return TEMPLATE_VARIABLES.map((variable) => ({
      label: variable,
      value: variable,
      menuLabel: `${variable}    ${this.plugin.t(
        TEMPLATE_VARIABLE_DESCRIPTION_KEYS[variable],
      )} · ${renderTemplate(variable, now, language, filename)}`,
    }));
  }
}

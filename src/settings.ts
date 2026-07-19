import {
  App,
  Component,
  MarkdownRenderer,
  Notice,
  PluginSettingTab,
  Setting,
  TextAreaComponent,
  type SettingDefinitionItem,
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
import type { TaskManagerSettings } from "./main";

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

const SETTING_KEYS = new Set<keyof TaskManagerSettings>([
  "language",
  "staleTaskDays",
  "askCompletionTime",
  "dailyFolder",
  "futureTaskFolder",
  "filenamePattern",
  "customTemplate",
  "includeTitle",
]);

export class TaskManagerSettingTab extends PluginSettingTab {
  private templatePreviewMode = false;
  private legacyPreviewCleanup: (() => void) | null = null;

  constructor(app: App, private readonly plugin: TaskManagerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const t = this.plugin.t.bind(this.plugin);
    this.legacyPreviewCleanup?.();
    this.legacyPreviewCleanup = null;
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
          .onChange((value) => void this.updateLanguage(value)),
      );

    new Setting(containerEl).setName(t("taskHomeHeading")).setHeading();
    new Setting(containerEl)
      .setName(t("staleTaskDaysName"))
      .setDesc(t("staleTaskDaysDescription"))
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.staleTaskDays))
          .onChange((value) => void this.updateStaleTaskDays(value));
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
          .onChange((value) => void this.updateBooleanSetting("askCompletionTime", value)),
      );
    new Setting(containerEl)
      .setName(t("deadlineFormatName"))
      .setDesc(t("deadlineFormatDescription"));

    new Setting(containerEl)
      .setName(t("futureTaskSettingsHeading"))
      .setHeading();
    this.renderFolderSetting(containerEl, "futureTaskFolder");

    new Setting(containerEl).setName(t("storageHeading")).setHeading();
    this.renderFolderSetting(containerEl, "dailyFolder");

    new Setting(containerEl).setName(t("filenameHeading")).setHeading();
    const filenameSetting = new Setting(containerEl)
      .setName(t("filenamePatternName"))
      .setDesc(t("filenamePatternDescription"));
    this.renderFilenameSettings(filenameSetting);

    new Setting(containerEl).setName(t("templateHeading")).setHeading();
    new Setting(containerEl)
      .setName(t("includeTitleName"))
      .setDesc(t("includeTitleDescription"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeTitle)
          .onChange((value) => void this.updateBooleanSetting("includeTitle", value)),
      );
    const templateSetting = new Setting(containerEl)
      .setName(t("templateName"))
      .setDesc(t("templateDescription"));
    this.legacyPreviewCleanup = this.renderTemplateSettings(templateSetting);
  }

  private async updateLanguage(value: string): Promise<void> {
    if (value !== "system" && value !== "zh-CN" && value !== "en") {
      return;
    }
    this.plugin.settings.language = value;
    await this.plugin.saveSettings();
    this.display();
  }

  private async updateStaleTaskDays(value: string): Promise<void> {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return;
    }
    this.plugin.settings.staleTaskDays = days;
    await this.plugin.saveSettings();
  }

  private async updateBooleanSetting(
    key: "askCompletionTime" | "includeTitle",
    value: boolean,
  ): Promise<void> {
    this.plugin.settings[key] = value;
    await this.plugin.saveSettings();
  }

  private renderFolderSetting(
    containerEl: HTMLElement,
    key: "dailyFolder" | "futureTaskFolder",
  ): void {
    const t = this.plugin.t.bind(this.plugin);
    const isFuture = key === "futureTaskFolder";
    const setting = new Setting(containerEl)
      .setName(t(isFuture ? "futureTaskFolderLabel" : "folderLabel"))
      .setDesc(
        t(isFuture ? "futureTaskStorageDescription" : "storageDescription"),
      )
      .addText((text) => {
        text
          .setPlaceholder(t("folderUnconfigured"))
          .setValue(this.plugin.settings[key]);
        text.inputEl.readOnly = true;
      });

    setting.addButton((button) =>
      button.setButtonText(t("chooseFolder")).onClick(() => {
        new FolderSelectionModal(
          this.app,
          this.plugin,
          async (path) => {
            this.plugin.settings[key] = path;
            await this.plugin.saveSettings();
            new Notice(
              t(isFuture ? "futureTaskFolderConfigured" : "folderConfigured", {
                path,
              }),
            );
            this.display();
          },
          isFuture
            ? {
                initialPath: this.plugin.settings.futureTaskFolder,
                title: t("futureTaskFolderModalTitle"),
                description: t("futureTaskFolderModalDescription"),
                placeholder: t("futureTaskFolderPlaceholder"),
                label: t("futureTaskFolderLabel"),
                requiredMessage: t("futureTaskFolderRequired"),
              }
            : undefined,
        ).open();
      }),
    );
    setting.addButton((button) =>
      button
        .setButtonText(t("clearFolder"))
        .setWarning()
        .setDisabled(!this.plugin.settings[key])
        .onClick(() => void this.clearFolderSetting(key)),
    );
  }

  private async clearFolderSetting(
    key: "dailyFolder" | "futureTaskFolder",
  ): Promise<void> {
    const isFuture = key === "futureTaskFolder";
    this.plugin.settings[key] = "";
    await this.plugin.saveSettings();
    new Notice(
      this.plugin.t(isFuture ? "futureTaskFolderCleared" : "folderCleared"),
    );
    this.display();
  }

  getSettingDefinitions(): SettingDefinitionItem<
    keyof TaskManagerSettings
  >[] {
    const t = this.plugin.t.bind(this.plugin);
    return [
      {
        type: "group",
        heading: t("settingsTitle"),
        items: [
          {
            name: t("languageName"),
            desc: t("languageDescription"),
            control: {
              type: "dropdown",
              key: "language",
              options: {
                system: t("languageSystem"),
                "zh-CN": t("languageChinese"),
                en: t("languageEnglish"),
              },
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("taskHomeHeading"),
        items: [
          {
            name: t("staleTaskDaysName"),
            desc: t("staleTaskDaysDescription"),
            control: {
              type: "number",
              key: "staleTaskDays",
              min: 1,
              max: 3650,
              step: 1,
              validate: (value) =>
                Number.isInteger(value) && value >= 1 && value <= 3650
                  ? undefined
                  : "Enter a whole number from 1 to 3650.",
            },
          },
          {
            name: t("askCompletionTimeName"),
            desc: t("askCompletionTimeDescription"),
            control: { type: "toggle", key: "askCompletionTime" },
          },
          {
            name: t("deadlineFormatName"),
            desc: t("deadlineFormatDescription"),
          },
        ],
      },
      {
        type: "group",
        heading: t("futureTaskSettingsHeading"),
        items: [
          {
            name: t("futureTaskFolderLabel"),
            desc: t("futureTaskStorageDescription"),
            control: {
              type: "folder",
              key: "futureTaskFolder",
              placeholder: t("folderUnconfigured"),
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("storageHeading"),
        items: [
          {
            name: t("folderLabel"),
            desc: t("storageDescription"),
            control: {
              type: "folder",
              key: "dailyFolder",
              placeholder: t("folderUnconfigured"),
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("filenameHeading"),
        items: [
          {
            name: t("filenamePatternName"),
            desc: t("filenamePatternDescription"),
            aliases: FILENAME_TOKENS.slice(),
            render: (setting) => this.renderFilenameSettings(setting),
          },
        ],
      },
      {
        type: "group",
        heading: t("templateHeading"),
        items: [
          {
            name: t("includeTitleName"),
            desc: t("includeTitleDescription"),
            control: { type: "toggle", key: "includeTitle" },
          },
          {
            name: t("templateName"),
            desc: t("templateDescription"),
            aliases: TEMPLATE_VARIABLES.slice(),
            render: (setting) => this.renderTemplateSettings(setting),
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (isSettingKey(key)) {
      return this.plugin.settings[key];
    }
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "language":
        if (value !== "system" && value !== "zh-CN" && value !== "en") {
          return;
        }
        this.plugin.settings.language = value;
        break;
      case "staleTaskDays":
        if (
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 1 ||
          value > 3650
        ) {
          return;
        }
        this.plugin.settings.staleTaskDays = value;
        break;
      case "askCompletionTime":
      case "includeTitle":
        if (typeof value !== "boolean") {
          return;
        }
        this.plugin.settings[key] = value;
        break;
      case "dailyFolder":
      case "futureTaskFolder":
        if (typeof value !== "string") {
          return;
        }
        this.plugin.settings[key] = value.trim();
        break;
      default:
        return;
    }

    await this.plugin.saveSettings();
    if (key === "language") {
      this.display();
    }
  }

  private renderFilenameSettings(setting: Setting): void {
    const t = this.plugin.t.bind(this.plugin);
    let filenameText: TextComponent | null = null;
    setting.settingEl.addClass("task-manager-filename-setting");
    setting.addText((text) => {
      filenameText = text;
      text
        .setPlaceholder(
          getDefaultFilenamePattern(this.plugin.getCurrentLanguage()),
        )
        .setValue(this.plugin.settings.filenamePattern)
        .onChange((value) => void this.updateFilenamePattern(value, preview));

      attachNativeContextMenu(text.inputEl, t, () => [
        {
          title: t("filenameMarkersGroup"),
          items: this.getFilenameTokenItems(),
        },
      ]);
    });
    setting.addButton((button) =>
      button
        .setButtonText(t("resetFilename"))
        .onClick(() => void this.resetFilenamePattern()),
    );

    const extras = setting.settingEl.createDiv({
      cls: "task-manager-filename-extras",
    });
    const insertPanel = extras.createDiv({
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

    const preview = extras.createEl("p", {
      text: t("filenamePreview", {
        filename:
          this.plugin.getTodayFilename() || t("filenameInvalidPreview"),
      }),
      cls: "task-manager-preview",
    });
  }

  private async updateFilenamePattern(
    value: string,
    preview: HTMLElement,
  ): Promise<void> {
    this.plugin.settings.filenamePattern = value;
    await this.plugin.saveSettings();
    preview.setText(
      this.plugin.t("filenamePreview", {
        filename:
          this.plugin.getTodayFilename() ||
          this.plugin.t("filenameInvalidPreview"),
      }),
    );
  }

  private async resetFilenamePattern(): Promise<void> {
    this.plugin.settings.filenamePattern = "";
    await this.plugin.saveSettings();
    this.display();
  }

  private renderTemplateSettings(setting: Setting): () => void {
    const t = this.plugin.t.bind(this.plugin);
    const language = this.plugin.getCurrentLanguage();
    const markdownItems = this.getMarkdownInsertItems();
    const contextGroups = (): InsertGroup[] => [
      {
        title: t("templateVariablesGroup"),
        items: this.getTemplateVariableItems(),
      },
      { title: t("markdownSnippetsGroup"), items: markdownItems },
    ];

    setting.settingEl.addClasses([
      "task-manager-settings",
      "task-manager-template-setting",
    ]);
    setting.infoEl.createEl("p", {
      cls: "setting-item-description task-manager-insert-hint",
      text: t("templateInsertHint"),
    });

    const variableGroup = setting.infoEl.createDiv({
      cls: "task-manager-quick-group",
    });
    variableGroup.createDiv({
      cls: "task-manager-quick-group-title",
      text: t("templateVariablesGroup"),
    });
    const variableChips = variableGroup.createDiv({
      cls: "task-manager-token-list",
    });

    const markdownGroup = setting.infoEl.createDiv({
      cls: "task-manager-quick-group",
    });
    markdownGroup.createDiv({
      cls: "task-manager-quick-group-title",
      text: t("markdownSnippetsGroup"),
    });
    const markdownChips = markdownGroup.createDiv({
      cls: "task-manager-token-list",
    });

    const editorHost = setting.controlEl.createDiv({
      cls: "task-manager-template-editor",
    });
    const textArea = new TextAreaComponent(editorHost);
    let templateValue =
      this.plugin.settings.customTemplate || getDefaultTemplate(language);
    const saveTemplate = async (value: string): Promise<void> => {
      templateValue = value;
      const localizedDefault = getDefaultTemplate(
        this.plugin.getCurrentLanguage(),
      );
      this.plugin.settings.customTemplate =
        value === localizedDefault ? "" : value;
      await this.plugin.saveSettings();
    };
    textArea
      .setValue(templateValue)
      .onChange((value) => void saveTemplate(value));
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

    const actionRow = setting.controlEl.createDiv({
      cls: "task-manager-template-actions",
    });
    const modeButton = actionRow.createEl("button", { attr: { type: "button" } });
    const resetButton = actionRow.createEl("button", {
      text: t("resetTemplate"),
      attr: { type: "button" },
    });

    let previewComponent: Component | null = null;
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
      previewComponent?.unload();
      previewComponent = new Component();
      previewComponent.load();
      await MarkdownRenderer.render(
        this.app,
        content,
        previewContentEl,
        this.plugin.getTodayPath(date) || filename,
        previewComponent,
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
    const resetTemplate = async (): Promise<void> => {
      this.plugin.settings.customTemplate = "";
      templateValue = getDefaultTemplate(this.plugin.getCurrentLanguage());
      textArea.setValue(templateValue);
      await this.plugin.saveSettings();
      if (this.templatePreviewMode) {
        await renderPreview();
      }
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
    resetButton.addEventListener("click", () => void resetTemplate());

    void updateMode();
    return () => previewComponent?.unload();
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

function isSettingKey(key: string): key is keyof TaskManagerSettings {
  return SETTING_KEYS.has(key as keyof TaskManagerSettings);
}

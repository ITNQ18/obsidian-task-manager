import type { TranslationKey } from "./i18n";
import { insertTextAtSelection } from "./core";

export interface InsertItem {
  label: string;
  value: string;
  menuLabel?: string;
}

export interface InsertGroup {
  title: string;
  items: InsertItem[];
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

interface NativeMenuApi {
  buildFromTemplate: (template: unknown[]) => {
    popup: (options?: Record<string, unknown>) => void;
  };
  getCurrentWindow?: () => unknown;
}

type Translate = (
  key: TranslationKey,
  variables?: Record<string, string>,
) => string;

export function insertIntoTextControl(
  control: TextControl,
  insertion: string,
  selectionStart = control.selectionStart ?? control.value.length,
  selectionEnd = control.selectionEnd ?? selectionStart,
): void {
  const result = insertTextAtSelection(
    control.value,
    selectionStart,
    selectionEnd,
    insertion,
  );
  control.value = result.value;
  control.focus();
  control.setSelectionRange(result.cursor, result.cursor);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

export function attachNativeContextMenu(
  control: TextControl,
  t: Translate,
  groups: InsertGroup[] | (() => InsertGroup[]),
): void {
  control.addEventListener("contextmenu", (event) => {
    const nativeMenu = getNativeMenuApi();
    if (!nativeMenu) {
      return;
    }

    const selectionStart = control.selectionStart ?? control.value.length;
    const selectionEnd = control.selectionEnd ?? selectionStart;
    const hasSelection = selectionEnd > selectionStart;
    const resolvedGroups = typeof groups === "function" ? groups() : groups;
    const template: unknown[] = [
      {
        label: t("contextCut"),
        role: "cut",
        accelerator: "CmdOrCtrl+X",
        enabled: hasSelection && !control.readOnly,
      },
      {
        label: t("contextCopy"),
        role: "copy",
        accelerator: "CmdOrCtrl+C",
        enabled: hasSelection,
      },
      {
        label: t("contextPaste"),
        role: "paste",
        accelerator: "CmdOrCtrl+V",
        enabled: !control.readOnly,
      },
      {
        label: t("contextPastePlain"),
        role: "pasteAndMatchStyle",
        accelerator: "CmdOrCtrl+Shift+V",
        enabled: !control.readOnly,
      },
      { type: "separator" },
      ...resolvedGroups.map((group) => ({
        label: group.title,
        submenu: group.items.map((item) => ({
          label:
            item.menuLabel ??
            (item.label === item.value
              ? item.label
              : `${item.label}    ${item.value}`),
          click: () =>
            insertIntoTextControl(
              control,
              item.value,
              selectionStart,
              selectionEnd,
            ),
        })),
      })),
    ];

    try {
      const menu = nativeMenu.buildFromTemplate(template);
      event.preventDefault();
      event.stopPropagation();
      const currentWindow = nativeMenu.getCurrentWindow?.();
      menu.popup(currentWindow ? { window: currentWindow } : undefined);
    } catch {
      // Leave the browser/Electron context menu untouched when the current
      // platform does not expose a native menu API to community plugins.
    }
  });
}

function getNativeMenuApi(): NativeMenuApi | null {
  const runtimeRequire = (
    window as Window & { require?: (moduleName: string) => unknown }
  ).require;
  if (!runtimeRequire) {
    return null;
  }

  for (const moduleName of ["@electron/remote", "electron"]) {
    try {
      const loaded = runtimeRequire(moduleName) as {
        Menu?: NativeMenuApi;
        remote?: {
          Menu?: NativeMenuApi;
          getCurrentWindow?: () => unknown;
        };
        getCurrentWindow?: () => unknown;
      };
      const container = loaded.remote ?? loaded;
      if (container.Menu?.buildFromTemplate) {
        return {
          buildFromTemplate: container.Menu.buildFromTemplate.bind(
            container.Menu,
          ),
          getCurrentWindow:
            container.getCurrentWindow?.bind(container) ??
            loaded.getCurrentWindow?.bind(loaded),
        };
      }
    } catch {
      // Try the next Electron bridge. Mobile and sandboxed builds may expose none.
    }
  }

  return null;
}

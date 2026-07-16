# Task Manager

[English](README.md) | [简体中文](README.zh-CN.md)

Task Manager 是一款 Obsidian 任务与日报管理插件，可在紧凑的右侧边栏中创建日报、整理未完成任务、查看逾期任务并维护未来计划。

## 功能

- 从右侧边栏打开或创建今日日报，不覆盖已有文件。
- 自定义日报目录、文件名格式、Markdown 模板和一级标题。
- 日报改名后，只要仍位于设定目录中且文件名包含对应的年、月、日，仍可被识别。
- 从日报中识别标准 Markdown 任务 `- [ ]`，并按计划完成日期分类。
- 将昨日日报中的计划视为今日待完成任务，同时不检测今日日报中的任务。
- 分开展示近期遗留、长期未完成和已有明确截止日期的逾期任务。
- 使用一个可配置目录下的固定文件 `未来任务.md` 保存未来任务；每项必须包含 `📅 YYYY-MM-DD`，可选 `⏰ HH:mm`。
- 可直接在侧栏完成任务，并将 `- [x]` 和 `✅ YYYY-MM-DD HH:mm` 完成时间写回原笔记。
- 在原生输入框右键菜单中增加文件名标记、模板变量和常用 Markdown 子菜单，同时保留原有编辑操作。
- 支持跟随 Obsidian、简体中文和 English；非中文 Obsidian 语言默认使用英文。
- 选择目录时忽略隐藏目录、`node_modules` 和插件源码目录。
- 完全在本地保险库中运行，不含统计、遥测和网络请求。

## 任务格式

日报中的计划使用标准 Markdown 任务：

```markdown
- [ ] 整理本周工作总结
```

明确截止日期或未来任务使用日期标记：

```markdown
- [ ] 发布 0.1.0 版本 📅 2026-07-20
- [ ] 完成发布复查 📅 2026-07-20 ⏰ 18:30
```

任务完成后会写回 Obsidian 原生复选框格式：

```markdown
- [x] 发布 0.1.0 版本 ✅ 2026-07-20 17:40
```

## 日报规则

默认中文日报正文：

```markdown
## 完成工作

-

## 遗留问题

-

## 后续计划

- [ ] ~
```

插件默认不设置日报目录，首次创建日报时由用户选择保险库内的目录。英文界面会使用对应的英文默认模板。

## 安装

### Obsidian 社区插件

插件通过官方审核后：

1. 打开 Obsidian 的 **设置 → 第三方插件**。
2. 点击 **浏览**，搜索 **Task Manager**。
3. 点击 **安装**，然后点击 **启用**。

### GitHub Release

1. 从最新 GitHub Release 下载 `task-manager.zip`，不要下载 GitHub 自动生成的源码压缩包。
2. 解压后，将完整的 `task-manager` 文件夹放入 `<保险库>/.obsidian/plugins/`。
3. 确认文件夹内包含 `main.js`、`manifest.json` 和 `styles.css`。
4. 刷新或重启 Obsidian，然后在第三方插件列表中启用 **Task Manager**。

## 开发

环境要求：

- Node.js 18 或更高版本
- npm

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

`npm run build` 会先进行 TypeScript 检查，再生成生产环境的 `main.js`。手动测试时，将 `main.js`、`manifest.json` 和 `styles.css` 复制到测试保险库的 `.obsidian/plugins/task-manager/`。

## 隐私

Task Manager 只读取和更新当前 Obsidian 保险库内的 Markdown 文件，不收集统计数据，不上传笔记内容，也不会发起网络请求。

## 许可证

[MIT](LICENSE)

# Agent Note: DeepSeek Harness VS Code 扩展与 VSIX 制品流水线

状态: 已实现

[English](2026-09-15-vscode-extension-and-vsix-artifact-pipeline.md) | 中文

## 问题

用户希望直接在 VS Code 及兼容编辑器（例如 Antigravity IDE）中作为侧边栏聊天体验运行 DeepSeek Harness，而无需打开外部浏览器窗口。该扩展需要透明处理本地认证 Cookie、避免跨站点信任错误（例如目录选择器上的 HTTP 403）、在缺少 `dsh` 时提供健壮的混合安装流程，并通过 CI 构建和分发 `.vsix` 制品包。

## 决策

1. **带环回代理的嵌入式 Webview**：将 DeepSeek Harness Web GUI 嵌入在侧边栏专属的 `WebviewView` 以及可选的编辑器标签页面板中。实现本地环回反向代理（`apps/vscode/src/dshManager.ts`），提取认证 Cookie，在所有 iframe 请求中自动注入，并规范化安全请求头（`Origin`、`sec-fetch-site`、`Referer`）以满足 `api-request-trust.ts` 的信任检查。
2. **混合安装交互体验**：若在 PATH 或标准 Node 目录中未找到 `dsh`，侧边栏将展示交互式安装卡片，提供一键自动安装（在缺少 sudo 权限时自动回退至扩展存储目录）以及可直接复制的命令 `npm install -g @deepseek-ai/dsh`。
3. **打包与 CI 流水线**：添加基于 `@vscode/vsce` 的 `apps/vscode/scripts/build.mjs` 和 `package.mjs`。在根目录 `package.json` 中添加 `package:vscode` 脚本，并在 `.github/workflows/desktop-artifacts.yml` 中添加 `build-vscode-vsix` 作业，在 GitHub Actions 中自动打包并上传 VSIX 制品。

## 备选方案

**在 Webview 中直接嵌入原生 localhost URL**。在 `vscode-webview://` 上下文中直接渲染 iframe 导致 Cookie 丢失（`SameSite=Strict`），从而产生 HTTP 401 认证错误。

**重新实现专用的聊天通信协议**。在扩展内部重写聊天界面会重复大量 Web 应用功能，且无法直接复用 Cordis 引擎提供的工具、子代理和扩展。

## 影响

VS Code 扩展可在左侧和右侧侧边栏无缝运行。通过 `pnpm run package:vscode` 可在本地构建 VSIX 扩展包（`deepseek-harness-vscode-0.1.0.vsix`），并且在 GitHub Actions 工作流中与 Linux AppImage 和 Windows EXE 安装程序并行自动生成并归档。

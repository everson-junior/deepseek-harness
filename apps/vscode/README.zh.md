# DeepSeek Chat & Harness for Visual Studio Code

[English](README.md) | 中文

DeepSeek Chat 是专为 Visual Studio Code 打造的 AI 编码助手和自主 Agent 扩展，提供与 **GitHub Copilot Chat** 和 **Google Gemini Code Assist** 相当的交互式聊天体验。由 **DeepSeek-V3** 与 **DeepSeek-R1 (Reasoner)** 驱动，并集成了 **DeepSeek Harness** 自主智能体运行时。

---

## 功能特性

### 1. 专用侧边栏聊天（Activity Bar）
- **DeepSeek 侧边栏面板**：随时从活动栏图标打开对话。
- **原生主题适配**：完美适配深色、浅色与高对比度 VS Code 主题。
- **推理过程可视化（DeepSeek-R1）**：实时可折叠展示每一步的 Thinking 推理过程及运行状态。
- **丰富代码块操作**：
  - 语法高亮展示。
  - **Copy** 复制到剪贴板。
  - **Insert at Cursor** 直接插入到当前活动编辑器光标处。
  - **Replace Selection** 替换编辑器当前选中内容。
  - **New File** 在新编辑器标签中打开生成的代码。
- **上下文关联**：一键将活动文件与选中的代码片段（例如 `index.ts:15-40`）附带至提问中。
- **Slash 命令快捷调用**：
  - `/explain` — 解释算法逻辑与复杂度。
  - `/fix` — 智能排查 Bug 并提供修复方案。
  - `/test` — 自动生成标准单元测试。
  - `/refactor` — 代码重构以提升可读性。

### 2. VS Code 原生 Chat 参与者（`@deepseek`）
- 直接在 VS Code 官方 Chat 面板中通过 `@deepseek` 提问。
- 原生内置命令：
  - `@deepseek /explain`
  - `@deepseek /fix`
  - `@deepseek /test`
  - `@deepseek /help`

### 3. 编辑器右键上下文菜单
- 右键点击任何选中的代码：
  - **DeepSeek: Explain Selected Code**
  - **DeepSeek: Fix Selected Code**
  - **DeepSeek: Generate Tests for Selection**
  - **DeepSeek: Send Selection to DeepSeek Chat**

### 4. 双模式运行引擎
- **直接 API 模式（极速低延迟）**：通过 DeepSeek 官方 API 实现实时 Server-Sent Events (SSE) 流式传输。
- **自主 Agent 模式（DeepSeek Harness）**：可选接入本地 `dsh` CLI，支持文件检索、跨文件编辑与命令执行等自主工作流。

---

## 配置项

打开 VS Code 设置（`Ctrl+,` 或 `Cmd+,`），搜索 **DeepSeek**：

| 配置项 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `deepseek.apiKey` | `string` | `""` | DeepSeek API 密钥。留空时自动读取 `DEEPSEEK_API_KEY` 环境变量。 |
| `deepseek.baseUrl` | `string` | `https://api.deepseek.com` | API 终端节点地址。 |
| `deepseek.model` | `string` | `deepseek-chat` | 默认模型：`deepseek-chat` (V3) 或 `deepseek-reasoner` (R1)。 |
| `deepseek.temperature` | `number` | `0.7` | 采样温度（0.0 至 2.0）。 |
| `deepseek.maxTokens` | `number` | `4096` | 单次回答的最大 Token 数量。 |
| `deepseek.systemPrompt` | `string` | `""` | 自定义系统提示词。 |
| `deepseek.harnessEnabled` | `boolean` | `false` | 启用 DeepSeek Harness 智能体工具执行。 |

---

## 构建与安装

```sh
# 1. 构建扩展产物
node apps/vscode/scripts/build.mjs

# 2. 打包为 .vsix 安装包
node apps/vscode/scripts/package.mjs

# 3. 安装到 VS Code
code --install-extension apps/vscode/deepseek-harness-chat-0.1.0.vsix
```

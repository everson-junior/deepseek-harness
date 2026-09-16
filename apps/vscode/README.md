# DeepSeek Harness for Visual Studio Code

English | [中文](README.zh.md)

Run the official **DeepSeek Harness** autonomous AI agent directly inside Visual Studio Code.

Instead of a standalone chat mock, this extension launches and manages the authentic DeepSeek Harness agent engine (`dsh`) bound to your current workspace, providing the full web interface, autonomous tool pipeline, file inspection/editing, and session history directly within your IDE.

---

## Features

### 1. Embedded DeepSeek Harness Webview
- **Sidebar Panel (Activity Bar)**: Open the DeepSeek Harness interface at any time from the Activity Bar icon.
- **Full Editor Tab (`DeepSeek Harness: Open Harness in Editor Tab`)**: Maximize your workspace by running the full Harness UI inside an editor tab.
- **Autonomous Agent Tools**: Full access to all Harness capabilities:
  - File reading, searching (ripgrep/glob), and editing.
  - Subprocess and terminal execution.
  - Session history, branching, and multi-turn planning.
  - Model switching and reasoning tokens (DeepSeek-V3 and DeepSeek-R1 Reasoner).

### 2. Lifecycle & Workspace Process Management
- **Automatic Workspace Binding**: Harness starts with your open VS Code workspace folder as its working directory.
- **Status Bar Integration**:
  - `$(hubot) DSH: Active (:PORT)` — Shows current status and active port.
  - Quick access to start, stop, restart, or view logs.
- **Dedicated Output Channel**:
  - Live stdout/stderr logs from the Harness process available under the `DeepSeek Harness` output channel.

### 3. Flexible Launch Modes
- Auto-detects `dsh` from your system `PATH` or monorepo development checkout.
- Configurable custom command/path (e.g. `pnpm dsh`).
- Configurable port and startup flags.

---

## Configuration

Open VS Code Settings (`Ctrl+,` or `Cmd+,`) and search for **DeepSeek**:

| Setting | Type | Default | Description |
|---|---|---|---|
| `deepseek.dshPath` | `string` | `""` | Custom command or path to dsh (e.g. `dsh`, `pnpm dsh`). Auto-detects if empty. |
| `deepseek.port` | `number` | `0` | Port for the Harness Web server (0 assigns a random available port). |
| `deepseek.profile` | `string` | `"web"` | DSH profile to boot (e.g. `web`). |
| `deepseek.autoStart` | `boolean` | `true` | Automatically boot the Harness runtime when the view is opened. |
| `deepseek.apiKey` | `string` | `""` | DeepSeek API key. Reads `DEEPSEEK_API_KEY` from environment or `.env` if blank. |
| `deepseek.baseUrl` | `string` | `https://api.deepseek.com` | DeepSeek API endpoint base URL. |

---

## Build & Install

```sh
# 1. Build extension bundle
node apps/vscode/scripts/build.mjs

# 2. Package into .vsix
node apps/vscode/scripts/package.mjs

# 3. Install into VS Code
code --install-extension apps/vscode/deepseek-harness-vscode-0.1.0.vsix
```

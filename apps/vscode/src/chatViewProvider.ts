import * as vscode from 'vscode'
import { DshProcessManager } from './dshManager.ts'
import { ExtensionConfig, HarnessInfo } from './types.ts'

/**
 * Generates the HTML content for the Webview based on current Harness status.
 */
function getHtmlForStatus(info: HarnessInfo): string {
  const nonce = getNonce()

  if (info.status === 'running' && info.url) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:* http://localhost:* https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--vscode-editor-background);
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  </style>
</head>
<body>
  <iframe src="${info.url}" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`
  }

  const commonStyles = `
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px 16px;
      box-sizing: border-box;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      text-align: center;
    }
    .card {
      width: 100%;
      max-width: 320px;
      padding: 20px 16px;
      border-radius: 8px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      box-sizing: border-box;
    }
    h2 {
      margin: 0 0 8px 0;
      font-size: 15px;
      font-weight: 600;
    }
    p {
      margin: 0 0 16px 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 8px 12px;
      margin-top: 8px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      box-sizing: border-box;
    }
    .btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .btn.primary {
      background-color: #007acc;
      color: #ffffff;
      font-weight: 600;
    }
    .btn.primary:hover {
      background-color: #0062a3;
    }
    .btn.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .spinner {
      border: 3px solid rgba(128, 128, 128, 0.2);
      border-top: 3px solid var(--vscode-progressBar-background, #007acc);
      border-radius: 50%;
      width: 28px;
      height: 28px;
      animation: spin 1s linear infinite;
      margin: 16px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .error-box {
      color: var(--vscode-errorForeground);
      background: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f44336);
      padding: 8px 10px;
      border-radius: 4px;
      font-size: 11px;
      word-break: break-word;
      margin-bottom: 12px;
      text-align: left;
    }
    .install-icon {
      font-size: 36px;
      margin-bottom: 8px;
    }
    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      margin: 16px 0 12px 0;
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      width: 100%;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    }
    .divider:not(:empty)::before {
      margin-right: 8px;
    }
    .divider:not(:empty)::after {
      margin-left: 8px;
    }
    .cmd-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      background: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.2));
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
      border-radius: 6px;
      padding: 8px 10px;
      margin: 6px 0 12px 0;
      width: 100%;
      box-sizing: border-box;
    }
    .cmd-text {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      color: var(--vscode-textPreformat-foreground, #4ec9b0);
      user-select: all;
      overflow-x: auto;
      white-space: nowrap;
      text-align: left;
    }
    .copy-btn {
      background: transparent;
      border: 1px solid var(--vscode-button-border, rgba(255, 255, 255, 0.15));
      color: var(--vscode-foreground);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      transition: background-color 0.15s;
    }
    .copy-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
    }
    .copy-btn.copied {
      color: #89d185;
      border-color: #89d185;
    }
    .note {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      margin-bottom: 12px;
      text-align: left;
      line-height: 1.4;
    }
  `

  if (info.status === 'installing') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${commonStyles}</style>
</head>
<body>
  <div class="card">
    <h2>Instalando DeepSeek Harness...</h2>
    <div class="spinner"></div>
    <p>Executando o setup de <code>@deepseek-ai/dsh</code> no background. Acompanhe os detalhes no terminal de saída.</p>
    <button class="btn secondary" id="btn-logs">📋 Ver Logs da Instalação</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-logs').addEventListener('click', () => {
      vscode.postMessage({ command: 'showLogs' });
    });
  </script>
</body>
</html>`
  }

  if (info.status === 'not_installed') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${commonStyles}</style>
</head>
<body>
  <div class="card">
    <div class="install-icon">⚡</div>
    <h2>DeepSeek Harness Não Encontrado</h2>
    <p>O comando <code>dsh</code> não está instalado no seu sistema. Escolha como deseja instalar:</p>

    <button class="btn primary" id="btn-auto-install">
      ⚡ Instalar DeepSeek Harness Automaticamente
    </button>
    <div class="note" style="text-align:center; font-size:10px;">
      Instalação limpa e transparente no background
    </div>

    <div class="divider">OU INSTALAR MANUALMENTE NO TERMINAL</div>

    <div class="cmd-box">
      <span class="cmd-text" id="cmd-to-copy">npm install -g @deepseek-ai/dsh</span>
      <button class="copy-btn" id="btn-copy" title="Copiar comando">
        <span id="copy-label">Copiar</span>
      </button>
    </div>

    <button class="btn secondary" id="btn-check">
      🔄 Já Instalei, Verificar Novamente
    </button>

    <div style="display: flex; gap: 6px; margin-top: 6px; width: 100%;">
      <button class="btn secondary" id="btn-settings" style="flex: 1;">⚙️ Configurações</button>
      <button class="btn secondary" id="btn-logs" style="flex: 1;">📋 Ver Logs</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('btn-auto-install').addEventListener('click', () => {
      vscode.postMessage({ command: 'install' });
    });

    document.getElementById('btn-copy').addEventListener('click', () => {
      const text = 'npm install -g @deepseek-ai/dsh';
      vscode.postMessage({ command: 'copy', text: text });
      const copyBtn = document.getElementById('btn-copy');
      const copyLabel = document.getElementById('copy-label');
      copyBtn.classList.add('copied');
      copyLabel.textContent = 'Copiado!';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyLabel.textContent = 'Copiar';
      }, 2500);
    });

    document.getElementById('btn-check').addEventListener('click', () => {
      vscode.postMessage({ command: 'checkAvailable' });
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
      vscode.postMessage({ command: 'openSettings' });
    });

    document.getElementById('btn-logs').addEventListener('click', () => {
      vscode.postMessage({ command: 'showLogs' });
    });
  </script>
</body>
</html>`
  }

  if (info.status === 'starting') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${commonStyles}</style>
</head>
<body>
  <div class="card">
    <h2>Starting DeepSeek Harness...</h2>
    <div class="spinner"></div>
    <p>Authenticating and loading workspace chat...</p>
    <button class="btn secondary" id="btn-logs">View Logs</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-logs').addEventListener('click', () => {
      vscode.postMessage({ command: 'showLogs' });
    });
  </script>
</body>
</html>`
  }

  if (info.status === 'error') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${commonStyles}</style>
</head>
<body>
  <div class="card">
    <h2>Harness Startup Failed</h2>
    <div class="error-box">${info.error ?? 'Unknown error occurred'}</div>
    <button class="btn primary" id="btn-restart">Retry Start</button>
    <button class="btn secondary" id="btn-logs">Show Logs</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-restart').addEventListener('click', () => {
      vscode.postMessage({ command: 'start' });
    });
    document.getElementById('btn-logs').addEventListener('click', () => {
      vscode.postMessage({ command: 'showLogs' });
    });
  </script>
</body>
</html>`
  }

  // 'stopped'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${commonStyles}</style>
</head>
<body>
  <div class="card">
    <h2>DeepSeek Harness</h2>
    <p>Autonomous AI agent running directly in your sidebar.</p>
    <button class="btn primary" id="btn-start">▶ Start DeepSeek Harness</button>
    <button class="btn secondary" id="btn-open-editor">📑 Open in Editor Tab</button>
    <button class="btn secondary" id="btn-logs">📋 View Logs</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-start').addEventListener('click', () => {
      vscode.postMessage({ command: 'start' });
    });
    document.getElementById('btn-open-editor').addEventListener('click', () => {
      vscode.postMessage({ command: 'openEditorTab' });
    });
    document.getElementById('btn-logs').addEventListener('click', () => {
      vscode.postMessage({ command: 'showLogs' });
    });
  </script>
</body>
</html>`
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

/**
 * Webview View Provider for embedding DeepSeek Harness in the sidebar.
 */
export class DeepSeekHarnessViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'deepseek.harnessView'
  private view?: vscode.WebviewView

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly dshManager: DshProcessManager,
    private config: ExtensionConfig,
  ) {
    this.dshManager.onStatusChanged((info) => {
      this.updateWebviewContent(info)
    })
  }

  public updateConfig(newConfig: ExtensionConfig): void {
    this.config = newConfig
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      enableForms: true,
      localResourceRoots: [this.extensionUri],
    }

    webviewView.webview.onDidReceiveMessage(async (data: { command: string; text?: string }) => {
      switch (data.command) {
        case 'start':
          await vscode.commands.executeCommand('deepseek.startHarness')
          break
        case 'install':
          await vscode.commands.executeCommand('deepseek.installHarness')
          break
        case 'checkAvailable':
          await vscode.commands.executeCommand('deepseek.checkHarness')
          break
        case 'copy':
          if (data.text) {
            await vscode.env.clipboard.writeText(data.text)
            vscode.window.showInformationMessage(`Comando copiado: ${data.text}`)
          }
          break
        case 'restart':
          await vscode.commands.executeCommand('deepseek.restartHarness')
          break
        case 'openEditorTab':
          await vscode.commands.executeCommand('deepseek.openFullView')
          break
        case 'openSettings':
          vscode.commands.executeCommand('deepseek.openSettings')
          break
        case 'showLogs':
          vscode.commands.executeCommand('deepseek.showLogs')
          break
      }
    })

    this.updateWebviewContent(this.dshManager.info)

    // Auto-start if configured and currently stopped
    if (this.config.autoStart && this.dshManager.info.status === 'stopped') {
      vscode.commands.executeCommand('deepseek.startHarness')
    }
  }

  private updateWebviewContent(info: HarnessInfo): void {
    if (this.view) {
      this.view.webview.html = getHtmlForStatus(info)
    }
  }
}

/**
 * Opens DeepSeek Harness inside a dedicated VS Code Editor Tab.
 */
export function openHarnessInEditorTab(
  context: vscode.ExtensionContext,
  dshManager: DshProcessManager,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'deepseekHarnessEditorTab',
    'DeepSeek Harness',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      enableForms: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    },
  )

  const update = (info: HarnessInfo) => {
    panel.webview.html = getHtmlForStatus(info)
  }

  panel.webview.onDidReceiveMessage(async (data: { command: string; text?: string }) => {
    switch (data.command) {
      case 'start':
        await vscode.commands.executeCommand('deepseek.startHarness')
        break
      case 'install':
        await vscode.commands.executeCommand('deepseek.installHarness')
        break
      case 'checkAvailable':
        await vscode.commands.executeCommand('deepseek.checkHarness')
        break
      case 'copy':
        if (data.text) {
          await vscode.env.clipboard.writeText(data.text)
          vscode.window.showInformationMessage(`Comando copiado: ${data.text}`)
        }
        break
      case 'openSettings':
        vscode.commands.executeCommand('deepseek.openSettings')
        break
      case 'showLogs':
        vscode.commands.executeCommand('deepseek.showLogs')
        break
    }
  })

  const sub = dshManager.onStatusChanged(info => update(info))
  panel.onDidDispose(() => sub.dispose())

  update(dshManager.info)

  if (dshManager.info.status === 'stopped') {
    dshManager.start().catch((err: Error) => {
      vscode.window.showErrorMessage(`DeepSeek Harness: ${err.message}`)
    })
  }

  return panel
}

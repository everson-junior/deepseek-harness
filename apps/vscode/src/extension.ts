import * as vscode from 'vscode'
import { DeepSeekHarnessViewProvider, openHarnessInEditorTab } from './chatViewProvider.ts'
import { DshProcessManager } from './dshManager.ts'
import { ExtensionConfig, HarnessInfo } from './types.ts'

/**
 * Resolve runtime configuration combining VS Code settings and environment variables.
 */
function resolveConfig(): ExtensionConfig {
  const wsConfig = vscode.workspace.getConfiguration('deepseek')
  const apiKeySetting = wsConfig.get<string>('apiKey', '')
  const envApiKey = process.env.DEEPSEEK_API_KEY ?? ''

  const baseUrlSetting = wsConfig.get<string>('baseUrl', 'https://api.deepseek.com')
  const envBaseUrl = process.env.DEEPSEEK_BASE_URL ?? ''

  return {
    dshPath: wsConfig.get<string>('dshPath', ''),
    port: wsConfig.get<number>('port', 0),
    profile: wsConfig.get<string>('profile', 'web'),
    autoStart: wsConfig.get<boolean>('autoStart', true),
    apiKey: apiKeySetting || envApiKey,
    baseUrl: envBaseUrl || baseUrlSetting,
  }
}

/**
 * Update the Status Bar item according to the Harness state.
 */
function updateStatusBar(item: vscode.StatusBarItem, info: HarnessInfo): void {
  switch (info.status) {
    case 'running':
      item.text = '$(hubot) DeepSeek Harness: Active'
      item.tooltip = 'DeepSeek Harness is active.\nClick to focus chat.'
      item.command = 'deepseek.focusHarness'
      item.backgroundColor = undefined
      break
    case 'starting':
      item.text = '$(sync~spin) DSH: Starting...'
      item.tooltip = 'DeepSeek Harness is starting...'
      item.command = 'deepseek.showLogs'
      item.backgroundColor = undefined
      break
    case 'installing':
      item.text = '$(sync~spin) DSH: Installing...'
      item.tooltip = 'Installing DeepSeek Harness (@deepseek-ai/dsh)...'
      item.command = 'deepseek.showLogs'
      item.backgroundColor = undefined
      break
    case 'not_installed':
      item.text = '$(cloud-download) DSH: Not Installed'
      item.tooltip = 'DeepSeek Harness is not installed.\nClick to install.'
      item.command = 'deepseek.installHarness'
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
      break
    case 'error':
      item.text = '$(error) DSH: Error'
      item.tooltip = `DeepSeek Harness error: ${info.error ?? 'Unknown'}\nClick to view logs.`
      item.command = 'deepseek.showLogs'
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
      break
    case 'stopped':
    default:
      item.text = '$(circle-slash) DSH: Stopped'
      item.tooltip = 'DeepSeek Harness is stopped.\nClick to start.'
      item.command = 'deepseek.startHarness'
      item.backgroundColor = undefined
      break
  }
}

let dshManagerInstance: DshProcessManager | null = null

/**
 * Extension activation entrypoint.
 */
export function activate(context: vscode.ExtensionContext): void {
  let currentConfig = resolveConfig()

  const outputChannel = vscode.window.createOutputChannel('DeepSeek Harness')
  context.subscriptions.push(outputChannel)

  const dshManager = new DshProcessManager(
    currentConfig,
    outputChannel,
    context.globalStorageUri.fsPath,
  )
  dshManagerInstance = dshManager
  context.subscriptions.push({
    dispose: () => {
      dshManager.dispose()
    },
  })

  // Status Bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  context.subscriptions.push(statusBarItem)
  updateStatusBar(statusBarItem, dshManager.info)
  statusBarItem.show()

  const updateContextState = (info: HarnessInfo) => {
    updateStatusBar(statusBarItem, info)
    vscode.commands.executeCommand('setContext', 'deepseek.isRunning', info.status === 'running')
  }

  dshManager.onStatusChanged((info) => {
    updateContextState(info)
  })

  updateContextState(dshManager.info)

  // Register Webview View Provider for the sidebar chat
  const harnessViewProvider = new DeepSeekHarnessViewProvider(
    context.extensionUri,
    dshManager,
    currentConfig,
  )

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DeepSeekHarnessViewProvider.viewType,
      harnessViewProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
  )

  // Listen to configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('deepseek')) {
        currentConfig = resolveConfig()
        dshManager.updateConfig(currentConfig)
        harnessViewProvider.updateConfig(currentConfig)
      }
    }),
  )

  // Register user commands
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek.startHarness', async () => {
      try {
        await vscode.commands.executeCommand('deepseek.harnessView.focus')
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Starting DeepSeek Harness...',
            cancellable: false,
          },
          async () => {
            await dshManager.start()
          },
        )
        await vscode.commands.executeCommand('deepseek.harnessView.focus')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        vscode.window.showErrorMessage(`Failed to start DeepSeek Harness: ${msg}`, 'Show Logs').then((action) => {
          if (action === 'Show Logs') {
            outputChannel.show(true)
          }
        })
      }
    }),

    vscode.commands.registerCommand('deepseek.stopHarness', async () => {
      await dshManager.stop()
      vscode.window.showInformationMessage('DeepSeek Harness stopped.')
    }),

    vscode.commands.registerCommand('deepseek.restartHarness', async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Restarting DeepSeek Harness...',
            cancellable: false,
          },
          async () => {
            await dshManager.restart()
          },
        )
        await vscode.commands.executeCommand('deepseek.harnessView.focus')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        vscode.window.showErrorMessage(`Failed to restart DeepSeek Harness: ${msg}`, 'Show Logs').then((action) => {
          if (action === 'Show Logs') {
            outputChannel.show(true)
          }
        })
      }
    }),

    vscode.commands.registerCommand('deepseek.openFullView', () => {
      openHarnessInEditorTab(context, dshManager)
    }),

    vscode.commands.registerCommand('deepseek.focusHarness', async () => {
      await vscode.commands.executeCommand('deepseek.harnessView.focus')
    }),

    vscode.commands.registerCommand('deepseek.moveToRightSidebar', async () => {
      // 1. Open/reveal the Secondary Side Bar on the right
      try {
        await vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar')
      } catch {
        // Ignore
      }

      // 2. Guide the user cleanly without triggering VS Code's modal error
      vscode.window.showInformationMessage(
        'A barra direita foi aberta! Para fixar o chat nela: clique com o botão direito no título "DeepSeek Harness" e selecione "Mover para a Barra Lateral Secundária" (ou simplesmente arraste o ícone do polvo para lá).',
      )
    }),

    vscode.commands.registerCommand('deepseek.openInBrowser', async () => {
      if (dshManager.info.status === 'running' && dshManager.info.url) {
        await vscode.env.openExternal(vscode.Uri.parse(dshManager.info.url))
      } else {
        const start = await vscode.window.showInformationMessage(
          'DeepSeek Harness is not currently running.',
          'Start Harness',
        )
        if (start === 'Start Harness') {
          try {
            const url = await dshManager.start()
            await vscode.env.openExternal(vscode.Uri.parse(url))
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            vscode.window.showErrorMessage(`Failed to start DeepSeek Harness: ${msg}`)
          }
        }
      }
    }),

    vscode.commands.registerCommand('deepseek.showLogs', () => {
      outputChannel.show(true)
    }),

    vscode.commands.registerCommand('deepseek.installHarness', async () => {
      try {
        await dshManager.installHarness()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        vscode.window.showErrorMessage(`Falha na instalação do DeepSeek Harness: ${msg}`)
      }
    }),

    vscode.commands.registerCommand('deepseek.checkHarness', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Verificando instalação do DeepSeek Harness...',
          cancellable: false,
        },
        async () => {
          await dshManager.initStatus()
        },
      )
      if (dshManager.info.status === 'not_installed') {
        vscode.window.showWarningMessage(
          'DeepSeek Harness (dsh) não foi encontrado no sistema.',
          'Instalar Automaticamente',
        ).then((choice) => {
          if (choice === 'Instalar Automaticamente') {
            vscode.commands.executeCommand('deepseek.installHarness')
          }
        })
      } else {
        vscode.window.showInformationMessage('DeepSeek Harness está pronto e disponível!')
      }
    }),

    vscode.commands.registerCommand('deepseek.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'deepseek')
    }),
  )
}

/**
 * Extension deactivation hook.
 */
export function deactivate(): void {
  if (dshManagerInstance) {
    dshManagerInstance.dispose()
    dshManagerInstance = null
  }
}

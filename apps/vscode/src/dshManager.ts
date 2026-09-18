import { ChildProcess, execFile, execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import http, { Server, RequestOptions, IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http'
import { Duplex } from 'node:stream'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import * as vscode from 'vscode'
import { ExtensionConfig, HarnessInfo, HarnessStatus } from './types.ts'

function spawnExecutable(
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
): ChildProcess {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command, ...args], options)
  }
  return spawn(command, args, options)
}

/**
 * Transfers a successfully upgraded WebSocket connection in both directions.
 */
export function bridgeWebSocket(
  clientSocket: Duplex,
  serverSocket: Duplex,
  clientHead: Buffer,
  serverHead: Buffer,
): void {
  if (serverHead.length > 0) clientSocket.write(serverHead)
  if (clientHead.length > 0) serverSocket.write(clientHead)
  clientSocket.pipe(serverSocket).pipe(clientSocket)
}

/**
 * Finds the real Node.js binary on the system (avoiding process.execPath which is the VS Code / Antigravity binary).
 */
export function findNodeBinary(): string {
  const home = homedir()

  if (process.platform === 'win32') {
    try {
      const pathNode = execFileSync('where.exe', ['node.exe'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split(/\r?\n/)
        .map(candidate => candidate.trim())
        .find(candidate => candidate.length > 0)
      if (pathNode) {
        return pathNode
      }
    } catch {
      // Continue with the standard Windows locations.
    }
  }

  // 1. Check NVM installations (prefer newest version)
  const nvmDir = join(home, '.nvm/versions/node')
  if (existsSync(nvmDir)) {
    try {
      const versions = readdirSync(nvmDir)
        .filter(v => v.startsWith('v'))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      for (const v of versions) {
        const candidate = join(nvmDir, v, 'bin/node')
        if (existsSync(candidate)) {
          return candidate
        }
      }
    } catch {
      // Ignore filesystem read errors
    }
  }

  // 2. Check standard system locations
  const candidates = process.platform === 'win32'
    ? [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe'),
      join(process.env.ProgramW6432 ?? 'C:\\Program Files', 'nodejs', 'node.exe'),
      join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'nodejs', 'node.exe'),
      join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'npm', 'node.exe'),
    ]
    : [
      '/usr/bin/node',
      '/usr/local/bin/node',
      join(home, '.local/share/pnpm/node'),
      join(home, '.local/bin/node'),
      '/bin/node',
    ]

  for (const c of candidates) {
    if (existsSync(c)) {
      return c
    }
  }

  return 'node'
}

/**
 * Finds the corresponding npm binary.
 */
export function findNpmBinary(): string {
  const nodeBin = findNodeBinary()
  if (nodeBin !== 'node') {
    const isWin = process.platform === 'win32'
    const npmCandidate = join(dirname(nodeBin), isWin ? 'npm.cmd' : 'npm')
    if (existsSync(npmCandidate)) {
      return npmCandidate
    }
  }
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function findProcessIdOnPort(port: number): Promise<number | undefined> {
  if (port <= 0) return Promise.resolve(undefined)
  return new Promise((resolvePort) => {
    const command = process.platform === 'win32' ? 'netstat.exe' : 'lsof'
    const args = process.platform === 'win32'
      ? ['-ano']
      : ['-ti', `tcp:${port}`]
    execFile(command, args, { encoding: 'utf8' }, (_error, stdout) => {
      const lines = stdout.split(/\r?\n/)
      if (process.platform === 'win32') {
        const match = lines.find(line =>
          new RegExp(`127\\.0\\.0\\.1:${port}\\s+.*LISTENING`, 'i').test(line) ||
          new RegExp(`0\\.0\\.0\\.0:${port}\\s+.*LISTENING`, 'i').test(line),
        )
        const pid = match?.trim().split(/\s+/).at(-1)
        resolvePort(pid ? Number(pid) : undefined)
        return
      }
      const pid = lines.map(line => Number(line.trim())).find(value => Number.isInteger(value) && value > 0)
      resolvePort(pid)
    })
  })
}

async function stopProcessOnPort(
  port: number,
  outputChannel: vscode.OutputChannel,
  excludedPid?: number,
): Promise<void> {
  const pid = await findProcessIdOnPort(port)
  if (!pid || pid === excludedPid) return

  outputChannel.appendLine(`[DeepSeek Harness] Stopping process ${pid} listening on port ${port}...`)
  await new Promise<void>((resolveStop) => {
    if (process.platform === 'win32') {
      execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], () => resolveStop())
    } else {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // Process may have exited between discovery and termination.
      }
      resolveStop()
    }
  })
}

/**
 * Enhanced PATH builder that includes common Node/pnpm install locations.
 */
function resolveEnhancedEnv(userConfig: ExtensionConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  // VSCode launches the extension host outside the integrated terminal, so
  // terminal.integrated.env.windows does not reach the DSH child process.
  // Corporate TLS interception requires Node to trust the Windows system store.
  if (process.platform === 'win32' && !env.NODE_EXTRA_CA_CERTS?.trim()) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ')
  }

  if (userConfig.apiKey) {
    env.DEEPSEEK_API_KEY = userConfig.apiKey
  }
  if (userConfig.baseUrl) {
    env.DEEPSEEK_BASE_URL = userConfig.baseUrl
  }

  const home = homedir()
  const candidateDirs = [
    join(home, '.local/share/pnpm'),
    join(home, '.pnpm'),
    join(home, '.npm-global/bin'),
    join(home, '.cargo/bin'),
  ]

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      candidateDirs.push(join(appData, 'npm'))
    }
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) {
      candidateDirs.push(join(localAppData, 'npm'))
    }
  } else {
    candidateDirs.push(
      '/usr/local/bin',
      '/usr/bin',
      join(home, '.local/bin'),
      join(home, '.npm-global/bin'),
    )
  }

  const nodeBin = findNodeBinary()
  if (nodeBin !== 'node') {
    candidateDirs.push(dirname(nodeBin))
  }

  const nvmVersionsDir = join(home, '.nvm/versions/node')
  if (existsSync(nvmVersionsDir)) {
    try {
      const versions = readdirSync(nvmVersionsDir)
      for (const v of versions) {
        candidateDirs.push(join(nvmVersionsDir, v, 'bin'))
      }
    } catch {
      // Ignore directory read errors
    }
  }

  const currentPath = env.PATH ?? ''
  const pathSep = process.platform === 'win32' ? ';' : ':'
  const extraPaths = candidateDirs.filter(d => existsSync(d) && !currentPath.includes(d))
  if (extraPaths.length > 0) {
    env.PATH = `${extraPaths.join(pathSep)}${pathSep}${currentPath}`
  }

  return env
}

/**
 * Resolves the executable command and arguments for booting the DeepSeek Harness.
 */
export function resolveHarnessCommand(
  config: ExtensionConfig,
  storageRoot?: string,
): { command: string; args: string[] } {
  const profileArgs = ['--profile', config.profile || 'web', '--no-open']
  if (config.port > 0) {
    profileArgs.push('--port', String(config.port))
  }

  // 1. Explicit user path configured
  if (config.dshPath && config.dshPath.trim() !== '') {
    const parts = config.dshPath.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
    const command = parts[0]?.replace(/^"|"$/g, '') ?? ''
    const extraArgs = parts.slice(1)
    return {
      command,
      args: [...extraArgs, ...profileArgs],
    }
  }

  const nodeBin = findNodeBinary()

  // 2. Extension private storage installation (isolated auto-install without sudo)
  if (storageRoot) {
    const isWin = process.platform === 'win32'
    const storageBin = join(storageRoot, 'node_modules', '.bin', isWin ? 'dsh.cmd' : 'dsh')
    if (existsSync(storageBin)) {
      return {
        command: storageBin,
        args: profileArgs,
      }
    }
  }

  // 3. Check global dsh binary in nodeBin directory
  if (nodeBin !== 'node') {
    const isWin = process.platform === 'win32'
    const directCandidate = join(dirname(nodeBin), isWin ? 'dsh.cmd' : 'dsh')
    if (existsSync(directCandidate)) {
      return {
        command: directCandidate,
        args: profileArgs,
      }
    }
  }

  // 4. Fallback to global `dsh` CLI command
  return {
    command: process.platform === 'win32' ? 'dsh.cmd' : 'dsh',
    args: profileArgs,
  }
}

/**
 * Resolves the source CLI command for a selected DeepSeek Harness checkout.
 */
export function resolveWorkspaceSourceCommand(
  projectPath: string,
  config: ExtensionConfig,
): { command: string; args: string[] } {
  const sourceBin = join(projectPath, 'apps', 'cli', 'src', 'bin.ts')
  if (!existsSync(sourceBin)) {
    throw new Error(`The selected folder is not a DeepSeek Harness source checkout: ${sourceBin}`)
  }

  const args = ['--import', 'tsx/esm', sourceBin, '--profile', config.profile || 'web', '--no-open']
  if (config.port > 0) {
    args.push('--port', String(config.port))
  }
  return { command: findNodeBinary(), args }
}

/**
 * Checks if an installed DeepSeek Harness command is available on this system.
 */
export async function checkDshAvailable(
  config: ExtensionConfig,
  storageRoot?: string,
): Promise<boolean> {
  // 1. Check explicit config
  if (config.dshPath && config.dshPath.trim() !== '') {
    return true
  }

  // 2. Check private storage installation
  if (storageRoot) {
    const isWin = process.platform === 'win32'
    const storageBin = join(storageRoot, 'node_modules', '.bin', isWin ? 'dsh.cmd' : 'dsh')
    if (existsSync(storageBin)) return true
  }

  // 3. Check direct candidate in node bin directory
  const nodeBin = findNodeBinary()
  if (nodeBin !== 'node') {
    const isWin = process.platform === 'win32'
    const directCandidate = join(dirname(nodeBin), isWin ? 'dsh.cmd' : 'dsh')
    if (existsSync(directCandidate)) return true
  }

  // 4. Check system PATH via `dsh --version`
  return new Promise<boolean>((res) => {
    const env = resolveEnhancedEnv(config)
    const cmd = process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
    const child = spawnExecutable(cmd, ['--version'], { env, stdio: 'ignore' })
    child.on('error', () => res(false))
    child.on('close', code => res(code === 0))
  })
}

/**
 * Creates a local reverse proxy that always injects the active DSH session cookie
 * and normalizes browser security headers (Origin, sec-fetch-site, Referer) so that
 * all /api endpoints (such as directoryPicker/pick) pass the DSH trust fence without HTTP 403.
 */
function createIframeProxy(
  dshPort: number,
  initialCookie: string,
): Promise<{ server: Server; port: number; updateCookie: (c: string) => void }> {
  return new Promise((resolveProxy, rejectProxy) => {
    let currentCookie = initialCookie

    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      const targetUrl = new URL(req.url ?? '/', `http://127.0.0.1:${dshPort}`)

      // Merge client cookies with the essential dsh-auth session cookie
      const existingCookie = req.headers.cookie ?? ''
      const forwardCookie = currentCookie
        ? existingCookie
          ? `${currentCookie}; ${existingCookie}`
          : currentCookie
        : existingCookie

      const forwardHeaders: OutgoingHttpHeaders = {
        ...req.headers,
        host: `127.0.0.1:${dshPort}`,
        cookie: forwardCookie,
      }

      // Sanitize Origin & sec-fetch-site to satisfy isTrustedApiRequest in api-request-trust.ts
      if (forwardHeaders['origin']) {
        forwardHeaders['origin'] = `http://127.0.0.1:${dshPort}`
      }
      if (forwardHeaders['referer']) {
        forwardHeaders['referer'] = `http://127.0.0.1:${dshPort}/`
      }
      if (forwardHeaders['sec-fetch-site']) {
        forwardHeaders['sec-fetch-site'] = 'same-origin'
      }

      const options: RequestOptions = {
        hostname: '127.0.0.1',
        port: dshPort,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: forwardHeaders,
      }

      const connector = http.request(options, (targetRes: IncomingMessage) => {
        const headers = { ...targetRes.headers }

        // Capture newly rotated cookies from the backend
        if (headers['set-cookie']) {
          const newCookie = headers['set-cookie'].find(c => c.includes('dsh-auth'))
          if (newCookie) {
            currentCookie = newCookie.split(';')[0]
          }

          headers['set-cookie'] = headers['set-cookie'].map(cookie =>
            cookie
              .replace(/;\s*SameSite=Strict/gi, '')
              .replace(/;\s*HttpOnly/gi, ''),
          )
        }

        // Allow embedding in Webview iframes & disable framing restrictions
        delete headers['x-frame-options']
        delete headers['content-security-policy']
        headers['access-control-allow-origin'] = '*'

        res.writeHead(targetRes.statusCode ?? 200, headers)
        targetRes.pipe(res)
      })

      connector.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' })
          res.end(`Proxy connection error: ${err.message}`)
        }
      })

      req.pipe(connector)
    })

    // Forward WebSocket / HTTP upgrade requests
    server.on('upgrade', (req: IncomingMessage, clientSocket: Duplex, clientHead: Buffer) => {
      const existingCookie = req.headers.cookie ?? ''
      const forwardCookie = currentCookie
        ? existingCookie
          ? `${currentCookie}; ${existingCookie}`
          : currentCookie
        : existingCookie

      const forwardHeaders: OutgoingHttpHeaders = {
        ...req.headers,
        host: `127.0.0.1:${dshPort}`,
        cookie: forwardCookie,
      }

      if (forwardHeaders['origin']) {
        forwardHeaders['origin'] = `http://127.0.0.1:${dshPort}`
      }
      if (forwardHeaders['referer']) {
        forwardHeaders['referer'] = `http://127.0.0.1:${dshPort}/`
      }
      if (forwardHeaders['sec-fetch-site']) {
        forwardHeaders['sec-fetch-site'] = 'same-origin'
      }

      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: dshPort,
        path: req.url,
        method: req.method,
        headers: forwardHeaders,
      })

      proxyReq.on('upgrade', (proxyRes: IncomingMessage, serverSocket: Duplex, serverHead: Buffer) => {
        clientSocket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            Object.entries(proxyRes.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\r\n') +
            '\r\n\r\n',
        )
        bridgeWebSocket(clientSocket, serverSocket, clientHead, serverHead)
      })

      proxyReq.on('error', () => {
        clientSocket.destroy()
      })

      proxyReq.end()
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolveProxy({
          server,
          port: addr.port,
          updateCookie: (c: string) => {
            currentCookie = c
          },
        })
      } else {
        rejectProxy(new Error('Failed to obtain proxy address'))
      }
    })

    server.on('error', (err) => {
      rejectProxy(err)
    })
  })
}

/**
 * Manages the lifecycle of the DeepSeek Harness runtime process and Webview proxy.
 */
export class DshProcessManager {
  private childProcess: ChildProcess | null = null
  private proxyServer: Server | null = null
  private currentInfo: HarnessInfo = { status: 'stopped' }
  private backendPort?: number
  private isStopping = false
  private storageRoot?: string

  private readonly _onStatusChanged = new vscode.EventEmitter<HarnessInfo>()
  public readonly onStatusChanged: vscode.Event<HarnessInfo> = this._onStatusChanged.event

  constructor(
    private config: ExtensionConfig,
    private readonly outputChannel: vscode.OutputChannel,
    storageRoot?: string,
  ) {
    this.storageRoot = storageRoot
    this.initStatus()
  }

  public async initStatus(): Promise<void> {
    const available = await this.isAvailable()
    if (!available) {
      this.setStatus('not_installed')
    } else if (this.currentInfo.status === 'not_installed') {
      this.setStatus('stopped')
    }
  }

  public async isAvailable(): Promise<boolean> {
    return checkDshAvailable(this.config, this.storageRoot)
  }

  public get info(): HarnessInfo {
    return this.currentInfo
  }

  public updateConfig(newConfig: ExtensionConfig): void {
    this.config = newConfig
    this.initStatus()
  }

  public setStatus(status: HarnessStatus, extra?: Partial<HarnessInfo>): void {
    this.currentInfo = {
      ...this.currentInfo,
      status,
      ...extra,
    }
    this._onStatusChanged.fire(this.currentInfo)
  }

  /**
   * Automatically installs DeepSeek Harness using npm.
   * Tries global install first, falls back to isolated extension storage prefix if permissions fail.
   */
  public async installHarness(): Promise<void> {
    this.setStatus('installing')
    this.outputChannel.show(true)
    this.outputChannel.appendLine('=========================================')
    this.outputChannel.appendLine('[DeepSeek Harness] Starting automated installation...')
    this.outputChannel.appendLine('=========================================')

    const npmBin = findNpmBinary()
    const env = resolveEnhancedEnv(this.config)

    // Step 1: Try global installation
    const tryGlobal = (): Promise<boolean> => {
      return new Promise<boolean>((res) => {
        this.outputChannel.appendLine(`[DeepSeek Harness] Executing: ${npmBin} install -g @deepseek-ai/dsh`)
        const child = spawnExecutable(npmBin, ['install', '-g', '@deepseek-ai/dsh'], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        child.stdout?.on('data', d => this.outputChannel.append(d.toString()))
        child.stderr?.on('data', d => this.outputChannel.append(d.toString()))

        child.on('close', (code) => {
          if (code === 0) {
            this.outputChannel.appendLine('[DeepSeek Harness] Global installation succeeded!')
            res(true)
          } else {
            this.outputChannel.appendLine(`[DeepSeek Harness] Global install exited with code ${code}. Trying local storage fallback...`)
            res(false)
          }
        })
        child.on('error', () => res(false))
      })
    }

    // Step 2: Try local extension storage fallback
    const tryLocal = (storagePath: string): Promise<boolean> => {
      return new Promise<boolean>((res) => {
        try {
          if (!existsSync(storagePath)) {
            mkdirSync(storagePath, { recursive: true })
          }
        } catch {}

        this.outputChannel.appendLine(`[DeepSeek Harness] Executing: ${npmBin} install @deepseek-ai/dsh --prefix ${storagePath}`)
        const child = spawnExecutable(npmBin, ['install', '@deepseek-ai/dsh', '--prefix', storagePath], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        child.stdout?.on('data', d => this.outputChannel.append(d.toString()))
        child.stderr?.on('data', d => this.outputChannel.append(d.toString()))

        child.on('close', (code) => {
          if (code === 0) {
            this.outputChannel.appendLine('[DeepSeek Harness] Local extension storage installation succeeded!')
            res(true)
          } else {
            this.outputChannel.appendLine(`[DeepSeek Harness] Local install failed with code ${code}.`)
            res(false)
          }
        })
        child.on('error', () => res(false))
      })
    }

    let success = await tryGlobal()
    if (!success && this.storageRoot) {
      success = await tryLocal(this.storageRoot)
    }

    if (success) {
      this.setStatus('stopped')
      vscode.window.showInformationMessage('DeepSeek Harness (@deepseek-ai/dsh) installed successfully!')
    } else {
      const errMsg = 'Failed to install @deepseek-ai/dsh. Please run "npm install -g @deepseek-ai/dsh" manually in terminal.'
      this.setStatus('not_installed', { error: errMsg })
      vscode.window.showErrorMessage(errMsg, 'View Logs').then((action) => {
        if (action === 'View Logs') {
          this.outputChannel.show(true)
        }
      })
    }
  }

  /**
   * Start the DeepSeek Harness runtime and proxy.
   * Resolves when the authenticated web URL is ready to be embedded.
   */
  public async start(): Promise<string> {
    const available = await this.isAvailable()
    if (!available) {
      this.setStatus('not_installed')
      throw new Error('DeepSeek Harness is not installed. Please click "Instalar DeepSeek Harness" in the sidebar.')
    }

    const workspaceFolders = vscode.workspace.workspaceFolders
    const { command, args } = resolveHarnessCommand(this.config, this.storageRoot)
    const cwd = workspaceFolders && workspaceFolders.length > 0
      ? workspaceFolders[0].uri.fsPath
      : process.cwd()
    return this.startProcess(command, args, cwd)
  }

  /**
   * Start the selected repository's source CLI for development and provider debugging.
   */
  public async startFromWorkspaceSource(projectPath: string): Promise<string> {
    const { command, args } = resolveWorkspaceSourceCommand(projectPath, this.config)
    return this.startProcess(command, args, projectPath)
  }

  private async startProcess(command: string, args: string[], cwd: string): Promise<string> {
    if (this.currentInfo.status === 'running' && this.currentInfo.url) {
      return this.currentInfo.url
    }

    if (this.currentInfo.status === 'starting') {
      return new Promise<string>((resolve, reject) => {
        const disposable = this.onStatusChanged((info) => {
          if (info.status === 'running' && info.url) {
            disposable.dispose()
            resolve(info.url)
          } else if (info.status === 'error' || info.status === 'not_installed') {
            disposable.dispose()
            reject(new Error(info.error ?? 'Failed to start DeepSeek Harness'))
          }
        })
      })
    }

    this.isStopping = false
    this.setStatus('starting', { url: undefined, port: undefined, error: undefined, pid: undefined })
    const env = resolveEnhancedEnv(this.config)

    this.outputChannel.appendLine('=========================================')
    this.outputChannel.appendLine('[DeepSeek Harness] Starting process...')
    this.outputChannel.appendLine(`[DeepSeek Harness] Command: ${command} ${args.join(' ')}`)
    this.outputChannel.appendLine(`[DeepSeek Harness] Working directory: ${cwd}`)
    this.outputChannel.appendLine('=========================================')

    return new Promise<string>((resolve, reject) => {
      let isSettled = false

      // 35-second startup timeout safeguard
      const startupTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true
          const errMsg = 'Timeout waiting for DeepSeek Harness to start. Check output logs for details.'
          this.outputChannel.appendLine(`[DeepSeek Harness] ERROR: ${errMsg}`)
          this.setStatus('error', { error: errMsg })
          reject(new Error(errMsg))
        }
      }, 35000)

      try {
        const child = spawnExecutable(command, args, {
          cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        this.childProcess = child
        this.setStatus('starting', { pid: child.pid })

        const urlRegex = /dsh web:\s+(https?:\/\/[^\s\)]+)/i

        const handleData = async (data: Buffer) => {
          const text = data.toString('utf-8')
          this.outputChannel.append(text)

          const match = text.match(urlRegex)
          if (match && !isSettled) {
            isSettled = true
            clearTimeout(startupTimer)
            const rawDshUrl = match[1]

            let dshPort = 3000
            let token = ''
            try {
              const parsed = new URL(rawDshUrl)
              dshPort = parseInt(parsed.port, 10)
              token = parsed.searchParams.get('token') ?? ''
            } catch {
              // fallback
            }

            try {
              // Perform initial handshake to capture the signed dsh-auth session cookie
              let initialCookie = ''
              try {
                const initialRes = await fetch(`http://127.0.0.1:${dshPort}/?token=${token}`, {
                  redirect: 'manual',
                })
                const rawCookie = initialRes.headers.get('set-cookie')
                if (rawCookie) {
                  initialCookie = rawCookie.split(';')[0]
                }
              } catch (authFetchErr) {
                this.outputChannel.appendLine(
                  `[DeepSeek Harness] Warning during initial auth fetch: ${authFetchErr}`,
                )
              }

              // Create the proxy that auto-injects this cookie and sanitizes origin/sec-fetch-site
              const { server, port: proxyPort } = await createIframeProxy(dshPort, initialCookie)
              this.proxyServer = server

              const webviewUrl = `http://127.0.0.1:${proxyPort}/`
              this.backendPort = dshPort
              this.setStatus('running', { url: webviewUrl, port: dshPort, pid: child.pid })
              this.outputChannel.appendLine(`[DeepSeek Harness] Backend ready at: ${rawDshUrl}`)
              this.outputChannel.appendLine(`[DeepSeek Harness] Webview sidebar ready at: ${webviewUrl}`)
              resolve(webviewUrl)
            } catch (proxyErr: unknown) {
              const msg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
              this.outputChannel.appendLine(`[DeepSeek Harness] Proxy start failed: ${msg}. Using raw URL.`)
              this.backendPort = dshPort
              this.setStatus('running', { url: rawDshUrl, port: dshPort, pid: child.pid })
              resolve(rawDshUrl)
            }
          }
        }

        child.stdout?.on('data', handleData)
        child.stderr?.on('data', handleData)

        child.on('error', (err: Error) => {
          this.outputChannel.appendLine(`[DeepSeek Harness] Process spawn error: ${err.message}`)
          if (!isSettled) {
            isSettled = true
            clearTimeout(startupTimer)
            this.setStatus('error', { error: err.message })
            reject(err)
          }
        })

        child.on('close', (code: number | null, signal: string | null) => {
          clearTimeout(startupTimer)
          this.outputChannel.appendLine(
            `[DeepSeek Harness] Process exited (code: ${code}, signal: ${signal})`,
          )
          this.childProcess = null
          this.closeProxy()

          if (this.isStopping) {
            this.setStatus('stopped', { url: undefined, port: undefined, pid: undefined })
          } else if (!isSettled) {
            isSettled = true
            const errMsg = `DeepSeek Harness exited with code ${code}`
            this.setStatus('error', { error: errMsg, url: undefined, port: undefined, pid: undefined })
            reject(new Error(errMsg))
          } else {
            this.setStatus('stopped', { url: undefined, port: undefined, pid: undefined })
          }
        })
      } catch (err: unknown) {
        clearTimeout(startupTimer)
        const error = err instanceof Error ? err : new Error(String(err))
        this.outputChannel.appendLine(`[DeepSeek Harness] Spawn exception: ${error.message}`)
        this.setStatus('error', { error: error.message })
        if (!isSettled) {
          isSettled = true
          reject(error)
        }
      }
    })
  }

  private closeProxy(): void {
    if (this.proxyServer) {
      try {
        this.proxyServer.close()
      } catch {
        // ignore
      }
      this.proxyServer = null
    }
  }

  /**
   * Stop the running DeepSeek Harness instance and proxy.
   */
  public async stop(): Promise<void> {
    this.closeProxy()
    const backendPort = this.backendPort ?? this.currentInfo.port ?? this.config.port
    this.backendPort = undefined

    if (!this.childProcess) {
      await stopProcessOnPort(backendPort, this.outputChannel)
      this.setStatus('stopped', { url: undefined, port: undefined, pid: undefined })
      return
    }

    this.isStopping = true
    this.outputChannel.appendLine('[DeepSeek Harness] Stopping process...')

    const child = this.childProcess
    await new Promise<void>((resolve) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved && this.childProcess) {
          this.outputChannel.appendLine('[DeepSeek Harness] Forcing kill (SIGKILL)...')
          try {
            child.kill('SIGKILL')
          } catch {
            // Ignore
          }
          resolved = true
          this.childProcess = null
          this.setStatus('stopped', { url: undefined, port: undefined, pid: undefined })
          resolve()
        }
      }, 3000)

      child.once('close', () => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          this.childProcess = null
          this.setStatus('stopped', { url: undefined, port: undefined, pid: undefined })
          resolve()
        }
      })

      try {
        child.kill('SIGTERM')
      } catch {
        clearTimeout(timeout)
        resolved = true
        this.childProcess = null
        this.setStatus('stopped', { url: undefined, port: undefined, pid: undefined })
        resolve()
      }
    })

    await stopProcessOnPort(backendPort, this.outputChannel)
  }

  public async restart(): Promise<string> {
    await this.stop()
    return this.start()
  }

  public async dispose(): Promise<void> {
    await this.stop()
    this._onStatusChanged.dispose()
  }
}

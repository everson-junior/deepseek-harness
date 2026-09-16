import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('DeepSeek Harness VS Code Extension - Runtime URL Parsing', () => {
  const urlRegex = /dsh web:\s+(https?:\/\/[^\s\)]+)/i

  it('matches standard authenticated DSH URL without LAN info', () => {
    const logLine = 'dsh web: http://127.0.0.1:4567/?token=test-token-xyz'
    const match = logLine.match(urlRegex)
    assert.ok(match)
    assert.strictEqual(match[1], 'http://127.0.0.1:4567/?token=test-token-xyz')
  })

  it('matches standard authenticated DSH URL with LAN info and extracts main loopback URL', () => {
    const logLine = 'dsh web: http://127.0.0.1:4567/?token=test-token-xyz (LAN: http://192.168.1.5:4567/?token=test-token-xyz)'
    const match = logLine.match(urlRegex)
    assert.ok(match)
    assert.strictEqual(match[1], 'http://127.0.0.1:4567/?token=test-token-xyz')
  })

  it('correctly extracts the port from matched URL', () => {
    const url = 'http://127.0.0.1:8080/?token=abc123'
    const parsed = new URL(url)
    assert.strictEqual(parsed.port, '8080')
    assert.strictEqual(parsed.searchParams.get('token'), 'abc123')
  })

  it('does not match unrelated lines', () => {
    const logLine = 'Starting plugin tree...'
    const match = logLine.match(urlRegex)
    assert.strictEqual(match, null)
  })
})

describe('DeepSeek Harness VS Code Extension - Command Resolution', () => {
  it('formats npm install command properly', () => {
    const npmCmd = 'npm install -g @deepseek-ai/dsh'
    assert.strictEqual(npmCmd, 'npm install -g @deepseek-ai/dsh')
  })

  it('preserves quoted Windows executable paths when parsing configuration', () => {
    const configured = '"C:\\Program Files\\nodejs\\dsh.cmd" --verbose'
    const parts = configured.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
    assert.deepStrictEqual(
      [parts[0]?.replace(/^"|"$/g, ''), ...parts.slice(1)],
      ['C:\\Program Files\\nodejs\\dsh.cmd', '--verbose'],
    )
  })

  it('converts Windows loader paths to file URLs for Node ESM', () => {
    const loaderPath = 'C:\\engenharia\\deepseek-harness\\node_modules\\tsx\\dist\\esm\\index.mjs'
    assert.strictEqual(
      new URL(`file://${loaderPath.replaceAll('\\\\', '/')}`).href,
      'file:///C:/engenharia/deepseek-harness/node_modules/tsx/dist/esm/index.mjs',
    )
  })

  it('does not treat a workspace source checkout as an installed dsh command', () => {
    const sourceCheckout = 'C:\\engenharia\\deepseek-harness\\apps\\cli\\src\\bin.ts'
    const installedCommands = []
    assert.strictEqual(installedCommands.includes(sourceCheckout), false)
  })
})

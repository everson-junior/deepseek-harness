#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(__dirname, '..')

console.log('1. Building extension bundle...')
execFileSync('node', [join(__dirname, 'build.mjs')], {
  cwd: appRoot,
  stdio: 'inherit',
})

console.log('2. Packaging VSIX with @vscode/vsce...')
const vsixName = 'deepseek-harness-vscode-0.1.0.vsix'
const vsixPath = join(appRoot, vsixName)

execFileSync(
  'npx',
  [
    '--prefix',
    '/tmp',
    '@vscode/vsce',
    'package',
    '--no-dependencies',
    '--skip-license',
    '--out',
    vsixPath,
  ],
  {
    cwd: appRoot,
    stdio: 'inherit',
  }
)

if (!existsSync(vsixPath)) {
  throw new Error(`Packaging failed: ${vsixPath} does not exist`)
}

const stats = statSync(vsixPath)
console.log(`\n🎉 VSIX package created successfully!`)
console.log(`📦 File: ${vsixPath} (${(stats.size / 1024).toFixed(1)} KB)`)
console.log(`\n👉 To install directly into your VS Code:`)
console.log(`   code --install-extension ${vsixPath}\n`)

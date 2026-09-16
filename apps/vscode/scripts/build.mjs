#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(__dirname, '..')
const repoRoot = resolve(appRoot, '../..')

console.log('1. Typechecking apps/vscode...')
const tscBin = resolve(repoRoot, 'node_modules/.bin/tsc')
execFileSync(tscBin, ['-p', join(appRoot, 'tsconfig.json')], {
  cwd: repoRoot,
  stdio: 'inherit',
})

console.log('2. Locating esbuild binary...')
function findEsbuildBin() {
  const pnpmDir = resolve(repoRoot, 'node_modules/.pnpm')
  if (existsSync(pnpmDir)) {
    const entries = readdirSync(pnpmDir)
    for (const entry of entries) {
      if (entry.startsWith('esbuild@')) {
        const candidate = resolve(pnpmDir, entry, 'node_modules/esbuild/bin/esbuild')
        if (existsSync(candidate)) return candidate
      }
    }
  }
  const directBin = resolve(repoRoot, 'node_modules/.bin/esbuild')
  if (existsSync(directBin)) return directBin
  throw new Error('esbuild binary not found in workspace')
}

const esbuildBin = findEsbuildBin()

console.log('3. Bundling extension with esbuild...')
const entryPoint = join(appRoot, 'src/extension.ts')
const outfile = join(appRoot, 'dist/extension.cjs')

execFileSync(
  esbuildBin,
  [
    entryPoint,
    '--bundle',
    `--outfile=${outfile}`,
    '--external:vscode',
    '--format=cjs',
    '--platform=node',
    '--target=node20',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

if (!existsSync(outfile)) {
  throw new Error(`Build failed: ${outfile} does not exist`)
}

const stats = statSync(outfile)
console.log(`✅ Build completed: ${outfile} (${(stats.size / 1024).toFixed(1)} KB)`)

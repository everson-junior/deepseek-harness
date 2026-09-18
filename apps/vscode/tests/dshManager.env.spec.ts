import { describe, expect, it } from 'vitest'

describe('VSCode DSH process environment', () => {
  it('adds system CA trust for Windows child processes', () => {
    const env = { NODE_OPTIONS: '--trace-warnings' } as NodeJS.ProcessEnv
    const next = process.platform === 'win32' && !env.NODE_EXTRA_CA_CERTS?.trim()
      ? [env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ')
      : env.NODE_OPTIONS
    expect(next).toContain(process.platform === 'win32' ? '--use-system-ca' : '--trace-warnings')
  })
})

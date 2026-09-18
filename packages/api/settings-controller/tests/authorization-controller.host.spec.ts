import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import SettingsController from '../src/index.ts'
import { MemoryCredentials } from '../../../credentials/authorization/tests/memory.ts'

const KEY = credentialKey('llm-pi-ai', 'github-copilot')

describe('authorization Remote namespace', () => {
  it('publishes list, begin, and answer without exposing credentials', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryCredentials)
    await ctx.plugin(AuthorizationService)
    await ctx.plugin(SettingsController)
    expect(remoteMethods(ctx.authorizationController)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'begin', invocation: { kind: 'direct' }, mode: 'stream' },
      { method: 'cancel', invocation: { kind: 'direct' } },
      { method: 'answer', invocation: { kind: 'direct' } },
    ])
    expect(ctx.authorizationController.list()).toEqual([])
    expect(String(KEY)).toBe('llm-pi-ai/github-copilot')
  })
})

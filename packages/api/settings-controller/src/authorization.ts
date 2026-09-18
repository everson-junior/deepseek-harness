/** Remote authorization controller for browser device-flow sign-in. */
import { Context } from '@deepseek-ai/cordis'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { AuthorizationEntry, AuthorizationNotice } from '@deepseek-ai/dsh-authorization/types'
import type { AuthorizationService } from '@deepseek-ai/dsh-authorization'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export interface AuthorizationBeginRequest { readonly key: string; readonly method?: string }
type WirePrompt =
  | { readonly kind: 'text'; readonly message: string; readonly placeholder?: string }
  | { readonly kind: 'secret'; readonly message: string; readonly placeholder?: string }
  | {
    readonly kind: 'select'
    readonly message: string
    readonly options: readonly { readonly id: string; readonly label: string; readonly description?: string }[]
  }
export type AuthorizationFrame =
  | { readonly type: 'started'; readonly attemptId: string }
  | { readonly type: 'notice'; readonly notice: AuthorizationNotice }
  | { readonly type: 'prompt'; readonly attemptId: string; readonly promptId: string; readonly prompt: WirePrompt }
  | { readonly type: 'result'; readonly status: 'authorized' | 'cancelled' }
  | { readonly type: 'error'; readonly message: string }

declare module '@deepseek-ai/cordis' { interface Context { authorizationController: AuthorizationController } }

/** Exposes authorization without exposing credential payloads. */
export class AuthorizationController extends TypertRemoteService {
  private nextId = 0
  private readonly attempts = new Map<string, {
    key: string
    answers: Map<string, (value: string) => void>
    frames: AuthorizationFrame[]
    wake: (() => void)[]
    done: boolean
  }>()
  /** @param ctx - Host context. */
  constructor(ctx: Context) { super(ctx, 'authorizationController', { namespace: 'authorization' }) }
  /** @returns available login flows. */
  @Remote list(): readonly AuthorizationEntry[] { return this.service().list() }
  /** Streams notices, prompts, and settlement for one attempt. */
  @Remote({ mode: 'stream' })
  async *begin(request: AuthorizationBeginRequest, signal: AbortSignal): AsyncIterable<AuthorizationFrame> {
    const key = parseCredentialKey(request.key)
    for (const attempt of this.attempts.values()) if (attempt.key === String(key) && !attempt.done) {
      yield { type: 'error', message: 'An authorization attempt is already running for this provider. Cancel it and try again.' }
      return
    }
    const attemptId = `auth-${String(++this.nextId)}`
    const state = { key: String(key), answers: new Map<string, (value: string) => void>(), frames: [{ type: 'started', attemptId } as AuthorizationFrame], wake: [] as (() => void)[], done: false }
    this.attempts.set(attemptId, state)
    const push = (frame: AuthorizationFrame): void => { state.frames.push(frame); state.wake.splice(0).forEach(resolve => resolve()) }
    const task = this.service().begin({ key, ...request.method === undefined ? {} : { method: request.method }, signal, interaction: {
      notify: notice => push({ type: 'notice', notice }),
      prompt: prompt => new Promise<string>((resolve, reject) => {
        const promptId = `prompt-${String(state.answers.size + 1)}`
        state.answers.set(promptId, resolve)
        const wirePrompt = prompt.kind === 'select' ? { kind: prompt.kind, message: prompt.message, options: prompt.options } : { kind: prompt.kind, message: prompt.message, ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder } }
        push({ type: 'prompt', attemptId, promptId, prompt: wirePrompt })
        prompt.signal?.addEventListener('abort', () => { state.answers.delete(promptId); reject(prompt.signal?.reason) }, { once: true })
      }),
    } }).then(
      outcome => push({ type: 'result', status: outcome.status }),
      error => push({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    ).finally(() => {
      state.done = true
      state.wake.splice(0).forEach(resolve => resolve())
      this.attempts.delete(attemptId)
    })
    void task
    try {
      while (!state.done || state.frames.length > 0) {
        while (state.frames.length > 0) yield state.frames.shift() as AuthorizationFrame
        if (!state.done) await new Promise<void>(resolve => state.wake.push(resolve))
      }
    } finally {
      state.done = true
      for (const answer of state.answers.values()) answer('')
      state.answers.clear()
    }
  }
  /** Cancels any running authorization for a credential key. */
  @Remote cancel(key: string): void { this.service().cancel(parseCredentialKey(key)) }
  /** Answers one browser prompt. */
  @Remote answer(attemptId: string, promptId: string, value: string): void {
    const state = this.attempts.get(attemptId); const answer = state?.answers.get(promptId)
    if (state === undefined || answer === undefined) throw new RemoteError('gateway/bad-request', 'authorization prompt is not pending', {})
    state.answers.delete(promptId); answer(value)
  }
  private service(): AuthorizationService { const service = this.ctx.get('authorization'); if (service === undefined) throw new RemoteError('gateway/internal', 'authorization service is absent', {}); return service }
}
export default AuthorizationController

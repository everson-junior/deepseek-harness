/**
 * Status of the DeepSeek Harness runtime process.
 */
export type HarnessStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'error'
  | 'not_installed'
  | 'installing'

/**
 * Information about the currently running DeepSeek Harness instance.
 */
export interface HarnessInfo {
  status: HarnessStatus
  url?: string
  port?: number
  pid?: number
  error?: string
}

/**
 * Extension runtime configuration resolved from workspace settings and env.
 */
export interface ExtensionConfig {
  dshPath: string
  port: number
  profile: string
  autoStart: boolean
  apiKey: string
  baseUrl: string
}

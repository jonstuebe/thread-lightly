import type { AiBinding } from './ai-live'
import type { CaseObject } from './case-object'

export interface Env {
  ASSETS: Fetcher
  AI: AiBinding
  CASES: DurableObjectNamespace<CaseObject>
  SMALLTALK_MODEL: string
  REPLY_MODEL: string
}

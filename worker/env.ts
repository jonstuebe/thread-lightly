import type { CaseObject } from './case-object'

export interface Env {
  ASSETS: Fetcher
  CASES: DurableObjectNamespace<CaseObject>
}

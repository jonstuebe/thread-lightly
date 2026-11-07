// NOTE: the model calls the engine depends on, as services. The live versions
// call Workers AI (worker/ai-live.ts); tests provide fakes with exact outcomes.

import { Context, Data, type Effect } from 'effect'

import type { Guest, GuestId, Topic, TopicId } from '../../shared/case'

export const SMALLTALK = 'smalltalk'

export type Tone = 'neutral' | 'friendly' | 'rude' | 'accusatory'

export type Turn = Readonly<{ from: string; text: string }>

export type Routing = Readonly<{
  topic: TopicId | typeof SMALLTALK
  confidence: number
  tone: Tone
  injection: number
}>

export class AiFailed extends Data.TaggedError('AiFailed')<{
  readonly reason: string
}> {}

export class Router extends Context.Service<
  Router,
  {
    readonly route: (input: {
      readonly guest: Guest
      readonly topics: ReadonlyArray<Topic>
      readonly recent: ReadonlyArray<Turn>
      readonly text: string
    }) => Effect.Effect<Routing, AiFailed>
    readonly pickResponders: (input: {
      readonly guests: ReadonlyArray<Guest>
      readonly recent: ReadonlyArray<Turn>
      readonly text: string
    }) => Effect.Effect<ReadonlyArray<GuestId>, AiFailed>
  }
>()('Router') {}

export class SmallTalk extends Context.Service<
  SmallTalk,
  {
    readonly reply: (input: {
      readonly guest: Guest
      readonly recent: ReadonlyArray<Turn>
      readonly text: string
    }) => Effect.Effect<string, AiFailed>
  }
>()('SmallTalk') {}

// NOTE: thresholds from the Clef routing spike (docs/design.md, section 5).
export const INJECTION_THRESHOLD = 0.5
export const CONFIDENCE_THRESHOLD = 0.3
export const MAX_GROUP_RESPONDERS = 2

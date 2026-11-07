// NOTE: the model calls the engine depends on, as services. The live versions
// call Workers AI (worker/ai-live.ts); tests provide fakes with exact outcomes.

import { Context, Data, type Effect, type Option } from 'effect'

import type { FactId, Guest, GuestId, Topic, TopicId } from '../../shared/case'

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

// NOTE: the composer (docs/design.md, section 5). It sees a menu of what the
// guest could say, one dictionary reply per topic, plus the case background,
// and writes one text that answers the detective's exact question. It may only
// say what the replies it picks say: the live service rejects a text that adds
// a claim, and reports in `kept` which of the picked replies' facts the text
// still states. The engine posts exactly those fact IDs, so a message carries
// what it says and nothing more. `picked` is empty when the background alone
// answers. `Unanswered` means nothing on the menu fits.
export type MenuItem = Readonly<{
  key: string
  text: string
  facts: ReadonlyArray<Readonly<{ id: FactId; text: string }>>
}>

export type Composed =
  | Readonly<{
      _tag: 'Answered'
      text: string
      picked: ReadonlyArray<string>
      kept: ReadonlyArray<FactId>
    }>
  | Readonly<{ _tag: 'Unanswered' }>

export class Composer extends Context.Service<
  Composer,
  {
    readonly compose: (input: {
      readonly guest: Guest
      readonly menu: ReadonlyArray<MenuItem>
      readonly hint: Option.Option<string>
      readonly recent: ReadonlyArray<Turn>
      readonly text: string
    }) => Effect.Effect<Composed, AiFailed>
  }
>()('Composer') {}

export const MAX_PICKED = 2

export type Ai = Router | SmallTalk | Composer

// NOTE: thresholds from the Clef routing spike (docs/design.md, section 5).
export const INJECTION_THRESHOLD = 0.5
export const CONFIDENCE_THRESHOLD = 0.3
export const MAX_GROUP_RESPONDERS = 2

// NOTE: everything a Durable Object stores about one game. It holds fact IDs,
// so it never goes to the client as is; `snapshot` in engine.ts builds the
// client's view.

import { Schema } from 'effect'

import { Contradiction, Day, FactId, GuestId, TopicId } from '../../shared/case'
import { ChatMessage, Ending, MessageId, Phase } from '../../shared/protocol'

export const StoredMessage = Schema.Struct({
  message: ChatMessage,
  factIds: Schema.Array(FactId),
})
export type StoredMessage = typeof StoredMessage.Type

export const Ask = Schema.Struct({ day: Day, topic: TopicId })
export type Ask = typeof Ask.Type

export const GameState = Schema.Struct({
  caseId: Schema.String,
  day: Day,
  phase: Phase,
  minutes: Schema.Int,
  patience: Schema.Record(GuestId, Schema.Number),
  asks: Schema.Record(GuestId, Schema.Array(Ask)),
  dodges: Schema.Record(GuestId, Schema.Int),
  messages: Schema.Array(StoredMessage),
  caseFile: Schema.Array(MessageId),
  nextMessageId: Schema.Int,
  lastSentAt: Schema.Number,
  ending: Schema.optionalKey(Ending),
  // NOTE: the contradiction that closed the case, kept so a reload shows it.
  solvedBy: Schema.optionalKey(Contradiction),
})
export type GameState = typeof GameState.Type

export const GameStateJson = Schema.fromJsonString(GameState)

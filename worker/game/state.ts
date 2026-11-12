// NOTE: everything a Durable Object stores about one game. It holds fact,
// question and contradiction IDs, so it never goes to the client as is;
// `snapshot` in engine.ts builds the client's view.

import { Schema } from 'effect'

import {
  ContradictionId,
  Day,
  FactId,
  GuestId,
  Part,
  QuestionId,
} from '../../shared/case'
import {
  ChatMessage,
  ChipId,
  Ending,
  MessageId,
  Phase,
} from '../../shared/protocol'

// NOTE: a posted message and the facts it carried.
export const StoredMessage = Schema.Struct({
  message: ChatMessage,
  factIds: Schema.Array(FactId),
})
export type StoredMessage = typeof StoredMessage.Type

// NOTE: a guest's reply to a DM question. Its Answer is fixed by the question
// and the day it was asked (`answerOn` in shared/rules.ts).
export const AnswerRecord = Schema.Struct({
  id: Schema.NonEmptyString,
  guest: GuestId,
  question: QuestionId,
  day: Day,
  messageIds: Schema.Array(MessageId),
  pressedMessageIds: Schema.Array(MessageId),
  pressed: Schema.Boolean,
  caught: Schema.Boolean,
})
export type AnswerRecord = typeof AnswerRecord.Type

export const CaughtRecord = Schema.Struct({
  guest: GuestId,
  contradiction: ContradictionId,
  answerId: Schema.NonEmptyString,
  claimMessageId: MessageId,
  proofMessageId: MessageId,
})
export type CaughtRecord = typeof CaughtRecord.Type

// NOTE: a chip's opaque ID for one question, and the message counter when it
// first reached a menu, which decides whether it's new.
export const ChipRecord = Schema.Struct({
  id: ChipId,
  question: QuestionId,
  appearedAt: Schema.Int,
})
export type ChipRecord = typeof ChipRecord.Type

export const ArrestRecord = Schema.Struct({
  suspect: GuestId,
  ending: Ending,
  contradiction: Schema.optionalKey(ContradictionId),
})
export type ArrestRecord = typeof ArrestRecord.Type

export const GameState = Schema.Struct({
  caseId: Schema.String,
  day: Day,
  part: Part,
  phase: Phase,
  ticksLeft: Schema.Int,
  messages: Schema.Array(StoredMessage),
  nextMessageId: Schema.Int,
  seen: Schema.Array(FactId),
  asked: Schema.Array(QuestionId),
  answers: Schema.Array(AnswerRecord),
  caught: Schema.Array(CaughtRecord),
  quiet: Schema.Array(GuestId),
  wrongProofs: Schema.Record(GuestId, Schema.Int),
  chips: Schema.Array(ChipRecord),
  // NOTE: keyed by thread ("group" or "dm:<guest>"): the message counter at
  // the detective's last question there.
  lastAsked: Schema.Record(Schema.String, Schema.Int),
  caseFile: Schema.Array(MessageId),
  lastActionAt: Schema.Number,
  arrest: Schema.optionalKey(ArrestRecord),
})
export type GameState = typeof GameState.Type

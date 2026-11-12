import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  CaseIntro,
  CaseResult,
  CaughtLie,
  ChatMessage,
  Clock,
  GuestId,
  GuestProfile,
  GuestStatus,
  Menu,
  MessageId,
  Thread,
} from '../shared/protocol'

// CONNECTION

export const GameId = Schema.String
export type GameId = typeof GameId.Type

// NOTE: `attempt` goes up on every reconnect so the socket's ManagedResource
// sees new requirements and opens a fresh socket. `failures` counts attempts
// in a row that never reached the case; after a few, the case is dropped.
export const Connection = defineTaggedUnion({
  NoCase: {},
  Starting: {},
  FailedStart: {},
  Connecting: {
    gameId: GameId,
    attempt: Schema.Number,
    failures: Schema.Number,
  },
  Open: { gameId: GameId, attempt: Schema.Number },
  Lost: { gameId: GameId, attempt: Schema.Number, failures: Schema.Number },
})
export type Connection = typeof Connection.Type

// BOARD

// NOTE: the client's copy of what the server has told it. Only the server
// changes it; the client never guesses at game state. `pressed` holds the
// answer IDs the detective has pressed.
export const Board = Schema.Struct({
  intro: CaseIntro,
  guests: Schema.Array(GuestProfile),
  messages: Schema.Array(ChatMessage),
  menus: Schema.Array(Menu),
  caseFile: Schema.Array(MessageId),
  pressed: Schema.Array(Schema.String),
  caught: Schema.Array(CaughtLie),
  clock: Clock,
  maybeResult: Schema.Option(CaseResult),
})
export type Board = typeof Board.Type

// PACING

// NOTE: the server sends a reply as soon as it has one. The client holds
// these back and plays them at reading speed, with a typing indicator first.
// Everything that follows from a reply (new chips, the clock, a catch) waits
// its turn behind it, so nothing shows up before the line that caused it.
export const Incoming = defineTaggedUnion({
  Post: { message: ChatMessage },
  MenuChange: { menu: Menu },
  StatusChange: { guest: GuestId, status: GuestStatus },
  ClockChange: { clock: Clock },
  Pressed: { answerId: Schema.String },
  Caught: { lie: CaughtLie },
  Result: { result: CaseResult },
})
export type Incoming = typeof Incoming.Type

// NOTE: `Night` holds the next morning's clock while the house sleeps.
export const Playback = defineTaggedUnion({
  Idle: {},
  Typing: { message: ChatMessage },
  Holding: {},
  Night: { clock: Clock },
})
export type Playback = typeof Playback.Type

// NOTE: between tapping a chip (or pressing, or showing proof) and the
// server posting the detective's line, the menus wait.
export const Asking = defineTaggedUnion({
  Ready: {},
  Waiting: { thread: Thread },
})
export type Asking = typeof Asking.Type

// SHEETS

export const ArrestStep = defineTaggedUnion({
  PickSuspect: {},
  PickLie: { suspect: GuestId },
  Confirm: { suspect: GuestId, maybeLie: Schema.Option(MessageId) },
  Submitted: {},
})
export type ArrestStep = typeof ArrestStep.Type

export const Sheet = defineTaggedUnion({
  Closed: {},
  Intro: {},
  CaseFile: {},
  Clock: {},
  ConfirmSleep: {},
  MessageActions: { messageId: MessageId },
  ShowProof: { messageId: MessageId },
  Arrest: { step: ArrestStep },
  Result: {},
})
export type Sheet = typeof Sheet.Type

export const Press = Schema.Struct({
  messageId: MessageId,
  pressId: Schema.Number,
})
export type Press = typeof Press.Type

// MODEL

export const Model = Schema.Struct({
  connection: Connection,
  played: Schema.Array(Schema.String),
  maybeBoard: Schema.Option(Board),
  incoming: Schema.Array(Incoming),
  playback: Playback,
  playbackEpoch: Schema.Number,
  asking: Asking,
  maybeOpenThread: Schema.Option(Thread),
  unread: Schema.Array(Schema.String),
  maybeNotice: Schema.Option(Schema.String),
  sheet: Sheet,
  maybePress: Schema.Option(Press),
  nextPressId: Schema.Number,
})
export type Model = typeof Model.Type

// FLAGS

// NOTE: what survives a reload, kept in localStorage. There are no accounts;
// losing the game ID loses the case.
export const Flags = Schema.Struct({
  gameId: Schema.NullOr(GameId),
  played: Schema.Array(Schema.String),
})
export type Flags = typeof Flags.Type

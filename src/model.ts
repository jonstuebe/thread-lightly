import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  CaseIntro,
  CaseResult,
  ChatMessage,
  Day,
  GuestId,
  GuestProfile,
  GuestStatus,
  MessageId,
  Phase,
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
// changes it; the client never guesses at game state.
export const Board = Schema.Struct({
  intro: CaseIntro,
  guests: Schema.Array(GuestProfile),
  messages: Schema.Array(ChatMessage),
  caseFile: Schema.Array(MessageId),
  day: Day,
  phase: Phase,
  maybeResult: Schema.Option(CaseResult),
})
export type Board = typeof Board.Type

// PACING

// NOTE: the server sends a reply as soon as it has one. The client holds
// these back and plays them at reading speed, with a typing indicator first.
export const Incoming = defineTaggedUnion({
  Post: { message: ChatMessage },
  StatusChange: { guest: GuestId, status: GuestStatus },
  PhaseChange: { day: Day, phase: Phase },
  Result: { result: CaseResult },
})
export type Incoming = typeof Incoming.Type

export const Playback = defineTaggedUnion({
  Idle: {},
  Typing: { message: ChatMessage },
  Holding: {},
})
export type Playback = typeof Playback.Type

export const PendingSend = Schema.Struct({
  id: Schema.Number,
  thread: Thread,
  text: Schema.String,
})
export type PendingSend = typeof PendingSend.Type

// SHEETS

export const ArrestStep = defineTaggedUnion({
  PickSuspect: {},
  PickClaim: { suspect: GuestId },
  PickProof: { suspect: GuestId, claim: MessageId },
  Confirm: { suspect: GuestId, claim: MessageId, proof: MessageId },
  Submitted: {},
})
export type ArrestStep = typeof ArrestStep.Type

export const Sheet = defineTaggedUnion({
  Closed: {},
  Intro: {},
  CaseFile: {},
  ConfirmEndDay: {},
  MessageActions: { messageId: MessageId },
  Arrest: { step: ArrestStep },
  Result: {},
})
export type Sheet = typeof Sheet.Type

export const Press = Schema.Struct({
  messageId: MessageId,
  pressId: Schema.Number,
})
export type Press = typeof Press.Type

export const Viewport = Schema.Struct({
  height: Schema.Number,
  offsetTop: Schema.Number,
})
export type Viewport = typeof Viewport.Type

// MODEL

export const Model = Schema.Struct({
  connection: Connection,
  played: Schema.Array(Schema.String),
  maybeBoard: Schema.Option(Board),
  incoming: Schema.Array(Incoming),
  playback: Playback,
  playbackEpoch: Schema.Number,
  pendingSends: Schema.Array(PendingSend),
  maybeOpenThread: Schema.Option(Thread),
  unread: Schema.Array(Schema.String),
  messageInput: Schema.String,
  isComposerFocused: Schema.Boolean,
  maybeViewport: Schema.Option(Viewport),
  maybeNotice: Schema.Option(Schema.String),
  sheet: Sheet,
  maybePress: Schema.Option(Press),
  nextLocalId: Schema.Number,
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

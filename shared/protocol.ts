// NOTE: the WebSocket protocol between the client and the case's Durable
// Object. Nothing here may carry fact IDs, truth values, contradictions, the
// case's question IDs or the thief: the client must never be able to read the
// answer.

import { Schema } from 'effect'

import { Day, GuestId, Night, Part } from './ids'

// NOTE: the client imports this module only, never ./case, so the ID and day
// types it needs are re-exported here.
export { DAYS, Day, GuestId, LAST_DAY, Night, PARTS, Part } from './ids'

// THREADS AND MESSAGES

export const Thread = Schema.TaggedUnion({
  Group: {},
  Direct: { guest: GuestId },
  WifiLog: {},
})
export type Thread = typeof Thread.Type

export const MessageId = Schema.NonEmptyString
export type MessageId = typeof MessageId.Type

export const Sender = Schema.TaggedUnion({
  Detective: {},
  Guest: { guest: GuestId },
  Lodge: {},
})
export type Sender = typeof Sender.Type

export const MessageBody = Schema.TaggedUnion({
  Text: { text: Schema.String },
  WifiEntry: {
    time: Schema.String,
    guest: GuestId,
    event: Schema.Literals(['joined', 'left']),
    accessPoint: Schema.String,
  },
})
export type MessageBody = typeof MessageBody.Type

// NOTE: `Answer` marks a guest's reply to a DM question: it can be pressed
// once and shown proof. Every bubble of one answer shares an `answerId`, and
// pressing or confronting any of them acts on the whole answer. Everything
// else (press and caught replies, wrong-proof replies, group lines, beats,
// Wi-Fi entries) is `Plain`: it can only be saved.
export const MessageRole = Schema.TaggedUnion({
  Plain: {},
  Answer: { answerId: Schema.NonEmptyString },
})
export type MessageRole = typeof MessageRole.Type

export const ChatMessage = Schema.Struct({
  id: MessageId,
  thread: Thread,
  sender: Sender,
  body: MessageBody,
  role: MessageRole,
  day: Day,
  part: Part,
})
export type ChatMessage = typeof ChatMessage.Type

// QUESTION MENU

// NOTE: an opaque ID the server assigns. Never the case's question slug,
// which could hint at the answer.
export const ChipId = Schema.NonEmptyString
export type ChipId = typeof ChipId.Type

// NOTE: one question the detective can ask. `text` is exactly what the
// detective will send. `isNew` marks a chip that appeared after the
// detective's last question in that thread. New chips come first, then the
// case's own order.
export const QuestionChip = Schema.Struct({
  id: ChipId,
  text: Schema.String,
  isNew: Schema.Boolean,
})
export type QuestionChip = typeof QuestionChip.Type

export const Menu = Schema.Struct({
  thread: Thread,
  chips: Schema.Array(QuestionChip),
})
export type Menu = typeof Menu.Type

// TIME

// NOTE: `asking` is the normal state. `bedtime` means evening ran out, or
// the detective chose to sleep: only GoToSleep (or an arrest) is accepted.
// `arrest` follows day 3: only Arrest is accepted.
export const Phase = Schema.Literals(['asking', 'bedtime', 'arrest'])
export type Phase = typeof Phase.Type

export const Clock = Schema.Struct({
  day: Day,
  part: Part,
  phase: Phase,
  ticksLeft: Schema.Int,
  partBudget: Schema.Int,
})
export type Clock = typeof Clock.Type

// GUESTS

// NOTE: `Away` comes from the case's schedule and carries its status line
// ("out kayaking 🛶"). `Quiet` follows wrong proof and lasts until the next
// part of the day. `Asleep` is everyone at bedtime.
export const GuestStatus = Schema.TaggedUnion({
  Around: {},
  Away: { status: Schema.String },
  Quiet: {},
  Asleep: {},
})
export type GuestStatus = typeof GuestStatus.Type

export const GuestProfile = Schema.Struct({
  id: GuestId,
  name: Schema.String,
  role: Schema.String,
  status: GuestStatus,
})
export type GuestProfile = typeof GuestProfile.Type

// CONFRONTING

// NOTE: a lie the detective caught: the answer bubble that told it and the
// saved item that broke it. Both get a ✓ caught stamp in the case file.
export const CaughtLie = Schema.Struct({
  guest: GuestId,
  claimMessageId: MessageId,
  proofMessageId: MessageId,
})
export type CaughtLie = typeof CaughtLie.Type

// INTRO AND ENDING

export const CaseIntro = Schema.Struct({
  title: Schema.String,
  premise: Schema.String,
  missingItem: Schema.String,
})
export type CaseIntro = typeof CaseIntro.Type

export const Ending = Schema.Literals(['caseClosed', 'theyWalk', 'wrongPerson'])
export type Ending = typeof Ending.Type

// NOTE: how a timeline event's evidence reached the detective. `saved` means a
// message carrying it is in the case file, `seen` that one was posted but not
// saved, `missed` that none was, and `none` that the event had no evidence.
export const Evidence = Schema.Literals(['saved', 'seen', 'missed', 'none'])
export type Evidence = typeof Evidence.Type

export const RevealedEvent = Schema.Struct({
  night: Night,
  time: Schema.String,
  text: Schema.String,
  evidence: Evidence,
})
export type RevealedEvent = typeof RevealedEvent.Type

// NOTE: a lie of the thief's about the theft and the fact that breaks it: the
// pair the detective caught, or one that would have closed the case.
export const Solution = Schema.Struct({
  claim: Schema.String,
  proof: Schema.String,
})
export type Solution = typeof Solution.Type

export const Tally = Schema.Struct({
  questionsAsked: Schema.Int,
  liesCaught: Schema.Int,
  wrongProofs: Schema.Int,
})
export type Tally = typeof Tally.Type

export const CaseResult = Schema.Struct({
  ending: Ending,
  thief: GuestId,
  solution: Schema.optionalKey(Solution),
  timeline: Schema.Array(RevealedEvent),
  tally: Tally,
})
export type CaseResult = typeof CaseResult.Type

// CLIENT TO SERVER

// NOTE: `Press` and `ShowProof` name any bubble of an answer. `proofMessageId`
// must be in the case file. `Arrest.lie` is the claim message of a caught lie
// against the suspect; leaving it out arrests on no evidence.
export const ClientMessage = Schema.TaggedUnion({
  AskQuestion: { thread: Thread, chipId: ChipId },
  Press: { messageId: MessageId },
  ShowProof: { messageId: MessageId, proofMessageId: MessageId },
  SaveToCaseFile: { messageId: MessageId },
  RemoveFromCaseFile: { messageId: MessageId },
  SkipPart: {},
  GoToSleep: {},
  Arrest: { suspect: GuestId, lie: Schema.optionalKey(MessageId) },
  Resume: {},
})
export type ClientMessage = typeof ClientMessage.Type

// SERVER TO CLIENT

export const RejectionReason = Schema.Literals([
  'away',
  'quiet',
  'asleep',
  'unknownQuestion',
  'notAnAnswer',
  'alreadyPressed',
  'alreadyCaught',
  'notInCaseFile',
  'notCaught',
  'notNow',
  'tooFast',
  'unknownMessage',
  'invalid',
])
export type RejectionReason = typeof RejectionReason.Type

export const ServerMessage = Schema.TaggedUnion({
  Snapshot: {
    intro: CaseIntro,
    guests: Schema.Array(GuestProfile),
    messages: Schema.Array(ChatMessage),
    menus: Schema.Array(Menu),
    caseFile: Schema.Array(MessageId),
    pressed: Schema.Array(Schema.NonEmptyString),
    caught: Schema.Array(CaughtLie),
    clock: Clock,
    result: Schema.optionalKey(CaseResult),
  },
  Typing: { thread: Thread, guest: GuestId },
  MessagePosted: { message: ChatMessage },
  MenuChanged: { menu: Menu },
  AnswerPressed: { answerId: Schema.NonEmptyString },
  LieCaught: { lie: CaughtLie },
  GuestStatusChanged: { guest: GuestId, status: GuestStatus },
  ClockChanged: { clock: Clock },
  CaseFileChanged: { caseFile: Schema.Array(MessageId) },
  ArrestResult: { result: CaseResult },
  Rejected: { reason: RejectionReason },
})
export type ServerMessage = typeof ServerMessage.Type

export const ClientMessageJson = Schema.fromJsonString(ClientMessage)
export const ServerMessageJson = Schema.fromJsonString(ServerMessage)

// HTTP

export const NEW_CASE_PATH = '/api/case/new'
export const caseSocketPath = (gameId: string): string =>
  `/api/case/${gameId}/ws`

export const NewCaseRequest = Schema.Struct({
  played: Schema.Array(Schema.String),
})
export type NewCaseRequest = typeof NewCaseRequest.Type

export const NewCaseResponse = Schema.Struct({
  gameId: Schema.String,
  caseId: Schema.String,
})
export type NewCaseResponse = typeof NewCaseResponse.Type

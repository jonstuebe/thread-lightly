// NOTE: the WebSocket protocol between the client and the case's Durable
// Object. Nothing here may carry fact IDs, truth values or the thief: the
// client must never be able to read the answer.

import { Schema } from 'effect'

import { Day, GuestId, Night } from './ids'

// NOTE: the client imports this module only, never ./case, so the ID and day
// types it needs are re-exported here.
export { Day, GuestId, LAST_DAY, Night } from './ids'

export const MAX_MESSAGE_LENGTH = 280

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

export const ChatMessage = Schema.Struct({
  id: MessageId,
  thread: Thread,
  sender: Sender,
  body: MessageBody,
  day: Day,
})
export type ChatMessage = typeof ChatMessage.Type

// GAME STATE

export const Phase = Schema.Literals(['morning', 'day', 'night', 'arrest'])
export type Phase = typeof Phase.Type

export const GuestStatus = Schema.Literals([
  'available',
  'annoyed',
  'leftOnRead',
  'asleep',
])
export type GuestStatus = typeof GuestStatus.Type

export const GuestProfile = Schema.Struct({
  id: GuestId,
  name: Schema.String,
  role: Schema.String,
  status: GuestStatus,
})
export type GuestProfile = typeof GuestProfile.Type

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
// pair the detective used to close the case, or one that would have.
export const Solution = Schema.Struct({
  claim: Schema.String,
  proof: Schema.String,
})
export type Solution = typeof Solution.Type

export const CaseResult = Schema.Struct({
  ending: Ending,
  thief: GuestId,
  solution: Schema.optionalKey(Solution),
  timeline: Schema.Array(RevealedEvent),
})
export type CaseResult = typeof CaseResult.Type

// CLIENT TO SERVER

export const ClientMessage = Schema.TaggedUnion({
  SendMessage: {
    thread: Thread,
    text: Schema.NonEmptyString.check(Schema.isMaxLength(MAX_MESSAGE_LENGTH)),
  },
  SaveToCaseFile: { messageId: MessageId },
  RemoveFromCaseFile: { messageId: MessageId },
  EndDay: {},
  MakeArrest: {
    suspect: GuestId,
    claimMessageId: MessageId,
    proofMessageId: MessageId,
  },
  Resume: {},
})
export type ClientMessage = typeof ClientMessage.Type

// SERVER TO CLIENT

export const RejectionReason = Schema.Literals([
  'asleep',
  'leftOnRead',
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
    caseFile: Schema.Array(MessageId),
    day: Day,
    phase: Phase,
    result: Schema.optionalKey(CaseResult),
  },
  Typing: { thread: Thread, guest: GuestId },
  MessagePosted: { message: ChatMessage },
  GuestStatusChanged: { guest: GuestId, status: GuestStatus },
  PhaseChanged: { day: Day, phase: Phase },
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

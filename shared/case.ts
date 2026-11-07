// NOTE: a Case contains the answer. Only the Worker and the local tooling may
// import this module's data; the client imports `protocol.ts` only.

import { Schema } from 'effect'

import { Day, GuestId, Night, Slug } from './ids'

export { DAYS, Day, GuestId, LAST_DAY, NIGHTS, Night } from './ids'

// IDS

export const FactId = Slug
export type FactId = typeof FactId.Type

export const TopicId = Slug
export type TopicId = typeof TopicId.Type

// TIME

export const MoveNight = Schema.Literals([1, 2])
export type MoveNight = typeof MoveNight.Type

export const MOVE_NIGHTS: ReadonlyArray<MoveNight> = [1, 2]

export const ClockTime = Schema.String.check(
  Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/),
)
export type ClockTime = typeof ClockTime.Type

// FACT

export const Fact = Schema.Struct({
  id: FactId,
  text: Schema.NonEmptyString,
  isTrue: Schema.Boolean,
  about: Schema.Array(GuestId),
  concernsTheft: Schema.Boolean,
})
export type Fact = typeof Fact.Type

// REPLIES

export const Reply = Schema.Struct({
  text: Schema.NonEmptyString,
  factIds: Schema.Array(FactId),
})
export type Reply = typeof Reply.Type

const Replies = Schema.NonEmptyArray(Reply)

export const NightOverride = Schema.Struct({
  night: MoveNight,
  variants: Replies,
})
export type NightOverride = typeof NightOverride.Type

const replySetFields = {
  variants: Replies,
  afterNight: Schema.optionalKey(Schema.Array(NightOverride)),
  ifFactDestroyed: Schema.optionalKey(Replies),
  lowPatience: Schema.optionalKey(Replies),
}

export const ReplySet = Schema.Struct(replySetFields)
export type ReplySet = typeof ReplySet.Type

export const TopicSubject = Schema.TaggedUnion({
  Whereabouts: { night: Night },
  Item: {},
  Guest: { guest: GuestId },
  NightEvent: { night: MoveNight },
  Secret: {},
  Other: {},
})
export type TopicSubject = typeof TopicSubject.Type

export const Visibility = Schema.Literals(['public', 'dmOnly'])
export type Visibility = typeof Visibility.Type

export const Topic = Schema.Struct({
  id: TopicId,
  description: Schema.NonEmptyString,
  subject: TopicSubject,
  visibility: Visibility,
  ...replySetFields,
})
export type Topic = typeof Topic.Type

export const Dictionary = Schema.Struct({
  topics: Schema.NonEmptyArray(Topic),
  pressed: ReplySet,
  dodges: Schema.NonEmptyArray(Schema.NonEmptyString),
  greetings: Schema.NonEmptyArray(Schema.NonEmptyString),
  thanks: Schema.NonEmptyArray(Schema.NonEmptyString),
  goodnight: Schema.NonEmptyString,
})
export type Dictionary = typeof Dictionary.Type

// GUEST

export const Temperament = Schema.Literals([
  'chatty',
  'guarded',
  'prickly',
  'anxious',
  'flattered',
  'gossip',
])
export type Temperament = typeof Temperament.Type

export const Guest = Schema.Struct({
  id: GuestId,
  name: Schema.NonEmptyString,
  role: Schema.NonEmptyString,
  voice: Schema.NonEmptyString,
  temperament: Temperament,
  bedtime: ClockTime,
  knows: Schema.Array(FactId),
  claims: Schema.Array(FactId),
  secret: Schema.optionalKey(FactId),
  dictionary: Dictionary,
})
export type Guest = typeof Guest.Type

// TIMELINE AND WI-FI LOG

export const TimelineEvent = Schema.Struct({
  night: Night,
  time: Schema.NonEmptyString,
  text: Schema.NonEmptyString,
  factIds: Schema.Array(FactId),
})
export type TimelineEvent = typeof TimelineEvent.Type

export const WifiEvent = Schema.Literals(['joined', 'left'])
export type WifiEvent = typeof WifiEvent.Type

export const WifiEntry = Schema.Struct({
  id: Slug,
  night: Night,
  time: Schema.NonEmptyString,
  guest: GuestId,
  event: WifiEvent,
  accessPoint: Schema.NonEmptyString,
  factIds: Schema.Array(FactId),
})
export type WifiEntry = typeof WifiEntry.Type

// GROUP CHAT

export const GroupLine = Schema.Struct({
  guest: GuestId,
  text: Schema.NonEmptyString,
  factIds: Schema.Array(FactId),
})
export type GroupLine = typeof GroupLine.Type

export const BeatTrigger = Schema.TaggedUnion({
  Morning: { day: Day },
  Idle: { day: Day },
})
export type BeatTrigger = typeof BeatTrigger.Type

export const GroupBeat = Schema.Struct({
  trigger: BeatTrigger,
  lines: Schema.NonEmptyArray(GroupLine),
})
export type GroupBeat = typeof GroupBeat.Type

// NIGHT MOVES

export const NightMove = Schema.TaggedUnion({
  Destroy: { night: MoveNight, fact: FactId },
  Plant: { night: MoveNight, fact: FactId, disprovedBy: FactId },
  Coach: {
    night: MoveNight,
    guest: GuestId,
    fact: FactId,
    tellFact: FactId,
    disprovedBy: FactId,
  },
})
export type NightMove = typeof NightMove.Type

// CONTRADICTION

export const Contradiction = Schema.Struct({
  suspect: GuestId,
  claimFact: FactId,
  proofFact: FactId,
  concernsTheft: Schema.Boolean,
})
export type Contradiction = typeof Contradiction.Type

// CASE

export const Setting = Schema.Struct({
  title: Schema.NonEmptyString,
  premise: Schema.NonEmptyString,
  missingItem: Schema.NonEmptyString,
  accessPoints: Schema.NonEmptyArray(Schema.NonEmptyString),
})
export type Setting = typeof Setting.Type

export const Case = Schema.Struct({
  id: Slug,
  setting: Setting,
  guests: Schema.Array(Guest).check(Schema.isBetweenLength(4, 8)),
  thief: GuestId,
  theftFact: FactId,
  timeline: Schema.NonEmptyArray(TimelineEvent),
  facts: Schema.NonEmptyArray(Fact),
  groupBeats: Schema.Array(GroupBeat),
  nightMoves: Schema.Array(NightMove),
  contradictions: Schema.Array(Contradiction),
  wifiLog: Schema.Array(WifiEntry),
})
export type Case = typeof Case.Type

export const decodeCase = Schema.decodeUnknownEffect(Case)

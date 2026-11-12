// NOTE: a Case contains the answer. Only the Worker and the local tooling may
// import this module's data; the client imports `protocol.ts` only.

import { Schema } from 'effect'

import { Day, GuestId, Night, Part, Slug } from './ids'

export {
  DAYS,
  Day,
  GuestId,
  LAST_DAY,
  NIGHTS,
  Night,
  PARTS,
  Part,
} from './ids'

// IDS

export const FactId = Slug
export type FactId = typeof FactId.Type

export const QuestionId = Slug
export type QuestionId = typeof QuestionId.Type

export const ContradictionId = Slug
export type ContradictionId = typeof ContradictionId.Type

// TIME

export const MoveNight = Schema.Literals([1, 2])
export type MoveNight = typeof MoveNight.Type

export const MOVE_NIGHTS: ReadonlyArray<MoveNight> = [1, 2]

const Ticks = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))

// NOTE: how many ticks each part of the day holds. The same budget applies to
// all three days. Ticks never carry over from one part to the next.
export const Budget = Schema.Struct({
  morning: Ticks,
  afternoon: Ticks,
  evening: Ticks,
})
export type Budget = typeof Budget.Type

// FACT

export const Fact = Schema.Struct({
  id: FactId,
  text: Schema.NonEmptyString,
  isTrue: Schema.Boolean,
  about: Schema.Array(GuestId),
  concernsTheft: Schema.Boolean,
})
export type Fact = typeof Fact.Type

// LINES AND ANSWERS

// NOTE: one chat bubble. The client gets `text` only, never `factIds`.
export const Line = Schema.Struct({
  text: Schema.NonEmptyString,
  factIds: Schema.Array(FactId),
})
export type Line = typeof Line.Type

const Bubbles = Schema.NonEmptyArray(Line).check(Schema.isMaxLength(3))

// NOTE: a reply that carries no facts, one to three bubbles. Used for wrong
// proof, where nothing the guest says may count as evidence.
export const PlainReply = Schema.NonEmptyArray(Schema.NonEmptyString).check(
  Schema.isMaxLength(3),
)
export type PlainReply = typeof PlainReply.Type

// NOTE: what a guest says to one question, and to each follow-up on it.
// `pressed` answers "Are you sure about that?". `caught` answers right proof,
// so it exists exactly when the answer carries the claim of a contradiction
// against this guest. `wrongProof` overrides the guest's own wrong-proof
// replies for this answer.
export const Answer = Schema.Struct({
  lines: Bubbles,
  pressed: Bubbles,
  caught: Schema.optionalKey(Bubbles),
  wrongProof: Schema.optionalKey(PlainReply),
})
export type Answer = typeof Answer.Type

export const NightAnswer = Schema.Struct({
  night: MoveNight,
  answer: Answer,
})
export type NightAnswer = typeof NightAnswer.Type

// QUESTIONS

// NOTE: every unlock on a question must hold before it reaches the menu.
// `Seen` means a message carrying the fact was posted where the detective can
// read it: any reply, Wi-Fi entry or beat. Saving isn't needed.
export const Unlock = Schema.TaggedUnion({
  Seen: { fact: FactId },
  Caught: { contradiction: ContradictionId },
  Asked: { question: QuestionId },
  AfterNight: { night: MoveNight },
})
export type Unlock = typeof Unlock.Type

const questionFields = {
  id: QuestionId,
  ask: Schema.NonEmptyString,
  from: Day,
  until: Schema.optionalKey(Day),
  unlock: Schema.Array(Unlock),
}

// NOTE: a question in one guest's DM thread. Its answer is fixed by the day
// it's asked: the latest `afterNight` whose night has passed, else `answer`;
// then `ifDestroyed` if that carries a fact the thief has destroyed.
export const Question = Schema.Struct({
  ...questionFields,
  answer: Answer,
  afterNight: Schema.optionalKey(Schema.Array(NightAnswer)),
  ifDestroyed: Schema.optionalKey(Answer),
})
export type Question = typeof Question.Type

export const GroupLine = Schema.Struct({
  guest: GuestId,
  text: Schema.NonEmptyString,
  factIds: Schema.Array(FactId),
})
export type GroupLine = typeof GroupLine.Type

// NOTE: a question asked in the group chat (still undecided, see
// docs/design.md; a case may have none). Guests reply in order, skipping any
// who are away or quiet. Group replies can't be pressed or confronted.
export const GroupQuestion = Schema.Struct({
  ...questionFields,
  replies: Schema.NonEmptyArray(GroupLine),
})
export type GroupQuestion = typeof GroupQuestion.Type

// GUEST

// NOTE: a part of a day the guest is out. Their thread shows `status` and
// their menu greys out.
export const AwaySlot = Schema.Struct({
  day: Day,
  part: Part,
  status: Schema.NonEmptyString,
})
export type AwaySlot = typeof AwaySlot.Type

// NOTE: `voice` is for the case writer. Temperament is voice only; nothing
// mechanical reads it.
export const Guest = Schema.Struct({
  id: GuestId,
  name: Schema.NonEmptyString,
  role: Schema.NonEmptyString,
  voice: Schema.NonEmptyString,
  knows: Schema.Array(FactId),
  claims: Schema.Array(FactId),
  secret: Schema.optionalKey(FactId),
  away: Schema.Array(AwaySlot),
  goodnight: Schema.NonEmptyString,
  wrongProof: Schema.NonEmptyArray(PlainReply),
  questions: Schema.Array(Question),
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

// NOTE: published the morning after its night.
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

// BEATS

// NOTE: plays in the group chat when the part starts. A part that's never
// reached (the detective went to sleep early) never plays its beat, so only
// morning beats are certain to be seen.
export const Beat = Schema.Struct({
  day: Day,
  part: Part,
  lines: Schema.NonEmptyArray(GroupLine),
})
export type Beat = typeof Beat.Type

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
  id: ContradictionId,
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
  budget: Budget,
  guests: Schema.Array(Guest).check(Schema.isBetweenLength(4, 5)),
  thief: GuestId,
  theftFact: FactId,
  timeline: Schema.NonEmptyArray(TimelineEvent),
  facts: Schema.NonEmptyArray(Fact),
  beats: Schema.Array(Beat),
  groupQuestions: Schema.Array(GroupQuestion),
  nightMoves: Schema.Array(NightMove),
  contradictions: Schema.Array(Contradiction),
  wifiLog: Schema.Array(WifiEntry),
})
export type Case = typeof Case.Type

export const decodeCase = Schema.decodeUnknownEffect(Case)

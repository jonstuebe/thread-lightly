// NOTE: the game's deterministic rules that a case's data feeds: who is around,
// which answer a question gives on a day, when a question unlocks and which
// contradiction a proof catches. The Durable Object plays by these and the
// checker searches the game with them, so the two can't disagree.

import { Array, Option, pipe } from 'effect'

import type {
  Answer,
  Beat,
  Case,
  Contradiction,
  ContradictionId,
  Day,
  FactId,
  GroupQuestion,
  Guest,
  GuestId,
  Line,
  Part,
  Question,
  QuestionId,
  WifiEntry,
} from './case'
import { Unlock } from './case'

// TICKS

export const ASK_COST = 1
export const PRESS_COST = 1
export const RIGHT_PROOF_COST = 1
export const WRONG_PROOF_COST = 2

// AVAILABILITY

export const awaySlot = (
  guest: Guest,
  day: Day,
  part: Part,
): Option.Option<string> =>
  pipe(
    guest.away,
    Array.findFirst(slot => slot.day === day && slot.part === part),
    Option.map(slot => slot.status),
  )

export const isAround = (guest: Guest, day: Day, part: Part): boolean =>
  Option.isNone(awaySlot(guest, day, part))

// PUBLISHED EVIDENCE

export const wifiPublishedOn = (
  caseData: Case,
  day: Day,
): ReadonlyArray<WifiEntry> =>
  Array.filter(caseData.wifiLog, entry => entry.night === day - 1)

export const beatAt = (
  caseData: Case,
  day: Day,
  part: Part,
): ReadonlyArray<Beat> =>
  Array.filter(caseData.beats, beat => beat.day === day && beat.part === part)

// QUESTIONS

export type AnyQuestion = Question | GroupQuestion

export const isOpenOn = (question: AnyQuestion, day: Day): boolean =>
  question.from <= day && (question.until === undefined || day <= question.until)

export type Progress = Readonly<{
  seen: ReadonlySet<FactId>
  asked: ReadonlySet<QuestionId>
  caught: ReadonlySet<ContradictionId>
}>

export const isUnlocked = (
  question: AnyQuestion,
  progress: Progress,
  day: Day,
): boolean =>
  Array.every(question.unlock, unlock =>
    Unlock.match(unlock, {
      Seen: ({ fact }) => progress.seen.has(fact),
      Caught: ({ contradiction }) => progress.caught.has(contradiction),
      Asked: ({ question: asked }) => progress.asked.has(asked),
      AfterNight: ({ night }) => night < day,
    }),
  )

export const factsOf = (
  lines: ReadonlyArray<Pick<Line, 'factIds'>>,
): ReadonlyArray<FactId> => Array.flatMap(lines, line => line.factIds)

export const destroyedBefore = (
  caseData: Case,
  day: Day,
): ReadonlySet<FactId> =>
  new Set(
    Array.flatMap(caseData.nightMoves, move =>
      move._tag === 'Destroy' && move.night < day ? [move.fact] : [],
    ),
  )

export const answerFacts = (answer: Answer): ReadonlyArray<FactId> => [
  ...factsOf(answer.lines),
  ...factsOf(answer.pressed),
  ...factsOf(answer.caught ?? []),
]

// NOTE: the answer before any destroyed fact is taken into account.
export const scheduledAnswer = (question: Question, day: Day): Answer =>
  pipe(
    question.afterNight ?? [],
    Array.filter(override => override.night < day),
    Array.reduce(
      Option.none<{ night: number; answer: Answer }>(),
      (latest, override) =>
        Option.match(latest, {
          onNone: () => Option.some(override),
          onSome: current =>
            override.night > current.night ? Option.some(override) : latest,
        }),
    ),
    Option.match({
      onNone: () => question.answer,
      onSome: override => override.answer,
    }),
  )

export const answerOn = (
  question: Question,
  day: Day,
  destroyed: ReadonlySet<FactId>,
): Answer => {
  const scheduled = scheduledAnswer(question, day)
  const carriesDestroyed = Array.some(answerFacts(scheduled), fact =>
    destroyed.has(fact),
  )
  return carriesDestroyed && question.ifDestroyed !== undefined
    ? question.ifDestroyed
    : scheduled
}

export const allAnswers = (question: Question): ReadonlyArray<Answer> => [
  question.answer,
  ...Array.map(question.afterNight ?? [], override => override.answer),
  ...(question.ifDestroyed === undefined ? [] : [question.ifDestroyed]),
]

// CONFRONTING

// NOTE: the facts proof can be shown against: the answer's lines, plus its
// pressed lines once it has been pressed.
export const confrontableFacts = (
  answer: Answer,
  pressed: boolean,
): ReadonlyArray<FactId> => [
  ...factsOf(answer.lines),
  ...(pressed ? factsOf(answer.pressed) : []),
]

// NOTE: proof is right when the answer carries a contradiction's claim and the
// proof item carries its proof. Anything else is wrong proof.
export const findCaught = (
  caseData: Case,
  suspect: GuestId,
  claimFacts: ReadonlyArray<FactId>,
  proofFacts: ReadonlyArray<FactId>,
): Option.Option<Contradiction> =>
  Array.findFirst(
    caseData.contradictions,
    contradiction =>
      contradiction.suspect === suspect &&
      claimFacts.includes(contradiction.claimFact) &&
      proofFacts.includes(contradiction.proofFact),
  )

// NOTE: wrong-proof replies rotate per guest by how many wrong proofs that
// guest has had, unless the answer has its own.
export const wrongProofReply = (
  guest: Guest,
  answer: Answer,
  wrongProofsSoFar: number,
): ReadonlyArray<string> =>
  answer.wrongProof ??
  guest.wrongProof[wrongProofsSoFar % guest.wrongProof.length] ??
  guest.wrongProof[0]

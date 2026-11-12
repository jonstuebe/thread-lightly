// NOTE: the solvability checker (docs/design.md, section 9). The game is
// deterministic, so the checker searches it. A case is used only when
// `findProblems` returns no errors; warnings are tuning advice.

import { Array, Data, Effect, Match, Option, Order, pipe } from 'effect'

import {
  type Answer,
  type Case,
  type Contradiction,
  type ContradictionId,
  DAYS,
  type Day,
  type Fact,
  type FactId,
  type GroupQuestion,
  type Guest,
  type GuestId,
  LAST_DAY,
  MOVE_NIGHTS,
  NightMove,
  PARTS,
  type Part,
  type Question,
  type QuestionId,
  decodeCase,
} from './case'
import {
  allAnswers,
  answerOn,
  beatAt,
  confrontableFacts,
  destroyedBefore,
  factsOf,
  findCaught,
  isAround,
  isOpenOn,
  isUnlocked,
  scheduledAnswer,
  wifiPublishedOn,
} from './rules'

export type Check =
  | 'schema'
  | 'references'
  | 'answers'
  | 'reachable'
  | 'winnable'
  | 'contradictions'
  | 'nightMoves'
  | 'noFalseProof'
  | 'noLeaks'
  | 'menuShape'
  | 'tuning'

export type Severity = 'error' | 'warning'

export type Problem = Readonly<{
  check: Check
  severity: Severity
  message: string
}>

export class CaseRejected extends Data.TaggedError('CaseRejected')<{
  readonly caseId: string
  readonly problems: ReadonlyArray<Problem>
}> {}

// NOTE: the search gives up past this many states and reports an error, so a
// case too tangled to check can't hang the checker.
export const MAX_SEARCH_STATES = 200_000

// NOTE: tuning targets (warnings only). The questions on offer should be at
// least this many times the case's whole budget.
export const MIN_QUESTIONS_PER_TICK = 2

const error = (check: Check, message: string): Problem => ({
  check,
  severity: 'error',
  message,
})

const warning = (check: Check, message: string): Problem => ({
  check,
  severity: 'warning',
  message,
})

const errorIf = (
  condition: boolean,
  check: Check,
  message: string,
): ReadonlyArray<Problem> => (condition ? [error(check, message)] : [])

export const isError = (problem: Problem): boolean =>
  problem.severity === 'error'

// LOOKUPS

type DmQuestion = Readonly<{ guest: Guest; question: Question }>

type Lookups = Readonly<{
  caseData: Case
  fact: (id: FactId) => Fact
  guest: (id: GuestId) => Guest
  dmQuestions: ReadonlyArray<DmQuestion>
  contradictionsAgainst: (guest: GuestId) => ReadonlyArray<Contradiction>
}>

// NOTE: only called after checkReferences passes, so every ID resolves.
const makeLookups = (caseData: Case): Lookups => {
  const facts = new Map(Array.map(caseData.facts, fact => [fact.id, fact]))
  const guests = new Map(Array.map(caseData.guests, guest => [guest.id, guest]))
  const orThrow = <A>(value: A | undefined, id: string): A => {
    if (value === undefined) {
      throw new Error(`Unresolved ID "${id}" after the references check`)
    }
    return value
  }
  return {
    caseData,
    fact: id => orThrow(facts.get(id), id),
    guest: id => orThrow(guests.get(id), id),
    dmQuestions: Array.flatMap(caseData.guests, guest =>
      Array.map(guest.questions, question => ({ guest, question })),
    ),
    contradictionsAgainst: guest =>
      Array.filter(
        caseData.contradictions,
        contradiction => contradiction.suspect === guest,
      ),
  }
}

const isAroundSomePart = (guest: Guest, day: Day): boolean =>
  Array.some(PARTS, part => isAround(guest, day, part))

const lastOpenDay = (question: Question | GroupQuestion): Day =>
  question.until ?? LAST_DAY

// REFERENCES

type Reference = Readonly<{ id: string; where: string }>

const refs = (
  ids: ReadonlyArray<string>,
  where: string,
): ReadonlyArray<Reference> => Array.map(ids, id => ({ id, where }))

const answerRefs = (answer: Answer, where: string): ReadonlyArray<Reference> =>
  refs(
    [
      ...factsOf(answer.lines),
      ...factsOf(answer.pressed),
      ...factsOf(answer.caught ?? []),
    ],
    where,
  )

const unlockRefs = (
  question: Question | GroupQuestion,
  where: string,
): Readonly<{
  facts: ReadonlyArray<Reference>
  questions: ReadonlyArray<Reference>
  contradictions: ReadonlyArray<Reference>
}> => ({
  facts: Array.flatMap(question.unlock, unlock =>
    unlock._tag === 'Seen' ? [{ id: unlock.fact, where }] : [],
  ),
  questions: Array.flatMap(question.unlock, unlock =>
    unlock._tag === 'Asked' ? [{ id: unlock.question, where }] : [],
  ),
  contradictions: Array.flatMap(question.unlock, unlock =>
    unlock._tag === 'Caught' ? [{ id: unlock.contradiction, where }] : [],
  ),
})

const allQuestionsWithWhere = (
  caseData: Case,
): ReadonlyArray<readonly [Question | GroupQuestion, string]> => [
  ...Array.flatMap(caseData.guests, guest =>
    Array.map(
      guest.questions,
      question => [question, `${guest.id}.${question.id}`] as const,
    ),
  ),
  ...Array.map(
    caseData.groupQuestions,
    question => [question, `group.${question.id}`] as const,
  ),
]

const factRefs = (caseData: Case): ReadonlyArray<Reference> => [
  { id: caseData.theftFact, where: 'theftFact' },
  ...Array.flatMap(caseData.guests, guest => [
    ...refs(guest.knows, `${guest.id}.knows`),
    ...refs(guest.claims, `${guest.id}.claims`),
    ...(guest.secret === undefined
      ? []
      : [{ id: guest.secret, where: `${guest.id}.secret` }]),
    ...Array.flatMap(guest.questions, question =>
      Array.flatMap(allAnswers(question), answer =>
        answerRefs(answer, `${guest.id}.${question.id}`),
      ),
    ),
  ]),
  ...Array.flatMap(caseData.groupQuestions, question =>
    refs(factsOf(question.replies), `group.${question.id}`),
  ),
  ...Array.flatMap(allQuestionsWithWhere(caseData), ([question, where]) =>
    unlockRefs(question, where).facts,
  ),
  ...Array.flatMap(caseData.timeline, (event, index) =>
    refs(event.factIds, `timeline[${index}]`),
  ),
  ...Array.flatMap(caseData.wifiLog, entry =>
    refs(entry.factIds, `wifiLog.${entry.id}`),
  ),
  ...Array.flatMap(caseData.beats, beat =>
    refs(factsOf(beat.lines), `beats(day ${beat.day} ${beat.part})`),
  ),
  ...Array.flatMap(caseData.nightMoves, move => {
    const where = `nightMoves.${move._tag}(night ${move.night})`
    return [
      { id: move.fact, where },
      ...(move._tag === 'Destroy' ? [] : [{ id: move.disprovedBy, where }]),
      ...(move._tag === 'Coach' ? [{ id: move.tellFact, where }] : []),
    ]
  }),
  ...Array.flatMap(caseData.contradictions, contradiction => [
    {
      id: contradiction.claimFact,
      where: `contradictions.${contradiction.id}`,
    },
    {
      id: contradiction.proofFact,
      where: `contradictions.${contradiction.id}`,
    },
  ]),
]

const guestRefs = (caseData: Case): ReadonlyArray<Reference> => [
  { id: caseData.thief, where: 'thief' },
  ...Array.flatMap(caseData.facts, fact =>
    refs(fact.about, `facts.${fact.id}.about`),
  ),
  ...Array.map(caseData.wifiLog, entry => ({
    id: entry.guest,
    where: `wifiLog.${entry.id}`,
  })),
  ...Array.flatMap(caseData.beats, beat =>
    Array.map(beat.lines, line => ({
      id: line.guest,
      where: `beats(day ${beat.day} ${beat.part})`,
    })),
  ),
  ...Array.flatMap(caseData.groupQuestions, question =>
    Array.map(question.replies, line => ({
      id: line.guest,
      where: `group.${question.id}`,
    })),
  ),
  ...Array.flatMap(caseData.nightMoves, move =>
    move._tag === 'Coach'
      ? [{ id: move.guest, where: 'nightMoves.Coach' }]
      : [],
  ),
  ...Array.map(caseData.contradictions, contradiction => ({
    id: contradiction.suspect,
    where: `contradictions.${contradiction.id}`,
  })),
]

const duplicates = (ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  pipe(
    ids,
    Array.filter((id, index) => ids.indexOf(id) !== index),
    Array.dedupe,
  )

const checkReferences = (caseData: Case): ReadonlyArray<Problem> => {
  const factIds = new Set(Array.map(caseData.facts, fact => fact.id))
  const guestIds = new Set(Array.map(caseData.guests, guest => guest.id))
  const questions = allQuestionsWithWhere(caseData)
  const questionIds = new Set(Array.map(questions, ([question]) => question.id))
  const contradictionIds = new Set(
    Array.map(caseData.contradictions, contradiction => contradiction.id),
  )
  const accessPoints = new Set(caseData.setting.accessPoints)

  const missing = (
    references: ReadonlyArray<Reference>,
    known: ReadonlySet<string>,
    kind: string,
  ): ReadonlyArray<Problem> =>
    Array.flatMap(references, reference =>
      errorIf(
        !known.has(reference.id),
        'references',
        `${reference.where} names unknown ${kind} "${reference.id}"`,
      ),
    )

  const duplicated = (
    ids: ReadonlyArray<string>,
    kind: string,
  ): ReadonlyArray<Problem> =>
    Array.map(duplicates(ids), id =>
      error('references', `${kind} "${id}" is defined more than once`),
    )

  return [
    ...duplicated(
      Array.map(caseData.facts, fact => fact.id),
      'fact',
    ),
    ...duplicated(
      Array.map(caseData.guests, guest => guest.id),
      'guest',
    ),
    ...duplicated(
      Array.map(questions, ([question]) => question.id),
      'question',
    ),
    ...duplicated(
      Array.map(caseData.contradictions, contradiction => contradiction.id),
      'contradiction',
    ),
    ...duplicated(
      Array.map(caseData.wifiLog, entry => entry.id),
      'wifi entry',
    ),
    ...missing(factRefs(caseData), factIds, 'fact'),
    ...missing(guestRefs(caseData), guestIds, 'guest'),
    ...missing(
      Array.flatMap(
        questions,
        ([question, where]) => unlockRefs(question, where).questions,
      ),
      questionIds,
      'question',
    ),
    ...missing(
      Array.flatMap(
        questions,
        ([question, where]) => unlockRefs(question, where).contradictions,
      ),
      contradictionIds,
      'contradiction',
    ),
    ...Array.flatMap(caseData.wifiLog, entry =>
      errorIf(
        !accessPoints.has(entry.accessPoint),
        'references',
        `wifiLog.${entry.id} names unknown access point "${entry.accessPoint}"`,
      ),
    ),
    ...errorIf(
      !guestIds.has(caseData.thief),
      'references',
      `thief "${caseData.thief}" isn't a guest`,
    ),
  ]
}

// ANSWERS

const claimsCarried = (
  lookups: Lookups,
  guest: GuestId,
  answer: Answer,
): ReadonlyArray<FactId> => {
  const facts = confrontableFacts(answer, true)
  return pipe(
    lookups.contradictionsAgainst(guest),
    Array.map(contradiction => contradiction.claimFact),
    Array.filter(claim => facts.includes(claim)),
    Array.dedupe,
  )
}

const checkAnswers = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const allClaims = new Set(
    Array.map(caseData.contradictions, contradiction => contradiction.claimFact),
  )

  const perQuestion = Array.flatMap(lookups.dmQuestions, ({ guest, question }) => {
    const name = `${guest.id}.${question.id}`
    const nights = Array.map(question.afterNight ?? [], override => override.night)
    const variants: ReadonlyArray<readonly [string, Answer]> = [
      ['answer', question.answer],
      ...Array.map(
        question.afterNight ?? [],
        override => [`afterNight ${override.night}`, override.answer] as const,
      ),
      ...(question.ifDestroyed === undefined
        ? []
        : [['ifDestroyed', question.ifDestroyed] as const]),
    ]
    return [
      ...errorIf(
        question.until !== undefined && question.until < question.from,
        'answers',
        `${name}: until is before from`,
      ),
      ...errorIf(
        Array.isReadonlyArrayNonEmpty(duplicates(Array.map(nights, String))),
        'answers',
        `${name}: afterNight names the same night twice`,
      ),
      ...Array.flatMap(question.afterNight ?? [], override =>
        errorIf(
          lastOpenDay(question) <= override.night,
          'answers',
          `${name}: afterNight ${override.night} can never be given, since the question closes on day ${lastOpenDay(question)}`,
        ),
      ),
      ...Array.flatMap(variants, ([variant, answer]) => {
        const claims = claimsCarried(lookups, guest.id, answer)
        return [
          ...errorIf(
            claims.length > 1,
            'answers',
            `${name} ${variant}: carries ${claims.length} contradiction claims (${claims.join(', ')}); an answer can be caught only once, so it may carry one`,
          ),
          ...errorIf(
            Array.isReadonlyArrayNonEmpty(claims) && answer.caught === undefined,
            'answers',
            `${name} ${variant}: carries the claim ${claims[0] ?? ''} but has no caught reply`,
          ),
          ...errorIf(
            Array.isReadonlyArrayEmpty(claims) && answer.caught !== undefined,
            'answers',
            `${name} ${variant}: has a caught reply but carries no contradiction claim against ${guest.id}`,
          ),
        ]
      }),
    ]
  })

  const groupQuestions = Array.flatMap(caseData.groupQuestions, question => [
    ...errorIf(
      question.until !== undefined && question.until < question.from,
      'answers',
      `group.${question.id}: until is before from`,
    ),
    ...Array.flatMap(question.replies, line =>
      Array.flatMap(line.factIds, fact =>
        errorIf(
          allClaims.has(fact),
          'answers',
          `group.${question.id}: ${line.guest} says the contradiction claim ${fact} in the group chat, where it can't be confronted`,
        ),
      ),
    ),
  ])

  const beats = Array.flatMap(caseData.beats, beat =>
    Array.flatMap(beat.lines, line => {
      const where = `beat (day ${beat.day} ${beat.part})`
      return [
        ...errorIf(
          !isAround(lookups.guest(line.guest), beat.day, beat.part),
          'answers',
          `${where}: ${line.guest} speaks while away`,
        ),
        ...Array.flatMap(line.factIds, fact =>
          errorIf(
            allClaims.has(fact),
            'answers',
            `${where}: ${line.guest} says the contradiction claim ${fact} in the group chat, where it can't be confronted`,
          ),
        ),
      ]
    }),
  )

  const mornings = Array.flatMap(DAYS, day =>
    errorIf(
      Array.isReadonlyArrayEmpty(beatAt(caseData, day, 'morning')),
      'answers',
      `day ${day} has no morning beat`,
    ),
  )

  const awaySlots = Array.flatMap(caseData.guests, guest =>
    errorIf(
      Array.isReadonlyArrayNonEmpty(
        duplicates(Array.map(guest.away, slot => `${slot.day} ${slot.part}`)),
      ),
      'answers',
      `${guest.id} is away twice in the same part`,
    ),
  )

  return [...perQuestion, ...groupQuestions, ...beats, ...mornings, ...awaySlots]
}

// WHAT CAN APPEAR

// NOTE: every fact some message could carry on a day, ignoring unlocks and the
// budget. Used to prove a fact *never* appears too early.
const mayAppearOn = (
  lookups: Lookups,
  day: Day,
  spokenBy?: GuestId,
): ReadonlySet<FactId> => {
  const { caseData } = lookups
  const destroyed = destroyedBefore(caseData, day)
  const byGuest = (guest: GuestId) =>
    spokenBy === undefined || spokenBy === guest
  return new Set([
    ...Array.flatMap(lookups.dmQuestions, ({ guest, question }) => {
      if (!byGuest(guest.id) || !isOpenOn(question, day)) {
        return []
      }
      const answer = answerOn(question, day, destroyed)
      return [
        ...factsOf(answer.lines),
        ...factsOf(answer.pressed),
        ...factsOf(answer.caught ?? []),
      ]
    }),
    ...Array.flatMap(caseData.groupQuestions, question =>
      isOpenOn(question, day)
        ? factsOf(Array.filter(question.replies, line => byGuest(line.guest)))
        : [],
    ),
    ...Array.flatMap(
      caseData.beats.filter(beat => beat.day === day),
      beat => factsOf(beat.lines.filter(line => byGuest(line.guest))),
    ),
    ...(spokenBy === undefined
      ? Array.flatMap(wifiPublishedOn(caseData, day), entry => entry.factIds)
      : []),
  ])
}

const saysInAnswerLinesOn = (
  lookups: Lookups,
  day: Day,
  guest: GuestId,
): ReadonlySet<FactId> => {
  const destroyed = destroyedBefore(lookups.caseData, day)
  return new Set(
    Array.flatMap(lookups.dmQuestions, ({ guest: owner, question }) =>
      owner.id === guest && isOpenOn(question, day)
        ? confrontableFacts(answerOn(question, day, destroyed), true)
        : [],
    ),
  )
}

const pressedOn = (
  lookups: Lookups,
  day: Day,
  guest: GuestId,
): ReadonlySet<FactId> => {
  const destroyed = destroyedBefore(lookups.caseData, day)
  return new Set(
    Array.flatMap(lookups.dmQuestions, ({ guest: owner, question }) =>
      owner.id === guest && isOpenOn(question, day)
        ? factsOf(answerOn(question, day, destroyed).pressed)
        : [],
    ),
  )
}

// CLOSURE

const union = <A>(
  set: ReadonlySet<A>,
  more: ReadonlyArray<A>,
): ReadonlySet<A> =>
  Array.every(more, item => set.has(item)) ? set : new Set([...set, ...more])

// NOTE: applies `step` until nothing grows. Every step only adds, so this
// always ends.
const fixpoint = <A>(value: A, step: (value: A) => A, size: (value: A) => number): A => {
  const next = step(value)
  return size(next) > size(value) ? fixpoint(next, step, size) : next
}

type Reach = Readonly<{
  seen: ReadonlySet<FactId>
  asked: ReadonlySet<QuestionId>
  caught: ReadonlySet<ContradictionId>
}>

const reachSize = (reach: Reach): number =>
  reach.seen.size + reach.asked.size + reach.caught.size

// NOTE: what a detective with an unlimited budget could reach, playing from
// the morning of `startDay`. It over-approximates in one way: a question
// counts as askable on every day its unlocks hold, though a real detective
// asks it once. Used to prove things *can* happen.
type Closure = Readonly<{
  seenBy: (day: Day) => ReadonlySet<FactId>
  askable: ReadonlySet<QuestionId>
  caught: ReadonlySet<ContradictionId>
}>

const published = (
  lookups: Lookups,
  day: Day,
  parts: ReadonlyArray<Part>,
): ReadonlyArray<FactId> => [
  ...Array.flatMap(wifiPublishedOn(lookups.caseData, day), entry => entry.factIds),
  ...Array.flatMap(parts, part =>
    Array.flatMap(beatAt(lookups.caseData, day, part), beat =>
      factsOf(beat.lines),
    ),
  ),
]

// NOTE: a detective who starts late has still been sent the Wi-Fi log and
// the morning beats of the days they slept through.
const freshStart = (lookups: Lookups, startDay: Day): ReadonlySet<FactId> =>
  new Set(
    Array.flatMap(
      DAYS.filter(day => day < startDay),
      day => published(lookups, day, ['morning']),
    ),
  )

const reachStep =
  (lookups: Lookups, day: Day) =>
  (reach: Reach): Reach => {
    const { caseData } = lookups
    const destroyed = destroyedBefore(caseData, day)
    const askableDm = Array.filter(
      lookups.dmQuestions,
      ({ guest, question }) =>
        isOpenOn(question, day) &&
        isAroundSomePart(guest, day) &&
        isUnlocked(question, reach, day),
    )
    const askableGroup = Array.filter(
      caseData.groupQuestions,
      question => isOpenOn(question, day) && isUnlocked(question, reach, day),
    )
    const answered = Array.map(askableDm, ({ guest, question }) => {
      const answer = answerOn(question, day, destroyed)
      return {
        answer,
        maybeCaught: findCaught(caseData, guest.id, confrontableFacts(answer, true), [
          ...reach.seen,
        ]),
      }
    })
    return {
      seen: union(reach.seen, [
        ...Array.flatMap(answered, ({ answer, maybeCaught }) => [
          ...factsOf(answer.lines),
          ...factsOf(answer.pressed),
          ...(Option.isSome(maybeCaught) ? factsOf(answer.caught ?? []) : []),
        ]),
        ...Array.flatMap(askableGroup, question =>
          factsOf(
            Array.filter(question.replies, line =>
              isAroundSomePart(lookups.guest(line.guest), day),
            ),
          ),
        ),
      ]),
      asked: union(reach.asked, [
        ...Array.map(askableDm, ({ question }) => question.id),
        ...Array.map(askableGroup, question => question.id),
      ]),
      caught: union(
        reach.caught,
        Array.getSomes(
          Array.map(answered, ({ maybeCaught }) =>
            Option.map(maybeCaught, contradiction => contradiction.id),
          ),
        ),
      ),
    }
  }

const closure = (lookups: Lookups, startDay: Day): Closure => {
  const days = Array.filter(DAYS, day => day >= startDay)
  const start: Reach = {
    seen: freshStart(lookups, startDay),
    asked: new Set(),
    caught: new Set(),
  }
  const byDay = Array.scan(days, start, (reach, day) =>
    fixpoint(
      { ...reach, seen: union(reach.seen, published(lookups, day, PARTS)) },
      reachStep(lookups, day),
      reachSize,
    ),
  ).slice(1)
  const last = Array.last(byDay).pipe(Option.getOrElse(() => start))
  return {
    seenBy: day =>
      pipe(
        Array.findLastIndex(days, candidate => candidate <= day),
        Option.flatMap(index => Array.get(byDay, index)),
        Option.match({
          onNone: () => start.seen,
          onSome: reach => reach.seen,
        }),
      ),
    askable: last.asked,
    caught: last.caught,
  }
}

// SEARCH

type Action =
  | Readonly<{ _tag: 'Ask'; key: string; question: Question; guest: Guest }>
  | Readonly<{ _tag: 'AskGroup'; key: string; question: GroupQuestion }>
  | Readonly<{ _tag: 'Press'; key: string; question: Question; guest: Guest }>
  | Readonly<{
      _tag: 'Prove'
      key: string
      question: Question
      guest: Guest
      contradiction: Contradiction
    }>

type Needs = Readonly<{
  facts: ReadonlySet<FactId>
  contradictions: ReadonlySet<ContradictionId>
  questions: ReadonlySet<QuestionId>
  presses: ReadonlySet<QuestionId>
}>

const needsSize = (needs: Needs): number =>
  needs.facts.size +
  needs.contradictions.size +
  needs.questions.size +
  needs.presses.size

const unlockNeeds = (
  questions: ReadonlyArray<Question | GroupQuestion>,
): Pick<Needs, 'facts' | 'contradictions' | 'questions'> => {
  const unlocks = Array.flatMap(questions, question => question.unlock)
  return {
    facts: new Set(
      Array.flatMap(unlocks, unlock =>
        unlock._tag === 'Seen' ? [unlock.fact] : [],
      ),
    ),
    contradictions: new Set(
      Array.flatMap(unlocks, unlock =>
        unlock._tag === 'Caught' ? [unlock.contradiction] : [],
      ),
    ),
    questions: new Set(
      Array.flatMap(unlocks, unlock =>
        unlock._tag === 'Asked' ? [unlock.question] : [],
      ),
    ),
  }
}

// NOTE: works backwards from the goal to every action that could help reach
// it, so the search branches on those only.
const relevantActions = (
  lookups: Lookups,
  day: Day,
  goal: ReadonlyArray<Contradiction>,
): ReadonlyArray<Action> => {
  const { caseData } = lookups
  const destroyed = destroyedBefore(caseData, day)
  const open = Array.map(
    Array.filter(lookups.dmQuestions, ({ question }) => isOpenOn(question, day)),
    ({ guest, question }) => ({
      guest,
      question,
      answer: answerOn(question, day, destroyed),
    }),
  )
  const openGroup = Array.filter(caseData.groupQuestions, question =>
    isOpenOn(question, day),
  )

  const grow = (needs: Needs): Needs => {
    const wanted = Array.filter(caseData.contradictions, contradiction =>
      needs.contradictions.has(contradiction.id),
    )
    const claimants = Array.filter(open, ({ guest, answer }) =>
      Array.some(
        wanted,
        contradiction =>
          contradiction.suspect === guest.id &&
          confrontableFacts(answer, true).includes(contradiction.claimFact),
      ),
    )
    const claimOnlyWhenPressed = Array.filter(claimants, ({ guest, answer }) =>
      Array.some(
        wanted,
        contradiction =>
          contradiction.suspect === guest.id &&
          !factsOf(answer.lines).includes(contradiction.claimFact),
      ),
    )
    const tellsInLines = Array.filter(open, ({ answer }) =>
      Array.some(factsOf(answer.lines), fact => needs.facts.has(fact)),
    )
    const tellsWhenPressed = Array.filter(open, ({ answer }) =>
      Array.some(factsOf(answer.pressed), fact => needs.facts.has(fact)),
    )
    const tellsWhenCaught = Array.flatMap(open, ({ guest, answer }) =>
      Array.some(factsOf(answer.caught ?? []), fact => needs.facts.has(fact))
        ? Array.filter(lookups.contradictionsAgainst(guest.id), contradiction =>
            confrontableFacts(answer, true).includes(contradiction.claimFact),
          )
        : [],
    )
    const groupTells = Array.filter(openGroup, question =>
      Array.some(factsOf(question.replies), fact => needs.facts.has(fact)),
    )
    const questions = union(needs.questions, [
      ...Array.map(claimants, ({ question }) => question.id),
      ...Array.map(tellsInLines, ({ question }) => question.id),
      ...Array.map(tellsWhenPressed, ({ question }) => question.id),
      ...Array.map(groupTells, question => question.id),
    ])
    const neededQuestions = [
      ...Array.filter(open, ({ question }) => questions.has(question.id)).map(
        ({ question }) => question,
      ),
      ...Array.filter(openGroup, question => questions.has(question.id)),
    ]
    const unlocks = unlockNeeds(neededQuestions)
    return {
      facts: union(needs.facts, [
        ...Array.map(wanted, contradiction => contradiction.proofFact),
        ...unlocks.facts,
      ]),
      contradictions: union(needs.contradictions, [
        ...Array.map(tellsWhenCaught, contradiction => contradiction.id),
        ...unlocks.contradictions,
      ]),
      questions: union(questions, [...unlocks.questions]),
      presses: union(needs.presses, [
        ...Array.map(claimOnlyWhenPressed, ({ question }) => question.id),
        ...Array.map(tellsWhenPressed, ({ question }) => question.id),
      ]),
    }
  }

  const needs = fixpoint(
    {
      facts: new Set<FactId>(),
      contradictions: new Set(Array.map(goal, contradiction => contradiction.id)),
      questions: new Set<QuestionId>(),
      presses: new Set<QuestionId>(),
    },
    grow,
    needsSize,
  )

  return [
    ...Array.flatMap(open, ({ guest, question, answer }): ReadonlyArray<Action> => [
      ...(needs.questions.has(question.id)
        ? [{ _tag: 'Ask', key: `ask ${question.id}`, question, guest } as const]
        : []),
      ...(needs.presses.has(question.id)
        ? [{ _tag: 'Press', key: `press ${question.id}`, question, guest } as const]
        : []),
      ...pipe(
        lookups.contradictionsAgainst(guest.id),
        Array.filter(
          contradiction =>
            needs.contradictions.has(contradiction.id) &&
            confrontableFacts(answer, true).includes(contradiction.claimFact),
        ),
        Array.map(
          (contradiction): Action => ({
            _tag: 'Prove',
            key: `prove ${question.id} with ${contradiction.proofFact}`,
            question,
            guest,
            contradiction,
          }),
        ),
      ),
    ]),
    ...Array.flatMap(openGroup, (question): ReadonlyArray<Action> =>
      needs.questions.has(question.id)
        ? [{ _tag: 'AskGroup', key: `ask ${question.id}`, question }]
        : [],
    ),
  ]
}

type SearchState = Readonly<{
  partIndex: number
  used: number
  path: ReadonlyArray<string>
  done: ReadonlySet<string>
  seen: ReadonlySet<FactId>
  asked: ReadonlySet<QuestionId>
  caught: ReadonlySet<ContradictionId>
  caughtAnswers: ReadonlySet<QuestionId>
}>

export type SearchResult =
  | Readonly<{ _tag: 'Won'; actions: ReadonlyArray<string> }>
  | Readonly<{ _tag: 'Lost' }>
  | Readonly<{ _tag: 'TooLarge' }>

const enterPart = (
  lookups: Lookups,
  day: Day,
  state: SearchState,
  partIndex: number,
): SearchState =>
  pipe(
    Array.get(PARTS, partIndex),
    Option.match({
      onNone: () => ({ ...state, partIndex, used: 0 }),
      onSome: part => ({
        ...state,
        partIndex,
        used: 0,
        seen: union(state.seen, published(lookups, day, [part])),
      }),
    }),
  )

const tryAction = (
  lookups: Lookups,
  day: Day,
  state: SearchState,
  action: Action,
): Option.Option<SearchState> => {
  const { caseData } = lookups
  const destroyed = destroyedBefore(caseData, day)
  const done = union(state.done, [action.key])
  const step = (changes: Partial<SearchState>): Option.Option<SearchState> =>
    Option.some({
      ...state,
      ...changes,
      done,
      used: state.used + 1,
      path: [...state.path, `${PARTS[state.partIndex] ?? ''}: ${action.key}`],
    })

  return pipe(
    Array.get(PARTS, state.partIndex),
    Option.filter(() => !state.done.has(action.key)),
    Option.flatMap(part =>
      Match.value(action).pipe(
        Match.tagsExhaustive({
          Ask: ({ guest, question }) => {
            if (!isAround(guest, day, part) || !isUnlocked(question, state, day)) {
              return Option.none()
            }
            return step({
              seen: union(
                state.seen,
                factsOf(answerOn(question, day, destroyed).lines),
              ),
              asked: union(state.asked, [question.id]),
            })
          },
          AskGroup: ({ question }) => {
            if (!isUnlocked(question, state, day)) {
              return Option.none()
            }
            const heard = Array.filter(question.replies, line =>
              isAround(lookups.guest(line.guest), day, part),
            )
            return step({
              seen: union(state.seen, factsOf(heard)),
              asked: union(state.asked, [question.id]),
            })
          },
          Press: ({ guest, question }) => {
            if (!isAround(guest, day, part) || !state.asked.has(question.id)) {
              return Option.none()
            }
            return step({
              seen: union(
                state.seen,
                factsOf(answerOn(question, day, destroyed).pressed),
              ),
            })
          },
          Prove: ({ guest, question, contradiction }) => {
            const answer = answerOn(question, day, destroyed)
            const claimFacts = confrontableFacts(
              answer,
              state.done.has(`press ${question.id}`),
            )
            if (
              !isAround(guest, day, part) ||
              !state.asked.has(question.id) ||
              state.caughtAnswers.has(question.id) ||
              !state.seen.has(contradiction.proofFact)
            ) {
              return Option.none()
            }
            return pipe(
              findCaught(caseData, guest.id, claimFacts, [contradiction.proofFact]),
              Option.flatMap(matched =>
                step({
                  seen: union(state.seen, factsOf(answer.caught ?? [])),
                  caught: union(state.caught, [matched.id]),
                  caughtAnswers: union(state.caughtAnswers, [question.id]),
                }),
              ),
            )
          },
        }),
      ),
    ),
  )
}

const stateKey = (state: SearchState): string =>
  `${state.partIndex}|${state.used}|${Array.sort([...state.done], Order.String).join(',')}`

const dedupeStates = (
  states: ReadonlyArray<SearchState>,
  visited: ReadonlySet<string>,
): ReadonlyArray<SearchState> =>
  Array.dedupeWith(
    Array.filter(states, state => !visited.has(stateKey(state))),
    (a, b) => stateKey(a) === stateKey(b),
  )

// NOTE: breadth-first by actions taken, so the first win found is the
// shortest. Each layer is first closed under skipping to the next part, which
// is free. Every action on a winning path costs one tick: wrong proof never
// helps.
export const searchDay = (
  caseData: Case,
  day: Day,
  maxStates: number = MAX_SEARCH_STATES,
): SearchResult => {
  const lookups = makeLookups(caseData)
  const goal = Array.filter(
    lookups.contradictionsAgainst(caseData.thief),
    contradiction => contradiction.concernsTheft,
  )
  const goalIds = new Set(Array.map(goal, contradiction => contradiction.id))
  const actions = relevantActions(lookups, day, goal)
  const isWon = (state: SearchState) =>
    Array.some([...state.caught], id => goalIds.has(id))
  const settle = (state: SearchState): SearchState =>
    state.used >= budgetFor(caseData, state.partIndex)
      ? enterPart(lookups, day, state, state.partIndex + 1)
      : state

  const withSkips = (
    layer: ReadonlyArray<SearchState>,
    visited: ReadonlySet<string>,
  ): ReadonlyArray<SearchState> => {
    const skipped = dedupeStates(
      Array.map(
        layer.filter(state => state.partIndex < PARTS.length),
        state => enterPart(lookups, day, state, state.partIndex + 1),
      ),
      new Set([...visited, ...Array.map(layer, stateKey)]),
    )
    return Array.isReadonlyArrayEmpty(skipped)
      ? layer
      : withSkips([...layer, ...skipped], visited)
  }

  const search = (
    frontier: ReadonlyArray<SearchState>,
    visited: ReadonlySet<string>,
  ): SearchResult => {
    const layer = withSkips(frontier, visited)
    const seenNow = union(visited, Array.map(layer, stateKey))
    return pipe(
      Array.findFirst(layer, isWon),
      Option.match({
        onSome: (won): SearchResult => ({ _tag: 'Won', actions: won.path }),
        onNone: (): SearchResult => {
          if (seenNow.size > maxStates) {
            return { _tag: 'TooLarge' }
          }
          const next = dedupeStates(
            Array.flatMap(layer, state =>
              Array.getSomes(
                Array.map(actions, action =>
                  Option.map(tryAction(lookups, day, state, action), settle),
                ),
              ),
            ),
            seenNow,
          )
          return Array.isReadonlyArrayEmpty(next)
            ? { _tag: 'Lost' }
            : search(next, seenNow)
        },
      }),
    )
  }

  const start = enterPart(
    lookups,
    day,
    {
      partIndex: 0,
      used: 0,
      path: [],
      done: new Set(),
      seen: freshStart(lookups, day),
      asked: new Set(),
      caught: new Set(),
      caughtAnswers: new Set(),
    },
    0,
  )
  return search([start], new Set())
}

const budgetFor = (caseData: Case, partIndex: number): number =>
  pipe(
    Array.get(PARTS, partIndex),
    Option.match({
      onNone: () => 0,
      onSome: part => caseData.budget[part],
    }),
  )

const checkWinnable = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const { morning, afternoon, evening } = caseData.budget
  return Match.value(searchDay(caseData, LAST_DAY)).pipe(
    Match.tagsExhaustive({
      Won: () => [],
      Lost: () => [
        error(
          'winnable',
          `from a fresh morning on day ${LAST_DAY}, no path within the budget (${morning}/${afternoon}/${evening}) catches a theft lie of ${caseData.thief}'s`,
        ),
      ],
      TooLarge: () => [
        error(
          'winnable',
          `the day-${LAST_DAY} search passed ${MAX_SEARCH_STATES} states; simplify the unlocks around the theft lie`,
        ),
      ],
    }),
  )
}


// REACHABLE

const checkReachable = (
  lookups: Lookups,
  fromDayOne: Closure,
): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  return [
    ...Array.flatMap(allQuestionsWithWhere(caseData), ([question, where]) =>
      errorIf(
        !fromDayOne.askable.has(question.id),
        'reachable',
        `${where} can never be asked: its unlocks can't all hold while it's open and its guest is around`,
      ),
    ),
    ...Array.flatMap(caseData.contradictions, contradiction =>
      errorIf(
        !fromDayOne.caught.has(contradiction.id),
        'reachable',
        `contradiction ${contradiction.id} can never be caught`,
      ),
    ),
  ]
}

// CONTRADICTIONS

const checkContradictions = (lookups: Lookups): ReadonlyArray<Problem> =>
  Array.flatMap(lookups.caseData.contradictions, contradiction => {
    const name = `contradiction ${contradiction.id}`
    const claim = lookups.fact(contradiction.claimFact)
    const proof = lookups.fact(contradiction.proofFact)
    const suspect = lookups.guest(contradiction.suspect)
    return [
      ...errorIf(claim.isTrue, 'contradictions', `${name}: the claim is true`),
      ...errorIf(!proof.isTrue, 'contradictions', `${name}: the proof is false`),
      ...errorIf(
        !suspect.claims.includes(claim.id),
        'contradictions',
        `${name}: the claim isn't one of ${suspect.id}'s claims`,
      ),
      ...errorIf(
        contradiction.concernsTheft !== claim.concernsTheft,
        'contradictions',
        `${name}: concernsTheft doesn't match the claim fact`,
      ),
      ...errorIf(
        !Array.some(DAYS, day =>
          saysInAnswerLinesOn(lookups, day, suspect.id).has(claim.id),
        ),
        'contradictions',
        `${name}: ${suspect.id} never says the claim in a DM answer`,
      ),
    ]
  })

// NIGHT MOVES

const checkNightMoves = (
  lookups: Lookups,
  fromDayOne: Closure,
): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const daysUntil = (night: number) => Array.filter(DAYS, day => day <= night)
  const daysAfter = (night: number) => Array.filter(DAYS, day => day > night)

  const onePerNight = Array.flatMap(MOVE_NIGHTS, night => {
    const count = Array.filter(
      caseData.nightMoves,
      move => move.night === night,
    ).length
    return errorIf(
      count !== 1,
      'nightMoves',
      `night ${night} has ${count} moves; it needs exactly one`,
    )
  })

  const perMove = Array.flatMap(caseData.nightMoves, move => {
    const name = `${move._tag} on night ${move.night}`
    const fact = lookups.fact(move.fact)
    return NightMove.match(move, {
      Destroy: () => [
        ...errorIf(!fact.isTrue, 'nightMoves', `${name}: ${fact.id} must be true`),
        ...errorIf(
          Array.some(caseData.wifiLog, entry => entry.factIds.includes(fact.id)),
          'nightMoves',
          `${name}: ${fact.id} is in the Wi-Fi log, which the thief can't edit`,
        ),
        ...errorIf(
          !fromDayOne.seenBy(move.night === 1 ? 1 : 2).has(fact.id),
          'nightMoves',
          `${name}: ${fact.id} can't be found before it's destroyed`,
        ),
        ...Array.flatMap(lookups.dmQuestions, ({ guest, question }) =>
          Array.flatMap(daysAfter(move.night), day => {
            if (!isOpenOn(question, day)) {
              return []
            }
            const scheduled = scheduledAnswer(question, day)
            const carries = (answer: Answer) =>
              [
                ...factsOf(answer.lines),
                ...factsOf(answer.pressed),
                ...factsOf(answer.caught ?? []),
              ].includes(fact.id)
            return [
              ...errorIf(
                carries(scheduled) && question.ifDestroyed === undefined,
                'nightMoves',
                `${name}: ${guest.id}.${question.id} still carries ${fact.id} on day ${day}; give it an ifDestroyed answer`,
              ),
              ...errorIf(
                question.ifDestroyed !== undefined &&
                  carries(question.ifDestroyed),
                'nightMoves',
                `${name}: ${guest.id}.${question.id}'s ifDestroyed answer carries ${fact.id}`,
              ),
            ]
          }),
        ),
        ...Array.flatMap(
          caseData.beats.filter(beat => beat.day > move.night),
          beat =>
            errorIf(
              factsOf(beat.lines).includes(fact.id),
              'nightMoves',
              `${name}: the beat on day ${beat.day} ${beat.part} carries ${fact.id} after it's destroyed`,
            ),
        ),
        ...Array.flatMap(caseData.groupQuestions, question =>
          errorIf(
            lastOpenDay(question) > move.night &&
              factsOf(question.replies).includes(fact.id),
            'nightMoves',
            `${name}: group.${question.id} can carry ${fact.id} after it's destroyed`,
          ),
        ),
      ],
      Plant: () => [
        ...errorIf(fact.isTrue, 'nightMoves', `${name}: ${fact.id} must be false`),
        ...errorIf(
          !fact.concernsTheft,
          'nightMoves',
          `${name}: ${fact.id} must concern the theft`,
        ),
        ...errorIf(
          Array.isReadonlyArrayEmpty(fact.about) ||
            fact.about.includes(caseData.thief),
          'nightMoves',
          `${name}: ${fact.id} must point at an innocent`,
        ),
        ...errorIf(
          Array.some(daysUntil(move.night), day =>
            mayAppearOn(lookups, day).has(fact.id),
          ),
          'nightMoves',
          `${name}: ${fact.id} appears before it's planted`,
        ),
        ...errorIf(
          !fromDayOne.seenBy(LAST_DAY).has(fact.id),
          'nightMoves',
          `${name}: ${fact.id} never appears`,
        ),
      ],
      Coach: coach => [
        ...errorIf(
          coach.guest === caseData.thief,
          'nightMoves',
          `${name}: the thief can't coach themselves`,
        ),
        ...errorIf(fact.isTrue, 'nightMoves', `${name}: ${fact.id} must be false`),
        ...errorIf(
          !lookups.guest(coach.guest).claims.includes(fact.id),
          'nightMoves',
          `${name}: ${fact.id} must be one of ${coach.guest}'s claims`,
        ),
        ...errorIf(
          Array.some(daysUntil(move.night), day =>
            mayAppearOn(lookups, day, coach.guest).has(fact.id),
          ),
          'nightMoves',
          `${name}: ${coach.guest} says ${fact.id} before being coached`,
        ),
        ...errorIf(
          !Array.some(daysAfter(move.night), day =>
            saysInAnswerLinesOn(lookups, day, coach.guest).has(fact.id),
          ),
          'nightMoves',
          `${name}: ${coach.guest} never says ${fact.id} in a DM answer`,
        ),
        ...errorIf(
          !lookups.fact(coach.tellFact).isTrue,
          'nightMoves',
          `${name}: the tell ${coach.tellFact} must be true`,
        ),
        ...errorIf(
          !Array.some(daysAfter(move.night), day =>
            pressedOn(lookups, day, coach.guest).has(coach.tellFact),
          ),
          'nightMoves',
          `${name}: ${coach.guest} never gives the tell when pressed`,
        ),
      ],
    })
  })

  return [...onePerNight, ...perMove]
}

const checkNoFalseProof = (
  lookups: Lookups,
  fromDayThree: Closure,
): ReadonlyArray<Problem> =>
  Array.flatMap(lookups.caseData.nightMoves, move => {
    if (move._tag === 'Destroy') {
      return []
    }
    const name = `${move._tag} on night ${move.night}`
    return [
      ...errorIf(
        !lookups.fact(move.disprovedBy).isTrue,
        'noFalseProof',
        `${name}: ${move.disprovedBy} must be true to disprove ${move.fact}`,
      ),
      ...errorIf(
        !fromDayThree.seenBy(LAST_DAY).has(move.disprovedBy),
        'noFalseProof',
        `${name}: ${move.disprovedBy} can't be found from a fresh day ${LAST_DAY}`,
      ),
    ]
  })

// LEAKS

const checkNoLeaks = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const planted = new Set(
    Array.flatMap(caseData.nightMoves, move =>
      move._tag === 'Plant' ? [move.fact] : [],
    ),
  )

  const perGuest = Array.flatMap(caseData.guests, guest => {
    const speakable = new Set([...guest.knows, ...guest.claims])
    const answerFactsOf = Array.flatMap(guest.questions, question =>
      Array.flatMap(allAnswers(question), answer => [
        ...factsOf(answer.lines),
        ...factsOf(answer.pressed),
        ...factsOf(answer.caught ?? []),
      ]),
    )
    const groupFacts = Array.flatMap(caseData.groupQuestions, question =>
      factsOf(Array.filter(question.replies, line => line.guest === guest.id)),
    )
    const beatFacts = pipe(
      caseData.beats,
      Array.flatMap(beat => beat.lines),
      Array.filter(line => line.guest === guest.id),
      factsOf,
    )
    const unspeakable = (facts: ReadonlyArray<FactId>, where: string) =>
      Array.map(
        Array.dedupe(Array.filter(facts, fact => !speakable.has(fact))),
        fact =>
          error(
            'noLeaks',
            `${guest.id} says ${fact}${where}, which isn't in their knows or claims`,
          ),
      )
    return [
      ...unspeakable(answerFactsOf, ''),
      ...unspeakable(groupFacts, ' in a group question'),
      ...unspeakable(
        Array.filter(beatFacts, fact => !planted.has(fact)),
        ' in a beat',
      ),
      ...Array.flatMap(guest.knows, fact =>
        errorIf(
          !lookups.fact(fact).isTrue,
          'noLeaks',
          `${guest.id} knows ${fact}, but it's false; lies go in claims`,
        ),
      ),
      ...Option.match(Option.fromUndefinedOr(guest.secret), {
        onNone: () => [],
        onSome: fact => [
          ...errorIf(
            !guest.knows.includes(fact),
            'noLeaks',
            `${guest.id}'s secret ${fact} isn't in their knows`,
          ),
          ...errorIf(
            lookups.fact(fact).concernsTheft,
            'noLeaks',
            `${guest.id}'s secret ${fact} must not concern the theft`,
          ),
          ...errorIf(
            guest.id === caseData.thief,
            'noLeaks',
            `the thief can't have a secret; secrets belong to innocents`,
          ),
          ...errorIf(
            [...groupFacts, ...beatFacts].includes(fact),
            'noLeaks',
            `${guest.id} gives away their secret ${fact} in the group chat`,
          ),
        ],
      }),
    ]
  })

  const theftFact = lookups.fact(caseData.theftFact)
  const everywhere = [
    ...Array.flatMap(lookups.dmQuestions, ({ question }) =>
      Array.flatMap(allAnswers(question), answer => [
        ...factsOf(answer.lines),
        ...factsOf(answer.pressed),
        ...factsOf(answer.caught ?? []),
      ]),
    ),
    ...Array.flatMap(caseData.groupQuestions, question =>
      factsOf(question.replies),
    ),
    ...Array.flatMap(caseData.beats, beat => factsOf(beat.lines)),
    ...Array.flatMap(caseData.wifiLog, entry => entry.factIds),
  ]

  return [
    ...perGuest,
    ...errorIf(
      !theftFact.isTrue || !theftFact.concernsTheft,
      'noLeaks',
      `theftFact ${theftFact.id} must be true and concern the theft`,
    ),
    ...errorIf(
      everywhere.includes(theftFact.id),
      'noLeaks',
      `theftFact ${theftFact.id} is said outright somewhere; it may only appear in the timeline`,
    ),
  ]
}

// MENU SHAPE

const outsideRange = (
  value: number,
  others: ReadonlyArray<number>,
): boolean =>
  Array.isReadonlyArrayNonEmpty(others) &&
  (value < Math.min(...others) || value > Math.max(...others))

const checkMenuShape = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const thief = lookups.guest(caseData.thief)
  const innocents = Array.filter(caseData.guests, guest => guest.id !== thief.id)
  return [
    ...Array.flatMap(caseData.guests, guest =>
      errorIf(
        Array.isReadonlyArrayEmpty(lookups.contradictionsAgainst(guest.id)),
        'menuShape',
        `${guest.id} has no lie to catch; every guest needs one, or the one who has one stands out`,
      ),
    ),
    ...errorIf(
      outsideRange(
        thief.questions.length,
        Array.map(innocents, guest => guest.questions.length),
      ),
      'menuShape',
      `the thief has ${thief.questions.length} questions, outside the innocents' range`,
    ),
    ...errorIf(
      outsideRange(
        thief.away.length,
        Array.map(innocents, guest => guest.away.length),
      ),
      'menuShape',
      `the thief is away ${thief.away.length} times, outside the innocents' range`,
    ),
  ]
}

// TUNING

const checkTuning = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const { morning, afternoon, evening } = caseData.budget
  const totalBudget = (morning + afternoon + evening) * DAYS.length
  const questionCount =
    lookups.dmQuestions.length + caseData.groupQuestions.length
  const largestPart = Math.max(morning, afternoon, evening)
  const dayOne = searchDay(caseData, 1)
  return [
    ...(questionCount < totalBudget * MIN_QUESTIONS_PER_TICK
      ? [
          warning(
            'tuning',
            `${questionCount} questions on offer for a budget of ${totalBudget}; aim for at least ${totalBudget * MIN_QUESTIONS_PER_TICK} so the detective has to choose`,
          ),
        ]
      : []),
    ...(dayOne._tag === 'Won' && dayOne.actions.length <= largestPart
      ? [
          warning(
            'tuning',
            `the case can be won on day 1 in ${dayOne.actions.length} actions (${dayOne.actions.join('; ')}), within one part's budget`,
          ),
        ]
      : []),
  ]
}

// CHECK

export const findProblems = (caseData: Case): ReadonlyArray<Problem> => {
  const referenceProblems = checkReferences(caseData)
  if (Array.isReadonlyArrayNonEmpty(referenceProblems)) {
    return referenceProblems
  }

  const lookups = makeLookups(caseData)
  const fromDayOne = closure(lookups, 1)
  const fromDayThree = closure(lookups, LAST_DAY)
  const errors = [
    ...checkAnswers(lookups),
    ...checkReachable(lookups, fromDayOne),
    ...checkWinnable(lookups),
    ...checkContradictions(lookups),
    ...checkNightMoves(lookups, fromDayOne),
    ...checkNoFalseProof(lookups, fromDayThree),
    ...checkNoLeaks(lookups),
    ...checkMenuShape(lookups),
  ]
  return [...errors, ...checkTuning(lookups)]
}

const caseIdOf = (input: unknown): string =>
  typeof input === 'object' &&
  input !== null &&
  'id' in input &&
  typeof input.id === 'string'
    ? input.id
    : 'unknown'

// NOTE: fails on errors only. Warnings come back from `findProblems`.
export const validateCase = (
  input: unknown,
): Effect.Effect<Case, CaseRejected> =>
  pipe(
    decodeCase(input),
    Effect.mapError(
      parseError =>
        new CaseRejected({
          caseId: caseIdOf(input),
          problems: [error('schema', parseError.message)],
        }),
    ),
    Effect.flatMap(caseData =>
      Array.match(Array.filter(findProblems(caseData), isError), {
        onEmpty: () => Effect.succeed(caseData),
        onNonEmpty: problems =>
          Effect.fail(new CaseRejected({ caseId: caseData.id, problems })),
      }),
    ),
  )

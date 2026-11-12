// NOTE: the game for one case (docs/design.md, sections 2 to 7). `handle`
// takes the stored state and one client message and returns the next state
// plus the messages to send. It's pure: every rule comes from
// shared/rules.ts, every line from the case, and the clock is passed in.
//
// Nothing sent out may carry fact IDs, truth, contradictions, the case's
// question IDs or the thief (until the arrest's result names them).

import { Option } from 'effect'

import type {
  Answer,
  Case,
  ContradictionId,
  FactId,
  GroupQuestion,
  Guest,
  GuestId,
  Part,
  Question,
  QuestionId,
} from '../../shared/case'
import {
  type CaseResult,
  type CaughtLie,
  type ChatMessage,
  type ClientMessage,
  type Clock,
  type Ending,
  type Evidence,
  type GuestStatus,
  LAST_DAY,
  type Menu,
  type MessageBody,
  type MessageId,
  type MessageRole,
  type RejectionReason,
  type Sender,
  ServerMessage,
  type Solution,
  type Thread,
} from '../../shared/protocol'
import {
  ASK_COST,
  PRESS_COST,
  RIGHT_PROOF_COST,
  WRONG_PROOF_COST,
  allAnswers,
  answerOn,
  awaySlot,
  beatAt,
  confrontableFacts,
  destroyedBefore,
  findCaught,
  isOpenOn,
  isUnlocked,
  type Progress,
  wifiPublishedOn,
  wrongProofReply,
} from '../../shared/rules'
import type {
  AnswerRecord,
  CaughtRecord,
  GameState,
  StoredMessage,
} from './state'

// NOTE: a second tick-spending action this soon after the last one is a
// double tap, not a choice.
export const MIN_ACTION_INTERVAL_MS = 300

export const PRESS_TEXT = 'Are you sure about that?'
export const BEDTIME_TEXT = "Everyone's gone to bed 🌙"

export type Step = Readonly<{
  state: GameState
  out: ReadonlyArray<ServerMessage>
}>

// CASE LOOKUPS

type ThreadQuestion =
  | Readonly<{
      _tag: 'Direct'
      guest: Guest
      question: Question
      order: number
    }>
  | Readonly<{ _tag: 'Group'; question: GroupQuestion; order: number }>

type Lookups = Readonly<{
  guests: ReadonlyMap<GuestId, Guest>
  questions: ReadonlyMap<QuestionId, ThreadQuestion>
  threads: ReadonlyArray<Readonly<{ key: string; thread: Thread }>>
}>

const lookupCache = new WeakMap<Case, Lookups>()

const lookups = (caseData: Case): Lookups => {
  const cached = lookupCache.get(caseData)
  if (cached !== undefined) {
    return cached
  }
  const questions = new Map<QuestionId, ThreadQuestion>()
  caseData.groupQuestions.forEach((question, order) =>
    questions.set(question.id, { _tag: 'Group', question, order }),
  )
  caseData.guests.forEach(guest =>
    guest.questions.forEach((question, order) =>
      questions.set(question.id, { _tag: 'Direct', guest, question, order }),
    ),
  )
  const built: Lookups = {
    guests: new Map(caseData.guests.map(guest => [guest.id, guest])),
    questions,
    threads: [
      { key: GROUP_KEY, thread: GROUP },
      ...caseData.guests.map(guest => ({
        key: directKey(guest.id),
        thread: direct(guest.id),
      })),
    ],
  }
  lookupCache.set(caseData, built)
  return built
}

const GROUP: Thread = { _tag: 'Group' }
const WIFI: Thread = { _tag: 'WifiLog' }
const GROUP_KEY = 'group'
const direct = (guest: GuestId): Thread => ({ _tag: 'Direct', guest })
const directKey = (guest: GuestId): string => `dm:${guest}`

const threadKey = (thread: Thread): Option.Option<string> => {
  switch (thread._tag) {
    case 'Group':
      return Option.some(GROUP_KEY)
    case 'Direct':
      return Option.some(directKey(thread.guest))
    case 'WifiLog':
      return Option.none()
  }
}

const questionThreadKey = (entry: ThreadQuestion): string =>
  entry._tag === 'Group' ? GROUP_KEY : directKey(entry.guest.id)

const nextPart = (part: Part): Option.Option<Part> =>
  part === 'morning'
    ? Option.some('afternoon')
    : part === 'afternoon'
      ? Option.some('evening')
      : Option.none()

// STEP HELPERS

const emit = (step: Step, ...messages: ReadonlyArray<ServerMessage>): Step => ({
  ...step,
  out: [...step.out, ...messages],
})

const update = (step: Step, change: Partial<GameState>): Step => ({
  ...step,
  state: { ...step.state, ...change },
})

const reject = (state: GameState, reason: RejectionReason): Step => ({
  state,
  out: [ServerMessage.cases.Rejected.make({ reason })],
})

const PLAIN: MessageRole = { _tag: 'Plain' }
const DETECTIVE: Sender = { _tag: 'Detective' }
const LODGE: Sender = { _tag: 'Lodge' }
const text = (value: string): MessageBody => ({ _tag: 'Text', text: value })

const union = <A>(
  existing: ReadonlyArray<A>,
  added: ReadonlyArray<A>,
): ReadonlyArray<A> => [
  ...existing,
  ...added.filter(
    (item, index) => !existing.includes(item) && added.indexOf(item) === index,
  ),
]

type Posted = Readonly<{ step: Step; id: MessageId }>

const post = (
  step: Step,
  thread: Thread,
  sender: Sender,
  body: MessageBody,
  factIds: ReadonlyArray<FactId>,
  role: MessageRole = PLAIN,
): Posted => {
  const { state } = step
  const message: ChatMessage = {
    id: `m${state.nextMessageId}`,
    thread,
    sender,
    body,
    role,
    day: state.day,
    part: state.part,
  }
  const stored: StoredMessage = { message, factIds }
  return {
    id: message.id,
    step: emit(
      update(step, {
        nextMessageId: state.nextMessageId + 1,
        messages: [...state.messages, stored],
        seen: union(state.seen, factIds),
      }),
      ServerMessage.cases.MessagePosted.make({ message }),
    ),
  }
}

type Bubble = Readonly<{ text: string; factIds: ReadonlyArray<FactId> }>

type Spoken = Readonly<{ step: Step; ids: ReadonlyArray<MessageId> }>

// NOTE: one typing indicator, then the guest's bubbles in order.
const speak = (
  step: Step,
  thread: Thread,
  guest: GuestId,
  bubbles: ReadonlyArray<Bubble>,
  role: MessageRole = PLAIN,
): Spoken => {
  if (bubbles.length === 0) {
    return { step, ids: [] }
  }
  return bubbles.reduce<Spoken>(
    (spoken, bubble) => {
      const posted = post(
        spoken.step,
        thread,
        { _tag: 'Guest', guest },
        text(bubble.text),
        bubble.factIds,
        role,
      )
      return { step: posted.step, ids: [...spoken.ids, posted.id] }
    },
    {
      step: emit(step, ServerMessage.cases.Typing.make({ thread, guest })),
      ids: [],
    },
  )
}

const findMessage = (
  state: GameState,
  id: MessageId,
): Option.Option<StoredMessage> =>
  Option.fromUndefinedOr(
    state.messages.find(stored => stored.message.id === id),
  )

// GUEST STATUS

export const statusOf = (state: GameState, guest: Guest): GuestStatus => {
  if (state.phase !== 'asking' || state.arrest !== undefined) {
    return { _tag: 'Asleep' }
  }
  return Option.match(awaySlot(guest, state.day, state.part), {
    onSome: status => ({ _tag: 'Away', status }),
    onNone: () =>
      state.quiet.includes(guest.id) ? { _tag: 'Quiet' } : { _tag: 'Around' },
  })
}

const unreachable = (
  state: GameState,
  guest: Guest,
): Option.Option<RejectionReason> => {
  switch (statusOf(state, guest)._tag) {
    case 'Around':
      return Option.none()
    case 'Away':
      return Option.some('away')
    case 'Quiet':
      return Option.some('quiet')
    case 'Asleep':
      return Option.some('asleep')
  }
}

// MENUS

const progressOf = (state: GameState): Progress => ({
  seen: new Set(state.seen),
  asked: new Set(state.asked),
  caught: new Set(state.caught.map(record => record.contradiction)),
})

const isOnMenu = (
  state: GameState,
  progress: Progress,
  entry: ThreadQuestion,
): boolean =>
  !progress.asked.has(entry.question.id) &&
  isOpenOn(entry.question, state.day) &&
  isUnlocked(entry.question, progress, state.day)

// NOTE: gives every question that has reached a menu an opaque chip ID, in
// the order they appear. The counter it records decides `isNew`.
const syncChips = (caseData: Case, state: GameState): GameState => {
  const progress = progressOf(state)
  const known = new Set(state.chips.map(chip => chip.question))
  const added = [...lookups(caseData).questions.values()]
    .filter(entry => !known.has(entry.question.id))
    .filter(entry => isOnMenu(state, progress, entry))
  if (added.length === 0) {
    return state
  }
  return {
    ...state,
    chips: [
      ...state.chips,
      ...added.map((entry, index) => ({
        id: `c${state.chips.length + index + 1}`,
        question: entry.question.id,
        appearedAt: state.nextMessageId,
      })),
    ],
  }
}

const menuFor = (
  caseData: Case,
  state: GameState,
  key: string,
  thread: Thread,
): Menu => {
  const { questions } = lookups(caseData)
  const progress = progressOf(state)
  const lastAsked = state.lastAsked[key] ?? 0
  const chips = state.chips.flatMap(chip => {
    const entry = questions.get(chip.question)
    return entry !== undefined &&
      questionThreadKey(entry) === key &&
      isOnMenu(state, progress, entry)
      ? [{ chip, entry, isNew: chip.appearedAt > lastAsked }]
      : []
  })
  chips.sort((a, b) => a.entry.order - b.entry.order)
  return {
    thread,
    chips: chips.map(({ chip, entry, isNew }) => ({
      id: chip.id,
      text: entry.question.ask,
      isNew,
    })),
  }
}

export const menusOf = (
  caseData: Case,
  state: GameState,
): ReadonlyArray<Menu> =>
  lookups(caseData).threads.map(({ key, thread }) =>
    menuFor(caseData, state, key, thread),
  )

// CLOCK

export const clockOf = (caseData: Case, state: GameState): Clock => ({
  day: state.day,
  part: state.part,
  phase: state.phase,
  ticksLeft: state.ticksLeft,
  partBudget: caseData.budget[state.part],
})

// NOTE: what the client can see of the state, compared before and after each
// stage of a step so only what changed is sent.
type View = Readonly<{
  statuses: ReadonlyArray<GuestStatus>
  menus: ReadonlyArray<Menu>
  clock: Clock
}>

const viewOf = (caseData: Case, state: GameState): View => ({
  statuses: caseData.guests.map(guest => statusOf(state, guest)),
  menus: menusOf(caseData, state),
  clock: clockOf(caseData, state),
})

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

// NOTE: syncs chips and sends the statuses, menus and clock that changed
// since `before`, in that order.
const settle = (caseData: Case, before: View, step: Step): Step => {
  const state = syncChips(caseData, step.state)
  const after = viewOf(caseData, state)
  const statuses = caseData.guests.flatMap((guest, index) =>
    same(before.statuses[index], after.statuses[index])
      ? []
      : [
          ServerMessage.cases.GuestStatusChanged.make({
            guest: guest.id,
            status: after.statuses[index] ?? { _tag: 'Around' },
          }),
        ],
  )
  const menus = after.menus.flatMap((menu, index) =>
    same(before.menus[index], menu)
      ? []
      : [ServerMessage.cases.MenuChanged.make({ menu })],
  )
  const clock = same(before.clock, after.clock)
    ? []
    : [ServerMessage.cases.ClockChanged.make({ clock: after.clock })]
  return emit({ state, out: step.out }, ...statuses, ...menus, ...clock)
}

// NOTE: runs one stage and settles what it changed.
const stage = (caseData: Case, step: Step, run: (step: Step) => Step): Step =>
  settle(caseData, viewOf(caseData, step.state), run(step))

// PARTS AND DAYS

const formatWifi = (caseData: Case, body: MessageBody): string => {
  if (body._tag === 'Text') {
    return body.text
  }
  const name = lookups(caseData).guests.get(body.guest)?.name ?? body.guest
  return `${body.time} · ${name}'s phone ${body.event} ${body.accessPoint}`
}

// NOTE: the morning brings the previous night's Wi-Fi log first. Then any
// part plays its beat.
const startPart = (caseData: Case, step: Step): Step => {
  const { day, part } = step.state
  const withWifi =
    part === 'morning'
      ? wifiPublishedOn(caseData, day).reduce(
          (current, entry) =>
            post(
              current,
              WIFI,
              LODGE,
              {
                _tag: 'WifiEntry',
                time: entry.time,
                guest: entry.guest,
                event: entry.event,
                accessPoint: entry.accessPoint,
              },
              entry.factIds,
            ).step,
          step,
        )
      : step
  return beatAt(caseData, day, part)
    .flatMap(beat => beat.lines)
    .reduce(
      (current, line) => speak(current, GROUP, line.guest, [line]).step,
      withWifi,
    )
}

// NOTE: everyone goes to bed. On the last day there's no night: the arrest
// is all that's left.
const endDay = (caseData: Case, step: Step): Step => {
  const announced = post(step, GROUP, LODGE, text(BEDTIME_TEXT), []).step
  const goodnights = caseData.guests.reduce(
    (current, guest) =>
      speak(current, GROUP, guest.id, [{ text: guest.goodnight, factIds: [] }])
        .step,
    announced,
  )
  return update(goodnights, {
    phase: step.state.day === LAST_DAY ? 'arrest' : 'bedtime',
    ticksLeft: 0,
    quiet: [],
  })
}

// NOTE: the night passes. The thief's move needs no state of its own: rules
// read it from the case by day (`destroyedBefore`, `afterNight`).
const sleep = (caseData: Case, step: Step): Step => {
  const day = step.state.day === 1 ? 2 : 3
  return startPart(
    caseData,
    update(step, {
      day,
      part: 'morning',
      phase: 'asking',
      ticksLeft: caseData.budget.morning,
      quiet: [],
    }),
  )
}

const advancePart = (caseData: Case, step: Step): Step =>
  Option.match(nextPart(step.state.part), {
    onNone: () => stage(caseData, step, current => endDay(caseData, current)),
    onSome: part =>
      stage(caseData, step, current =>
        startPart(
          caseData,
          update(current, {
            part,
            ticksLeft: caseData.budget[part],
            quiet: [],
          }),
        ),
      ),
  })

// NOTE: an action may overspend. The part ends after the action settles.
const spend = (step: Step, cost: number): Step =>
  update(step, { ticksLeft: Math.max(0, step.state.ticksLeft - cost) })

// NOTE: runs a tick-spending action: its own changes settle first, then, if
// the part's ticks ran out, the next part starts in the same step. `prep`
// changes the state before the action without counting as a visible change.
const act = (
  caseData: Case,
  state: GameState,
  prep: Partial<GameState>,
  run: (step: Step) => Step,
): Step => {
  const before = viewOf(caseData, state)
  const acted = settle(
    caseData,
    before,
    run({ state: { ...state, ...prep }, out: [] }),
  )
  return acted.state.ticksLeft === 0 ? advancePart(caseData, acted) : acted
}

// NOTE: shared checks for actions that spend ticks.
const checkCanAct = (
  state: GameState,
  now: number,
): Option.Option<RejectionReason> =>
  state.phase === 'bedtime'
    ? Option.some('asleep')
    : state.phase !== 'asking'
      ? Option.some('notNow')
      : now - state.lastActionAt < MIN_ACTION_INTERVAL_MS
        ? Option.some('tooFast')
        : Option.none()

// ASKING

const askQuestion = (
  caseData: Case,
  state: GameState,
  thread: Thread,
  chipId: string,
  now: number,
): Step => {
  const blocked = checkCanAct(state, now)
  if (Option.isSome(blocked)) {
    return reject(state, blocked.value)
  }
  const key = threadKey(thread)
  if (Option.isNone(key)) {
    return reject(state, 'invalid')
  }
  if (thread._tag === 'Direct' && !lookups(caseData).guests.has(thread.guest)) {
    return reject(state, 'invalid')
  }
  const chip = state.chips.find(candidate => candidate.id === chipId)
  const entry =
    chip === undefined
      ? undefined
      : lookups(caseData).questions.get(chip.question)
  if (
    entry === undefined ||
    questionThreadKey(entry) !== key.value ||
    !isOnMenu(state, progressOf(state), entry)
  ) {
    return reject(state, 'unknownQuestion')
  }
  if (entry._tag === 'Direct') {
    const away = unreachable(state, entry.guest)
    if (Option.isSome(away)) {
      return reject(state, away.value)
    }
  }

  const prep = {
    asked: [...state.asked, entry.question.id],
    lastAsked: { ...state.lastAsked, [key.value]: state.nextMessageId },
    lastActionAt: now,
  }
  return act(caseData, state, prep, step => {
    const sent = post(
      step,
      thread,
      DETECTIVE,
      text(entry.question.ask),
      [],
    ).step
    const replied =
      entry._tag === 'Direct'
        ? answerDirect(caseData, sent, entry.guest, entry.question)
        : answerGroup(caseData, sent, entry.question)
    return spend(replied, ASK_COST)
  })
}

const answerDirect = (
  caseData: Case,
  step: Step,
  guest: Guest,
  question: Question,
): Step => {
  const { day } = step.state
  const answer = answerOn(question, day, destroyedBefore(caseData, day))
  const answerId = `a${step.state.answers.length + 1}`
  const spoken = speak(step, direct(guest.id), guest.id, answer.lines, {
    _tag: 'Answer',
    answerId,
  })
  const record: AnswerRecord = {
    id: answerId,
    guest: guest.id,
    question: question.id,
    day,
    messageIds: spoken.ids,
    pressedMessageIds: [],
    pressed: false,
    caught: false,
  }
  return update(spoken.step, {
    answers: [...spoken.step.state.answers, record],
  })
}

// NOTE: guests reply in the case's order, skipping any who are away or quiet.
const answerGroup = (
  caseData: Case,
  step: Step,
  question: GroupQuestion,
): Step =>
  question.replies.reduce((current, line) => {
    const guest = lookups(caseData).guests.get(line.guest)
    return guest === undefined ||
      Option.isSome(unreachable(current.state, guest))
      ? current
      : speak(current, GROUP, line.guest, [line]).step
  }, step)

// PRESSING AND PROOF

type Target = Readonly<{
  record: AnswerRecord
  guest: Guest
  answer: Answer
  question: Question
}>

const answerOf = (
  caseData: Case,
  record: AnswerRecord,
): Option.Option<Target> => {
  const entry = lookups(caseData).questions.get(record.question)
  const guest = lookups(caseData).guests.get(record.guest)
  if (entry?._tag !== 'Direct' || guest === undefined) {
    return Option.none()
  }
  return Option.some({
    record,
    guest,
    question: entry.question,
    answer: answerOn(
      entry.question,
      record.day,
      destroyedBefore(caseData, record.day),
    ),
  })
}

// NOTE: finds the answer any of its bubbles belongs to.
const findTarget = (
  caseData: Case,
  state: GameState,
  messageId: MessageId,
): Either<RejectionReason, Target> => {
  const stored = findMessage(state, messageId)
  if (Option.isNone(stored)) {
    return { _tag: 'Left', left: 'unknownMessage' }
  }
  const role = stored.value.message.role
  if (role._tag !== 'Answer') {
    return { _tag: 'Left', left: 'notAnAnswer' }
  }
  const record = state.answers.find(answer => answer.id === role.answerId)
  const target =
    record === undefined ? Option.none() : answerOf(caseData, record)
  return Option.match(target, {
    onNone: () => ({ _tag: 'Left', left: 'notAnAnswer' }),
    onSome: right => ({ _tag: 'Right', right }),
  })
}

type Either<E, A> =
  | Readonly<{ _tag: 'Left'; left: E }>
  | Readonly<{ _tag: 'Right'; right: A }>

const replaceAnswer = (
  state: GameState,
  record: AnswerRecord,
): ReadonlyArray<AnswerRecord> =>
  state.answers.map(answer => (answer.id === record.id ? record : answer))

const press = (
  caseData: Case,
  state: GameState,
  messageId: MessageId,
  now: number,
): Step => {
  const found = findTarget(caseData, state, messageId)
  if (found._tag === 'Left') {
    return reject(state, found.left)
  }
  const { record, guest, answer } = found.right
  if (record.caught) {
    return reject(state, 'alreadyCaught')
  }
  if (record.pressed) {
    return reject(state, 'alreadyPressed')
  }
  const blocked = Option.orElse(checkCanAct(state, now), () =>
    unreachable(state, guest),
  )
  if (Option.isSome(blocked)) {
    return reject(state, blocked.value)
  }

  return act(caseData, state, { lastActionAt: now }, step => {
    const thread = direct(guest.id)
    const asked = post(step, thread, DETECTIVE, text(PRESS_TEXT), []).step
    const spoken = speak(asked, thread, guest.id, answer.pressed)
    const pressed = emit(
      update(spoken.step, {
        answers: replaceAnswer(spoken.step.state, {
          ...record,
          pressed: true,
          pressedMessageIds: spoken.ids,
        }),
      }),
      ServerMessage.cases.AnswerPressed.make({ answerId: record.id }),
    )
    return spend(pressed, PRESS_COST)
  })
}

const showProof = (
  caseData: Case,
  state: GameState,
  messageId: MessageId,
  proofMessageId: MessageId,
  now: number,
): Step => {
  const found = findTarget(caseData, state, messageId)
  if (found._tag === 'Left') {
    return reject(state, found.left)
  }
  const { record, guest, answer } = found.right
  if (record.caught) {
    return reject(state, 'alreadyCaught')
  }
  const proof = state.caseFile.includes(proofMessageId)
    ? findMessage(state, proofMessageId)
    : Option.none()
  if (Option.isNone(proof)) {
    return reject(state, 'notInCaseFile')
  }
  const blocked = Option.orElse(checkCanAct(state, now), () =>
    unreachable(state, guest),
  )
  if (Option.isSome(blocked)) {
    return reject(state, blocked.value)
  }

  const quote = formatWifi(caseData, proof.value.message.body)
  const caught = findCaught(
    caseData,
    guest.id,
    confrontableFacts(answer, record.pressed),
    proof.value.factIds,
  )
  return act(caseData, state, { lastActionAt: now }, step => {
    const thread = direct(guest.id)
    const shown = post(
      step,
      thread,
      DETECTIVE,
      text(`That's not what this says: "${quote}"`),
      [],
    ).step
    return Option.match(caught, {
      onSome: contradiction => {
        const spoken = speak(shown, thread, guest.id, answer.caught ?? [])
        const claimMessageId =
          [...record.messageIds, ...record.pressedMessageIds].find(id =>
            Option.match(findMessage(spoken.step.state, id), {
              onNone: () => false,
              onSome: stored =>
                stored.factIds.includes(contradiction.claimFact),
            }),
          ) ??
          record.messageIds[0] ??
          messageId
        const caughtRecord: CaughtRecord = {
          guest: guest.id,
          contradiction: contradiction.id,
          answerId: record.id,
          claimMessageId,
          proofMessageId,
        }
        const recorded = emit(
          update(spoken.step, {
            answers: replaceAnswer(spoken.step.state, {
              ...record,
              caught: true,
            }),
            caught: [...spoken.step.state.caught, caughtRecord],
          }),
          ServerMessage.cases.LieCaught.make({
            lie: toCaughtLie(caughtRecord),
          }),
        )
        return spend(recorded, RIGHT_PROOF_COST)
      },
      onNone: () => {
        const soFar = shown.state.wrongProofs[guest.id] ?? 0
        const reply = wrongProofReply(guest, answer, soFar).map(line => ({
          text: line,
          factIds: [],
        }))
        const spoken = speak(shown, thread, guest.id, reply)
        const quieted = update(spoken.step, {
          wrongProofs: {
            ...spoken.step.state.wrongProofs,
            [guest.id]: soFar + 1,
          },
          quiet: union(spoken.step.state.quiet, [guest.id]),
        })
        return spend(quieted, WRONG_PROOF_COST)
      },
    })
  })
}

const toCaughtLie = (record: CaughtRecord): CaughtLie => ({
  guest: record.guest,
  claimMessageId: record.claimMessageId,
  proofMessageId: record.proofMessageId,
})

// CASE FILE

const changeCaseFile = (
  state: GameState,
  messageId: MessageId,
  change: (caseFile: ReadonlyArray<MessageId>) => ReadonlyArray<MessageId>,
): Step => {
  if (Option.isNone(findMessage(state, messageId))) {
    return reject(state, 'unknownMessage')
  }
  const caseFile = change(state.caseFile)
  return {
    state: { ...state, caseFile },
    out: [ServerMessage.cases.CaseFileChanged.make({ caseFile })],
  }
}

// TIME

const skipPart = (caseData: Case, state: GameState): Step =>
  state.phase !== 'asking'
    ? reject(state, 'notNow')
    : advancePart(caseData, { state, out: [] })

const goToSleep = (caseData: Case, state: GameState): Step => {
  if (state.phase === 'arrest') {
    return reject(state, 'notNow')
  }
  const inBed =
    state.phase === 'asking'
      ? stage(caseData, { state, out: [] }, step => endDay(caseData, step))
      : { state, out: [] }
  return inBed.state.phase === 'bedtime'
    ? stage(caseData, inBed, step => sleep(caseData, step))
    : inBed
}

// ARREST

const arrest = (
  caseData: Case,
  state: GameState,
  suspect: GuestId,
  lie: MessageId | undefined,
): Step => {
  if (!lookups(caseData).guests.has(suspect)) {
    return reject(state, 'invalid')
  }
  if (lie !== undefined && Option.isNone(findMessage(state, lie))) {
    return reject(state, 'unknownMessage')
  }
  const record =
    lie === undefined
      ? undefined
      : state.caught.find(
          caught =>
            caught.guest === suspect &&
            (caught.claimMessageId === lie ||
              state.answers.some(
                answer =>
                  answer.id === caught.answerId &&
                  (answer.messageIds.includes(lie) ||
                    answer.pressedMessageIds.includes(lie)),
              )),
        )
  if (lie !== undefined && record === undefined) {
    return reject(state, 'notCaught')
  }
  const contradiction =
    record === undefined
      ? undefined
      : caseData.contradictions.find(c => c.id === record.contradiction)
  const ending: Ending =
    suspect !== caseData.thief
      ? 'wrongPerson'
      : contradiction?.concernsTheft === true
        ? 'caseClosed'
        : 'theyWalk'

  const closed = stage(caseData, { state, out: [] }, step =>
    update(step, {
      phase: 'arrest',
      ticksLeft: 0,
      arrest: {
        suspect,
        ending,
        ...(contradiction === undefined
          ? {}
          : { contradiction: contradiction.id }),
      },
    }),
  )
  return emit(
    closed,
    ServerMessage.cases.ArrestResult.make({
      result: caseResult(caseData, closed.state),
    }),
  )
}

const factText = (caseData: Case, id: FactId): string =>
  caseData.facts.find(fact => fact.id === id)?.text ?? id

// NOTE: the thief's lie about the theft and its proof: the pair the
// detective caught, or else the one they came closest to.
const solutionFor = (
  caseData: Case,
  state: GameState,
): Option.Option<Solution> => {
  const caught = new Set(state.caught.map(record => record.contradiction))
  const seen = new Set(state.seen)
  const saved = savedFacts(state)
  const score = (id: ContradictionId, claim: FactId, proof: FactId): number =>
    caught.has(id)
      ? 10
      : (seen.has(claim) ? 1 : 0) +
        (seen.has(proof) ? 1 : 0) +
        (saved.has(proof) ? 1 : 0)
  const best = caseData.contradictions
    .filter(c => c.suspect === caseData.thief && c.concernsTheft)
    .reduce<Option.Option<{ score: number; claim: FactId; proof: FactId }>>(
      (current, c) => {
        const candidate = {
          score: score(c.id, c.claimFact, c.proofFact),
          claim: c.claimFact,
          proof: c.proofFact,
        }
        return Option.isSome(current) && current.value.score >= candidate.score
          ? current
          : Option.some(candidate)
      },
      Option.none(),
    )
  return Option.map(best, ({ claim, proof }) => ({
    claim: factText(caseData, claim),
    proof: factText(caseData, proof),
  }))
}

const savedFacts = (state: GameState): ReadonlySet<FactId> =>
  new Set(
    state.messages
      .filter(stored => state.caseFile.includes(stored.message.id))
      .flatMap(stored => stored.factIds),
  )

const findableCache = new WeakMap<Case, ReadonlySet<FactId>>()

// NOTE: every fact some message in the case can carry.
const findableFacts = (caseData: Case): ReadonlySet<FactId> => {
  const cached = findableCache.get(caseData)
  if (cached !== undefined) {
    return cached
  }
  const bubbles = (answer: Answer) => [
    ...answer.lines,
    ...answer.pressed,
    ...(answer.caught ?? []),
  ]
  const found = new Set<FactId>([
    ...caseData.guests.flatMap(guest =>
      guest.questions.flatMap(question =>
        allAnswers(question)
          .flatMap(bubbles)
          .flatMap(line => line.factIds),
      ),
    ),
    ...caseData.groupQuestions.flatMap(q => q.replies.flatMap(l => l.factIds)),
    ...caseData.beats.flatMap(beat => beat.lines.flatMap(l => l.factIds)),
    ...caseData.wifiLog.flatMap(entry => entry.factIds),
  ])
  findableCache.set(caseData, found)
  return found
}

export const caseResult = (caseData: Case, state: GameState): CaseResult => {
  const findable = findableFacts(caseData)
  const seen = new Set(state.seen)
  const saved = savedFacts(state)
  const evidenceFor = (factIds: ReadonlyArray<FactId>): Evidence => {
    const evidence = factIds.filter(fact => findable.has(fact))
    return evidence.length === 0
      ? 'none'
      : evidence.some(fact => saved.has(fact))
        ? 'saved'
        : evidence.some(fact => seen.has(fact))
          ? 'seen'
          : 'missed'
  }
  const solution = solutionFor(caseData, state)
  return {
    ending: state.arrest?.ending ?? 'theyWalk',
    thief: caseData.thief,
    ...(Option.isSome(solution) ? { solution: solution.value } : {}),
    timeline: caseData.timeline.map(event => ({
      night: event.night,
      time: event.time,
      text: event.text,
      evidence: evidenceFor(event.factIds),
    })),
    tally: {
      questionsAsked: state.asked.length,
      liesCaught: new Set(state.caught.map(record => record.contradiction))
        .size,
      wrongProofs: Object.values(state.wrongProofs).reduce((a, b) => a + b, 0),
    },
  }
}

// START AND SNAPSHOT

export const startGame = (caseData: Case): GameState => {
  const empty: GameState = {
    caseId: caseData.id,
    day: 1,
    part: 'morning',
    phase: 'asking',
    ticksLeft: caseData.budget.morning,
    messages: [],
    nextMessageId: 1,
    seen: [],
    asked: [],
    answers: [],
    caught: [],
    quiet: [],
    wrongProofs: {},
    chips: [],
    lastAsked: {},
    caseFile: [],
    lastActionAt: 0,
  }
  const started = syncChips(
    caseData,
    startPart(caseData, { state: empty, out: [] }).state,
  )
  // NOTE: nothing on the first menus is new.
  return {
    ...started,
    lastAsked: Object.fromEntries(
      lookups(caseData).threads.map(({ key }) => [key, started.nextMessageId]),
    ),
  }
}

export const snapshot = (caseData: Case, state: GameState): ServerMessage =>
  ServerMessage.cases.Snapshot.make({
    intro: {
      title: caseData.setting.title,
      premise: caseData.setting.premise,
      missingItem: caseData.setting.missingItem,
    },
    guests: caseData.guests.map(guest => ({
      id: guest.id,
      name: guest.name,
      role: guest.role,
      status: statusOf(state, guest),
    })),
    messages: state.messages.map(stored => stored.message),
    menus: menusOf(caseData, state),
    caseFile: state.caseFile,
    pressed: state.answers.filter(answer => answer.pressed).map(a => a.id),
    caught: state.caught.map(toCaughtLie),
    clock: clockOf(caseData, state),
    ...(state.arrest === undefined
      ? {}
      : { result: caseResult(caseData, state) }),
  })

// HANDLE

export const handle = (
  caseData: Case,
  state: GameState,
  message: ClientMessage,
  now: number,
): Step => {
  if (message._tag === 'Resume') {
    return { state, out: [snapshot(caseData, state)] }
  }
  if (state.arrest !== undefined) {
    return reject(state, 'notNow')
  }
  switch (message._tag) {
    case 'AskQuestion':
      return askQuestion(caseData, state, message.thread, message.chipId, now)
    case 'Press':
      return press(caseData, state, message.messageId, now)
    case 'ShowProof':
      return showProof(
        caseData,
        state,
        message.messageId,
        message.proofMessageId,
        now,
      )
    case 'SaveToCaseFile':
      return changeCaseFile(state, message.messageId, caseFile =>
        caseFile.includes(message.messageId)
          ? caseFile
          : [...caseFile, message.messageId],
      )
    case 'RemoveFromCaseFile':
      return changeCaseFile(state, message.messageId, caseFile =>
        caseFile.filter(id => id !== message.messageId),
      )
    case 'SkipPart':
      return skipPart(caseData, state)
    case 'GoToSleep':
      return goToSleep(caseData, state)
    case 'Arrest':
      return arrest(caseData, state, message.suspect, message.lie)
  }
}

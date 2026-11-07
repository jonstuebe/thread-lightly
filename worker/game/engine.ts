// NOTE: the game rules for one case (docs/design.md, sections 2, 4, 5 and 8).
// `handle` takes the stored state and one client message and returns the next
// state plus the messages to send. Model calls go through the Router,
// SmallTalk and Composer services; everything else is pure.

import { Array, Effect, Option, pipe } from 'effect'

import {
  type Case,
  type Contradiction,
  DAYS,
  type Day,
  type FactId,
  type Guest,
  type GuestId,
  LAST_DAY,
  type Reply,
  type Topic,
  type TopicId,
} from '../../shared/case'
import {
  type CaseResult,
  type ChatMessage,
  ClientMessage,
  type Ending,
  type Evidence,
  type GuestStatus,
  type MessageBody,
  type MessageId,
  type RejectionReason,
  type Sender,
  ServerMessage,
  type Solution,
  type Thread,
} from '../../shared/protocol'
import {
  activeReplies,
  destroyedFacts,
  sightingsOn,
} from '../../shared/replies'
import {
  type Ai,
  CONFIDENCE_THRESHOLD,
  INJECTION_THRESHOLD,
  MAX_GROUP_RESPONDERS,
  Composer,
  type Composed,
  Router,
  SMALLTALK,
  SmallTalk,
  type Turn,
} from './ai'
import { PATIENCE, type Patience } from './patience'
import type { GameState, StoredMessage } from './state'

export const DAY_START_MINUTES = 9 * 60
export const MINUTES_PER_MESSAGE = 20
export const MIN_SEND_INTERVAL_MS = 750
const RECENT_MESSAGES = 4
const PRESSED_KEY = 'pressed'

// NOTE: a day's idle beats play in order as the clock passes these times
// (11:20am, 2pm, 4:40pm), so the group chat stirs while the detective is busy
// in DMs. A day can have at most three.
export const IDLE_BEAT_MINUTES: ReadonlyArray<number> = [
  11 * 60 + 20,
  14 * 60,
  16 * 60 + 40,
]

export type Step = Readonly<{
  state: GameState
  out: ReadonlyArray<ServerMessage>
}>

// STEP HELPERS

const emit = (step: Step, ...messages: ReadonlyArray<ServerMessage>): Step => ({
  ...step,
  out: [...step.out, ...messages],
})

const reject = (state: GameState, reason: RejectionReason): Step => ({
  state,
  out: [ServerMessage.cases.Rejected.make({ reason })],
})

const post = (
  step: Step,
  thread: Thread,
  sender: Sender,
  body: MessageBody,
  factIds: ReadonlyArray<FactId>,
): Step => {
  const message: ChatMessage = {
    id: `m${step.state.nextMessageId}`,
    thread,
    sender,
    body,
    day: step.state.day,
  }
  return emit(
    {
      ...step,
      state: {
        ...step.state,
        nextMessageId: step.state.nextMessageId + 1,
        messages: [...step.state.messages, { message, factIds }],
      },
    },
    ServerMessage.cases.MessagePosted.make({ message }),
  )
}

const text = (value: string): MessageBody => ({ _tag: 'Text', text: value })

const direct = (guest: GuestId): Thread => ({ _tag: 'Direct', guest })

const GROUP: Thread = { _tag: 'Group' }

const sameThread = (a: Thread, b: Thread): boolean =>
  a._tag === b._tag &&
  (a._tag !== 'Direct' || (b._tag === 'Direct' && a.guest === b.guest))

// GUEST STATUS

export const bedtimeMinutes = (bedtime: string): number => {
  const [hours = 0, minutes = 0] = Array.map(bedtime.split(':'), Number)
  return (hours < 12 ? hours + 24 : hours) * 60 + minutes
}

const traitsOf = (guest: Guest): Patience => PATIENCE[guest.temperament]

const patienceOf = (state: GameState, guest: Guest): number =>
  state.patience[guest.id] ?? 0

export const statusOf = (state: GameState, guest: Guest): GuestStatus => {
  if (state.phase !== 'day' || state.ending !== undefined) {
    return 'asleep'
  }
  if (state.minutes >= bedtimeMinutes(guest.bedtime)) {
    return 'asleep'
  }
  const patience = patienceOf(state, guest)
  if (patience <= 0) {
    return 'leftOnRead'
  }
  if (patience <= traitsOf(guest).perDay / 3) {
    return 'annoyed'
  }
  return 'available'
}

type Statuses = ReadonlyMap<GuestId, GuestStatus>

const statuses = (caseData: Case, state: GameState): Statuses =>
  new Map(
    Array.map(caseData.guests, guest => [guest.id, statusOf(state, guest)]),
  )

const announceStatusChanges = (
  caseData: Case,
  before: Statuses,
  step: Step,
): Step =>
  Array.reduce(caseData.guests, step, (current, guest) => {
    const status = statusOf(current.state, guest)
    if (before.get(guest.id) === status) {
      return current
    }
    const announced = emit(
      current,
      ServerMessage.cases.GuestStatusChanged.make({ guest: guest.id, status }),
    )
    return status === 'asleep' && current.state.phase === 'day'
      ? post(
          announced,
          direct(guest.id),
          { _tag: 'Guest', guest: guest.id },
          text(guest.dictionary.goodnight),
          [],
        )
      : announced
  })

// DAYS

const beginDay = (caseData: Case, step: Step, day: Day): Step => {
  const before = statuses(caseData, step.state)
  const started: Step = {
    ...step,
    state: {
      ...step.state,
      day,
      phase: 'day',
      minutes: DAY_START_MINUTES,
      patience: Object.fromEntries(
        Array.map(caseData.guests, guest => [guest.id, traitsOf(guest).perDay]),
      ),
    },
  }
  const withWifi = pipe(
    caseData.wifiLog,
    Array.filter(entry => entry.night === day - 1),
    Array.reduce(started, (current, entry) =>
      post(
        current,
        { _tag: 'WifiLog' },
        { _tag: 'Lodge' },
        {
          _tag: 'WifiEntry',
          time: entry.time,
          guest: entry.guest,
          event: entry.event,
          accessPoint: entry.accessPoint,
        },
        entry.factIds,
      ),
    ),
  )
  const withBeat = pipe(
    caseData.groupBeats,
    Array.filter(
      beat => beat.trigger._tag === 'Morning' && beat.trigger.day === day,
    ),
    Array.flatMap(beat => beat.lines),
    Array.reduce(withWifi, (current, line) =>
      post(
        current,
        GROUP,
        { _tag: 'Guest', guest: line.guest },
        text(line.text),
        line.factIds,
      ),
    ),
  )
  return announceStatusChanges(
    caseData,
    before,
    emit(
      withBeat,
      ServerMessage.cases.PhaseChanged.make({ day, phase: 'day' }),
    ),
  )
}

const playIdleBeats = (
  caseData: Case,
  step: Step,
  fromMinutes: number,
): Step => {
  const toMinutes = step.state.minutes
  return pipe(
    caseData.groupBeats,
    Array.filter(
      beat =>
        beat.trigger._tag === 'Idle' && beat.trigger.day === step.state.day,
    ),
    Array.filter((_, index) => {
      const slot = IDLE_BEAT_MINUTES[index]
      return slot !== undefined && fromMinutes < slot && slot <= toMinutes
    }),
    Array.flatMap(beat => beat.lines),
    Array.reduce(step, (current, line) =>
      pipe(
        caseData.guests,
        Array.findFirst(guest => guest.id === line.guest),
        Option.filter(guest => statusOf(current.state, guest) !== 'asleep'),
        Option.match({
          onNone: () => current,
          onSome: guest =>
            post(
              current,
              GROUP,
              { _tag: 'Guest', guest: guest.id },
              text(line.text),
              line.factIds,
            ),
        }),
      ),
    ),
  )
}

export const startGame = (caseData: Case): GameState =>
  beginDay(
    caseData,
    {
      state: {
        caseId: caseData.id,
        day: 1,
        phase: 'morning',
        minutes: DAY_START_MINUTES,
        patience: {},
        asks: {},
        dodges: {},
        messages: [],
        caseFile: [],
        nextMessageId: 1,
        lastSentAt: 0,
      },
      out: [],
    },
    1,
  ).state

const endDay = (caseData: Case, state: GameState): Step => {
  if (state.phase !== 'day') {
    return reject(state, 'notNow')
  }
  const before = statuses(caseData, state)
  if (state.day === LAST_DAY) {
    const arrest: Step = {
      state: { ...state, phase: 'arrest' },
      out: [
        ServerMessage.cases.PhaseChanged.make({
          day: state.day,
          phase: 'arrest',
        }),
      ],
    }
    return announceStatusChanges(caseData, before, arrest)
  }
  const nextDay = Array.findFirst(DAYS, day => day === state.day + 1)
  return Option.match(nextDay, {
    onNone: () => reject(state, 'notNow'),
    onSome: day =>
      beginDay(
        caseData,
        {
          state: { ...state, phase: 'night' },
          out: [
            ServerMessage.cases.PhaseChanged.make({
              day: state.day,
              phase: 'night',
            }),
          ],
        },
        day,
      ),
  })
}

// SNAPSHOT

// NOTE: facts some message could carry on some day. The theft itself and
// anything only in the timeline aren't evidence, so they never count as missed.
const findableFacts = (caseData: Case): ReadonlySet<FactId> =>
  new Set(
    Array.flatMap(DAYS, day =>
      Array.map(sightingsOn(caseData, day), sighting => sighting.fact),
    ),
  )

const factsIn = (messages: ReadonlyArray<StoredMessage>): ReadonlySet<FactId> =>
  new Set(Array.flatMap(messages, stored => stored.factIds))

const evidenceFor = (
  facts: ReadonlyArray<FactId>,
  findable: ReadonlySet<FactId>,
  seen: ReadonlySet<FactId>,
  saved: ReadonlySet<FactId>,
): Evidence => {
  const clues = Array.filter(facts, fact => findable.has(fact))
  if (Array.isReadonlyArrayEmpty(clues)) {
    return 'none'
  }
  if (Array.some(clues, fact => saved.has(fact))) {
    return 'saved'
  }
  return Array.some(clues, fact => seen.has(fact)) ? 'seen' : 'missed'
}

const factText = (caseData: Case, id: FactId): string =>
  pipe(
    caseData.facts,
    Array.findFirst(fact => fact.id === id),
    Option.match({ onNone: () => id, onSome: fact => fact.text }),
  )

// NOTE: the pair the detective used, or else the thief's theft contradiction
// they came closest to: both halves seen beats one, and case order breaks ties.
const pickSolution = (
  caseData: Case,
  seen: ReadonlySet<FactId>,
  maybeUsed: Option.Option<Contradiction>,
): Option.Option<Solution> => {
  const closeness = (contradiction: Contradiction): number =>
    (seen.has(contradiction.claimFact) ? 1 : 0) +
    (seen.has(contradiction.proofFact) ? 1 : 0)
  const candidates = Array.filter(
    caseData.contradictions,
    contradiction =>
      contradiction.suspect === caseData.thief && contradiction.concernsTheft,
  )
  return pipe(
    maybeUsed,
    Option.orElse(() =>
      Array.reduce(candidates, Option.none<Contradiction>(), (best, next) =>
        Option.isSome(best) && closeness(best.value) >= closeness(next)
          ? best
          : Option.some(next),
      ),
    ),
    Option.map(contradiction => ({
      claim: factText(caseData, contradiction.claimFact),
      proof: factText(caseData, contradiction.proofFact),
    })),
  )
}

const caseResult = (
  caseData: Case,
  state: GameState,
  ending: Ending,
  maybeUsed: Option.Option<Contradiction>,
): CaseResult => {
  const findable = findableFacts(caseData)
  const seen = factsIn(state.messages)
  const saved = factsIn(
    Array.filter(state.messages, stored =>
      state.caseFile.includes(stored.message.id),
    ),
  )
  const maybeSolution = pickSolution(caseData, seen, maybeUsed)
  return {
    ending,
    thief: caseData.thief,
    ...(Option.isSome(maybeSolution) ? { solution: maybeSolution.value } : {}),
    timeline: Array.map(caseData.timeline, event => ({
      night: event.night,
      time: event.time,
      text: event.text,
      evidence: evidenceFor(event.factIds, findable, seen, saved),
    })),
  }
}

export const snapshot = (caseData: Case, state: GameState): ServerMessage =>
  ServerMessage.cases.Snapshot.make({
    intro: {
      title: caseData.setting.title,
      premise: caseData.setting.premise,
      missingItem: caseData.setting.missingItem,
    },
    guests: Array.map(caseData.guests, guest => ({
      id: guest.id,
      name: guest.name,
      role: guest.role,
      status: statusOf(state, guest),
    })),
    messages: Array.map(state.messages, stored => stored.message),
    caseFile: state.caseFile,
    day: state.day,
    phase: state.phase,
    ...(state.ending === undefined
      ? {}
      : {
          result: caseResult(
            caseData,
            state,
            state.ending,
            Option.fromUndefinedOr(state.solvedBy),
          ),
        }),
  })

// CASE FILE

const findMessage = (
  state: GameState,
  id: MessageId,
): Option.Option<StoredMessage> =>
  Array.findFirst(state.messages, stored => stored.message.id === id)

const updateCaseFile = (
  state: GameState,
  id: MessageId,
  change: (caseFile: ReadonlyArray<MessageId>) => ReadonlyArray<MessageId>,
): Step =>
  Option.match(findMessage(state, id), {
    onNone: () => reject(state, 'unknownMessage'),
    onSome: () => {
      const caseFile = change(state.caseFile)
      return {
        state: { ...state, caseFile },
        out: [ServerMessage.cases.CaseFileChanged.make({ caseFile })],
      }
    },
  })

// ARREST

export type Verdict = Readonly<{
  ending: Ending
  maybeUsed: Option.Option<Contradiction>
}>

export const judgeArrest = (
  caseData: Case,
  suspect: GuestId,
  claim: StoredMessage,
  proof: StoredMessage,
): Verdict => {
  if (suspect !== caseData.thief) {
    return { ending: 'wrongPerson', maybeUsed: Option.none() }
  }
  const saidBySuspect =
    claim.message.sender._tag === 'Guest' &&
    claim.message.sender.guest === suspect
  const maybeUsed = pipe(
    caseData.contradictions,
    Array.findFirst(
      contradiction =>
        contradiction.suspect === suspect &&
        contradiction.concernsTheft &&
        claim.factIds.includes(contradiction.claimFact) &&
        proof.factIds.includes(contradiction.proofFact),
    ),
    Option.filter(() => saidBySuspect),
  )
  return {
    ending: Option.isSome(maybeUsed) ? 'caseClosed' : 'theyWalk',
    maybeUsed,
  }
}

const makeArrest = (
  caseData: Case,
  state: GameState,
  suspect: GuestId,
  claimMessageId: MessageId,
  proofMessageId: MessageId,
): Step => {
  if (state.phase !== 'day' && state.phase !== 'arrest') {
    return reject(state, 'notNow')
  }
  const saved = (id: MessageId) =>
    state.caseFile.includes(id) ? findMessage(state, id) : Option.none()
  const isGuest = Array.some(caseData.guests, guest => guest.id === suspect)
  return pipe(
    Option.all({ claim: saved(claimMessageId), proof: saved(proofMessageId) }),
    Option.filter(() => isGuest && claimMessageId !== proofMessageId),
    Option.match({
      onNone: () => reject(state, 'invalid'),
      onSome: ({ claim, proof }) => {
        const { ending, maybeUsed } = judgeArrest(
          caseData,
          suspect,
          claim,
          proof,
        )
        const closed: GameState = {
          ...state,
          phase: 'arrest',
          ending,
          ...(Option.isSome(maybeUsed) ? { solvedBy: maybeUsed.value } : {}),
        }
        return {
          state: closed,
          out: [
            ServerMessage.cases.ArrestResult.make({
              result: caseResult(caseData, closed, ending, maybeUsed),
            }),
          ],
        }
      },
    }),
  )
}

// ANSWERING

type Answer = Readonly<{
  reply: Reply
  cost: number
  topics: ReadonlyArray<TopicId>
  dodged: boolean
}>

const recentTurns = (
  caseData: Case,
  state: GameState,
  thread: Thread,
): ReadonlyArray<Turn> =>
  pipe(
    state.messages,
    Array.filter(stored => sameThread(stored.message.thread, thread)),
    Array.takeRight(RECENT_MESSAGES),
    Array.flatMap(({ message }) => {
      if (message.body._tag !== 'Text') {
        return []
      }
      const sender = message.sender
      const from =
        sender._tag === 'Guest'
          ? pipe(
              caseData.guests,
              Array.findFirst(guest => guest.id === sender.guest),
              Option.match({
                onNone: () => 'guest',
                onSome: guest => guest.name,
              }),
            )
          : 'detective'
      return [{ from, text: message.body.text }]
    }),
  )

const pickRotating = <A>(
  items: ReadonlyArray<A>,
  turn: number,
): Option.Option<A> =>
  Array.isReadonlyArrayEmpty(items)
    ? Option.none()
    : Array.get(items, turn % items.length)

const dodge = (state: GameState, guest: Guest, cost: number): Answer => ({
  reply: {
    text: Option.getOrElse(
      pickRotating(guest.dictionary.dodges, state.dodges[guest.id] ?? 0),
      () => '…',
    ),
    factIds: [],
  },
  cost,
  topics: [],
  dodged: true,
})

const pleasantry = (
  state: GameState,
  guest: Guest,
  thread: Thread,
  cost: number,
): Answer => {
  const detectiveMessagesToday = Array.filter(
    state.messages,
    ({ message }) =>
      message.day === state.day &&
      message.sender._tag === 'Detective' &&
      sameThread(message.thread, thread),
  ).length
  const lines =
    detectiveMessagesToday > 1
      ? guest.dictionary.thanks
      : guest.dictionary.greetings
  return {
    reply: {
      text: Option.getOrElse(
        pickRotating(lines, detectiveMessagesToday),
        () => '…',
      ),
      factIds: [],
    },
    cost,
    topics: [],
    dodged: false,
  }
}

const factsOf = (
  caseData: Case,
  reply: Reply,
): ReadonlyArray<Readonly<{ id: FactId; text: string }>> =>
  Array.filter(caseData.facts, fact => reply.factIds.includes(fact.id)).map(
    fact => ({ id: fact.id, text: fact.text }),
  )

type MenuEntry = Readonly<{ topic: TopicId; reply: Reply }>

// NOTE: what the guest could say right now, one reply per topic. Secret topics
// stay off the menu unless the router picked one with confidence, so a vague
// question can't stumble into a secret.
const menuOf = (
  caseData: Case,
  state: GameState,
  guest: Guest,
  topics: ReadonlyArray<Topic>,
  confident: Option.Option<TopicId>,
): ReadonlyArray<MenuEntry> => {
  const destroyed = destroyedFacts(caseData, state.day)
  const annoyed = statusOf(state, guest) === 'annoyed'
  const asks = state.asks[guest.id] ?? []
  return Array.flatMap(topics, topic => {
    const isConfident = Option.contains(confident, topic.id)
    if (topic.subject._tag === 'Secret' && !isConfident) {
      return []
    }
    const replies =
      annoyed && topic.lowPatience !== undefined
        ? activeReplies({ variants: topic.lowPatience }, state.day, destroyed)
        : activeReplies(topic, state.day, destroyed)
    const timesAsked = Array.filter(asks, ask => ask.topic === topic.id).length
    return Option.match(pickRotating(replies, timesAsked), {
      onNone: () => [],
      onSome: reply => [{ topic: topic.id, reply }],
    })
  })
}

const answer = (
  caseData: Case,
  state: GameState,
  guest: Guest,
  thread: Thread,
  message: string,
  recent: ReadonlyArray<Turn>,
): Effect.Effect<Answer, never, Ai> =>
  Effect.gen(function* () {
    const router = yield* Router
    const smallTalk = yield* SmallTalk
    const composer = yield* Composer
    const traits = traitsOf(guest)
    const topics = Array.filter(
      guest.dictionary.topics,
      topic => thread._tag !== 'Group' || topic.visibility === 'public',
    )
    const maybeRouting = yield* Effect.option(
      router.route({ guest, topics, recent, text: message }),
    )
    if (Option.isNone(maybeRouting)) {
      return dodge(state, guest, traits.costs.neutral)
    }
    const routing = maybeRouting.value
    const baseCost = traits.costs[routing.tone]
    const confident = routing.confidence >= CONFIDENCE_THRESHOLD

    if (routing.injection >= INJECTION_THRESHOLD) {
      return dodge(state, guest, baseCost)
    }

    if (confident && routing.topic === SMALLTALK) {
      const maybeSmallTalk = yield* Effect.option(
        smallTalk.reply({ guest, recent, text: message }),
      )
      return Option.match(maybeSmallTalk, {
        onNone: () => dodge(state, guest, baseCost),
        onSome: line => ({
          reply: { text: line, factIds: [] },
          cost: baseCost,
          topics: [],
          dodged: false,
        }),
      })
    }

    const confidentTopic = Option.filter(
      Array.findFirst(topics, topic => topic.id === routing.topic),
      () => confident,
    )
    const asks = state.asks[guest.id] ?? []
    const costFor = (picked: ReadonlyArray<TopicId>): number =>
      Array.some(
        asks,
        ask => ask.day === state.day && picked.includes(ask.topic),
      )
        ? baseCost + traits.costs.repeated
        : baseCost
    const fallback = (): Answer =>
      routing.tone === 'friendly'
        ? pleasantry(state, guest, thread, baseCost)
        : dodge(state, guest, baseCost)

    // NOTE: an accusation gets the pressed reply, reworded to fit. It answers
    // any accusation, so it posts as written if the composer can't use it.
    if (routing.tone === 'accusatory' && Option.isSome(confidentTopic)) {
      const destroyed = destroyedFacts(caseData, state.day)
      const maybePressed = pickRotating(
        activeReplies(guest.dictionary.pressed, state.day, destroyed),
        Array.filter(asks, ask => ask.topic === confidentTopic.value.id).length,
      )
      if (Option.isNone(maybePressed)) {
        return dodge(state, guest, costFor([confidentTopic.value.id]))
      }
      const pressed = maybePressed.value
      const composed = yield* pipe(
        composer.compose({
          guest,
          menu: [
            {
              key: PRESSED_KEY,
              text: pressed.text,
              facts: factsOf(caseData, pressed),
            },
          ],
          hint: Option.some(PRESSED_KEY),
          recent,
          text: message,
        }),
        Effect.option,
      )
      return {
        reply: {
          text: Option.match(composed, {
            onNone: () => pressed.text,
            onSome: result =>
              result._tag === 'Answered' &&
              result.picked.includes(PRESSED_KEY) &&
              Array.every(pressed.factIds, factId =>
                result.kept.includes(factId),
              )
                ? result.text
                : pressed.text,
          }),
          factIds: pressed.factIds,
        },
        cost: costFor([confidentTopic.value.id]),
        topics: [confidentTopic.value.id],
        dodged: false,
      }
    }

    const menu = menuOf(
      caseData,
      state,
      guest,
      topics,
      Option.map(confidentTopic, topic => topic.id),
    )
    const compose = (items: ReadonlyArray<MenuEntry>) =>
      Effect.option(
        composer.compose({
          guest,
          menu: Array.map(items, ({ topic, reply }) => ({
            key: topic,
            text: reply.text,
            facts: factsOf(caseData, reply),
          })),
          hint: Option.map(confidentTopic, topic => topic.id),
          recent,
          text: message,
        }),
      )
    const keepsAll = (
      composed: Composed,
      item: MenuEntry,
    ): composed is Extract<Composed, { _tag: 'Answered' }> =>
      composed._tag === 'Answered' &&
      composed.picked.includes(item.topic) &&
      Array.every(item.reply.factIds, factId => composed.kept.includes(factId))
    const maybeComposed = yield* compose(menu)

    const confidentItem = Option.flatMap(confidentTopic, topic =>
      Array.findFirst(menu, item => item.topic === topic.id),
    )
    const verbatim = ({ topic, reply }: MenuEntry): Answer => ({
      reply,
      cost: costFor([topic]),
      topics: [topic],
      dodged: false,
    })

    // NOTE: the composer is down or broke the facts, so fall back to the
    // router's confident pick verbatim, as before the composer existed.
    if (Option.isNone(maybeComposed)) {
      return Option.match(confidentItem, { onNone: fallback, onSome: verbatim })
    }

    const composed = maybeComposed.value
    if (composed._tag === 'Unanswered') {
      return fallback()
    }
    const picked = Array.filter(menu, item =>
      composed.picked.includes(item.topic),
    )

    // NOTE: the solvability checker assumes a question routed to a topic gets
    // that topic's facts. If the composer used the confident topic but trimmed
    // some away, compose once more from that reply alone. If that trims too,
    // the question was narrower than the topic: post the first answer, which
    // carries only what it says, rather than a canned line that doesn't answer.
    const shortened = Option.filter(
      confidentItem,
      item => picked.includes(item) && !keepsAll(composed, item),
    )
    if (Option.isSome(shortened)) {
      const item = shortened.value
      const retried = yield* compose([item])
      if (Option.isSome(retried) && keepsAll(retried.value, item)) {
        return {
          ...verbatim(item),
          reply: { text: retried.value.text, factIds: item.reply.factIds },
        }
      }
    }
    const pickedTopics = Array.map(picked, item => item.topic)
    return {
      reply: {
        text: composed.text,
        factIds: Array.filter(
          Array.dedupe(Array.flatMap(picked, item => item.reply.factIds)),
          factId => composed.kept.includes(factId),
        ),
      },
      cost: costFor(pickedTopics),
      topics: pickedTopics,
      dodged: false,
    }
  })

const applyAnswer = (
  step: Step,
  guest: Guest,
  thread: Thread,
  given: Answer,
): Step => {
  const state = step.state
  const patience = Math.min(
    traitsOf(guest).perDay,
    patienceOf(state, guest) - given.cost,
  )
  const asks = [
    ...(state.asks[guest.id] ?? []),
    ...Array.map(given.topics, topic => ({ day: state.day, topic })),
  ]
  const charged: Step = {
    ...step,
    state: {
      ...state,
      patience: { ...state.patience, [guest.id]: patience },
      asks: { ...state.asks, [guest.id]: asks },
      dodges: given.dodged
        ? { ...state.dodges, [guest.id]: (state.dodges[guest.id] ?? 0) + 1 }
        : state.dodges,
    },
  }
  return post(
    emit(charged, ServerMessage.cases.Typing.make({ thread, guest: guest.id })),
    thread,
    { _tag: 'Guest', guest: guest.id },
    text(given.reply.text),
    given.reply.factIds,
  )
}

// SENDING

const canReply = (status: GuestStatus): boolean =>
  status === 'available' || status === 'annoyed'

const sendMessage = (
  caseData: Case,
  state: GameState,
  thread: Thread,
  message: string,
  now: number,
): Effect.Effect<Step, never, Ai> =>
  Effect.gen(function* () {
    if (state.phase !== 'day') {
      return reject(state, 'notNow')
    }
    if (now - state.lastSentAt < MIN_SEND_INTERVAL_MS) {
      return reject(state, 'tooFast')
    }
    if (thread._tag === 'WifiLog') {
      return reject(state, 'invalid')
    }
    const maybeGuest =
      thread._tag === 'Direct'
        ? Array.findFirst(caseData.guests, guest => guest.id === thread.guest)
        : Option.none()
    if (thread._tag === 'Direct' && Option.isNone(maybeGuest)) {
      return reject(state, 'invalid')
    }

    const recent = recentTurns(caseData, state, thread)
    const before = statuses(caseData, state)
    const sent = announceStatusChanges(
      caseData,
      before,
      post(
        {
          state: {
            ...state,
            lastSentAt: now,
            minutes: state.minutes + MINUTES_PER_MESSAGE,
          },
          out: [],
        },
        thread,
        { _tag: 'Detective' },
        text(message),
        [],
      ),
    )

    const responders = Option.isSome(maybeGuest)
      ? Array.filter([maybeGuest.value], guest =>
          canReply(statusOf(sent.state, guest)),
        )
      : yield* groupResponders(caseData, sent.state, recent, message)

    const answers = yield* Effect.forEach(responders, guest =>
      Effect.map(
        answer(caseData, sent.state, guest, thread, message, recent),
        given => ({ guest, given }),
      ),
    )

    const afterReplies = playIdleBeats(
      caseData,
      Array.reduce(answers, sent, (current, { guest, given }) =>
        applyAnswer(current, guest, thread, given),
      ),
      state.minutes,
    )
    return announceStatusChanges(
      caseData,
      statuses(caseData, sent.state),
      afterReplies,
    )
  })

const groupResponders = (
  caseData: Case,
  state: GameState,
  recent: ReadonlyArray<Turn>,
  message: string,
): Effect.Effect<ReadonlyArray<Guest>, never, Router> =>
  Effect.gen(function* () {
    const router = yield* Router
    const awake = Array.filter(caseData.guests, guest =>
      canReply(statusOf(state, guest)),
    )
    if (Array.isReadonlyArrayEmpty(awake)) {
      return []
    }
    const picked = yield* pipe(
      router.pickResponders({ guests: awake, recent, text: message }),
      Effect.orElseSucceed(() => []),
    )
    return pipe(
      Array.dedupe(picked),
      Array.flatMap(id => Array.filter(awake, guest => guest.id === id)),
      Array.take(MAX_GROUP_RESPONDERS),
    )
  })

// HANDLE

export const handle = (
  caseData: Case,
  state: GameState,
  message: ClientMessage,
  now: number,
): Effect.Effect<Step, never, Ai> => {
  if (state.ending !== undefined && message._tag !== 'Resume') {
    return Effect.succeed(reject(state, 'notNow'))
  }
  return ClientMessage.match(message, {
    Resume: () => Effect.succeed({ state, out: [snapshot(caseData, state)] }),
    SendMessage: ({ thread, text: body }) =>
      sendMessage(caseData, state, thread, body, now),
    SaveToCaseFile: ({ messageId }) =>
      Effect.succeed(
        updateCaseFile(state, messageId, caseFile =>
          caseFile.includes(messageId) ? caseFile : [...caseFile, messageId],
        ),
      ),
    RemoveFromCaseFile: ({ messageId }) =>
      Effect.succeed(
        updateCaseFile(state, messageId, caseFile =>
          Array.filter(caseFile, id => id !== messageId),
        ),
      ),
    EndDay: () => Effect.succeed(endDay(caseData, state)),
    MakeArrest: ({ suspect, claimMessageId, proofMessageId }) =>
      Effect.succeed(
        makeArrest(caseData, state, suspect, claimMessageId, proofMessageId),
      ),
  })
}

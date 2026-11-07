import { Array, Effect, Option, Random, String } from 'effect'

import {
  GUEST_NAMES,
  type GuestName,
  type LineKind,
  dayName,
  guestOf,
} from './cast'
import { Beat, Line, Situation, Vote, Voter } from './model'

// PACING

const WORDS_PER_MINUTE = 170
const MIN_READ_MILLIS = 1300
const MAX_TYPING_MILLIS = 1800

export const readMillis = (text: string): number =>
  Math.max(
    MIN_READ_MILLIS,
    Math.round(
      (String.split(text.trim(), /\s+/).length * 60000) / WORDS_PER_MINUTE,
    ),
  )

export const typingMillis = (text: string): number =>
  Math.min(MAX_TYPING_MILLIS, 700 + text.length * 18)

export const VOTE_REVEAL_MILLIS = 800
export const CHECK_RESULT_HOLD_MILLIS = 4500
export const DEPARTURE_HOLD_MILLIS = 1300

// SCRIPTS

const guestSays = (from: GuestName, text: string): Beat =>
  Beat.GuestSays({ line: Line.make({ from, text }) })

const showEvent = (text: string): Beat =>
  Beat.ShowEvent({ text, holdMillis: readMillis(text) })

export const introScript = (playerName: string): ReadonlyArray<Beat> => [
  Beat.ShowTimestamp({ label: 'Friday', time: '8:42 PM' }),
  guestSays(
    'Margot',
    'Welcome to Pine Hollow everyone!! 🌲 So happy you all made it',
  ),
  guestSays('Lena', 'the lake view is literally unreal 😭'),
  guestSays('Gus', 'Fire’s going in the main room. - Gus'),
  guestSays(
    'Margot',
    'ok slightly awkward… has anyone seen my grandmother’s silver brooch? 😬 It was on the mantel at dinner',
  ),
  guestSays('Priya', 'It was definitely there at dessert. I noticed it.'),
  guestSays('Theo', 'well it didnt walk off'),
  guestSays('Wes', 'I didn’t touch it! Sorry. Nobody said I did. Sorry.'),
  guestSays(
    'Margot',
    `${playerName}, you got in late, did you see anything? 🙏`,
  ),
  Beat.Pause({ millis: 400 }),
  Beat.ShowNotice({
    isPrivate: true,
    title: 'You’re the detective',
    body: 'One of these six guests took the brooch, and they’ll start stealing phones to keep people quiet. Each night, look into one guest. Turn in the thief by Monday.',
    maybeSmall: Option.some(
      'Chat with the group, then tap “Go to bed” when you’re ready for your first night.',
    ),
    holdMillis: 0,
  }),
]

export type MorningInput = Readonly<{
  day: number
  minute: number
  maybeVictim: Option.Option<GuestName>
  maybePending: Option.Option<GuestName>
  thief: GuestName
  wifiLog: ReadonlyArray<GuestName>
}>

const checkNotice = (
  name: GuestName,
  thief: GuestName,
  maybeVictim: Option.Option<GuestName>,
): Beat => {
  const isGuilty = name === thief
  const wasTaken = Option.contains(maybeVictim, name)
  return Beat.ShowNotice({
    isPrivate: true,
    title: isGuilty ? `${name} has the brooch.` : `${name} is clean.`,
    body: isGuilty
      ? `You spotted the velvet brooch box in ${name}’s coat pocket. Now get the group to turn them in.`
      : wasTaken
        ? `${name} was asleep by midnight, and now their phone is gone too.`
        : `${name} was asleep by midnight and their bag checks out.`,
    maybeSmall: Option.none(),
    holdMillis: CHECK_RESULT_HOLD_MILLIS,
  })
}

export const morningScript = (input: MorningInput): ReadonlyArray<Beat> => [
  Beat.ShowTimestamp({
    label: dayName(input.day),
    time: `7:${`${input.minute}`.padStart(2, '0')} AM`,
  }),
  ...Option.match(input.maybeVictim, {
    onNone: () => [
      showEvent(
        'Nobody’s phone went missing overnight. The brooch is still gone.',
      ),
    ],
    onSome: victim => [
      showEvent(`📵 ${victim}’s phone was taken overnight.`),
      Beat.DepartGuest({ name: victim }),
      Beat.ShowEvent({
        text: `${victim} left the conversation.`,
        holdMillis: DEPARTURE_HOLD_MILLIS,
      }),
    ],
  }),
  ...Option.match(input.maybePending, {
    onNone: () => [],
    onSome: name => [checkNotice(name, input.thief, input.maybeVictim)],
  }),
  showEvent(
    `📶 Lodge Wi‑Fi: phones online between 1 and 4 AM were ${Array.join(input.wifiLog, ' and ')}.`,
  ),
  ...(input.day === 3
    ? [showEvent('Everyone checks out tomorrow. Today’s vote is the last one.')]
    : []),
  Beat.AskGuests({
    situation: Situation.Morning({ maybeVictim: input.maybeVictim }),
    count: 6,
    maybeHint: Option.none(),
  }),
]

export type VoteOutcomeInput = Readonly<{
  votes: ReadonlyArray<Vote>
  turnedIn: GuestName
  thief: GuestName
  aliveAfter: ReadonlyArray<GuestName>
  maybeReaction: Option.Option<Line>
  isFinalVote: boolean
}>

export const FINAL_DAY = 3

export const hasInnocentsLeft = (
  alive: ReadonlyArray<GuestName>,
  thief: GuestName,
): boolean => Array.some(alive, name => name !== thief)

export const voteOutcomeScript = (
  input: VoteOutcomeInput,
): ReadonlyArray<Beat> => {
  const reveals = Array.map(input.votes, vote =>
    Beat.RevealVote({ vote, holdMillis: VOTE_REVEAL_MILLIS }),
  )
  const verdict = [
    Beat.Pause({ millis: 700 }),
    showEvent(`${input.turnedIn} was turned in to the lodge manager.`),
    Beat.DepartGuest({ name: input.turnedIn }),
  ]
  if (input.turnedIn === input.thief) {
    return [
      ...reveals,
      ...verdict,
      Beat.Pause({ millis: 500 }),
      showEvent(`The brooch was in ${input.turnedIn}’s coat pocket. 💍`),
      Beat.ShowEnding({ isWin: true }),
    ]
  }
  const departure = showEvent(
    `${input.turnedIn} didn’t have the brooch. ${input.turnedIn} left the conversation.`,
  )
  if (input.isFinalVote || !hasInnocentsLeft(input.aliveAfter, input.thief)) {
    return [
      ...reveals,
      ...verdict,
      departure,
      Beat.Pause({ millis: 500 }),
      showEvent('That night, your phone went missing too. 📵'),
      Beat.ShowEnding({ isWin: false }),
    ]
  }
  return [
    ...reveals,
    ...verdict,
    departure,
    Beat.Pause({ millis: 400 }),
    ...Option.match(input.maybeReaction, {
      onNone: () => [],
      onSome: line => [Beat.GuestSays({ line })],
    }),
    Beat.BeginNight(),
  ]
}

// RANDOM ROLLS

const pickOne = <A>(items: ReadonlyArray<A>): Effect.Effect<Option.Option<A>> =>
  Array.match(items, {
    onEmpty: () => Effect.succeed(Option.none<A>()),
    onNonEmpty: nonEmpty => Effect.map(Random.choice(nonEmpty), Option.some),
  })

export const dealNewCase = Effect.gen(function* () {
  const seating = yield* Random.shuffle(GUEST_NAMES)
  const thief = yield* Random.choice(GUEST_NAMES)
  return { thief, seating }
})

export const rollMorning = (
  day: number,
  alive: ReadonlyArray<GuestName>,
  thief: GuestName,
) =>
  Effect.gen(function* () {
    const innocents = Array.filter(alive, name => name !== thief)
    const maybeVictim = day > 1 ? yield* pickOne(innocents) : Option.none()
    const innocentsLeft = Array.filter(
      innocents,
      name => !Option.contains(maybeVictim, name),
    )
    const maybeAlibi = yield* pickOne(innocentsLeft)
    const wifiLog = yield* Random.shuffle([
      thief,
      ...Option.toArray(maybeAlibi),
    ])
    const minute = yield* Random.nextIntBetween(40, 58)
    return { maybeVictim, wifiLog, minute }
  })

// LINES

export type LineContext = Readonly<{
  alive: ReadonlyArray<GuestName>
  playerName: string
  usedLines: ReadonlyArray<string>
}>

const fillTemplate = (
  template: string,
  speaker: GuestName,
  maybeVictim: Option.Option<GuestName>,
  context: LineContext,
) =>
  Effect.gen(function* () {
    const others = Array.filter(context.alive, name => name !== speaker)
    const maybeSomeone = yield* pickOne(others)
    const someone = Option.getOrElse(maybeSomeone, () => 'someone')
    const victim = Option.getOrElse(maybeVictim, () => '')
    return template
      .replaceAll('{s}', someone)
      .replaceAll('{you}', context.playerName)
      .replaceAll('{v}', victim)
  })

export const pickLine = (
  speaker: GuestName,
  kind: LineKind,
  maybeVictim: Option.Option<GuestName>,
  context: LineContext,
) =>
  Effect.gen(function* () {
    const fits = (template: string) =>
      Option.isSome(maybeVictim) || !template.includes('{v}')
    const all = Array.filter(guestOf(speaker)[kind], fits)
    const fresh = Array.filter(
      all,
      template => !Array.contains(context.usedLines, template),
    )
    const maybeTemplate = yield* pickOne(
      Array.isArrayNonEmpty(fresh) ? fresh : all,
    )
    const template = Option.getOrElse(maybeTemplate, () => '…')
    const text = yield* fillTemplate(template, speaker, maybeVictim, context)
    return {
      line: Line.make({ from: speaker, text }),
      usedLines: [...context.usedLines, template],
    }
  })

type PickedLines = Readonly<{
  lines: ReadonlyArray<Line>
  usedLines: ReadonlyArray<string>
}>

type LineRequest = Readonly<{
  speaker: GuestName
  kind: LineKind
  maybeVictim: Option.Option<GuestName>
}>

const lineRequest = (
  speaker: GuestName,
  kind: LineKind,
  maybeVictim: Option.Option<GuestName> = Option.none(),
): LineRequest => ({ speaker, kind, maybeVictim })

const pickLines = (
  requests: ReadonlyArray<LineRequest>,
  context: LineContext,
) =>
  Effect.reduce(
    requests,
    (): PickedLines => ({ lines: [], usedLines: context.usedLines }),
    (picked, request) =>
      Effect.map(
        pickLine(request.speaker, request.kind, request.maybeVictim, {
          ...context,
          usedLines: picked.usedLines,
        }),
        next => ({
          lines: [...picked.lines, next.line],
          usedLines: next.usedLines,
        }),
      ),
  )

export const mentionedGuest = (
  text: string,
  alive: ReadonlyArray<GuestName>,
): Option.Option<GuestName> =>
  Array.findFirst(alive, name =>
    text.toLowerCase().includes(name.toLowerCase()),
  )

export const fallbackLines = (situation: Situation, context: LineContext) =>
  Situation.match(situation, {
    Morning: ({ maybeVictim }) =>
      Effect.gen(function* () {
        const speakers = yield* Random.shuffle(context.alive)
        return yield* pickLines(
          Array.map(Array.take(speakers, 5), speaker =>
            lineRequest(speaker, 'chatter', maybeVictim),
          ),
          context,
        )
      }),
    Reply: ({ text }) =>
      Effect.gen(function* () {
        const maybeNamed = mentionedGuest(text, context.alive)
        const maybeOther = yield* pickOne(
          Array.filter(
            context.alive,
            name => !Option.contains(maybeNamed, name),
          ),
        )
        return yield* pickLines(
          [
            ...Option.toArray(
              Option.map(maybeNamed, speaker => lineRequest(speaker, 'defend')),
            ),
            ...Option.toArray(
              Option.map(maybeOther, speaker => lineRequest(speaker, 'react')),
            ),
          ],
          context,
        )
      }),
  })

// VOTING

const guestVote = (
  voter: GuestName,
  playerChoice: GuestName,
  thief: GuestName,
  alive: ReadonlyArray<GuestName>,
  wifiLog: ReadonlyArray<GuestName>,
) =>
  Effect.gen(function* () {
    const candidates = Array.filter(alive, name => name !== voter)
    if (voter === thief) {
      if (playerChoice !== thief) {
        return playerChoice
      }
      const scapegoat = yield* pickOne(
        Array.filter(candidates, name => name !== thief),
      )
      return Option.getOrElse(scapegoat, () => playerChoice)
    }
    const followsPlayer = yield* Random.next
    if (playerChoice !== voter && followsPlayer < 0.6) {
      return playerChoice
    }
    const weighted = Array.flatMap(candidates, name =>
      Array.contains(wifiLog, name) ? [name, name, name] : [name],
    )
    const pick = yield* pickOne(weighted)
    return Option.getOrElse(pick, () => playerChoice)
  })

export type VoteInput = Readonly<{
  choice: GuestName
  thief: GuestName
  alive: ReadonlyArray<GuestName>
  wifiLog: ReadonlyArray<GuestName>
  playerName: string
  usedLines: ReadonlyArray<string>
  isFinalVote: boolean
}>

export const tally = (
  votes: ReadonlyArray<Vote>,
  candidates: ReadonlyArray<GuestName>,
): ReadonlyArray<GuestName> => {
  const countFor = (name: GuestName) =>
    Array.filter(votes, vote => vote.choice === name).length
  const most = Math.max(0, ...Array.map(candidates, countFor))
  return Array.filter(candidates, name => countFor(name) === most)
}

export const castGuestVotes = (input: VoteInput) =>
  Effect.gen(function* () {
    const order = yield* Random.shuffle(input.alive)
    const guestVotes = yield* Effect.forEach(order, voter =>
      Effect.map(
        guestVote(voter, input.choice, input.thief, input.alive, input.wifiLog),
        choice => Vote.make({ voter: Voter.Guest({ name: voter }), choice }),
      ),
    )
    const allVotes = [
      Vote.make({ voter: Voter.Player(), choice: input.choice }),
      ...guestVotes,
    ]
    const tied = tally(allVotes, input.alive)
    const maybeTieBreak = yield* pickOne(tied)
    const turnedIn = Array.contains(tied, input.choice)
      ? input.choice
      : Option.getOrElse(maybeTieBreak, () => input.choice)
    const aliveAfter = Array.filter(input.alive, name => name !== turnedIn)
    const maybeReactor =
      turnedIn !== input.thief &&
      !input.isFinalVote &&
      hasInnocentsLeft(aliveAfter, input.thief)
        ? yield* pickOne(aliveAfter)
        : Option.none<GuestName>()
    const reaction = yield* Option.match(maybeReactor, {
      onNone: () =>
        Effect.succeed({
          maybeLine: Option.none<Line>(),
          usedLines: input.usedLines,
        }),
      onSome: reactor =>
        Effect.map(
          pickLine(reactor, 'react', Option.none(), {
            alive: aliveAfter,
            playerName: input.playerName,
            usedLines: input.usedLines,
          }),
          picked => ({
            maybeLine: Option.some(picked.line),
            usedLines: picked.usedLines,
          }),
        ),
    })
    return {
      votes: guestVotes,
      turnedIn,
      maybeReaction: reaction.maybeLine,
      usedLines: reaction.usedLines,
    }
  })

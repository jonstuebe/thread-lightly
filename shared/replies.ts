// NOTE: the rules for which replies a guest can give on a given day. The
// Durable Object serves replies with these rules and the checker proves a case
// solvable with them, so the two can't disagree.

import { Array, Option, Order, pipe } from 'effect'

import type {
  Case,
  Day,
  FactId,
  GuestId,
  Reply,
  ReplySet,
  Visibility,
} from './case'

export const destroyedFacts = (caseData: Case, day: Day): ReadonlySet<FactId> =>
  new Set(
    Array.flatMap(caseData.nightMoves, move =>
      move._tag === 'Destroy' && move.night < day ? [move.fact] : [],
    ),
  )

const carriesAny =
  (facts: ReadonlySet<FactId>) =>
  (reply: Reply): boolean =>
    Array.some(reply.factIds, factId => facts.has(factId))

export const activeReplies = (
  replySet: ReplySet,
  day: Day,
  destroyed: ReadonlySet<FactId>,
): ReadonlyArray<Reply> => {
  const carriesDestroyed = carriesAny(destroyed)
  const current = pipe(
    replySet.afterNight ?? [],
    Array.filter(override => override.night < day),
    Array.sort(
      Order.mapInput(
        Order.Number,
        (override: { readonly night: number }) => override.night,
      ),
    ),
    Array.last,
    Option.match({
      onNone: () => replySet.variants,
      onSome: override => override.variants,
    }),
  )

  if (!Array.some(current, carriesDestroyed)) {
    return current
  }

  return Array.filter(
    replySet.ifFactDestroyed ?? current,
    reply => !carriesDestroyed(reply),
  )
}

export const allReplies = (replySet: ReplySet): ReadonlyArray<Reply> => [
  ...replySet.variants,
  ...Array.flatMap(replySet.afterNight ?? [], override => override.variants),
  ...(replySet.ifFactDestroyed ?? []),
  ...(replySet.lowPatience ?? []),
]

export type FactSource =
  | Readonly<{ kind: 'guest'; guest: GuestId; visibility: Visibility }>
  | Readonly<{ kind: 'pressed'; guest: GuestId }>
  | Readonly<{ kind: 'wifi' }>
  | Readonly<{ kind: 'group' }>

export type Sighting = Readonly<{ fact: FactId; source: FactSource }>

// NOTE: guest replies count only on the day itself, because the player has to
// ask that day. The Wi-Fi log and morning beats stay readable once published,
// so they count from the day they appear. Idle beats are not guaranteed to
// play, so they never count.
export const sightingsOn = (
  caseData: Case,
  day: Day,
): ReadonlyArray<Sighting> => {
  const destroyed = destroyedFacts(caseData, day)

  const fromGuests = Array.flatMap(caseData.guests, guest => [
    ...Array.flatMap(guest.dictionary.topics, topic =>
      Array.flatMap(activeReplies(topic, day, destroyed), reply =>
        Array.map(reply.factIds, (fact): Sighting => ({
          fact,
          source: {
            kind: 'guest',
            guest: guest.id,
            visibility: topic.visibility,
          },
        })),
      ),
    ),
    ...Array.flatMap(
      activeReplies(guest.dictionary.pressed, day, destroyed),
      reply =>
        Array.map(reply.factIds, (fact): Sighting => ({
          fact,
          source: { kind: 'pressed', guest: guest.id },
        })),
    ),
  ])

  const fromWifi = pipe(
    caseData.wifiLog,
    Array.filter(entry => entry.night < day),
    Array.flatMap(entry =>
      Array.map(entry.factIds, (fact): Sighting => ({
        fact,
        source: { kind: 'wifi' },
      })),
    ),
  )

  const fromGroup = pipe(
    caseData.groupBeats,
    Array.filter(
      beat => beat.trigger._tag === 'Morning' && beat.trigger.day <= day,
    ),
    Array.flatMap(beat => beat.lines),
    Array.flatMap(line =>
      Array.map(line.factIds, (fact): Sighting => ({
        fact,
        source: { kind: 'group' },
      })),
    ),
  )

  return [...fromGuests, ...fromWifi, ...fromGroup]
}

export const isSpokenBy = (source: FactSource, guest: GuestId): boolean =>
  (source.kind === 'guest' || source.kind === 'pressed') &&
  source.guest === guest

// NOTE: pure helpers over the Board: which messages belong to a thread, who
// a guest is, and how long the client holds each incoming message.

import { Array, Option, pipe } from 'effect'

import {
  type CaughtLie,
  type ChatMessage,
  type Clock,
  type GuestId,
  type GuestProfile,
  type MessageId,
  type Part,
  type QuestionChip,
  Thread,
} from '../shared/protocol'
import type { Board } from './model'

// THREADS

export const GROUP = Thread.cases.Group.make({})
export const WIFI_LOG = Thread.cases.WifiLog.make({})
export const direct = (guest: GuestId): Thread =>
  Thread.cases.Direct.make({ guest })

export const threadKey = (thread: Thread): string =>
  Thread.match(thread, {
    Group: () => 'group',
    WifiLog: () => 'wifi',
    Direct: ({ guest }) => `dm-${guest}`,
  })

export const isSameThread = (a: Thread, b: Thread): boolean =>
  threadKey(a) === threadKey(b)

export const threadMessages = (
  board: Board,
  thread: Thread,
): ReadonlyArray<ChatMessage> =>
  Array.filter(board.messages, message => isSameThread(message.thread, thread))

export const findMessage = (
  board: Board,
  id: MessageId,
): Option.Option<ChatMessage> =>
  Array.findFirst(board.messages, message => message.id === id)

export const savedMessages = (board: Board): ReadonlyArray<ChatMessage> =>
  Array.flatMap(board.caseFile, id =>
    Option.match(findMessage(board, id), {
      onNone: () => [],
      onSome: message => [message],
    }),
  )

export const isSaved = (board: Board, id: MessageId): boolean =>
  board.caseFile.includes(id)

// MENUS

export const menuChips = (
  board: Board,
  thread: Thread,
): ReadonlyArray<QuestionChip> =>
  pipe(
    Array.findFirst(board.menus, menu => isSameThread(menu.thread, thread)),
    Option.match({ onNone: () => [], onSome: menu => menu.chips }),
  )

// ANSWERS

export const maybeAnswerId = (message: ChatMessage): Option.Option<string> =>
  message.role._tag === 'Answer'
    ? Option.some(message.role.answerId)
    : Option.none()

const isSameAnswer = (
  board: Board,
  messageId: MessageId,
  other: ChatMessage,
): boolean =>
  other.id === messageId ||
  Option.exists(
    Option.flatMap(findMessage(board, messageId), maybeAnswerId),
    answerId =>
      Option.exists(maybeAnswerId(other), otherId => otherId === answerId),
  )

export const isPressedAnswer = (board: Board, message: ChatMessage): boolean =>
  Option.exists(maybeAnswerId(message), answerId =>
    board.pressed.includes(answerId),
  )

// NOTE: a lie is caught on one bubble, but the whole answer told it.
export const caughtLieOf = (
  board: Board,
  message: ChatMessage,
): Option.Option<CaughtLie> =>
  Array.findFirst(
    board.caught,
    lie =>
      lie.proofMessageId === message.id ||
      isSameAnswer(board, lie.claimMessageId, message),
  )

export const isCaughtAnswer = (board: Board, message: ChatMessage): boolean =>
  Array.some(board.caught, lie =>
    isSameAnswer(board, lie.claimMessageId, message),
  )

export const caughtLiesAgainst = (
  board: Board,
  guest: GuestId,
): ReadonlyArray<CaughtLie> =>
  Array.filter(board.caught, lie => lie.guest === guest)

// TIME

export const PART_NAMES: Readonly<Record<Part, string>> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export const maybeNextPart = (part: Part): Option.Option<Part> =>
  part === 'morning'
    ? Option.some('afternoon')
    : part === 'afternoon'
      ? Option.some('evening')
      : Option.none()

export const clockTitle = (clock: Clock): string =>
  `Day ${clock.day} · ${PART_NAMES[clock.part]}`

export const ticksLabel = (clock: Clock): string =>
  `${clock.ticksLeft} of ${clock.partBudget} ${clock.partBudget === 1 ? 'tick' : 'ticks'} left`

export const isAsking = (board: Board): boolean =>
  board.clock.phase === 'asking' && Option.isNone(board.maybeResult)

// GUESTS

export const findGuest = (
  board: Board,
  id: GuestId,
): Option.Option<GuestProfile> =>
  Array.findFirst(board.guests, guest => guest.id === id)

export const guestName = (board: Board, id: GuestId): string =>
  Option.match(findGuest(board, id), {
    onNone: () => id,
    onSome: guest => guest.name,
  })

export const firstName = (name: string): string => name.split(' ')[0] ?? name

const AVATAR_COLORS: ReadonlyArray<string> = [
  '#c8643a',
  '#3a6fd8',
  '#7d4fc4',
  '#2f8a5f',
  '#c93f72',
  '#9a6b10',
  '#2a8a9a',
  '#6b6f80',
]

export const isAround = (guest: GuestProfile): boolean =>
  guest.status._tag === 'Around'

// NOTE: what a guest's row and header say when they can't be asked.
export const maybeStatusLine = (
  board: Board,
  guest: GuestProfile,
): Option.Option<string> => {
  if (Option.isSome(board.maybeResult)) {
    return Option.none()
  }
  const name = firstName(guest.name)
  const status = guest.status
  return status._tag === 'Away'
    ? Option.some(status.status)
    : status._tag === 'Quiet'
      ? Option.some(`${name} isn’t answering right now`)
      : status._tag === 'Asleep'
        ? Option.some(`${name} is asleep`)
        : Option.none()
}

export const avatarColor = (board: Board, id: GuestId): string =>
  pipe(
    Array.findFirstIndex(board.guests, guest => guest.id === id),
    Option.flatMap(index =>
      Array.get(AVATAR_COLORS, index % AVATAR_COLORS.length),
    ),
    Option.getOrElse(() => '#8e8e93'),
  )

export const initials = (name: string): string =>
  pipe(
    name.split(' '),
    Array.take(2),
    Array.map(part => part.slice(0, 1)),
    Array.join(''),
  )

// TEXT

export const messageText = (board: Board, message: ChatMessage): string => {
  const body = message.body
  return body._tag === 'Text'
    ? body.text
    : `${firstName(guestName(board, body.guest))}'s phone ${body.event} the ${body.accessPoint} access point at ${body.time}`
}

export const senderLabel = (board: Board, message: ChatMessage): string => {
  const sender = message.sender
  return sender._tag === 'Guest'
    ? guestName(board, sender.guest)
    : sender._tag === 'Detective'
      ? 'You'
      : 'Wi-Fi log'
}

export const whereLabel = (message: ChatMessage): string =>
  message.thread._tag === 'Group'
    ? 'group chat'
    : message.thread._tag === 'WifiLog'
      ? 'Wi-Fi log'
      : 'DM'

// PACING

const TYPING_BASE_MILLIS = 450
const TYPING_MILLIS_PER_CHAR = 22
const MAX_TYPING_MILLIS = 2400
export const AFTER_POST_MILLIS = 450
export const WIFI_ENTRY_MILLIS = 120
export const NIGHT_MILLIS = 1800
export const RECONNECT_MILLIS = 1500
export const LONG_PRESS_MILLIS = 450
export const MAX_RECONNECT_FAILURES = 3

export const typingMillis = (text: string): number =>
  Math.min(
    MAX_TYPING_MILLIS,
    TYPING_BASE_MILLIS + text.length * TYPING_MILLIS_PER_CHAR,
  )

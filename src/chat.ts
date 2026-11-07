// NOTE: pure helpers over the Board: which messages belong to a thread, who
// a guest is, and how long the client holds each incoming message.

import { Array, Option, pipe } from 'effect'

import {
  type ChatMessage,
  type GuestId,
  type GuestProfile,
  type MessageId,
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

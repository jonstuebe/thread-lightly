// NOTE: test-only Models. The board is hand-made, not read from cases/, so the
// client tests never touch case data.

import { Option } from 'effect'

import {
  type ChatMessage,
  type ServerMessage,
  Thread,
} from '../shared/protocol'
import { EMPTY_FLAGS } from './command'
import { Message } from './message'
import { type Board, Connection, type Model } from './model'
import { init } from './update'

export const GAME_ID = 'a'.repeat(64)

export const dmMargot = Thread.cases.Direct.make({ guest: 'margot' })
export const dmDale = Thread.cases.Direct.make({ guest: 'dale' })
export const group = Thread.cases.Group.make({})
export const wifiLog = Thread.cases.WifiLog.make({})

export const guestSays = (
  id: string,
  thread: Thread,
  guest: string,
  text: string,
): ChatMessage => ({
  id,
  thread,
  sender: { _tag: 'Guest', guest },
  body: { _tag: 'Text', text },
  day: 1,
})

export const detectiveSays = (
  id: string,
  thread: Thread,
  text: string,
): ChatMessage => ({
  id,
  thread,
  sender: { _tag: 'Detective' },
  body: { _tag: 'Text', text },
  day: 1,
})

export const wifiEntry: ChatMessage = {
  id: 'm1',
  thread: wifiLog,
  sender: { _tag: 'Lodge' },
  body: {
    _tag: 'WifiEntry',
    time: '01:12',
    guest: 'dale',
    event: 'joined',
    accessPoint: 'kitchen',
  },
  day: 1,
}

export const daleClaim = guestSays(
  'm2',
  dmDale,
  'dale',
  'I was asleep by eleven fifteen, out like a light.',
)

export const board: Board = {
  intro: {
    title: 'The Silver Brooch',
    premise: 'A brooch went missing from the great room.',
    missingItem: 'the silver brooch',
  },
  guests: [
    {
      id: 'margot',
      name: 'Margot Hale',
      role: 'Your host',
      status: 'available',
    },
    {
      id: 'dale',
      name: 'Dale Pruitt',
      role: 'Margot’s brother-in-law',
      status: 'available',
    },
  ],
  messages: [wifiEntry, daleClaim],
  caseFile: [],
  day: 1,
  phase: 'day',
  maybeResult: Option.none(),
}

export const lockedModel: Model = init(EMPTY_FLAGS).model

export const playingModel: Model = {
  ...lockedModel,
  connection: Connection.Open({ gameId: GAME_ID, attempt: 0 }),
  maybeBoard: Option.some(board),
}

export const fromServer = (message: ServerMessage): Message =>
  Message.ReceivedServerMessage({ gameId: GAME_ID, attempt: 0, message })

import { Option } from 'effect'

import { GUEST_NAMES } from './cast'
import {
  FeedItem,
  LiveTexts,
  Menu,
  Model,
  Os,
  Phase,
  Playback,
  Screen,
} from './model'

export const lockedModel = Model.make({
  os: Os.Ios(),
  screen: Screen.Locked(),
  menu: Menu.Closed(),
  nameInput: 'Riley',
  playerName: 'Riley',
  messageInput: '',
  isComposerFocused: false,
  maybeViewport: Option.none(),
  caseNumber: 0,
  thief: 'Margot',
  alive: GUEST_NAMES,
  gone: [],
  day: 0,
  phase: Phase.Evening(),
  checks: [],
  wifiLog: [],
  feed: [],
  nextFeedId: 0,
  script: [],
  playback: Playback.Idle(),
  usedLines: [],
  liveTexts: LiveTexts.Untried(),
})

export const eveningModel = Model.make({
  ...lockedModel,
  screen: Screen.InChat(),
  caseNumber: 1,
  thief: 'Lena',
  feed: [FeedItem.Event({ id: 0, text: 'Everyone arrived.' })],
  nextFeedId: 1,
})

export const votingModel = (day: number) =>
  Model.make({
    ...eveningModel,
    day,
    phase: Phase.Vote(),
    alive: ['Lena', 'Wes', 'Gus'],
    gone: ['Margot', 'Theo', 'Priya'],
    wifiLog: ['Lena', 'Gus'],
    feed: [
      FeedItem.Poll({
        id: 0,
        candidates: ['Lena', 'Wes', 'Gus'],
        votes: [],
        maybeChoice: Option.none(),
      }),
    ],
  })

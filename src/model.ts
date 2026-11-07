import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { GuestName } from './cast'

// PHONE STYLE

export const Os = defineTaggedUnion({ Ios: {}, Android: {} })
export type Os = typeof Os.Type

// SCREEN

export const Screen = defineTaggedUnion({
  Locked: {},
  Joining: {},
  InChat: {},
})
export type Screen = typeof Screen.Type

export const Menu = defineTaggedUnion({ Closed: {}, Open: {} })
export type Menu = typeof Menu.Type

// GAME

export const Phase = defineTaggedUnion({
  Evening: {},
  Night: { maybePending: Schema.Option(GuestName) },
  Day: {},
  Vote: {},
  Over: {},
})
export type Phase = typeof Phase.Type

export const Check = Schema.Struct({
  name: GuestName,
  isGuilty: Schema.Boolean,
})
export type Check = typeof Check.Type

export const Voter = defineTaggedUnion({
  Player: {},
  Guest: { name: GuestName },
})
export type Voter = typeof Voter.Type

export const Vote = Schema.Struct({ voter: Voter, choice: GuestName })
export type Vote = typeof Vote.Type

export const Line = Schema.Struct({ from: GuestName, text: Schema.String })
export type Line = typeof Line.Type

export const NightCandidate = Schema.Struct({
  name: GuestName,
  maybeCheck: Schema.Option(Check),
})
export type NightCandidate = typeof NightCandidate.Type

// FEED

export const FeedItem = defineTaggedUnion({
  GuestText: { id: Schema.Number, from: GuestName, text: Schema.String },
  PlayerText: { id: Schema.Number, text: Schema.String },
  Timestamp: { id: Schema.Number, label: Schema.String, time: Schema.String },
  Event: { id: Schema.Number, text: Schema.String },
  Notice: {
    id: Schema.Number,
    isPrivate: Schema.Boolean,
    title: Schema.String,
    body: Schema.String,
    maybeSmall: Schema.Option(Schema.String),
  },
  NightPick: {
    id: Schema.Number,
    candidates: Schema.Array(NightCandidate),
    maybePick: Schema.Option(GuestName),
  },
  Poll: {
    id: Schema.Number,
    candidates: Schema.Array(GuestName),
    votes: Schema.Array(Vote),
    maybeChoice: Schema.Option(GuestName),
  },
  Ending: {
    id: Schema.Number,
    title: Schema.String,
    body: Schema.String,
    small: Schema.String,
  },
})
export type FeedItem = typeof FeedItem.Type

// SCRIPT

export const Fallback = defineTaggedUnion({
  Chatter: { maybeVictim: Schema.Option(GuestName) },
  Reply: { text: Schema.String },
})
export type Fallback = typeof Fallback.Type

export const Situation = defineTaggedUnion({
  Morning: { maybeVictim: Schema.Option(GuestName) },
  Reply: { text: Schema.String },
})
export type Situation = typeof Situation.Type

export const Beat = defineTaggedUnion({
  GuestSays: { line: Line },
  ShowEvent: { text: Schema.String, holdMillis: Schema.Number },
  ShowTimestamp: { label: Schema.String, time: Schema.String },
  ShowNotice: {
    isPrivate: Schema.Boolean,
    title: Schema.String,
    body: Schema.String,
    maybeSmall: Schema.Option(Schema.String),
    holdMillis: Schema.Number,
  },
  Pause: { millis: Schema.Number },
  DepartGuest: { name: GuestName },
  AskGuests: {
    situation: Situation,
    count: Schema.Number,
    maybeHint: Schema.Option(GuestName),
  },
  RevealVote: { vote: Vote, holdMillis: Schema.Number },
  BeginNight: {},
  ShowEnding: { isWin: Schema.Boolean },
})
export type Beat = typeof Beat.Type

export const Playback = defineTaggedUnion({
  Idle: {},
  Preparing: {},
  Typing: { line: Line },
  Holding: {},
  AwaitingGuests: { typist: GuestName, situation: Situation },
})
export type Playback = typeof Playback.Type

export const LiveTexts = defineTaggedUnion({
  Untried: {},
  Available: {},
  Unavailable: {},
})
export type LiveTexts = typeof LiveTexts.Type

export const Viewport = Schema.Struct({
  height: Schema.Number,
  offsetTop: Schema.Number,
})
export type Viewport = typeof Viewport.Type

// MODEL

export const Model = Schema.Struct({
  os: Os,
  screen: Screen,
  menu: Menu,
  nameInput: Schema.String,
  playerName: Schema.String,
  messageInput: Schema.String,
  isComposerFocused: Schema.Boolean,
  maybeViewport: Schema.Option(Viewport),
  caseNumber: Schema.Number,
  thief: GuestName,
  alive: Schema.Array(GuestName),
  gone: Schema.Array(GuestName),
  day: Schema.Number,
  phase: Phase,
  checks: Schema.Array(Check),
  wifiLog: Schema.Array(GuestName),
  feed: Schema.Array(FeedItem),
  nextFeedId: Schema.Number,
  script: Schema.Array(Beat),
  playback: Playback,
  usedLines: Schema.Array(Schema.String),
  liveTexts: LiveTexts,
})
export type Model = typeof Model.Type

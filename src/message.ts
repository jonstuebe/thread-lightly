import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { GuestName } from './cast'
import { Line, Vote } from './model'

export const Message = defineMessageUnion({
  ClickedNotification: {},
  UpdatedNameInput: { value: Schema.String },
  SubmittedJoin: {},
  ClickedMenu: {},
  ClickedGroupName: {},
  ClickedCloseMenu: {},
  ClickedNewCase: {},
  CompletedDealNewCase: {
    caseNumber: Schema.Number,
    thief: GuestName,
    seating: Schema.Array(GuestName),
  },
  UpdatedMessageInput: { value: Schema.String },
  SubmittedMessage: {},
  FocusedComposer: {},
  BlurredComposer: {},
  ClickedThread: {},
  CompletedBlurComposer: {},
  CompletedScrollToLatest: {},
  ChangedViewport: { height: Schema.Number, offsetTop: Schema.Number },
  ClickedGoToBed: {},
  ClickedNightCandidate: { feedId: Schema.Number, name: GuestName },
  ClickedSkipToMorning: {},
  ClickedCallVote: {},
  ClickedPollOption: { feedId: Schema.Number, name: GuestName },
  CompletedWaitForBeat: { caseNumber: Schema.Number },
  CompletedRollMorning: {
    caseNumber: Schema.Number,
    maybeVictim: Schema.Option(GuestName),
    wifiLog: Schema.Array(GuestName),
    minute: Schema.Number,
  },
  CompletedCastGuestVotes: {
    caseNumber: Schema.Number,
    votes: Schema.Array(Vote),
    turnedIn: GuestName,
    maybeReaction: Schema.Option(Line),
    usedLines: Schema.Array(Schema.String),
  },
  SucceededFetchGuestTexts: {
    caseNumber: Schema.Number,
    lines: Schema.Array(Line),
  },
  FailedFetchGuestTexts: {
    caseNumber: Schema.Number,
    isUnavailable: Schema.Boolean,
  },
  CompletedPickFallbackLines: {
    caseNumber: Schema.Number,
    lines: Schema.Array(Line),
    usedLines: Schema.Array(Schema.String),
  },
})
export type Message = typeof Message.Type

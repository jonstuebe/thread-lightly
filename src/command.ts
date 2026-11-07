import { Array, Duration, Effect, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'
import { Command, Dom, Http } from 'foldkit'

import {
  GUEST_TEXTS_PATH,
  type GuestTextsRequest,
  type GuestTextsSituation,
  MAX_HISTORY,
} from '../shared/api'
import { GuestName } from './cast'
import { castGuestVotes, dealNewCase, fallbackLines, rollMorning } from './game'
import { Message } from './message'
import { FeedItem, Line, Os, Situation } from './model'

export const THREAD_END_ID = 'thread-end'
export const COMPOSER_INPUT_ID = 'composer-input'

const GUEST_TEXTS_TIMEOUT = Duration.seconds(30)

// DEVICE

export const DetectOs = Command.define('DetectOs', {
  messages: [Message.CompletedDetectOs],
  execute: Effect.sync(() =>
    Message.CompletedDetectOs({
      os: /Android/i.test(navigator.userAgent) ? Os.Android() : Os.Ios(),
    }),
  ),
})

export const ScrollToLatest = Command.define('ScrollToLatest', {
  messages: [Message.CompletedScrollToLatest],
  execute: Dom.scrollIntoView(`#${THREAD_END_ID}`, { block: 'end' }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedScrollToLatest()),
  ),
})

export const BlurComposer = Command.define('BlurComposer', {
  messages: [Message.CompletedBlurComposer],
  execute: Effect.sync(() => {
    const input = document.getElementById(COMPOSER_INPUT_ID)
    if (input instanceof HTMLElement) {
      input.blur()
    }
    return Message.CompletedBlurComposer()
  }),
})

// PACING

export const WaitForBeat = Command.define('WaitForBeat', {
  args: { caseNumber: Schema.Number, millis: Schema.Number },
  messages: [Message.CompletedWaitForBeat],
  execute: ({ caseNumber, millis }) =>
    Effect.sleep(Duration.millis(millis)).pipe(
      Effect.as(Message.CompletedWaitForBeat({ caseNumber })),
    ),
})

// ROLLS

export const DealNewCase = Command.define('DealNewCase', {
  args: { caseNumber: Schema.Number },
  messages: [Message.CompletedDealNewCase],
  execute: ({ caseNumber }) =>
    Effect.map(dealNewCase, ({ thief, seating }) =>
      Message.CompletedDealNewCase({ caseNumber, thief, seating }),
    ),
})

export const RollMorning = Command.define('RollMorning', {
  args: {
    caseNumber: Schema.Number,
    day: Schema.Number,
    alive: Schema.Array(GuestName),
    thief: GuestName,
  },
  messages: [Message.CompletedRollMorning],
  execute: ({ caseNumber, day, alive, thief }) =>
    Effect.map(rollMorning(day, alive, thief), roll =>
      Message.CompletedRollMorning({ caseNumber, ...roll }),
    ),
})

export const CastGuestVotes = Command.define('CastGuestVotes', {
  args: {
    caseNumber: Schema.Number,
    choice: GuestName,
    thief: GuestName,
    alive: Schema.Array(GuestName),
    wifiLog: Schema.Array(GuestName),
    playerName: Schema.String,
    usedLines: Schema.Array(Schema.String),
    isFinalVote: Schema.Boolean,
  },
  messages: [Message.CompletedCastGuestVotes],
  execute: ({ caseNumber, ...input }) =>
    Effect.map(castGuestVotes(input), outcome =>
      Message.CompletedCastGuestVotes({ caseNumber, ...outcome }),
    ),
})

export const PickFallbackLines = Command.define('PickFallbackLines', {
  args: {
    caseNumber: Schema.Number,
    situation: Situation,
    alive: Schema.Array(GuestName),
    playerName: Schema.String,
    usedLines: Schema.Array(Schema.String),
  },
  messages: [Message.CompletedPickFallbackLines],
  execute: ({ caseNumber, situation, ...context }) =>
    Effect.map(fallbackLines(situation, context), picked =>
      Message.CompletedPickFallbackLines({ caseNumber, ...picked }),
    ),
})

// LIVE GUEST TEXTS

const GuestTextsResponse = Schema.Struct({
  messages: Schema.Array(
    Schema.Struct({ from: Schema.String, text: Schema.String }),
  ),
})

const historyEntry = (item: FeedItem, playerName: string) =>
  FeedItem.match(item, {
    GuestText: ({ from, text }) => Option.some({ from, text }),
    PlayerText: ({ text }) => Option.some({ from: playerName, text }),
    Event: ({ text }) => Option.some({ from: '(event)', text }),
    Timestamp: () => Option.none(),
    Notice: () => Option.none(),
    NightPick: () => Option.none(),
    Poll: () => Option.none(),
    Ending: () => Option.none(),
  })

const toWireSituation = (situation: Situation): GuestTextsSituation =>
  Situation.match<GuestTextsSituation>(situation, {
    Morning: ({ maybeVictim }) => ({
      kind: 'morning',
      victim: Option.getOrNull(maybeVictim),
    }),
    Reply: ({ text }) => ({ kind: 'reply', text }),
  })

export const FetchGuestTexts = Command.define('FetchGuestTexts', {
  args: {
    caseNumber: Schema.Number,
    situation: Situation,
    count: Schema.Number,
    playerName: Schema.String,
    alive: Schema.Array(GuestName),
    gone: Schema.Array(GuestName),
    thief: GuestName,
    wifiLog: Schema.Array(GuestName),
    feed: Schema.Array(FeedItem),
  },
  messages: [Message.SucceededFetchGuestTexts, Message.FailedFetchGuestTexts],
  execute: args =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const body: GuestTextsRequest = {
        situation: toWireSituation(args.situation),
        playerName: args.playerName,
        alive: args.alive,
        gone: args.gone,
        thief: args.thief,
        wifiLog: args.wifiLog,
        history: Array.takeRight(
          Array.getSomes(
            Array.map(args.feed, item => historyEntry(item, args.playerName)),
          ),
          MAX_HISTORY,
        ),
        count: args.count,
      }
      const response = yield* client.execute(
        HttpClientRequest.post(GUEST_TEXTS_PATH).pipe(
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
      )
      if (response.status === 503 || response.status === 404) {
        return Message.FailedFetchGuestTexts({
          caseNumber: args.caseNumber,
          isUnavailable: true,
        })
      }
      if (response.status !== 200) {
        return Message.FailedFetchGuestTexts({
          caseNumber: args.caseNumber,
          isUnavailable: false,
        })
      }
      const decoded = yield* Schema.decodeUnknownEffect(GuestTextsResponse)(
        yield* response.json,
      )
      const lines = Array.getSomes(
        Array.map(decoded.messages, ({ from, text }) =>
          Schema.is(GuestName)(from) && Array.contains(args.alive, from)
            ? Option.some(Line.make({ from, text: text.trim().slice(0, 180) }))
            : Option.none(),
        ),
      )
      return Array.match(Array.take(lines, args.count), {
        onEmpty: () =>
          Message.FailedFetchGuestTexts({
            caseNumber: args.caseNumber,
            isUnavailable: false,
          }),
        onNonEmpty: nonEmpty =>
          Message.SucceededFetchGuestTexts({
            caseNumber: args.caseNumber,
            lines: nonEmpty,
          }),
      })
    }).pipe(
      Effect.timeout(GUEST_TEXTS_TIMEOUT),
      Effect.catch(() =>
        Effect.succeed(
          Message.FailedFetchGuestTexts({
            caseNumber: args.caseNumber,
            isUnavailable: false,
          }),
        ),
      ),
      Effect.provide(Http.layer),
    ),
})

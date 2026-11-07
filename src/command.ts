import { Duration, Effect, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import { Command, Dom, Http } from 'foldkit'

import { BrowserKeyValueStore } from '@effect/platform-browser'

import {
  ClientMessage,
  ClientMessageJson,
  NEW_CASE_PATH,
  NewCaseResponse,
} from '../shared/protocol'
import { Message } from './message'
import { Flags } from './model'
import { CaseSocket } from './socket'

export const THREAD_END_ID = 'thread-end'
export const COMPOSER_INPUT_ID = 'composer-input'

const START_TIMEOUT = Duration.seconds(20)
const STORAGE_KEY = 'pine-hollow'

// STORAGE

const flagsStore = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  return KeyValueStore.toSchemaStore(store, Flags)
})

export const EMPTY_FLAGS: Flags = { gameId: null, played: [] }

export const loadFlags: Effect.Effect<Flags> = Effect.gen(function* () {
  const store = yield* flagsStore
  return Option.getOrElse(yield* store.get(STORAGE_KEY), () => EMPTY_FLAGS)
}).pipe(
  Effect.catch(() => Effect.succeed(EMPTY_FLAGS)),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage),
)

export const SaveGame = Command.define('SaveGame', {
  args: { flags: Flags },
  messages: [Message.CompletedSaveGame],
  execute: ({ flags }) =>
    Effect.gen(function* () {
      const store = yield* flagsStore
      yield* store.set(STORAGE_KEY, flags)
    }).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedSaveGame()),
      Effect.provide(BrowserKeyValueStore.layerLocalStorage),
    ),
})

// SERVER

export const StartCase = Command.define('StartCase', {
  args: { played: Schema.Array(Schema.String) },
  messages: [Message.SucceededStartCase, Message.FailedStartCase],
  execute: ({ played }) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.execute(
        HttpClientRequest.post(NEW_CASE_PATH).pipe(
          HttpClientRequest.bodyJsonUnsafe({ played }),
        ),
      )
      const { gameId, caseId } = yield* Schema.decodeUnknownEffect(
        NewCaseResponse,
      )(yield* response.json)
      return Message.SucceededStartCase({ gameId, caseId })
    }).pipe(
      Effect.timeout(START_TIMEOUT),
      Effect.catch(() => Effect.succeed(Message.FailedStartCase())),
      Effect.provide(Http.layer),
    ),
})

const encodeClientMessage = Schema.encodeEffect(ClientMessageJson)

// NOTE: a send that fails because the socket is gone is fine to drop: the
// close event triggers a reconnect, and the Snapshot after it is the truth.
export const SendToServer = Command.define('SendToServer', {
  args: { message: ClientMessage },
  messages: [Message.CompletedSendToServer],
  execute: ({ message }) =>
    Effect.gen(function* () {
      const { socket } = yield* CaseSocket.get
      const encoded = yield* encodeClientMessage(message)
      socket.send(encoded)
    }).pipe(Effect.ignore, Effect.as(Message.CompletedSendToServer())),
})

// TIMERS

export const WaitForBeat = Command.define('WaitForBeat', {
  args: { epoch: Schema.Number, millis: Schema.Number },
  messages: [Message.CompletedWaitForBeat],
  execute: ({ epoch, millis }) =>
    Effect.sleep(Duration.millis(millis)).pipe(
      Effect.as(Message.CompletedWaitForBeat({ epoch })),
    ),
})

export const WaitToReconnect = Command.define('WaitToReconnect', {
  args: { attempt: Schema.Number, millis: Schema.Number },
  messages: [Message.CompletedWaitToReconnect],
  execute: ({ attempt, millis }) =>
    Effect.sleep(Duration.millis(millis)).pipe(
      Effect.as(Message.CompletedWaitToReconnect({ attempt })),
    ),
})

export const WaitForLongPress = Command.define('WaitForLongPress', {
  args: { pressId: Schema.Number, millis: Schema.Number },
  messages: [Message.CompletedWaitForLongPress],
  execute: ({ pressId, millis }) =>
    Effect.sleep(Duration.millis(millis)).pipe(
      Effect.as(Message.CompletedWaitForLongPress({ pressId })),
    ),
})

// DOM

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

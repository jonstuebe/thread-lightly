// NOTE: the WebSocket to the case's Durable Object. The socket is a
// ManagedResource that exists while the Model says it should (Connecting or
// Open). Frames go into a queue as soon as the socket exists, because the
// server sends its Snapshot right away, before the subscription that reads
// the queue has started.

import { Data, Effect, Option, Queue, Schema, Stream, pipe } from 'effect'
import { ManagedResource } from 'foldkit'

import { ServerMessageJson, caseSocketPath } from '../shared/protocol'
import { Message } from './message'
import type { Model } from './model'

export type SocketEvent = Data.TaggedEnum<{
  Frame: { readonly data: string }
  Closed: {}
}>
const SocketEvent = Data.taggedEnum<SocketEvent>()

export type CaseSocketValue = Readonly<{
  socket: WebSocket
  events: Queue.Queue<SocketEvent>
}>

export class SocketFailed extends Data.TaggedError('SocketFailed')<{}> {}

export const CaseSocket = ManagedResource.tag<CaseSocketValue>()('CaseSocket')
export type CaseSocketService = ManagedResource.ServiceOf<typeof CaseSocket>

const socketUrl = (gameId: string): string => {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${caseSocketPath(gameId)}`
}

const openSocket = (gameId: string) =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<SocketEvent>()
    const socket = yield* Effect.callback<WebSocket, SocketFailed>(resume => {
      const socket = new WebSocket(socketUrl(gameId))
      socket.addEventListener('message', event => {
        if (typeof event.data === 'string') {
          Queue.offerUnsafe(events, SocketEvent.Frame({ data: event.data }))
        }
      })
      socket.addEventListener('close', () => {
        Queue.offerUnsafe(events, SocketEvent.Closed())
        resume(Effect.fail(new SocketFailed()))
      })
      socket.addEventListener('open', () => resume(Effect.succeed(socket)))
      return Effect.sync(() => socket.close())
    })
    return { socket, events }
  })

const decodeFrame = Schema.decodeOption(ServerMessageJson)

const toMessages = (
  event: SocketEvent,
  gameId: string,
  attempt: number,
): ReadonlyArray<Message> =>
  SocketEvent.$match(event, {
    Frame: ({ data }) =>
      Option.toArray(
        Option.map(decodeFrame(data), message =>
          Message.ReceivedServerMessage({ gameId, attempt, message }),
        ),
      ),
    Closed: () => [Message.ClosedCaseSocket({ gameId, attempt })],
  })

export const socketMessages = (
  events: Queue.Queue<SocketEvent>,
  gameId: string,
  attempt: number,
): Stream.Stream<Message> =>
  pipe(
    Stream.fromQueue(events),
    Stream.flatMap(event =>
      Stream.fromIterable(toMessages(event, gameId, attempt)),
    ),
  )

export const SocketRequirements = Schema.Option(
  Schema.Struct({ gameId: Schema.String, attempt: Schema.Number }),
)

export const socketRequirements = (
  model: Model,
): typeof SocketRequirements.Type => {
  const connection = model.connection
  return connection._tag === 'Connecting' || connection._tag === 'Open'
    ? Option.some({ gameId: connection.gameId, attempt: connection.attempt })
    : Option.none()
}

export const managedResources = ManagedResource.make<Model, Message>()(
  entry => ({
    caseSocket: entry(SocketRequirements, {
      resource: CaseSocket,
      modelToMaybeRequirements: socketRequirements,
      acquire: ({ gameId }) => openSocket(gameId),
      release: ({ socket }) => Effect.sync(() => socket.close()),
      onAcquired: () => Message.AcquiredCaseSocket(),
      onAcquireError: () => Message.FailedAcquireCaseSocket(),
      onReleased: () => Message.ReleasedCaseSocket(),
    }),
  }),
)

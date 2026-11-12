import { Effect, Option, Schema, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { Message } from './message'
import type { Model } from './model'
import { CaseSocket, type CaseSocketService, socketMessages } from './socket'

const OpenSocket = Schema.Option(
  Schema.Struct({ gameId: Schema.String, attempt: Schema.Number }),
)

export const subscriptions = Subscription.make<
  Model,
  Message,
  CaseSocketService
>()(entry => ({
  caseSocket: entry(
    { maybeOpen: OpenSocket },
    {
      modelToDependencies: model => ({
        maybeOpen:
          model.connection._tag === 'Open'
            ? Option.some({
                gameId: model.connection.gameId,
                attempt: model.connection.attempt,
              })
            : Option.none(),
      }),
      dependenciesToStream: ({ maybeOpen }) =>
        Option.match(maybeOpen, {
          onNone: () => Stream.empty,
          onSome: ({ gameId, attempt }) =>
            Stream.unwrap(
              CaseSocket.get.pipe(
                Effect.map(({ events }) =>
                  socketMessages(events, gameId, attempt),
                ),
                // NOTE: no socket to read (a hot reload can restore an Open
                // Model before the resource exists). Report it closed so the
                // usual reconnect runs, rather than going quiet.
                Effect.catch(() =>
                  Effect.succeed(
                    Stream.make(Message.ClosedCaseSocket({ gameId, attempt })),
                  ),
                ),
              ),
            ),
        }),
    },
  ),
}))

import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { Message } from './message'
import type { Model } from './model'
import { CaseSocket, type CaseSocketService, socketMessages } from './socket'

// NOTE: when the on-screen keyboard opens, iOS shrinks the visual viewport but
// not the layout viewport. Tracking it keeps the header pinned and the
// composer sitting right on top of the keyboard, like Messages.
const streamVisualViewport = Stream.callback<
  typeof Message.ChangedViewport.Type
>(queue =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const viewport = window.visualViewport
      const report = () => {
        Queue.offerUnsafe(
          queue,
          Message.ChangedViewport({
            height: viewport ? viewport.height : window.innerHeight,
            offsetTop: viewport ? viewport.offsetTop : 0,
          }),
        )
      }
      viewport?.addEventListener('resize', report)
      viewport?.addEventListener('scroll', report)
      window.addEventListener('resize', report)
      report()
      return report
    }),
    report =>
      Effect.sync(() => {
        window.visualViewport?.removeEventListener('resize', report)
        window.visualViewport?.removeEventListener('scroll', report)
        window.removeEventListener('resize', report)
      }),
  ).pipe(Effect.flatMap(() => Effect.never)),
)

const OpenSocket = Schema.Option(
  Schema.Struct({ gameId: Schema.String, attempt: Schema.Number }),
)

export const subscriptions = Subscription.make<
  Model,
  Message,
  CaseSocketService
>()(entry => ({
  visualViewport: entry(
    { hasCase: Schema.Boolean },
    {
      modelToDependencies: model => ({
        hasCase: Option.isSome(model.maybeBoard),
      }),
      dependenciesToStream: ({ hasCase }) =>
        hasCase ? streamVisualViewport : Stream.empty,
    },
  ),
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

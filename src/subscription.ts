import { Effect, Queue, Schema, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { Message } from './message'
import type { Model } from './model'

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

export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  visualViewport: entry(
    { isInChat: Schema.Boolean },
    {
      modelToDependencies: model => ({
        isInChat: model.screen._tag === 'InChat',
      }),
      dependenciesToStream: ({ isInChat }) =>
        isInChat ? streamVisualViewport : Stream.empty,
    },
  ),
}))

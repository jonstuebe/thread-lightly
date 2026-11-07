import { Option } from 'effect'
import { type Document, type HtmlBuilder } from 'foldkit/html'

import { type Message } from '../message'
import type { Model } from '../model'
import { listView } from './list'
import { lockScreenView } from './lock'
import { sheetView } from './sheets'
import { threadPaneView, welcomePaneView } from './thread'

// NOTE: phones show either the conversation list or one thread, like
// Messages. From 768px up, CSS shows both side by side.
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Pine Hollow: a group chat mystery',
  body: Option.match(model.maybeBoard, {
    onNone: () => lockScreenView(model, h),
    onSome: board =>
      h.div(
        [
          h.Class(
            [
              'app',
              Option.isSome(model.maybeOpenThread) ? 'in-thread' : 'in-list',
              model.isComposerFocused ? 'kb' : '',
            ].join(' '),
          ),
          h.Style(
            Option.match(model.maybeViewport, {
              onNone: () => ({}),
              onSome: viewport => ({
                top: `${viewport.offsetTop}px`,
                height: `${viewport.height}px`,
              }),
            }),
          ),
        ],
        [
          listView(model, board, h),
          Option.match(model.maybeOpenThread, {
            onNone: () => welcomePaneView(board, h),
            onSome: thread => threadPaneView(model, board, thread, h),
          }),
          sheetView(model, board, h),
        ],
      ),
  }),
})

import { Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { Message } from '../message'
import { Connection, type Model } from '../model'
import * as Icon from './icon'

const hintOf = (model: Model): string =>
  Option.getOrElse(model.maybeNotice, () =>
    Connection.match(model.connection, {
      NoCase: () => 'Tap the message to take the case',
      Starting: () => 'Opening the case…',
      FailedStart: () => 'Couldn’t open a case. Tap to try again.',
      Connecting: () => 'Getting back to your case…',
      Open: () => 'Getting back to your case…',
      Lost: () => 'Reconnecting…',
    }),
  )

export const lockScreenView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const canStart =
    model.connection._tag === 'NoCase' ||
    model.connection._tag === 'FailedStart'
  return h.div(
    [h.Class('lock')],
    [
      h.div([h.Class('moon'), h.AriaHidden(true)]),
      h.div([h.Class('lk-date')], ['Saturday morning']),
      h.div([h.Class('lk-time')], ['7:42']),
      h.button(
        [
          h.Type('button'),
          h.Class('notif'),
          h.AriaLabel('Open the message from Pine Hollow Lodge'),
          h.Disabled(!canStart),
          h.OnClick(Message.ClickedNotification()),
        ],
        [
          h.span([h.Class('n-icon'), h.AriaHidden(true)], [Icon.chatBubble()]),
          h.span(
            [h.Class('n-body')],
            [
              h.span(
                [h.Class('n-top')],
                [h.b([], ['Pine Hollow Lodge 🌲']), h.span([], ['now'])],
              ),
              h.span(
                [h.Class('n-text')],
                [
                  'Detective, are you up? Something’s gone missing overnight and everyone’s pretending they didn’t see a thing 😬',
                ],
              ),
            ],
          ),
        ],
      ),
      h.p([h.Class('lk-hint'), h.Role('status')], [hintOf(model)]),
      Icon.lodgeScene(),
    ],
  )
}

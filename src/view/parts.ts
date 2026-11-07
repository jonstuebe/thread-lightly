import { Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { GuestId } from '../../shared/protocol'
import { avatarColor, guestName, initials } from '../chat'
import { Message } from '../message'
import type { Board } from '../model'
import * as Icon from './icon'

// AVATARS

export const avatar = (
  board: Board,
  guest: GuestId,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [
      h.Class('avatar'),
      h.Style({ background: avatarColor(board, guest) }),
      h.AriaHidden(true),
    ],
    [initials(guestName(board, guest))],
  )

export const groupAvatar = (board: Board, h: HtmlBuilder<Message>): Html =>
  h.span([h.Class('avatar group'), h.AriaHidden(true)], [Icon.chatBubble()])

export const wifiAvatar = (h: HtmlBuilder<Message>): Html =>
  h.span([h.Class('avatar wifi'), h.AriaHidden(true)], [Icon.wifi()])

// SHEETS

export const sheet = (
  labelId: string,
  maybeOnDismiss: Option.Option<Message>,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('overlay')],
    [
      h.div([
        h.Class('scrim'),
        ...Option.match(maybeOnDismiss, {
          onNone: () => [],
          onSome: message => [h.OnClick(message)],
        }),
      ]),
      h.div(
        [
          h.Class('sheet'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabelledBy(labelId),
        ],
        [
          h.div([h.Class('grabber'), h.AriaHidden(true)]),
          Option.match(maybeOnDismiss, {
            onNone: () => h.empty,
            onSome: message =>
              h.button(
                [
                  h.Type('button'),
                  h.Class('sheet-close'),
                  h.AriaLabel('Close'),
                  h.OnClick(message),
                ],
                [Icon.close()],
              ),
          }),
          ...children,
        ],
      ),
    ],
  )

import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { Clock, GuestId } from '../../shared/protocol'
import {
  avatarColor,
  clockTitle,
  guestName,
  initials,
  ticksLabel,
} from '../chat'
import { Message } from '../message'
import type { Board, Model } from '../model'
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

// CLOCK

export const clockDots = (clock: Clock, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class('ticks'), h.Role('img'), h.AriaLabel(ticksLabel(clock))],
    Array.makeBy(Math.max(clock.partBudget, clock.ticksLeft), index =>
      h.i([h.Class(index < clock.ticksLeft ? 'tick on' : 'tick')]),
    ),
  )

// NOTE: while the house sleeps the clock shows the night, not the stale part.
export const clockLabel = (
  model: Model,
  board: Board,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  model.playback._tag === 'Night'
    ? [Icon.moon(), h.span([], ['Night falls…'])]
    : [
        h.span([h.Class('clock-title')], [clockTitle(board.clock)]),
        clockDots(board.clock, h),
      ]

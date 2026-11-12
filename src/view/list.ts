import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import {
  type ChatMessage,
  type GuestProfile,
  GuestStatus,
  LAST_DAY,
  type Thread,
} from '../../shared/protocol'
import {
  GROUP,
  WIFI_LOG,
  direct,
  isSameThread,
  maybeStatusLine,
  messageText,
  threadKey,
  threadMessages,
} from '../chat'
import { Message } from '../message'
import type { Board, Model } from '../model'
import * as Icon from './icon'
import { avatar, clockLabel, groupAvatar, wifiAvatar } from './parts'

// DAY BAR

type DayAction = Readonly<{ text: string; label: string; message: Message }>

const maybeDayAction = (
  model: Model,
  board: Board,
): Option.Option<DayAction> => {
  if (Option.isSome(board.maybeResult)) {
    return Option.some({
      text: 'See what happened',
      label: 'See what happened',
      message: Message.ClickedShowResult(),
    })
  }
  if (model.playback._tag === 'Night') {
    return Option.none()
  }
  const phase = board.clock.phase
  return phase === 'arrest'
    ? Option.some({
        text: 'Make an arrest',
        label: 'Make an arrest',
        message: Message.ClickedStartArrest(),
      })
    : phase === 'bedtime'
      ? Option.some({
          text: 'Go to sleep',
          label: 'Go to sleep',
          message: Message.ClickedGoToSleep(),
        })
      : Option.some({
          text: 'Skip',
          label: 'Skip ahead or go to sleep',
          message: Message.ClickedClock(),
        })
}

const isDark = (model: Model, board: Board): boolean =>
  Option.isNone(board.maybeResult) &&
  (model.playback._tag === 'Night' || board.clock.phase === 'bedtime')

const dayBarView = (
  model: Model,
  board: Board,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class(isDark(model, board) ? 'daybar night' : 'daybar')],
    [
      h.span(
        [h.Class('daybar-clock')],
        Option.isSome(board.maybeResult)
          ? [h.span([], ['The case is closed'])]
          : board.clock.phase === 'bedtime' && model.playback._tag !== 'Night'
            ? [Icon.moon(), h.span([], ['Everyone’s gone to bed'])]
            : board.clock.phase === 'arrest'
              ? [h.span([], [`Day ${LAST_DAY} is over`])]
              : clockLabel(model, board, h),
      ),
      Option.match(maybeDayAction(model, board), {
        onNone: () => h.empty,
        onSome: action =>
          h.button(
            [
              h.Type('button'),
              h.Class('btn small'),
              h.AriaLabel(action.label),
              h.OnClick(action.message),
            ],
            [action.text],
          ),
      }),
    ],
  )

// ROWS

const previewOf = (
  model: Model,
  board: Board,
  thread: Thread,
  fallback: string,
): string => {
  const isTyping =
    model.playback._tag === 'Typing' &&
    isSameThread(model.playback.message.thread, thread)
  if (isTyping) {
    return 'typing…'
  }
  return Option.match(Array.last(threadMessages(board, thread)), {
    onNone: () => fallback,
    onSome: (message: ChatMessage) =>
      message.sender._tag === 'Detective'
        ? `You: ${messageText(board, message)}`
        : messageText(board, message),
  })
}

const statusBadge = (
  board: Board,
  guest: GuestProfile,
  h: HtmlBuilder<Message>,
): Html =>
  Option.isSome(board.maybeResult)
    ? h.empty
    : GuestStatus.match(guest.status, {
        Around: () => h.empty,
        Away: () => h.span([h.Class('badge')], ['Away']),
        Quiet: () => h.span([h.Class('badge')], ['Quiet']),
        Asleep: () => h.span([h.Class('badge')], ['Asleep']),
      })

// NOTE: an away or quiet guest's row says why, where the last line would be.
const guestPreview = (
  model: Model,
  board: Board,
  guest: GuestProfile,
): string =>
  Option.getOrElse(
    Option.filter(
      maybeStatusLine(board, guest),
      () => guest.status._tag !== 'Asleep',
    ),
    () => previewOf(model, board, direct(guest.id), guest.role),
  )

const row = (
  model: Model,
  thread: Thread,
  avatarView: Html,
  name: string,
  preview: string,
  badge: Html,
  h: HtmlBuilder<Message>,
): Html => {
  const key = threadKey(thread)
  const isOpen = Option.exists(model.maybeOpenThread, open =>
    isSameThread(open, thread),
  )
  const isUnread = model.unread.includes(key)
  return h.keyed('li')(
    key,
    [],
    [
      h.button(
        [
          h.Type('button'),
          h.Class(isOpen ? 'convo sel' : 'convo'),
          h.AriaCurrent(isOpen ? 'page' : 'false'),
          h.AriaLabel(isUnread ? `${name}, unread` : name),
          h.OnClick(Message.ClickedThreadRow({ thread })),
        ],
        [
          h.span([h.Class(isUnread ? 'dot on' : 'dot'), h.AriaHidden(true)]),
          avatarView,
          h.span(
            [h.Class('convo-body')],
            [
              h.span([h.Class('convo-top')], [h.b([], [name]), badge]),
              h.span([h.Class('convo-preview')], [preview]),
            ],
          ),
        ],
      ),
    ],
  )
}

export const listView = (
  model: Model,
  board: Board,
  h: HtmlBuilder<Message>,
): Html =>
  h.aside(
    [h.Class('sidebar'), h.AriaLabel('Conversations')],
    [
      h.div(
        [h.Class('sb-bar')],
        [
          h.button(
            [
              h.Type('button'),
              h.Class('ib'),
              h.AriaLabel('About this case'),
              h.OnClick(Message.ClickedCaseInfo()),
            ],
            [Icon.info()],
          ),
          caseFileButton(board, h),
        ],
      ),
      h.h1([h.Class('sb-title')], [board.intro.title]),
      dayBarView(model, board, h),
      connectionBanner(model, h),
      h.ul(
        [h.Class('convos')],
        [
          row(
            model,
            WIFI_LOG,
            wifiAvatar(h),
            'Wi-Fi log',
            previewOf(model, board, WIFI_LOG, 'Nothing logged yet'),
            h.empty,
            h,
          ),
          row(
            model,
            GROUP,
            groupAvatar(board, h),
            'Guests',
            previewOf(model, board, GROUP, 'Everyone’s in here'),
            h.empty,
            h,
          ),
          ...Array.map(board.guests, guest =>
            row(
              model,
              direct(guest.id),
              avatar(board, guest.id, h),
              guest.name,
              guestPreview(model, board, guest),
              statusBadge(board, guest, h),
              h,
            ),
          ),
        ],
      ),
    ],
  )

// SHARED CHROME

export const caseFileButton = (board: Board, h: HtmlBuilder<Message>): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class('ib casefile-btn'),
      h.AriaLabel(`Case file, ${board.caseFile.length} saved`),
      h.OnClick(Message.ClickedCaseFile()),
    ],
    [
      Icon.folder(),
      Array.isReadonlyArrayEmpty(board.caseFile)
        ? h.empty
        : h.span(
            [h.Class('count'), h.AriaHidden(true)],
            [`${board.caseFile.length}`],
          ),
    ],
  )

export const connectionBanner = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  model.connection._tag === 'Lost' || model.connection._tag === 'Connecting'
    ? h.div([h.Class('banner'), h.Role('status')], ['Reconnecting…'])
    : h.empty

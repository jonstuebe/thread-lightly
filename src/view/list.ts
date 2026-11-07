import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import {
  type ChatMessage,
  type GuestProfile,
  LAST_DAY,
  type Thread,
} from '../../shared/protocol'
import {
  GROUP,
  WIFI_LOG,
  direct,
  firstName,
  isSameThread,
  messageText,
  threadKey,
  threadMessages,
} from '../chat'
import { Message } from '../message'
import type { Board, Model } from '../model'
import * as Icon from './icon'
import { avatar, groupAvatar, wifiAvatar } from './parts'

// DAY BAR

type DayAction = Readonly<{
  label: string
  maybeButton: Option.Option<Readonly<{ text: string; message: Message }>>
}>

const dayAction = (board: Board): DayAction =>
  Option.match(board.maybeResult, {
    onSome: () => ({
      label: 'The case is over',
      maybeButton: Option.some({
        text: 'See what happened',
        message: Message.ClickedShowResult(),
      }),
    }),
    onNone: () =>
      board.phase === 'arrest'
        ? {
            label: `Day ${LAST_DAY} is over`,
            maybeButton: Option.some({
              text: 'Make an arrest',
              message: Message.ClickedStartArrest(),
            }),
          }
        : board.phase === 'night'
          ? { label: 'Night falls on the lodge…', maybeButton: Option.none() }
          : {
              label: `Day ${board.day} of ${LAST_DAY}`,
              maybeButton: Option.some({
                text: board.day === LAST_DAY ? 'End the last day' : 'End day',
                message: Message.ClickedEndDay(),
              }),
            },
  })

const dayBarView = (board: Board, h: HtmlBuilder<Message>): Html => {
  const action = dayAction(board)
  return h.div(
    [h.Class(board.phase === 'night' ? 'daybar night' : 'daybar')],
    [
      h.span(
        [],
        [board.phase === 'night' ? Icon.moon() : h.empty, action.label],
      ),
      Option.match(action.maybeButton, {
        onNone: () => h.empty,
        onSome: button =>
          h.button(
            [h.Type('button'), h.Class('btn small'), h.OnClick(button.message)],
            [button.text],
          ),
      }),
    ],
  )
}

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

// NOTE: once the case is closed, statuses from the last night no longer mean
// anything, so the badges go away.
const statusBadge = (
  board: Board,
  guest: GuestProfile,
  h: HtmlBuilder<Message>,
): Html =>
  Option.isSome(board.maybeResult)
    ? h.empty
    : guest.status === 'asleep'
      ? h.span([h.Class('badge')], ['Asleep'])
      : guest.status === 'leftOnRead'
        ? h.span([h.Class('badge')], ['Not replying'])
        : h.empty

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
      dayBarView(board, h),
      connectionBanner(model, h),
      h.ul(
        [h.Class('convos')],
        [
          row(
            model,
            WIFI_LOG,
            wifiAvatar(h),
            'Lodge Wi-Fi log',
            previewOf(model, board, WIFI_LOG, 'Nothing logged yet'),
            h.empty,
            h,
          ),
          row(
            model,
            GROUP,
            groupAvatar(board, h),
            'Pine Hollow guests',
            previewOf(model, board, GROUP, 'Everyone at the lodge'),
            h.empty,
            h,
          ),
          ...Array.map(board.guests, guest =>
            row(
              model,
              direct(guest.id),
              avatar(board, guest.id, h),
              guest.name,
              previewOf(model, board, direct(guest.id), guest.role),
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

export const statusLine = (board: Board, guest: GuestProfile): string =>
  Option.isSome(board.maybeResult)
    ? guest.role
    : guest.status === 'asleep'
      ? `${firstName(guest.name)} has gone to bed`
      : guest.status === 'leftOnRead'
        ? `${firstName(guest.name)} isn’t replying`
        : guest.status === 'annoyed'
          ? `${firstName(guest.name)} seems a bit short with you`
          : guest.role

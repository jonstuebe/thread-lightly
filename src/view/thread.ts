import { Array, Option, pipe } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import {
  type ChatMessage,
  type GuestProfile,
  MAX_MESSAGE_LENGTH,
  Thread,
} from '../../shared/protocol'
import {
  findGuest,
  firstName,
  guestName,
  isSameThread,
  isSaved,
  threadMessages,
} from '../chat'
import { COMPOSER_INPUT_ID, THREAD_END_ID } from '../command'
import { Message } from '../message'
import type { Board, Model, PendingSend } from '../model'
import { isPlaying } from '../update'
import * as Icon from './icon'
import { caseFileButton, connectionBanner, statusLine } from './list'
import { avatar, groupAvatar, wifiAvatar } from './parts'

// HEADER

type Heading = Readonly<{ avatarView: Html; title: string; subtitle: string }>

const heading = (
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): Heading =>
  Thread.match(thread, {
    Group: () => ({
      avatarView: groupAvatar(board, h),
      title: 'Pine Hollow guests',
      subtitle: `${board.guests.length} guests and you`,
    }),
    WifiLog: () => ({
      avatarView: wifiAvatar(h),
      title: 'Lodge Wi-Fi log',
      subtitle: 'Posted every morning',
    }),
    Direct: ({ guest }) =>
      Option.match(findGuest(board, guest), {
        onNone: () => ({ avatarView: h.empty, title: guest, subtitle: '' }),
        onSome: profile => ({
          avatarView: avatar(board, guest, h),
          title: profile.name,
          subtitle: statusLine(profile),
        }),
      }),
  })

const headerView = (
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): Html => {
  const { avatarView, title, subtitle } = heading(board, thread, h)
  return h.header(
    [h.Class('hdr')],
    [
      h.button(
        [
          h.Type('button'),
          h.Class('ib back'),
          h.AriaLabel('Conversations'),
          h.OnClick(Message.ClickedBack()),
        ],
        [Icon.chevronLeft()],
      ),
      h.div(
        [h.Class('hcenter')],
        [
          avatarView,
          h.h2([h.Class('htitle')], [title]),
          h.span([h.Class('hsub')], [subtitle]),
        ],
      ),
      h.div([h.Class('hright')], [caseFileButton(board, h)]),
    ],
  )
}

// PRESSING

// NOTE: iOS Safari doesn't fire contextmenu on a long press, so the press is
// timed with pointer events. Right-click, Android's long press and the
// keyboard go straight to the menu.
// NOTE: adds a full stop only when the text doesn't already end a sentence,
// so the label never reads "night?. Press and hold".
const withStop = (text: string): string =>
  /[.!?…]$/.test(text.trimEnd()) ? text.trimEnd() : `${text.trimEnd()}.`

const pressable = (message: ChatMessage, h: HtmlBuilder<Message>) => [
  h.Role('button'),
  h.Tabindex(0),
  h.AriaHasPopup('dialog'),
  h.OnPointerDown((_pointerType, button) =>
    button === 0
      ? Option.some(Message.PressedMessage({ messageId: message.id }))
      : Option.none(),
  ),
  h.OnPointerUp(() => Option.some(Message.ReleasedMessage())),
  h.OnPointerLeave(() => Option.some(Message.ReleasedMessage())),
  h.OnContextMenu(Message.RequestedMessageActions({ messageId: message.id })),
  h.OnKeyDownPreventDefault(key =>
    key === 'Enter' || key === ' '
      ? Option.some(Message.RequestedMessageActions({ messageId: message.id }))
      : Option.none(),
  ),
]

const pinMark = (isPinned: boolean, h: HtmlBuilder<Message>): Html =>
  isPinned
    ? h.span(
        [h.Class('pin'), h.AriaLabel('In your case file'), h.Role('img')],
        [Icon.pin()],
      )
    : h.empty

// BUBBLES

type Grouping = Readonly<{ isFirst: boolean; isLast: boolean }>

const speakerKey = (message: ChatMessage): string =>
  message.sender._tag === 'Guest' ? message.sender.guest : message.sender._tag

const isSameSpeaker = (
  maybeOther: Option.Option<ChatMessage>,
  message: ChatMessage,
): boolean =>
  Option.exists(
    maybeOther,
    other =>
      speakerKey(other) === speakerKey(message) && other.day === message.day,
  )

const rowClass = (
  direction: 'in' | 'out',
  grouping: Grouping,
  extra = '',
): string =>
  [
    'row',
    direction,
    grouping.isFirst ? 'first' : '',
    grouping.isLast ? 'last' : '',
    extra,
  ].join(' ')

const bubbleView = (
  model: Model,
  board: Board,
  message: ChatMessage,
  grouping: Grouping,
  h: HtmlBuilder<Message>,
): Html => {
  const text = message.body._tag === 'Text' ? message.body.text : ''
  const isPressed = Option.exists(
    model.maybePress,
    press => press.messageId === message.id,
  )
  const saved = isSaved(board, message.id)
  const bubble = h.div(
    [
      h.Class(isPressed ? 'bubble pressed' : 'bubble'),
      h.AriaLabel(`${withStop(text)} Press and hold for options.`),
      ...pressable(message, h),
    ],
    [text],
  )
  const sender = message.sender
  if (sender._tag === 'Guest') {
    return h.keyed('div')(
      message.id,
      [h.Class(rowClass('in', grouping))],
      [
        avatar(board, sender.guest, h),
        h.div(
          [h.Class('col')],
          [
            isSameThread(message.thread, Thread.cases.Group.make({}))
              ? h.div([h.Class('name')], [guestName(board, sender.guest)])
              : h.empty,
            h.div([h.Class('bubble-line')], [bubble, pinMark(saved, h)]),
          ],
        ),
      ],
    )
  }
  return h.keyed('div')(
    message.id,
    [h.Class(rowClass('out', grouping))],
    [
      h.div(
        [h.Class('col')],
        [h.div([h.Class('bubble-line')], [pinMark(saved, h), bubble])],
      ),
    ],
  )
}

const pendingView = (pending: PendingSend, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    `pending-${pending.id}`,
    [h.Class('row out first last pending')],
    [
      h.div(
        [h.Class('col')],
        [
          h.div([h.Class('bubble')], [pending.text]),
          h.span([h.Class('sending')], ['Sending…']),
        ],
      ),
    ],
  )

const typingView = (
  board: Board,
  guest: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    'typing',
    [h.Class('row in first last typing')],
    [
      avatar(board, guest, h),
      h.div(
        [h.Class('col')],
        [
          h.div(
            [
              h.Class('bubble'),
              h.AriaLabel(`${firstName(guestName(board, guest))} is typing`),
            ],
            [h.span([h.Class('dots')], [h.i([]), h.i([]), h.i([])])],
          ),
        ],
      ),
    ],
  )

// NOTE: while the server is still working out a DM reply, the guest shows as
// typing, the way a real chat would.
const maybeTypist = (
  model: Model,
  board: Board,
  thread: Thread,
  pending: ReadonlyArray<PendingSend>,
): Option.Option<string> => {
  if (
    model.playback._tag === 'Typing' &&
    isSameThread(model.playback.message.thread, thread) &&
    model.playback.message.sender._tag === 'Guest'
  ) {
    return Option.some(model.playback.message.sender.guest)
  }
  return thread._tag === 'Direct' && Array.isReadonlyArrayNonEmpty(pending)
    ? pipe(
        findGuest(board, thread.guest),
        Option.filter(
          guest => guest.status === 'available' || guest.status === 'annoyed',
        ),
        Option.map(guest => guest.id),
      )
    : Option.none()
}

const daySeparator = (
  message: ChatMessage,
  maybePrevious: Option.Option<ChatMessage>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.exists(maybePrevious, previous => previous.day === message.day)
    ? h.empty
    : h.keyed('div')(
        `day-${message.day}-${message.id}`,
        [h.Class('sys')],
        [h.b([], [`Day ${message.day}`])],
      )

const chatView = (
  model: Model,
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const messages = threadMessages(board, thread)
  const pending = Array.filter(model.pendingSends, send =>
    isSameThread(send.thread, thread),
  )
  return [
    ...Array.flatMap(messages, (message, index) => {
      const maybePrevious = Array.get(messages, index - 1)
      const maybeNext = Array.get(messages, index + 1)
      return [
        daySeparator(message, maybePrevious, h),
        bubbleView(
          model,
          board,
          message,
          {
            isFirst: !isSameSpeaker(maybePrevious, message),
            isLast: !isSameSpeaker(maybeNext, message),
          },
          h,
        ),
      ]
    }),
    ...Array.map(pending, send => pendingView(send, h)),
    Option.match(maybeTypist(model, board, thread, pending), {
      onNone: () => h.empty,
      onSome: guest => typingView(board, guest, h),
    }),
  ]
}

const emptyThreadView = (
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): Html =>
  Thread.match(thread, {
    Group: () =>
      h.p(
        [h.Class('empty')],
        [
          'Everyone at the lodge is in here. Guests are more careful in public.',
        ],
      ),
    WifiLog: () => h.empty,
    Direct: ({ guest }) =>
      h.p(
        [h.Class('empty')],
        [
          `Ask ${firstName(guestName(board, guest))} anything. Long-press a reply to save it to your case file.`,
        ],
      ),
  })

// WI-FI LOG

const nightLabel = (day: number): string =>
  day === 1 ? 'The night of the theft' : `Night ${day - 1}`

const wifiRowView = (
  model: Model,
  board: Board,
  message: ChatMessage,
  h: HtmlBuilder<Message>,
): Html => {
  const body = message.body
  if (body._tag !== 'WifiEntry') {
    return h.empty
  }
  const isPressed = Option.exists(
    model.maybePress,
    press => press.messageId === message.id,
  )
  const device = `${firstName(guestName(board, body.guest))}’s phone`
  return h.keyed('li')(
    message.id,
    [
      h.Class(isPressed ? 'wifi-row pressed' : 'wifi-row'),
      h.AriaLabel(
        `${body.time}, ${device} ${body.event} ${body.accessPoint}. Press and hold for options.`,
      ),
      ...pressable(message, h),
    ],
    [
      h.span([h.Class('w-time')], [body.time]),
      h.span([h.Class('w-device')], [device]),
      h.span(
        [h.Class(body.event === 'joined' ? 'w-event in' : 'w-event out')],
        [body.event],
      ),
      h.span([h.Class('w-ap')], [body.accessPoint]),
      pinMark(isSaved(board, message.id), h),
    ],
  )
}

const wifiLogView = (
  model: Model,
  board: Board,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const entries = threadMessages(board, Thread.cases.WifiLog.make({}))
  const nights = Array.dedupe(Array.map(entries, entry => entry.day))
  return [
    h.div(
      [h.Class('router')],
      [
        h.div(
          [h.Class('router-head')],
          [
            h.b([], ['PineHollow-Guest']),
            h.span([], ['Device connection log · read only']),
          ],
        ),
        Array.match(nights, {
          onEmpty: () => h.p([h.Class('router-empty')], ['No entries yet.']),
          onNonEmpty: days =>
            h.div(
              [],
              Array.map(days, day =>
                h.keyed('section')(
                  `night-${day}`,
                  [h.Class('router-night')],
                  [
                    h.h3([], [nightLabel(day)]),
                    h.ul(
                      [h.Class('wifi-rows')],
                      Array.map(
                        Array.filter(entries, entry => entry.day === day),
                        entry => wifiRowView(model, board, entry, h),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        }),
      ],
    ),
  ]
}

// COMPOSER

const maybeDirectGuest = (
  board: Board,
  thread: Thread,
): Option.Option<GuestProfile> =>
  thread._tag === 'Direct' ? findGuest(board, thread.guest) : Option.none()

const composerBlock = (
  model: Model,
  board: Board,
  thread: Thread,
): Option.Option<string> => {
  if (Option.isSome(board.maybeResult)) {
    return Option.some('The case is over')
  }
  if (board.phase === 'arrest') {
    return Option.some('Time to make your arrest')
  }
  if (!isPlaying(model)) {
    return Option.some('Everyone’s asleep')
  }
  return pipe(
    maybeDirectGuest(board, thread),
    Option.flatMap(guest =>
      guest.status === 'asleep'
        ? Option.some(`${firstName(guest.name)} is asleep`)
        : guest.status === 'leftOnRead'
          ? Option.some(`${firstName(guest.name)} isn’t replying today`)
          : Option.none(),
    ),
  )
}

const composerView = (
  model: Model,
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): Html => {
  const maybeBlock = composerBlock(model, board, thread)
  const isOpen = Option.isNone(maybeBlock)
  const canSend = isOpen && model.messageInput.trim() !== ''
  return h.form(
    [h.Class('composer'), h.OnSubmit(Message.SubmittedMessage())],
    [
      h.div(
        [h.Class('field')],
        [
          h.input([
            h.Id(COMPOSER_INPUT_ID),
            h.Type('text'),
            h.Autocomplete('off'),
            h.Maxlength(MAX_MESSAGE_LENGTH),
            h.EnterKeyHint('send'),
            h.AriaLabel('Message'),
            h.Placeholder(Option.getOrElse(maybeBlock, () => 'Message')),
            h.Disabled(!isOpen),
            h.Value(model.messageInput),
            h.OnInput(value => Message.UpdatedMessageInput({ value })),
            h.OnFocus(Message.FocusedComposer()),
            h.OnBlur(Message.BlurredComposer()),
          ]),
          h.button(
            [
              h.Type('submit'),
              h.Class('send'),
              h.AriaLabel('Send'),
              h.Disabled(!canSend),
            ],
            [Icon.arrowUp()],
          ),
        ],
      ),
    ],
  )
}

const noticeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(model.maybeNotice, {
    onNone: () => h.empty,
    onSome: notice => h.div([h.Class('notice'), h.Role('status')], [notice]),
  })

// PANE

export const threadPaneView = (
  model: Model,
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): Html => {
  const isWifi = thread._tag === 'WifiLog'
  const messages = threadMessages(board, thread)
  return h.section(
    [h.Class('pane')],
    [
      headerView(board, thread, h),
      connectionBanner(model, h),
      h.main(
        [
          h.Class(isWifi ? 'thread wifi-thread' : 'thread'),
          h.AriaLive('polite'),
          h.OnClick(Message.ClickedThread()),
        ],
        [
          ...(isWifi
            ? wifiLogView(model, board, h)
            : Array.isReadonlyArrayEmpty(messages) &&
                Array.isReadonlyArrayEmpty(model.pendingSends)
              ? [emptyThreadView(board, thread, h)]
              : chatView(model, board, thread, h)),
          h.keyed('div')('end', [h.Id(THREAD_END_ID), h.Class('thread-end')]),
        ],
      ),
      noticeView(model, h),
      isWifi ? h.empty : composerView(model, board, thread, h),
    ],
  )
}

export const welcomePaneView = (board: Board, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('pane welcome')],
    [
      h.div(
        [h.Class('welcome-card')],
        [
          h.h2([], [board.intro.title]),
          h.p([], [board.intro.premise]),
          h.p(
            [h.Class('hint')],
            ['Pick a conversation to start asking around.'],
          ),
        ],
      ),
    ],
  )

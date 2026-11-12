import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import {
  type ChatMessage,
  type GuestProfile,
  type QuestionChip,
  Thread,
} from '../../shared/protocol'
import {
  PART_NAMES,
  clockTitle,
  findGuest,
  firstName,
  guestName,
  isAround,
  isCaughtAnswer,
  isSameThread,
  isSaved,
  maybeStatusLine,
  menuChips,
  threadMessages,
  ticksLabel,
} from '../chat'
import { THREAD_END_ID } from '../command'
import { Message } from '../message'
import type { Board, Model } from '../model'
import { isReadyToAsk } from '../update'
import * as Icon from './icon'
import { caseFileButton, connectionBanner } from './list'
import { avatar, clockLabel, groupAvatar, wifiAvatar } from './parts'

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
      title: 'Guests',
      subtitle: `${board.guests.length} guests and you`,
    }),
    WifiLog: () => ({
      avatarView: wifiAvatar(h),
      title: 'Wi-Fi log',
      subtitle: 'Posted every morning',
    }),
    Direct: ({ guest }) =>
      Option.match(findGuest(board, guest), {
        onNone: () => ({ avatarView: h.empty, title: guest, subtitle: '' }),
        onSome: profile => ({
          avatarView: avatar(board, guest, h),
          title: profile.name,
          subtitle: Option.getOrElse(
            maybeStatusLine(board, profile),
            () => profile.role,
          ),
        }),
      }),
  })

// NOTE: on phones the sidebar's day bar is out of sight inside a thread, so
// the clock sits under the header. Wider screens hide it in CSS.
const clockStrip = (
  model: Model,
  board: Board,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class(
        model.playback._tag === 'Night' ? 'clock-strip night' : 'clock-strip',
      ),
      h.AriaLabel(
        `Time: ${clockTitle(board.clock)}, ${ticksLabel(board.clock)}`,
      ),
      h.OnClick(Message.ClickedClock()),
    ],
    [...clockLabel(model, board, h), h.span([h.Class('strip-more')], ['›'])],
  )

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

const caughtMark = (isCaught: boolean, h: HtmlBuilder<Message>): Html =>
  isCaught ? h.span([h.Class('stamp')], ['✓ caught']) : h.empty

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
      speakerKey(other) === speakerKey(message) &&
      other.day === message.day &&
      other.part === message.part,
  )

const rowClass = (
  direction: 'in' | 'out',
  grouping: Grouping,
  extra: string,
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
  const isCaught = isCaughtAnswer(board, message)
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
  if (sender._tag === 'Lodge') {
    return h.keyed('div')(
      message.id,
      [h.Class('row lodge')],
      [
        h.div(
          [h.Class('bubble-line')],
          [
            h.div(
              [
                h.Class(isPressed ? 'lodge-line pressed' : 'lodge-line'),
                h.AriaLabel(`${withStop(text)} Press and hold for options.`),
                ...pressable(message, h),
              ],
              [text],
            ),
            pinMark(saved, h),
          ],
        ),
      ],
    )
  }
  if (sender._tag === 'Guest') {
    return h.keyed('div')(
      message.id,
      [h.Class(rowClass('in', grouping, isCaught ? 'caught' : ''))],
      [
        avatar(board, sender.guest, h),
        h.div(
          [h.Class('col')],
          [
            message.thread._tag === 'Group'
              ? h.div([h.Class('name')], [guestName(board, sender.guest)])
              : h.empty,
            h.div(
              [h.Class('bubble-line')],
              [bubble, pinMark(saved, h), caughtMark(isCaught, h)],
            ),
          ],
        ),
      ],
    )
  }
  return h.keyed('div')(
    message.id,
    [h.Class(rowClass('out', grouping, ''))],
    [
      h.div(
        [h.Class('col')],
        [h.div([h.Class('bubble-line')], [pinMark(saved, h), bubble])],
      ),
    ],
  )
}

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

const maybeTypist = (model: Model, thread: Thread): Option.Option<string> =>
  model.playback._tag === 'Typing' &&
  isSameThread(model.playback.message.thread, thread) &&
  model.playback.message.sender._tag === 'Guest'
    ? Option.some(model.playback.message.sender.guest)
    : Option.none()

const partSeparator = (
  message: ChatMessage,
  maybePrevious: Option.Option<ChatMessage>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.exists(
    maybePrevious,
    previous => previous.day === message.day && previous.part === message.part,
  )
    ? h.empty
    : h.keyed('div')(
        `part-${message.id}`,
        [h.Class('sys')],
        [h.b([], [`Day ${message.day}`]), ` · ${PART_NAMES[message.part]}`],
      )

const chatView = (
  model: Model,
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const messages = threadMessages(board, thread)
  return [
    ...Array.flatMap(messages, (message, index) => {
      const maybePrevious = Array.get(messages, index - 1)
      const maybeNext = Array.get(messages, index + 1)
      return [
        partSeparator(message, maybePrevious, h),
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
    Option.match(maybeTypist(model, thread), {
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
        ['Everyone’s in here. News from the house posts as the day goes on.'],
      ),
    WifiLog: () => h.empty,
    Direct: ({ guest }) =>
      h.p(
        [h.Class('empty')],
        [
          `Pick a question for ${firstName(guestName(board, guest))} below. Long-press a reply to save it, press them on it, or show proof it’s a lie.`,
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
            h.b([], ['Guest-WiFi']),
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

// QUESTION MENU

type MenuState =
  | Readonly<{
      _tag: 'Chips'
      isEnabled: boolean
      maybeNote: Option.Option<string>
    }>
  | Readonly<{
      _tag: 'Note'
      text: string
      maybeAction: Option.Option<Readonly<{ text: string; message: Message }>>
    }>

const directGuest = (
  board: Board,
  thread: Thread,
): Option.Option<GuestProfile> =>
  thread._tag === 'Direct' ? findGuest(board, thread.guest) : Option.none()

const note = (
  text: string,
  maybeAction: Option.Option<Readonly<{ text: string; message: Message }>>,
): MenuState => ({ _tag: 'Note', text, maybeAction })

const menuState = (model: Model, board: Board, thread: Thread): MenuState => {
  if (Option.isSome(board.maybeResult)) {
    return note(
      'The case is closed.',
      Option.some({
        text: 'See what happened',
        message: Message.ClickedShowResult(),
      }),
    )
  }
  if (model.playback._tag === 'Night') {
    return note('Night falls… 🌙', Option.none())
  }
  if (board.clock.phase === 'arrest') {
    return note(
      `Day ${board.clock.day} is over. Time to make your arrest.`,
      Option.some({
        text: 'Make an arrest',
        message: Message.ClickedStartArrest(),
      }),
    )
  }
  if (board.clock.phase === 'bedtime') {
    return note(
      'Everyone’s gone to bed 🌙',
      Option.some({ text: 'Go to sleep', message: Message.ClickedGoToSleep() }),
    )
  }
  const maybeAway = Option.flatMap(directGuest(board, thread), guest =>
    isAround(guest) ? Option.none() : maybeStatusLine(board, guest),
  )
  return {
    _tag: 'Chips',
    isEnabled: Option.isNone(maybeAway) && isReadyToAsk(model),
    maybeNote: maybeAway,
  }
}

const chipView = (
  thread: Thread,
  chip: QuestionChip,
  isEnabled: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    chip.id,
    [],
    [
      h.button(
        [
          h.Type('button'),
          h.Class(chip.isNew ? 'chip new' : 'chip'),
          h.Disabled(!isEnabled),
          h.OnClick(Message.ClickedChip({ thread, chipId: chip.id })),
        ],
        [
          chip.isNew
            ? h.span([h.Class('chip-new'), h.AriaHidden(true)], ['new'])
            : h.empty,
          h.span([h.Class('chip-text')], [chip.text]),
          chip.isNew
            ? h.span([h.Class('visually-hidden')], [' (new)'])
            : h.empty,
        ],
      ),
    ],
  )

const emptyMenuText = (board: Board, thread: Thread): string =>
  Thread.match(thread, {
    Group: () =>
      'Guests post here as the day goes on. Ask your questions in DMs.',
    WifiLog: () => '',
    Direct: ({ guest }) =>
      `Nothing more to ask ${firstName(guestName(board, guest))} right now. Something you find may change that.`,
  })

const menuLabel = (board: Board, thread: Thread): string =>
  Thread.match(thread, {
    Group: () => 'Questions for everyone',
    WifiLog: () => '',
    Direct: ({ guest }) =>
      `Questions for ${firstName(guestName(board, guest))}`,
  })

const menuView = (
  model: Model,
  board: Board,
  thread: Thread,
  h: HtmlBuilder<Message>,
): Html => {
  const state = menuState(model, board, thread)
  if (state._tag === 'Note') {
    return h.footer(
      [h.Class('menu note'), h.Role('group'), h.AriaLabel('Your move')],
      [
        h.p([h.Class('menu-note'), h.Role('status')], [state.text]),
        Option.match(state.maybeAction, {
          onNone: () => h.empty,
          onSome: action =>
            h.button(
              [h.Type('button'), h.Class('btn'), h.OnClick(action.message)],
              [action.text],
            ),
        }),
      ],
    )
  }
  const chips = menuChips(board, thread)
  return h.footer(
    [
      h.Class(state.isEnabled ? 'menu' : 'menu off'),
      h.Role('group'),
      h.AriaLabel('Your move'),
    ],
    [
      Option.match(state.maybeNote, {
        onNone: () => h.empty,
        onSome: text => h.p([h.Class('menu-status'), h.Role('status')], [text]),
      }),
      Array.match(chips, {
        onEmpty: () =>
          h.p([h.Class('menu-note')], [emptyMenuText(board, thread)]),
        onNonEmpty: nonEmpty =>
          h.ul(
            [h.Class('chips'), h.AriaLabel(menuLabel(board, thread))],
            Array.map(nonEmpty, chip =>
              chipView(thread, chip, state.isEnabled, h),
            ),
          ),
      }),
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
      Option.isSome(board.maybeResult) ? h.empty : clockStrip(model, board, h),
      connectionBanner(model, h),
      h.main(
        [
          h.Class(isWifi ? 'thread wifi-thread' : 'thread'),
          h.AriaLive('polite'),
        ],
        [
          ...(isWifi
            ? wifiLogView(model, board, h)
            : Array.isReadonlyArrayEmpty(messages) &&
                Option.isNone(maybeTypist(model, thread))
              ? [emptyThreadView(board, thread, h)]
              : chatView(model, board, thread, h)),
          h.keyed('div')('end', [h.Id(THREAD_END_ID), h.Class('thread-end')]),
        ],
      ),
      noticeView(model, h),
      isWifi ? h.empty : menuView(model, board, thread, h),
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

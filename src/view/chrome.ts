import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { dayName } from '../cast'
import { COMPOSER_INPUT_ID } from '../command'
import { FINAL_DAY } from '../game'
import { Message } from '../message'
import { type Model, Os, Phase } from '../model'
import { canChat, isBusy } from '../update'
import * as Icon from './icon'
import { avatar } from './thread'

const GROUP_NAME = 'Pine Hollow Lodge'

// HEADER

const peopleCount = (model: Model): number => model.alive.length + 1

export const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Os.match(model.os, {
    Ios: () =>
      h.header(
        [h.Class('hdr')],
        [
          h.span([h.Class('ib'), h.AriaHidden(true)], [Icon.chevronLeft()]),
          h.div(
            [h.Class('hcenter')],
            [
              h.div(
                [h.Class('stack')],
                Array.map(Array.take(model.alive, 3), name => avatar(name, h)),
              ),
              h.button(
                [
                  h.Type('button'),
                  h.Class('htitle-ios'),
                  h.OnClick(Message.ClickedMenu()),
                ],
                [
                  `${GROUP_NAME} 🌲 `,
                  h.span([], [`· ${peopleCount(model)} people ›`]),
                ],
              ),
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.Class('ib right'),
              h.AriaLabel('Game menu'),
              h.OnClick(Message.ClickedMenu()),
            ],
            [Icon.info()],
          ),
        ],
      ),
    Android: () =>
      h.header(
        [h.Class('hdr')],
        [
          h.span([h.Class('ib'), h.AriaHidden(true)], [Icon.arrowBack()]),
          h.div([h.Class('gav'), h.AriaHidden(true)], ['🌲']),
          h.div(
            [h.Class('htext')],
            [
              h.div([h.Class('htitle')], [GROUP_NAME]),
              h.div([h.Class('hsub')], [`${peopleCount(model)} people`]),
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.Class('ib'),
              h.AriaLabel('Game menu'),
              h.OnClick(Message.ClickedMenu()),
            ],
            [Icon.more()],
          ),
        ],
      ),
  })

// PHASE BAR

type PhaseAction = Readonly<{
  label: string
  maybeButton: Option.Option<
    Readonly<{ text: string; message: Message; isDisabled: boolean }>
  >
}>

const phaseAction = (model: Model): PhaseAction => {
  const busy = isBusy(model)
  return Phase.match(model.phase, {
    Evening: () => ({
      label: 'Friday night · get to know everyone',
      maybeButton: Option.some({
        text: 'Go to bed',
        message: Message.ClickedGoToBed(),
        isDisabled: busy,
      }),
    }),
    Night: ({ maybePending }) => ({
      label: `🌙 ${dayName(model.day)} night`,
      maybeButton: Option.some({
        text: 'Skip to morning',
        message: Message.ClickedSkipToMorning(),
        isDisabled: busy || Option.isNone(maybePending),
      }),
    }),
    Day: () => ({
      label:
        model.day === FINAL_DAY
          ? 'Monday · last chance to catch them'
          : `${dayName(model.day)} · day ${model.day} of ${FINAL_DAY}`,
      maybeButton: Option.some({
        text: 'Call a vote',
        message: Message.ClickedCallVote(),
        isDisabled: busy,
      }),
    }),
    Vote: () => ({ label: 'Vote in progress', maybeButton: Option.none() }),
    Over: () => ({
      label: 'Case over',
      maybeButton: Option.some({
        text: 'New case',
        message: Message.ClickedNewCase(),
        isDisabled: false,
      }),
    }),
  })
}

export const phaseBarView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const action = phaseAction(model)
  return h.div(
    [h.Class('phasebar')],
    [
      h.span([], [action.label]),
      Option.match(action.maybeButton, {
        onNone: () => h.empty,
        onSome: button =>
          h.button(
            [
              h.Type('button'),
              h.Class('btn'),
              h.Disabled(button.isDisabled),
              h.OnClick(button.message),
            ],
            [button.text],
          ),
      }),
    ],
  )
}

// COMPOSER

const placeholder = (model: Model): string =>
  canChat(model)
    ? Os.match(model.os, {
        Ios: () => 'Message',
        Android: () => 'Text message',
      })
    : model.phase._tag === 'Night'
      ? 'Everyone’s asleep'
      : 'Chat is paused'

export const composerView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isChatOpen = canChat(model)
  const canSend =
    isChatOpen && !isBusy(model) && model.messageInput.trim().length > 0
  const input = h.input([
    h.Id(COMPOSER_INPUT_ID),
    h.Type('text'),
    h.Autocomplete('off'),
    h.Maxlength(200),
    h.EnterKeyHint('send'),
    h.AriaLabel(
      Os.match(model.os, {
        Ios: () => 'Message',
        Android: () => 'Text message',
      }),
    ),
    h.Placeholder(placeholder(model)),
    h.Disabled(!isChatOpen),
    h.Value(model.messageInput),
    h.OnInput(value => Message.UpdatedMessageInput({ value })),
    h.OnFocus(Message.FocusedComposer()),
    h.OnBlur(Message.BlurredComposer()),
  ])
  const sendButton = (icon: Html) =>
    h.button(
      [
        h.Type('submit'),
        h.Class('send'),
        h.AriaLabel('Send'),
        h.Disabled(!canSend),
      ],
      [icon],
    )
  return h.form(
    [h.Class('composer'), h.OnSubmit(Message.SubmittedMessage())],
    Os.match(model.os, {
      Ios: () => [
        h.span([h.Class('plus'), h.AriaHidden(true)], [Icon.plus()]),
        h.div([h.Class('field')], [input, sendButton(Icon.arrowUp())]),
      ],
      Android: () => [
        h.span([h.Class('plus'), h.AriaHidden(true)], [Icon.plusCircle()]),
        h.div(
          [h.Class('field')],
          [input, h.span([h.Class('emo'), h.AriaHidden(true)], [Icon.emoji()])],
        ),
        sendButton(Icon.send()),
      ],
    }),
  )
}

// LOCK SCREEN

export const lockScreenView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('lock')],
    [
      h.div([h.Class('moon'), h.AriaHidden(true)]),
      h.div([h.Class('lk-date')], ['Friday, November 6']),
      h.div([h.Class('lk-time')], ['8:42']),
      h.button(
        [
          h.Type('button'),
          h.Class('notif'),
          h.AriaLabel('Open the Pine Hollow Lodge group chat'),
          h.OnClick(Message.ClickedNotification()),
        ],
        [
          h.span([h.Class('n-icon'), h.AriaHidden(true)], [Icon.chatBubble()]),
          h.span(
            [h.Class('n-body')],
            [
              h.span(
                [h.Class('n-top')],
                [h.b([], [`${GROUP_NAME} 🌲`]), h.span([], ['now'])],
              ),
              h.span(
                [h.Class('n-text')],
                [
                  'Margot: ok slightly awkward… has anyone seen my grandmother’s silver brooch? 😬',
                ],
              ),
            ],
          ),
        ],
      ),
      h.p([h.Class('lk-hint')], ['Tap the message to join the group chat']),
      Icon.lodgeScene(),
    ],
  )

// SHEETS

const sheet = (
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
        children,
      ),
    ],
  )

export const joinSheetView = (model: Model, h: HtmlBuilder<Message>): Html =>
  sheet(
    'join-title',
    Option.none(),
    [
      h.form(
        [h.OnSubmit(Message.SubmittedJoin())],
        [
          h.h2([h.Id('join-title')], ['You’re invited to Pine Hollow Lodge']),
          h.p(
            [],
            [
              'A lakeside weekend, six other guests, and one missing brooch. You’re secretly the detective. Each night you can look into one guest. Catch the thief before Monday.',
            ],
          ),
          h.label([h.For('name-input')], ['What should the group call you?']),
          h.input([
            h.Id('name-input'),
            h.Class('tin'),
            h.Type('text'),
            h.Maxlength(16),
            h.Autocomplete('off'),
            h.Value(model.nameInput),
            h.OnInput(value => Message.UpdatedNameInput({ value })),
          ]),
          h.button([h.Type('submit'), h.Class('btn')], ['Join the chat']),
        ],
      ),
    ],
    h,
  )

export const menuSheetView = (h: HtmlBuilder<Message>): Html =>
  sheet(
    'menu-title',
    Option.some(Message.ClickedCloseMenu()),
    [
      h.h2([h.Id('menu-title')], [`${GROUP_NAME} 🌲`]),
      h.p(
        [],
        [
          'Chat with the guests, look into one person each night, and vote to turn someone in each day. The Wi‑Fi log each morning always includes the thief, plus one innocent guest.',
        ],
      ),
      h.p(
        [h.Class('hint')],
        [
          'Guest texts are written live by Claude when the server has it switched on. Otherwise the guests use built-in lines.',
        ],
      ),
      h.button(
        [h.Type('button'), h.Class('btn'), h.OnClick(Message.ClickedNewCase())],
        ['Start a new case'],
      ),
      h.button(
        [
          h.Type('button'),
          h.Class('btn ghost'),
          h.OnClick(Message.ClickedCloseMenu()),
        ],
        ['Close'],
      ),
    ],
    h,
  )

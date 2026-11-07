import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { type GuestName, dayName, guestOf } from '../cast'
import { COMPOSER_INPUT_ID } from '../command'
import { FINAL_DAY } from '../game'
import { Message } from '../message'
import { FeedItem, type Model, Phase } from '../model'
import { canChat, isBusy } from '../update'
import * as Icon from './icon'
import { avatar } from './thread'

const GROUP_NAME = 'Pine Hollow Lodge'

// HEADER

const peopleCount = (model: Model): number => model.alive.length + 1

export const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.header(
    [h.Class('hdr')],
    [
      h.span([h.Class('ib back'), h.AriaHidden(true)], [Icon.chevronLeft()]),
      h.button(
        [
          h.Type('button'),
          h.Class('hcenter'),
          h.AriaHasPopup('dialog'),
          h.OnClick(Message.ClickedGroupName()),
        ],
        [
          h.span(
            [h.Class('stack')],
            Array.map(Array.take(model.alive, 3), name => avatar(name, h)),
          ),
          h.span(
            [h.Class('htitle')],
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
  )

// SIDEBAR

const latestPreview = (model: Model): string =>
  Option.getOrElse(
    Array.findLast(model.feed, item =>
      FeedItem.match(item, {
        GuestText: ({ from, text }) => Option.some(`${from}: ${text}`),
        PlayerText: ({ text }) => Option.some(`You: ${text}`),
        Event: ({ text }) => Option.some(text),
        Timestamp: () => Option.none(),
        Notice: () => Option.none(),
        NightPick: () => Option.none(),
        Poll: () => Option.none(),
        Ending: () => Option.none(),
      }),
    ),
    () => 'Margot: ok slightly awkward…',
  )

const latestTime = (model: Model): string =>
  Option.getOrElse(
    Array.findLast(model.feed, item =>
      item._tag === 'Timestamp' ? Option.some(item.time) : Option.none(),
    ),
    () => 'now',
  )

export const sidebarView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [h.Class('sidebar'), h.AriaLabel('Conversations')],
    [
      h.div(
        [h.Class('sb-bar')],
        [
          h.span([h.Class('sb-edit'), h.AriaHidden(true)], ['Edit']),
          h.span([h.Class('ib'), h.AriaHidden(true)], [Icon.compose()]),
        ],
      ),
      h.h1([h.Class('sb-title')], ['Messages']),
      h.div(
        [h.Class('sb-search'), h.AriaHidden(true)],
        [Icon.search(), h.span([], ['Search'])],
      ),
      h.div(
        [h.Class('convo'), h.AriaCurrent('page')],
        [
          h.div(
            [h.Class('convo-av')],
            Array.map(Array.take(model.alive, 2), name => avatar(name, h)),
          ),
          h.div(
            [h.Class('convo-body')],
            [
              h.div(
                [h.Class('convo-top')],
                [
                  h.b([], [GROUP_NAME]),
                  h.span([h.Class('convo-time')], [latestTime(model)]),
                ],
              ),
              h.div([h.Class('convo-preview')], [latestPreview(model)]),
            ],
          ),
        ],
      ),
    ],
  )

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
    ? 'Message'
    : model.phase._tag === 'Night'
      ? 'Everyone’s asleep'
      : 'Chat is paused'

export const composerView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isChatOpen = canChat(model)
  const canSend =
    isChatOpen && !isBusy(model) && model.messageInput.trim().length > 0
  return h.form(
    [h.Class('composer'), h.OnSubmit(Message.SubmittedMessage())],
    [
      h.span([h.Class('plus'), h.AriaHidden(true)], [Icon.plus()]),
      h.div(
        [h.Class('field')],
        [
          h.input([
            h.Id(COMPOSER_INPUT_ID),
            h.Type('text'),
            h.Autocomplete('off'),
            h.Maxlength(200),
            h.EnterKeyHint('send'),
            h.AriaLabel('Message'),
            h.Placeholder(placeholder(model)),
            h.Disabled(!isChatOpen),
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
    ],
    h,
  )

// PEOPLE

const roleOf = (name: GuestName): string => {
  const role = guestOf(name).bio.split(';')[0] ?? ''
  return role.charAt(0).toUpperCase() + role.slice(1)
}

const personRow = (
  key: string,
  avatarView: Html,
  name: string,
  role: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    key,
    [h.Class('person')],
    [
      avatarView,
      h.span(
        [h.Class('person-text')],
        [
          h.span([h.Class('person-name')], [name]),
          h.span([h.Class('person-role')], [role]),
        ],
      ),
    ],
  )

const guestRow = (name: GuestName, h: HtmlBuilder<Message>): Html =>
  personRow(name, avatar(name, h), name, roleOf(name), h)

export const peopleSheetView = (model: Model, h: HtmlBuilder<Message>): Html =>
  sheet(
    'people-title',
    Option.some(Message.ClickedCloseMenu()),
    [
      h.div(
        [h.Class('people-head')],
        [
          h.div(
            [h.Class('stack big')],
            Array.map(Array.take(model.alive, 3), name => avatar(name, h)),
          ),
          h.h2([h.Id('people-title')], [`${GROUP_NAME} 🌲`]),
          h.p([], [`${peopleCount(model)} people`]),
        ],
      ),
      h.ul(
        [h.Class('people'), h.AriaLabel('In the chat')],
        [
          personRow(
            'player',
            h.span(
              [h.Class('avatar you'), h.AriaHidden(true)],
              [model.playerName.slice(0, 1) || 'Y'],
            ),
            `${model.playerName} (you)`,
            'The detective, secretly',
            h,
          ),
          ...Array.map(model.alive, name => guestRow(name, h)),
        ],
      ),
      Array.match(model.gone, {
        onEmpty: () => h.empty,
        onNonEmpty: gone =>
          h.div(
            [],
            [
              h.h3([h.Class('people-section')], ['Left the chat']),
              h.ul(
                [h.Class('people gone'), h.AriaLabel('Left the chat')],
                Array.map(gone, name => guestRow(name, h)),
              ),
            ],
          ),
      }),
    ],
    h,
  )

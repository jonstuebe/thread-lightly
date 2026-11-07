import { Array, Option, pipe } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import {
  type CaseResult,
  type ChatMessage,
  type Ending,
  type GuestId,
  LAST_DAY,
  type MessageId,
} from '../../shared/protocol'
import {
  findMessage,
  firstName,
  guestName,
  isSaved,
  messageText,
  savedMessages,
  senderLabel,
} from '../chat'
import { Message } from '../message'
import { ArrestStep, type Board, type Model, Sheet } from '../model'
import { avatar, sheet } from './parts'

const close = Option.some(Message.ClickedCloseSheet())

const where = (message: ChatMessage): string =>
  message.thread._tag === 'Group'
    ? 'group chat'
    : message.thread._tag === 'WifiLog'
      ? 'Wi-Fi log'
      : 'DM'

const quoteBody = (
  board: Board,
  message: ChatMessage,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.span([h.Class('quote-text')], [messageText(board, message)]),
  h.span([h.Class('quote-meta')], [`Day ${message.day} · ${where(message)}`]),
]

const quote = (
  board: Board,
  message: ChatMessage,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.span([h.Class('quote-who')], [senderLabel(board, message)]),
  ...quoteBody(board, message, h),
]

const primary = (
  text: string,
  message: Message,
  isDisabled: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class('btn'),
      h.Disabled(isDisabled),
      h.OnClick(message),
    ],
    [text],
  )

const secondary = (
  text: string,
  message: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [h.Type('button'), h.Class('btn ghost wide'), h.OnClick(message)],
    [text],
  )

// INTRO

const introView = (board: Board, h: HtmlBuilder<Message>): Html =>
  sheet(
    'intro-title',
    close,
    [
      h.h2([h.Id('intro-title')], [board.intro.title]),
      h.p([], [board.intro.premise]),
      h.p([h.Class('missing')], [`Missing: ${board.intro.missingItem}`]),
      h.h3([h.Class('sheet-section')], ['How to play']),
      h.ul(
        [h.Class('rules')],
        [
          h.li(
            [],
            ['DM any guest, or ask the whole group. Type whatever you’d ask.'],
          ),
          h.li(
            [],
            [
              'Long-press a message to save it to your case file. Saved messages stay good even if the evidence disappears later.',
            ],
          ),
          h.li(
            [],
            [
              'Guests run out of patience if you’re rude or repeat yourself, and they go to bed at night.',
            ],
          ),
          h.li(
            [],
            [
              'Every morning the lodge Wi-Fi log shows whose phone moved around overnight. It never lies.',
            ],
          ),
          h.li(
            [],
            [
              `By the end of day ${LAST_DAY}, arrest the thief with two saved messages: something they claimed, and something that proves it false.`,
            ],
          ),
        ],
      ),
      primary('Start investigating', Message.ClickedCloseSheet(), false, h),
      secondary('Start a different case', Message.ClickedNewCase(), h),
    ],
    h,
  )

// CASE FILE

const senderKey = (message: ChatMessage): string =>
  message.sender._tag === 'Guest' ? message.sender.guest : message.sender._tag

const canArrest = (board: Board): boolean =>
  Option.isNone(board.maybeResult) &&
  (board.phase === 'day' || board.phase === 'arrest')

const caseFileView = (board: Board, h: HtmlBuilder<Message>): Html => {
  const saved = savedMessages(board)
  const senders = Array.dedupe(Array.map(saved, senderKey))
  return sheet(
    'casefile-title',
    close,
    [
      h.h2([h.Id('casefile-title')], ['Case file']),
      Array.match(saved, {
        onEmpty: () =>
          h.p(
            [],
            [
              'Nothing saved yet. Long-press any message, or a Wi-Fi log entry, to add it here.',
            ],
          ),
        onNonEmpty: () =>
          h.div(
            [],
            Array.map(senders, key => {
              const group = Array.filter(saved, m => senderKey(m) === key)
              const label = pipe(
                Array.head(group),
                Option.match({
                  onNone: () => key,
                  onSome: first => senderLabel(board, first),
                }),
              )
              return h.keyed('section')(
                key,
                [h.Class('file-group')],
                [
                  h.h3([h.Class('sheet-section')], [label]),
                  h.ul(
                    [h.Class('file-list')],
                    Array.map(group, message =>
                      h.keyed('li')(
                        message.id,
                        [h.Class('file-item')],
                        [
                          h.div(
                            [h.Class('quote')],
                            quoteBody(board, message, h),
                          ),
                          h.button(
                            [
                              h.Type('button'),
                              h.Class('btn ghost small'),
                              h.AriaLabel(
                                `Remove “${messageText(board, message)}” from the case file`,
                              ),
                              h.OnClick(
                                Message.ClickedRemoveMessage({
                                  messageId: message.id,
                                }),
                              ),
                            ],
                            ['Remove'],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              )
            }),
          ),
      }),
      canArrest(board)
        ? primary(
            'Make an arrest',
            Message.ClickedStartArrest(),
            saved.length < 2,
            h,
          )
        : h.empty,
      canArrest(board) && saved.length < 2
        ? h.p(
            [h.Class('hint center')],
            ['You need at least two saved messages to make an arrest.'],
          )
        : h.empty,
    ],
    h,
  )
}

// END DAY

const confirmEndDayView = (board: Board, h: HtmlBuilder<Message>): Html =>
  sheet(
    'endday-title',
    close,
    [
      h.h2(
        [h.Id('endday-title')],
        [
          board.day === LAST_DAY
            ? 'End the last day?'
            : `End day ${board.day}?`,
        ],
      ),
      h.p(
        [],
        [
          board.day === LAST_DAY
            ? 'Nobody will answer after this. Next, you make your arrest from what’s in your case file.'
            : 'Everyone goes to bed. Overnight the thief makes a move, and in the morning the Wi-Fi log shows who was up.',
        ],
      ),
      primary('End the day', Message.ClickedConfirmEndDay(), false, h),
      secondary('Keep investigating', Message.ClickedCloseSheet(), h),
    ],
    h,
  )

// MESSAGE ACTIONS

const messageActionsView = (
  board: Board,
  messageId: MessageId,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(findMessage(board, messageId), {
    onNone: () => h.empty,
    onSome: message =>
      sheet(
        'actions-title',
        close,
        [
          h.h2(
            [h.Id('actions-title'), h.Class('visually-hidden')],
            ['Message'],
          ),
          h.div([h.Class('quote big')], quote(board, message, h)),
          isSaved(board, messageId)
            ? primary(
                'Remove from case file',
                Message.ClickedRemoveMessage({ messageId }),
                false,
                h,
              )
            : primary(
                'Add to case file',
                Message.ClickedSaveMessage({ messageId }),
                false,
                h,
              ),
          secondary('Cancel', Message.ClickedCloseSheet(), h),
        ],
        h,
      ),
  })

// ARREST

const pickList = (
  board: Board,
  messages: ReadonlyArray<ChatMessage>,
  toMessage: (id: MessageId) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.ul(
    [h.Class('pick-list')],
    Array.map(messages, message =>
      h.keyed('li')(
        message.id,
        [],
        [
          h.button(
            [
              h.Type('button'),
              h.Class('opt quote'),
              h.OnClick(toMessage(message.id)),
            ],
            quote(board, message, h),
          ),
        ],
      ),
    ),
  )

const backButton = (h: HtmlBuilder<Message>): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class('btn ghost back-link'),
      h.OnClick(Message.ClickedArrestBack()),
    ],
    ['‹ Back'],
  )

const saidBy = (message: ChatMessage, suspect: GuestId): boolean =>
  message.sender._tag === 'Guest' && message.sender.guest === suspect

const arrestView = (
  board: Board,
  step: ArrestStep,
  h: HtmlBuilder<Message>,
): Html => {
  const saved = savedMessages(board)
  const name = (id: GuestId) => firstName(guestName(board, id))
  const body = ArrestStep.match(step, {
    PickSuspect: () => [
      backButton(h),
      h.h2([h.Id('arrest-title')], ['Who are you arresting?']),
      h.p(
        [],
        [
          'You get one arrest. Make it count: you’ll need a lie they told and the proof that it’s a lie.',
        ],
      ),
      h.ul(
        [h.Class('pick-list')],
        Array.map(board.guests, guest =>
          h.keyed('li')(
            guest.id,
            [],
            [
              h.button(
                [
                  h.Type('button'),
                  h.Class('opt'),
                  h.OnClick(Message.ClickedSuspect({ suspect: guest.id })),
                ],
                [
                  avatar(board, guest.id, h),
                  h.span(
                    [h.Class('on')],
                    [
                      h.span([h.Class('opt-name')], [guest.name]),
                      h.span([h.Class('opt-role')], [guest.role]),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ],
    PickClaim: ({ suspect }) => {
      const claims = Array.filter(saved, message => saidBy(message, suspect))
      return [
        backButton(h),
        h.h2([h.Id('arrest-title')], [`What did ${name(suspect)} lie about?`]),
        Array.match(claims, {
          onEmpty: () =>
            h.p(
              [],
              [
                `You haven’t saved anything ${name(suspect)} said. Save the message with their lie first.`,
              ],
            ),
          onNonEmpty: nonEmpty =>
            h.div(
              [],
              [
                h.p([], [`Pick the message where ${name(suspect)} lied.`]),
                pickList(
                  board,
                  nonEmpty,
                  messageId => Message.ClickedClaim({ messageId }),
                  h,
                ),
              ],
            ),
        }),
      ]
    },
    PickProof: ({ claim }) => {
      const proofs = Array.filter(saved, message => message.id !== claim)
      return [
        backButton(h),
        h.h2([h.Id('arrest-title')], ['What proves it’s a lie?']),
        Array.match(proofs, {
          onEmpty: () => h.p([], ['Save the message that proves it first.']),
          onNonEmpty: nonEmpty =>
            pickList(
              board,
              nonEmpty,
              messageId => Message.ClickedProof({ messageId }),
              h,
            ),
        }),
      ]
    },
    Confirm: ({ suspect, claim, proof }) => [
      backButton(h),
      h.h2([h.Id('arrest-title')], [`Arrest ${guestName(board, suspect)}?`]),
      h.h3([h.Class('sheet-section')], ['The lie']),
      Option.match(findMessage(board, claim), {
        onNone: () => h.empty,
        onSome: message => h.div([h.Class('quote')], quote(board, message, h)),
      }),
      h.h3([h.Class('sheet-section')], ['The proof']),
      Option.match(findMessage(board, proof), {
        onNone: () => h.empty,
        onSome: message => h.div([h.Class('quote')], quote(board, message, h)),
      }),
      h.button(
        [
          h.Type('button'),
          h.Class('btn danger'),
          h.OnClick(Message.ClickedConfirmArrest()),
        ],
        [`Arrest ${name(suspect)}`],
      ),
      h.p([h.Class('hint center')], ['This ends the case.']),
    ],
    Submitted: () => [
      h.h2([h.Id('arrest-title')], ['Making the arrest…']),
      h.p([], ['Everyone gathers in the great room.']),
    ],
  })
  return sheet(
    'arrest-title',
    step._tag === 'Submitted' ? Option.none() : close,
    body,
    h,
  )
}

// RESULT

const endingCopy = (
  board: Board,
  result: CaseResult,
): Readonly<{ title: string; body: string }> => {
  const thief = guestName(board, result.thief)
  const item = board.intro.missingItem
  const copy: Readonly<Record<Ending, { title: string; body: string }>> = {
    caseClosed: {
      title: 'Case closed 🎉',
      body: `You caught ${thief} in a lie about the theft, and the proof held up. ${item} is going home.`,
    },
    theyWalk: {
      title: 'They walk',
      body: `${thief} did it, but your evidence didn’t prove the theft. They leave on Monday with ${item}.`,
    },
    wrongPerson: {
      title: 'Wrong person',
      body: `You arrested the wrong guest. ${thief} did it, and leaves on Monday with ${item}.`,
    },
  }
  return copy[result.ending]
}

const resultView = (
  board: Board,
  result: CaseResult,
  h: HtmlBuilder<Message>,
): Html => {
  const { title, body } = endingCopy(board, result)
  return sheet(
    'result-title',
    close,
    [
      h.h2([h.Id('result-title')], [title]),
      h.p([], [body]),
      h.h3([h.Class('sheet-section')], ['What really happened']),
      h.ol(
        [h.Class('timeline')],
        Array.map(result.timeline, event =>
          h.li(
            [],
            [
              h.span([h.Class('t-time')], [event.time]),
              h.span([], [event.text]),
            ],
          ),
        ),
      ),
      primary('Start a new case', Message.ClickedNewCase(), false, h),
    ],
    h,
  )
}

// SHEET

export const sheetView = (
  model: Model,
  board: Board,
  h: HtmlBuilder<Message>,
): Html =>
  Sheet.match(model.sheet, {
    Closed: () => h.empty,
    Intro: () => introView(board, h),
    CaseFile: () => caseFileView(board, h),
    ConfirmEndDay: () => confirmEndDayView(board, h),
    MessageActions: ({ messageId }) => messageActionsView(board, messageId, h),
    Arrest: ({ step }) => arrestView(board, step, h),
    Result: () =>
      Option.match(board.maybeResult, {
        onNone: () => h.empty,
        onSome: result => resultView(board, result, h),
      }),
  })

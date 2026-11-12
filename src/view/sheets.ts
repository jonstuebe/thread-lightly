import { Array, Option, String, pipe } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import {
  type CaseResult,
  type CaughtLie,
  type ChatMessage,
  type Ending,
  type Evidence,
  type GuestId,
  LAST_DAY,
  type MessageId,
  type Night,
  type RevealedEvent,
  type Solution,
  type Tally,
} from '../../shared/protocol'
import {
  PART_NAMES,
  caughtLieOf,
  caughtLiesAgainst,
  clockTitle,
  findGuest,
  findMessage,
  firstName,
  guestName,
  isAround,
  isCaughtAnswer,
  isPressedAnswer,
  isSaved,
  maybeAnswerId,
  maybeNextPart,
  messageText,
  savedMessages,
  senderLabel,
  ticksLabel,
  whereLabel,
} from '../chat'
import { Message } from '../message'
import { ArrestStep, type Board, type Model, Sheet } from '../model'
import { isReadyToAsk } from '../update'
import { avatar, clockDots, sheet } from './parts'

const close = Option.some(Message.ClickedCloseSheet())

const quoteBody = (
  board: Board,
  message: ChatMessage,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.span([h.Class('quote-text')], [messageText(board, message)]),
  h.span(
    [h.Class('quote-meta')],
    [`Day ${message.day} · ${whereLabel(message)}`],
  ),
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

const stamp = (h: HtmlBuilder<Message>): Html =>
  h.span([h.Class('stamp')], ['✓ caught'])

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
            [
              'Tap a question to send it. What you notice unlocks new ones, marked new.',
            ],
          ),
          h.li(
            [],
            [
              'Each part of the day has a few ticks. A question or a press costs one; the dots in the header show what’s left.',
            ],
          ),
          h.li(
            [],
            [
              'Long-press a message to save it to your case file. Long-press a reply to press the guest on it, or show proof from your case file that it’s a lie. Wrong proof costs two ticks, and they go quiet for a while.',
            ],
          ),
          h.li(
            [],
            [
              'Every morning the Wi-Fi log shows whose phone moved around overnight. It never lies.',
            ],
          ),
          h.li(
            [],
            [
              `By the end of day ${LAST_DAY}, arrest the thief on a lie you caught.`,
            ],
          ),
        ],
      ),
      primary('Start investigating', Message.ClickedCloseSheet(), false, h),
      secondary('Start a different case', Message.ClickedNewCase(), h),
    ],
    h,
  )

// CLOCK

const clockView = (board: Board, h: HtmlBuilder<Message>): Html => {
  const clock = board.clock
  const canAct = clock.phase === 'asking' && Option.isNone(board.maybeResult)
  return sheet(
    'clock-title',
    close,
    [
      h.h2([h.Id('clock-title')], [clockTitle(clock)]),
      h.p([h.Class('clock-line')], [clockDots(clock, h), ticksLabel(clock)]),
      h.p(
        [],
        [
          'A question, a press or the right proof costs one tick. Wrong proof costs two. Leftover ticks don’t carry over.',
        ],
      ),
      ...(canAct
        ? [
            Option.match(maybeNextPart(clock.part), {
              onNone: () => h.empty,
              onSome: next =>
                primary(
                  `Skip to the ${PART_NAMES[next].toLowerCase()}`,
                  Message.ClickedSkipPart(),
                  false,
                  h,
                ),
            }),
            clock.part === 'evening'
              ? primary('Go to sleep', Message.ClickedGoToSleep(), false, h)
              : secondary('Go to sleep', Message.ClickedGoToSleep(), h),
            h.p(
              [h.Class('hint center')],
              [
                'A part you skip still posts its news in the group chat. Parts you sleep through don’t.',
              ],
            ),
          ]
        : []),
      secondary('Keep investigating', Message.ClickedCloseSheet(), h),
    ],
    h,
  )
}

const confirmSleepView = (board: Board, h: HtmlBuilder<Message>): Html => {
  const clock = board.clock
  const after =
    clock.day < LAST_DAY
      ? `You’ll wake up to day ${clock.day + 1}.`
      : 'After that, it’s time to make your arrest.'
  return sheet(
    'sleep-title',
    close,
    [
      h.h2([h.Id('sleep-title')], ['Skip the rest of today?']),
      h.p(
        [],
        [
          `It’s only the ${PART_NAMES[clock.part].toLowerCase()}. Turn in now and everyone heads to bed early: the rest of today’s ticks go unused, and whatever the group would have said today goes unsaid. ${after}`,
        ],
      ),
      primary('Go to sleep', Message.ClickedConfirmSleep(), false, h),
      secondary('Not yet', Message.ClickedClock(), h),
    ],
    h,
  )
}

// CASE FILE

const senderKey = (message: ChatMessage): string =>
  message.sender._tag === 'Guest' ? message.sender.guest : message.sender._tag

const canArrest = (board: Board): boolean => Option.isNone(board.maybeResult)

const caughtLieView = (
  board: Board,
  lie: CaughtLie,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    lie.claimMessageId,
    [h.Class('caught-lie')],
    [
      h.div(
        [h.Class('caught-head')],
        [h.b([], [guestName(board, lie.guest)]), stamp(h)],
      ),
      ...Option.match(findMessage(board, lie.claimMessageId), {
        onNone: () => [],
        onSome: claim => [
          h.div([h.Class('quote')], quoteBody(board, claim, h)),
        ],
      }),
      h.span([h.Class('caught-by')], ['proved wrong by']),
      ...Option.match(findMessage(board, lie.proofMessageId), {
        onNone: () => [],
        onSome: proof => [h.div([h.Class('quote')], quote(board, proof, h))],
      }),
    ],
  )

const caseFileView = (board: Board, h: HtmlBuilder<Message>): Html => {
  const saved = savedMessages(board)
  const senders = Array.dedupe(Array.map(saved, senderKey))
  return sheet(
    'casefile-title',
    close,
    [
      h.h2([h.Id('casefile-title')], ['Case file']),
      Array.match(board.caught, {
        onEmpty: () => h.empty,
        onNonEmpty: caught =>
          h.section(
            [h.Class('file-group')],
            [
              h.h3([h.Class('sheet-section')], ['Caught lies']),
              h.ul(
                [h.Class('file-list')],
                Array.map(caught, lie => caughtLieView(board, lie, h)),
              ),
            ],
          ),
      }),
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
                            [
                              ...quoteBody(board, message, h),
                              Option.isSome(caughtLieOf(board, message))
                                ? stamp(h)
                                : h.empty,
                            ],
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
        ? primary('Make an arrest', Message.ClickedStartArrest(), false, h)
        : h.empty,
    ],
    h,
  )
}

// MESSAGE ACTIONS

type Confrontable = Readonly<{ isPressable: boolean; reason: string }>

// NOTE: only a guest's reply to a DM question can be pressed or confronted,
// and only while they're around to answer.
const confrontable = (
  model: Model,
  board: Board,
  message: ChatMessage,
): Option.Option<Confrontable> => {
  if (
    Option.isNone(maybeAnswerId(message)) ||
    message.sender._tag !== 'Guest'
  ) {
    return Option.none()
  }
  const guest = message.sender.guest
  const name = firstName(guestName(board, guest))
  const isHere = Option.exists(findGuest(board, guest), isAround)
  const reason = isCaughtAnswer(board, message)
    ? 'You already caught this lie.'
    : !isHere
      ? `${name} can’t answer right now.`
      : !isReadyToAsk(model)
        ? 'Wait for the conversation to settle.'
        : ''
  return Option.some({
    isPressable: reason === '' && !isPressedAnswer(board, message),
    reason,
  })
}

const confrontActions = (
  board: Board,
  message: ChatMessage,
  state: Confrontable,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const canProve = state.reason === ''
  const hasProof = Array.some(board.caseFile, id => id !== message.id)
  return [
    h.button(
      [
        h.Type('button'),
        h.Class('btn action'),
        h.Disabled(!state.isPressable),
        h.OnClick(Message.ClickedPressAnswer({ messageId: message.id })),
      ],
      ['Press: “Are you sure about that?”'],
    ),
    h.button(
      [
        h.Type('button'),
        h.Class('btn action'),
        h.Disabled(!canProve || !hasProof),
        h.OnClick(Message.ClickedShowProof({ messageId: message.id })),
      ],
      ['Show proof'],
    ),
    h.p(
      [h.Class('hint center')],
      [
        state.reason !== ''
          ? state.reason
          : isPressedAnswer(board, message)
            ? 'You’ve pressed this answer. Right proof costs one tick, wrong proof two.'
            : !hasProof
              ? 'Save something to your case file to use as proof.'
              : 'Pressing costs one tick. Right proof costs one, wrong proof two.',
      ],
    ),
  ]
}

const messageActionsView = (
  model: Model,
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
          h.div(
            [h.Class('quote big')],
            [
              ...quote(board, message, h),
              isCaughtAnswer(board, message) ? stamp(h) : h.empty,
            ],
          ),
          isSaved(board, messageId)
            ? secondary(
                'Remove from case file',
                Message.ClickedRemoveMessage({ messageId }),
                h,
              )
            : primary(
                'Add to case file',
                Message.ClickedSaveMessage({ messageId }),
                false,
                h,
              ),
          ...Option.match(confrontable(model, board, message), {
            onNone: () => [],
            onSome: state => confrontActions(board, message, state, h),
          }),
          secondary('Cancel', Message.ClickedCloseSheet(), h),
        ],
        h,
      ),
  })

// SHOW PROOF

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

const backLink = (message: Message, h: HtmlBuilder<Message>): Html =>
  h.button(
    [h.Type('button'), h.Class('btn ghost back-link'), h.OnClick(message)],
    ['‹ Back'],
  )

const showProofView = (
  board: Board,
  messageId: MessageId,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(findMessage(board, messageId), {
    onNone: () => h.empty,
    onSome: confronted => {
      const name =
        confronted.sender._tag === 'Guest'
          ? firstName(guestName(board, confronted.sender.guest))
          : 'them'
      const proofs = Array.filter(
        savedMessages(board),
        saved => saved.id !== confronted.id,
      )
      return sheet(
        'proof-title',
        close,
        [
          backLink(Message.RequestedMessageActions({ messageId }), h),
          h.h2([h.Id('proof-title')], [`Show ${name} proof`]),
          h.div([h.Class('quote')], quoteBody(board, confronted, h)),
          h.p(
            [],
            [
              'Pick what proves this wrong. Right proof costs one tick. Wrong proof costs two, and they go quiet until the next part of the day.',
            ],
          ),
          Array.match(proofs, {
            onEmpty: () =>
              h.p(
                [h.Class('hint')],
                ['Your case file has nothing else in it.'],
              ),
            onNonEmpty: nonEmpty =>
              pickList(
                board,
                nonEmpty,
                proofMessageId => Message.ClickedProofItem({ proofMessageId }),
                h,
              ),
          }),
        ],
        h,
      )
    },
  })

// ARREST

const arrestView = (
  board: Board,
  step: ArrestStep,
  h: HtmlBuilder<Message>,
): Html => {
  const name = (id: GuestId) => firstName(guestName(board, id))
  const claimOf = (lie: CaughtLie) => findMessage(board, lie.claimMessageId)
  const back = backLink(Message.ClickedArrestBack(), h)
  const body = ArrestStep.match(step, {
    PickSuspect: () => [
      back,
      h.h2([h.Id('arrest-title')], ['Who are you arresting?']),
      h.p(
        [],
        ['You get one arrest. Make it stick with a lie you caught them in.'],
      ),
      h.ul(
        [h.Class('pick-list')],
        Array.map(board.guests, guest => {
          const count = caughtLiesAgainst(board, guest.id).length
          return h.keyed('li')(
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
                      h.span(
                        [h.Class('opt-role')],
                        [
                          count === 0
                            ? guest.role
                            : `${guest.role} · ${count} caught ${count === 1 ? 'lie' : 'lies'}`,
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          )
        }),
      ),
    ],
    PickLie: ({ suspect }) => {
      const lies = caughtLiesAgainst(board, suspect)
      return [
        back,
        h.h2(
          [h.Id('arrest-title')],
          [`Which lie are you arresting ${name(suspect)} on?`],
        ),
        Array.match(lies, {
          onEmpty: () =>
            h.p(
              [],
              [
                `You haven’t caught ${name(suspect)} in a lie. You can still arrest them, on nothing.`,
              ],
            ),
          onNonEmpty: nonEmpty =>
            h.ul(
              [h.Class('pick-list')],
              Array.map(nonEmpty, lie =>
                h.keyed('li')(
                  lie.claimMessageId,
                  [],
                  [
                    h.button(
                      [
                        h.Type('button'),
                        h.Class('opt quote'),
                        h.OnClick(
                          Message.ClickedLie({ messageId: lie.claimMessageId }),
                        ),
                      ],
                      Option.match(claimOf(lie), {
                        onNone: () => [stamp(h)],
                        onSome: claim => [
                          ...quoteBody(board, claim, h),
                          stamp(h),
                        ],
                      }),
                    ),
                  ],
                ),
              ),
            ),
        }),
        secondary('Arrest with no caught lie', Message.ClickedNoLie(), h),
      ]
    },
    Confirm: ({ suspect, maybeLie }) => [
      back,
      h.h2([h.Id('arrest-title')], [`Arrest ${guestName(board, suspect)}?`]),
      ...Option.match(
        Option.flatMap(maybeLie, id => findMessage(board, id)),
        {
          onNone: () => [
            h.p([], ['You’re making this arrest without a caught lie.']),
          ],
          onSome: claim => [
            h.h3([h.Class('sheet-section')], ['The lie']),
            h.div([h.Class('quote')], quote(board, claim, h)),
          ],
        },
      ),
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
      body: `You caught ${thief} in a lie about the theft, and the proof held up. ${String.capitalize(item)} is going home.`,
    },
    theyWalk: {
      title: 'They walk',
      body: `${thief} did it, but the lie you had didn’t prove the theft. They leave on Monday with ${item}.`,
    },
    wrongPerson: {
      title: 'Wrong person',
      body: `You arrested the wrong guest. ${thief} did it, and leaves on Monday with ${item}.`,
    },
  }
  return copy[result.ending]
}

const NIGHT_NAMES: Readonly<Record<Night, string>> = {
  0: 'The night of the theft',
  1: 'Night 1',
  2: 'Night 2',
}

const EVIDENCE_LABELS: Readonly<Record<Evidence, string>> = {
  saved: 'In your case file',
  seen: 'You saw this',
  missed: 'Missed',
  none: '',
}

const solutionView = (
  board: Board,
  result: CaseResult,
  solution: Solution,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.h3(
    [h.Class('sheet-section')],
    [
      result.ending === 'caseClosed'
        ? 'How you cracked it'
        : 'What would have held up',
    ],
  ),
  h.dl(
    [h.Class('solution')],
    [
      h.dt([], [`${firstName(guestName(board, result.thief))}’s lie`]),
      h.dd([], [solution.claim]),
      h.dt([], ['The proof']),
      h.dd([], [solution.proof]),
    ],
  ),
]

const cluesLine = (timeline: ReadonlyArray<RevealedEvent>): string => {
  const count = (evidence: Evidence) =>
    Array.filter(timeline, event => event.evidence === evidence).length
  const clues = timeline.length - count('none')
  const found = count('saved') + count('seen')
  return clues === 1
    ? `You uncovered ${found} of the 1 event below that left a trace.`
    : `You uncovered ${found} of the ${clues} events below that left a trace.`
}

const tallyView = (
  tally: Tally,
  timeline: ReadonlyArray<RevealedEvent>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.dl(
    [h.Class('tally-grid')],
    [
      h.div(
        [],
        [h.dt([], ['Questions asked']), h.dd([], [`${tally.questionsAsked}`])],
      ),
      h.div([], [h.dt([], ['Lies caught']), h.dd([], [`${tally.liesCaught}`])]),
      h.div(
        [],
        [h.dt([], ['Wrong proofs']), h.dd([], [`${tally.wrongProofs}`])],
      ),
    ],
  ),
  h.p([h.Class('tally')], [cluesLine(timeline)]),
]

const eventView = (event: RevealedEvent, h: HtmlBuilder<Message>): Html =>
  h.li(
    [h.Class(`ev-${event.evidence}`)],
    [
      h.span([h.Class('t-time')], [event.time]),
      h.span(
        [h.Class('t-body')],
        [
          h.span([], [event.text]),
          event.evidence === 'none'
            ? h.empty
            : h.span(
                [h.Class('t-evidence')],
                [EVIDENCE_LABELS[event.evidence]],
              ),
        ],
      ),
    ],
  )

const timelineView = (
  timeline: ReadonlyArray<RevealedEvent>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.h3([h.Class('sheet-section')], ['What really happened']),
  ...pipe(
    Array.isReadonlyArrayNonEmpty(timeline)
      ? Array.groupWith(timeline, (a, b) => a.night === b.night)
      : [],
    Array.flatMap(events => [
      h.h4([h.Class('t-night')], [NIGHT_NAMES[events[0].night]]),
      h.ol(
        [h.Class('timeline')],
        Array.map(events, event => eventView(event, h)),
      ),
    ]),
  ),
]

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
      ...(result.solution === undefined
        ? []
        : solutionView(board, result, result.solution, h)),
      ...tallyView(result.tally, result.timeline, h),
      ...timelineView(result.timeline, h),
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
    Clock: () => clockView(board, h),
    ConfirmSleep: () => confirmSleepView(board, h),
    MessageActions: ({ messageId }) =>
      messageActionsView(model, board, messageId, h),
    ShowProof: ({ messageId }) => showProofView(board, messageId, h),
    Arrest: ({ step }) => arrestView(board, step, h),
    Result: () =>
      Option.match(board.maybeResult, {
        onNone: () => h.empty,
        onSome: result => resultView(board, result, h),
      }),
  })

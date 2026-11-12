import { Array, Option } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  type CaseResult,
  type ChatMessage,
  ClientMessage,
  type Clock,
  type Menu,
  type MessageId,
  type RejectionReason,
  ServerMessage,
  type Thread,
} from '../shared/protocol'
import {
  AFTER_POST_MILLIS,
  LONG_PRESS_MILLIS,
  MAX_RECONNECT_FAILURES,
  NIGHT_MILLIS,
  RECONNECT_MILLIS,
  WIFI_ENTRY_MILLIS,
  findMessage,
  isSameThread,
  threadKey,
  typingMillis,
} from './chat'
import {
  SaveGame,
  ScrollToLatest,
  SendToServer,
  StartCase,
  WaitForBeat,
  WaitForLongPress,
  WaitToReconnect,
} from './command'
import { Message } from './message'
import {
  ArrestStep,
  Asking,
  type Board,
  Connection,
  type Flags,
  Incoming,
  type Model,
  Playback,
  Sheet,
} from './model'
import type { CaseSocketService } from './socket'

type UpdateReturn = Update.Return<Model, Message, CaseSocketService>

// INIT

export const init = (flags: Flags): UpdateReturn => ({
  model: {
    connection:
      flags.gameId === null
        ? Connection.NoCase()
        : Connection.Connecting({
            gameId: flags.gameId,
            attempt: 0,
            failures: 0,
          }),
    played: flags.played,
    maybeBoard: Option.none(),
    incoming: [],
    playback: Playback.Idle(),
    playbackEpoch: 0,
    asking: Asking.Ready(),
    maybeOpenThread: Option.none(),
    unread: [],
    maybeNotice: Option.none(),
    sheet: Sheet.Closed(),
    maybePress: Option.none(),
    nextPressId: 0,
  },
})

// HELPERS

const andThen = (
  first: UpdateReturn,
  next: (model: Model) => UpdateReturn,
): UpdateReturn => {
  const second = next(first.model)
  return {
    model: second.model,
    commands: [...(first.commands ?? []), ...(second.commands ?? [])],
  }
}

const withBoard = (model: Model, change: (board: Board) => Board): Model =>
  modifyFields(model, {
    maybeBoard: maybeBoard => Option.map(maybeBoard, change),
  })

const sendToServer = (model: Model, message: ClientMessage): UpdateReturn => ({
  model,
  commands: [SendToServer({ message })],
})

// NOTE: the detective can act only while it's their move: it's daytime, the
// case is open, nothing is still playing, and no line of theirs is in flight.
export const isReadyToAsk = (model: Model): boolean =>
  model.asking._tag === 'Ready' &&
  model.playback._tag === 'Idle' &&
  Array.isReadonlyArrayEmpty(model.incoming) &&
  Option.exists(
    model.maybeBoard,
    board => board.clock.phase === 'asking' && Option.isNone(board.maybeResult),
  )

const isViewing = (model: Model, message: ChatMessage): boolean =>
  Option.exists(model.maybeOpenThread, thread =>
    isSameThread(thread, message.thread),
  )

// NOTE: the socket stream for a superseded connection can still deliver a
// frame or two while it's being torn down. Only the current one counts.
const isCurrentSocket = (
  model: Model,
  gameId: string,
  attempt: number,
): boolean =>
  model.connection._tag === 'Open' &&
  model.connection.gameId === gameId &&
  model.connection.attempt === attempt

// CONNECTION

const startCase = (model: Model): UpdateReturn =>
  model.connection._tag === 'Starting'
    ? { model }
    : {
        model: modifyFields(model, {
          connection: () => Connection.Starting(),
          sheet: () => Sheet.Closed(),
          maybeNotice: () => Option.none(),
        }),
        commands: [StartCase({ played: model.played })],
      }

const dropCase = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    connection: () => Connection.NoCase(),
    maybeBoard: () => Option.none(),
    incoming: () => [],
    playback: () => Playback.Idle(),
    playbackEpoch: epoch => epoch + 1,
    asking: () => Asking.Ready(),
    maybeOpenThread: () => Option.none(),
    sheet: () => Sheet.Closed(),
    maybeNotice: () =>
      Option.some('We couldn’t reach that case. Start a new one?'),
  }),
  commands: [SaveGame({ flags: { gameId: null, played: model.played } })],
})

const loseConnection = (model: Model): UpdateReturn => {
  const connection = model.connection
  if (connection._tag !== 'Connecting' && connection._tag !== 'Open') {
    return { model }
  }
  const failures =
    connection._tag === 'Connecting' ? connection.failures + 1 : 0
  if (failures >= MAX_RECONNECT_FAILURES) {
    return dropCase(model)
  }
  return {
    model: modifyFields(model, {
      connection: () =>
        Connection.Lost({
          gameId: connection.gameId,
          attempt: connection.attempt,
          failures,
        }),
    }),
    commands: [
      WaitToReconnect({
        attempt: connection.attempt,
        millis: RECONNECT_MILLIS * (failures + 1),
      }),
    ],
  }
}

// PLAYBACK

// NOTE: the wait ends when the server posts anything in the thread the
// detective acted in, usually their own line.
const settleAsking = (asking: Asking, message: ChatMessage): Asking =>
  asking._tag === 'Waiting' && isSameThread(asking.thread, message.thread)
    ? Asking.Ready()
    : asking

const applyPost = (model: Model, message: ChatMessage): UpdateReturn => {
  const posted = modifyFields(
    withBoard(model, board =>
      Array.some(board.messages, existing => existing.id === message.id)
        ? board
        : { ...board, messages: [...board.messages, message] },
    ),
    { asking: asking => settleAsking(asking, message) },
  )
  if (message.sender._tag === 'Detective' || isViewing(model, message)) {
    return { model: posted, commands: [ScrollToLatest()] }
  }
  const key = threadKey(message.thread)
  return {
    model: modifyFields(posted, {
      unread: unread => (unread.includes(key) ? unread : [...unread, key]),
    }),
  }
}

const hold = (model: Model, millis: number): UpdateReturn => ({
  model: modifyFields(model, { playback: () => Playback.Holding() }),
  commands: [WaitForBeat({ epoch: model.playbackEpoch, millis })],
})

const replaceMenu = (menus: ReadonlyArray<Menu>, menu: Menu) =>
  Array.some(menus, existing => isSameThread(existing.thread, menu.thread))
    ? Array.map(menus, existing =>
        isSameThread(existing.thread, menu.thread) ? menu : existing,
      )
    : [...menus, menu]

const applyResult = (model: Model, result: CaseResult): Model =>
  modifyFields(
    withBoard(model, board => ({ ...board, maybeResult: Option.some(result) })),
    { sheet: () => Sheet.Result() },
  )

const openArrestIfDue = (model: Model, clock: Clock): Model =>
  clock.phase === 'arrest' && model.sheet._tag === 'Closed'
    ? modifyFields(model, {
        sheet: () => Sheet.Arrest({ step: ArrestStep.PickSuspect() }),
      })
    : model

const applyClock = (model: Model, clock: Clock): Model =>
  openArrestIfDue(
    withBoard(model, board => ({ ...board, clock })),
    clock,
  )

const isNewDay = (model: Model, clock: Clock): boolean =>
  Option.exists(model.maybeBoard, board => clock.day > board.clock.day)

const play = (model: Model, next: Incoming): UpdateReturn =>
  Incoming.match(next, {
    Post: ({ message }) => {
      const body = message.body
      if (message.sender._tag === 'Guest' && body._tag === 'Text') {
        return {
          model: modifyFields(model, {
            playback: () => Playback.Typing({ message }),
          }),
          commands: [
            WaitForBeat({
              epoch: model.playbackEpoch,
              millis: typingMillis(body.text),
            }),
            ...(isViewing(model, message) ? [ScrollToLatest()] : []),
          ],
        }
      }
      if (message.sender._tag === 'Lodge') {
        return andThen(applyPost(model, message), posted =>
          hold(posted, WIFI_ENTRY_MILLIS),
        )
      }
      return andThen(applyPost(model, message), advance)
    },
    MenuChange: ({ menu }) =>
      advance(
        withBoard(model, board => ({
          ...board,
          menus: replaceMenu(board.menus, menu),
        })),
      ),
    StatusChange: ({ guest, status }) =>
      advance(
        withBoard(model, board => ({
          ...board,
          guests: Array.map(board.guests, profile =>
            profile.id === guest ? { ...profile, status } : profile,
          ),
        })),
      ),
    ClockChange: ({ clock }) =>
      isNewDay(model, clock)
        ? {
            model: modifyFields(model, {
              playback: () => Playback.Night({ clock }),
            }),
            commands: [
              WaitForBeat({ epoch: model.playbackEpoch, millis: NIGHT_MILLIS }),
            ],
          }
        : advance(applyClock(model, clock)),
    Pressed: ({ answerId }) =>
      advance(
        withBoard(model, board =>
          board.pressed.includes(answerId)
            ? board
            : { ...board, pressed: [...board.pressed, answerId] },
        ),
      ),
    Caught: ({ lie }) =>
      advance(
        withBoard(model, board =>
          Array.some(
            board.caught,
            existing => existing.claimMessageId === lie.claimMessageId,
          )
            ? board
            : { ...board, caught: [...board.caught, lie] },
        ),
      ),
    Result: ({ result }) => advance(applyResult(model, result)),
  })

// NOTE: menu and status changes resize the menu under the thread after the
// last post scrolled it, so the open thread scrolls again once playback rests.
const settled = (model: Model): UpdateReturn =>
  Option.isSome(model.maybeOpenThread)
    ? { model, commands: [ScrollToLatest()] }
    : { model }

const advance = (model: Model): UpdateReturn =>
  model.playback._tag !== 'Idle'
    ? { model }
    : Array.match(model.incoming, {
        onEmpty: () => settled(model),
        onNonEmpty: ([next, ...rest]) =>
          play(modifyFields(model, { incoming: () => rest }), next),
      })

const enqueue = (model: Model, next: Incoming): UpdateReturn =>
  advance(modifyFields(model, { incoming: incoming => [...incoming, next] }))

const continuePlayback = (model: Model): UpdateReturn =>
  Playback.match(model.playback, {
    Idle: () => advance(model),
    Typing: ({ message }) =>
      andThen(applyPost(model, message), posted =>
        hold(posted, AFTER_POST_MILLIS),
      ),
    Holding: () =>
      advance(modifyFields(model, { playback: () => Playback.Idle() })),
    Night: ({ clock }) =>
      advance(
        applyClock(
          modifyFields(model, { playback: () => Playback.Idle() }),
          clock,
        ),
      ),
  })

// SERVER MESSAGES

export const NOTICES: Readonly<Record<RejectionReason, string>> = {
  away: 'They’re not around right now.',
  quiet: 'They’re not answering right now.',
  asleep: 'Everyone’s asleep.',
  unknownQuestion: 'That question isn’t on the menu anymore.',
  notAnAnswer: 'You can only press or confront a reply to your question.',
  alreadyPressed: 'You’ve already pressed that answer.',
  alreadyCaught: 'You’ve already caught that lie.',
  notInCaseFile: 'Save the proof to your case file first.',
  notCaught: 'That lie hasn’t been caught.',
  notNow: 'That can’t happen right now.',
  tooFast: 'Slow down a little.',
  unknownMessage: 'That message isn’t in the case anymore.',
  invalid: 'That didn’t go through.',
}

const reject = (model: Model, reason: RejectionReason): UpdateReturn => ({
  model: modifyFields(model, {
    asking: () => Asking.Ready(),
    maybeNotice: () => Option.some(NOTICES[reason]),
    sheet: sheet =>
      sheet._tag === 'Arrest' && sheet.step._tag === 'Submitted'
        ? Sheet.Arrest({ step: ArrestStep.PickSuspect() })
        : sheet,
  }),
})

// NOTE: sleeping before the evening throws away the rest of the day, so it
// asks first. Sleeping in the evening or at bedtime doesn't.
const isEarlyNight = (model: Model): boolean =>
  Option.exists(model.maybeBoard, board => board.clock.part !== 'evening')

const goToSleep = (model: Model): UpdateReturn =>
  sendToServer(
    modifyFields(model, { sheet: () => Sheet.Closed() }),
    ClientMessage.cases.GoToSleep.make({}),
  )

const sheetAfterSnapshot = (sheet: Sheet, board: Board): Sheet => {
  if (Option.isSome(board.maybeResult)) {
    return sheet._tag === 'Arrest' ? Sheet.Result() : sheet
  }
  if (board.clock.phase === 'arrest' && sheet._tag === 'Closed') {
    return Sheet.Arrest({ step: ArrestStep.PickSuspect() })
  }
  return sheet
}

const receive = (model: Model, message: ServerMessage): UpdateReturn =>
  ServerMessage.match(message, {
    Snapshot: snapshot => {
      const board: Board = {
        intro: snapshot.intro,
        guests: snapshot.guests,
        messages: snapshot.messages,
        menus: snapshot.menus,
        caseFile: snapshot.caseFile,
        pressed: snapshot.pressed,
        caught: snapshot.caught,
        clock: snapshot.clock,
        maybeResult: Option.fromUndefinedOr(snapshot.result),
      }
      return {
        model: modifyFields(model, {
          maybeBoard: () => Option.some(board),
          incoming: () => [],
          playback: () => Playback.Idle(),
          playbackEpoch: epoch => epoch + 1,
          asking: () => Asking.Ready(),
          sheet: sheet => sheetAfterSnapshot(sheet, board),
        }),
        commands: [ScrollToLatest()],
      }
    },
    Typing: () => ({ model }),
    MessagePosted: ({ message: posted }) =>
      enqueue(model, Incoming.Post({ message: posted })),
    MenuChanged: ({ menu }) => enqueue(model, Incoming.MenuChange({ menu })),
    AnswerPressed: ({ answerId }) =>
      enqueue(model, Incoming.Pressed({ answerId })),
    LieCaught: ({ lie }) => enqueue(model, Incoming.Caught({ lie })),
    GuestStatusChanged: ({ guest, status }) =>
      enqueue(model, Incoming.StatusChange({ guest, status })),
    ClockChanged: ({ clock }) =>
      enqueue(model, Incoming.ClockChange({ clock })),
    CaseFileChanged: ({ caseFile }) => ({
      model: withBoard(model, board => ({ ...board, caseFile })),
    }),
    ArrestResult: ({ result }) => enqueue(model, Incoming.Result({ result })),
    Rejected: ({ reason }) => reject(model, reason),
  })

// ASKING

const ask = (
  model: Model,
  thread: Thread,
  message: ClientMessage,
): UpdateReturn =>
  isReadyToAsk(model)
    ? {
        model: modifyFields(model, {
          asking: () => Asking.Waiting({ thread }),
          sheet: () => Sheet.Closed(),
          maybeNotice: () => Option.none(),
        }),
        commands: [SendToServer({ message }), ScrollToLatest()],
      }
    : { model }

const withMessage = (
  model: Model,
  messageId: MessageId,
  next: (message: ChatMessage) => UpdateReturn,
): UpdateReturn =>
  Option.match(
    Option.flatMap(model.maybeBoard, board => findMessage(board, messageId)),
    { onNone: () => ({ model }), onSome: next },
  )

// CASE FILE

const saveMessage = (model: Model, messageId: string): UpdateReturn =>
  sendToServer(
    modifyFields(
      withBoard(model, board =>
        board.caseFile.includes(messageId)
          ? board
          : { ...board, caseFile: [...board.caseFile, messageId] },
      ),
      { sheet: () => Sheet.Closed() },
    ),
    ClientMessage.cases.SaveToCaseFile.make({ messageId }),
  )

const removeMessage = (model: Model, messageId: string): UpdateReturn =>
  sendToServer(
    modifyFields(
      withBoard(model, board => ({
        ...board,
        caseFile: Array.filter(board.caseFile, id => id !== messageId),
      })),
      {
        sheet: sheet =>
          sheet._tag === 'MessageActions' ? Sheet.Closed() : sheet,
      },
    ),
    ClientMessage.cases.RemoveFromCaseFile.make({ messageId }),
  )

// ARREST

const arrestStep = (model: Model): Option.Option<ArrestStep> =>
  model.sheet._tag === 'Arrest' ? Option.some(model.sheet.step) : Option.none()

const toArrestStep = (model: Model, step: ArrestStep): UpdateReturn => ({
  model: modifyFields(model, { sheet: () => Sheet.Arrest({ step }) }),
})

const arrestBack = (model: Model, step: ArrestStep): UpdateReturn =>
  ArrestStep.match(step, {
    PickSuspect: () => ({
      model: modifyFields(model, { sheet: () => Sheet.CaseFile() }),
    }),
    PickLie: () => toArrestStep(model, ArrestStep.PickSuspect()),
    Confirm: ({ suspect }) =>
      toArrestStep(model, ArrestStep.PickLie({ suspect })),
    Submitted: () => ({ model }),
  })

const pickLie = (
  model: Model,
  maybeLie: Option.Option<MessageId>,
): UpdateReturn =>
  Option.match(arrestStep(model), {
    onNone: () => ({ model }),
    onSome: step =>
      step._tag === 'PickLie'
        ? toArrestStep(
            model,
            ArrestStep.Confirm({ suspect: step.suspect, maybeLie }),
          )
        : { model },
  })

const confirmArrest = (model: Model, step: ArrestStep): UpdateReturn => {
  if (step._tag !== 'Confirm') {
    return { model }
  }
  const message = Option.match(step.maybeLie, {
    onNone: () => ClientMessage.cases.Arrest.make({ suspect: step.suspect }),
    onSome: lie =>
      ClientMessage.cases.Arrest.make({ suspect: step.suspect, lie }),
  })
  return sendToServer(
    modifyFields(model, {
      sheet: () => Sheet.Arrest({ step: ArrestStep.Submitted() }),
    }),
    message,
  )
}

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedNotification: () => startCase(model),
    ClickedNewCase: () => startCase(model),
    SucceededStartCase: ({ gameId, caseId }) => {
      const played = [
        ...Array.filter(model.played, id => id !== caseId),
        caseId,
      ]
      return {
        model: modifyFields(model, {
          connection: () =>
            Connection.Connecting({ gameId, attempt: 0, failures: 0 }),
          played: () => played,
          maybeBoard: () => Option.none(),
          incoming: () => [],
          playback: () => Playback.Idle(),
          playbackEpoch: epoch => epoch + 1,
          asking: () => Asking.Ready(),
          maybeOpenThread: () => Option.none(),
          unread: () => [],
          maybeNotice: () => Option.none(),
          sheet: () => Sheet.Intro(),
        }),
        commands: [SaveGame({ flags: { gameId, played } })],
      }
    },
    FailedStartCase: () => ({
      model: modifyFields(model, {
        connection: () => Connection.FailedStart(),
      }),
    }),
    CompletedSaveGame: () => ({ model }),

    AcquiredCaseSocket: () => {
      const connection = model.connection
      return connection._tag === 'Connecting'
        ? {
            model: modifyFields(model, {
              connection: () =>
                Connection.Open({
                  gameId: connection.gameId,
                  attempt: connection.attempt,
                }),
            }),
          }
        : { model }
    },
    FailedAcquireCaseSocket: () => loseConnection(model),
    ReleasedCaseSocket: () => ({ model }),
    ReceivedServerMessage: ({ gameId, attempt, message: received }) =>
      isCurrentSocket(model, gameId, attempt)
        ? receive(model, received)
        : { model },
    ClosedCaseSocket: ({ gameId, attempt }) =>
      isCurrentSocket(model, gameId, attempt)
        ? loseConnection(model)
        : { model },
    CompletedWaitToReconnect: ({ attempt }) => {
      const connection = model.connection
      return connection._tag === 'Lost' && connection.attempt === attempt
        ? {
            model: modifyFields(model, {
              connection: () =>
                Connection.Connecting({
                  gameId: connection.gameId,
                  attempt: attempt + 1,
                  failures: connection.failures,
                }),
            }),
          }
        : { model }
    },
    CompletedSendToServer: () => ({ model }),
    CompletedWaitForBeat: ({ epoch }) =>
      epoch === model.playbackEpoch ? continuePlayback(model) : { model },

    ClickedThreadRow: ({ thread }) => {
      const key = threadKey(thread)
      return {
        model: modifyFields(model, {
          maybeOpenThread: () => Option.some(thread),
          unread: unread => Array.filter(unread, other => other !== key),
          maybeNotice: () => Option.none(),
        }),
        commands: [ScrollToLatest()],
      }
    },
    ClickedBack: () => ({
      model: modifyFields(model, {
        maybeOpenThread: () => Option.none(),
        maybeNotice: () => Option.none(),
      }),
    }),
    CompletedScrollToLatest: () => ({ model }),
    ClickedChip: ({ thread, chipId }) =>
      ask(
        model,
        thread,
        ClientMessage.cases.AskQuestion.make({ thread, chipId }),
      ),

    PressedMessage: ({ messageId }) => ({
      model: modifyFields(model, {
        maybePress: () =>
          Option.some({ messageId, pressId: model.nextPressId }),
        nextPressId: id => id + 1,
      }),
      commands: [
        WaitForLongPress({
          pressId: model.nextPressId,
          millis: LONG_PRESS_MILLIS,
        }),
      ],
    }),
    ReleasedMessage: () => ({
      model: modifyFields(model, { maybePress: () => Option.none() }),
    }),
    CompletedWaitForLongPress: ({ pressId }) =>
      Option.match(model.maybePress, {
        onNone: () => ({ model }),
        onSome: press =>
          press.pressId === pressId
            ? {
                model: modifyFields(model, {
                  maybePress: () => Option.none(),
                  sheet: () =>
                    Sheet.MessageActions({ messageId: press.messageId }),
                }),
              }
            : { model },
      }),
    RequestedMessageActions: ({ messageId }) => ({
      model: modifyFields(model, {
        maybePress: () => Option.none(),
        sheet: () => Sheet.MessageActions({ messageId }),
      }),
    }),
    ClickedSaveMessage: ({ messageId }) => saveMessage(model, messageId),
    ClickedRemoveMessage: ({ messageId }) => removeMessage(model, messageId),
    ClickedPressAnswer: ({ messageId }) =>
      withMessage(model, messageId, pressed =>
        ask(
          model,
          pressed.thread,
          ClientMessage.cases.Press.make({ messageId }),
        ),
      ),
    ClickedShowProof: ({ messageId }) => ({
      model: modifyFields(model, {
        sheet: () => Sheet.ShowProof({ messageId }),
      }),
    }),
    ClickedProofItem: ({ proofMessageId }) =>
      model.sheet._tag === 'ShowProof'
        ? withMessage(model, model.sheet.messageId, confronted =>
            ask(
              model,
              confronted.thread,
              ClientMessage.cases.ShowProof.make({
                messageId: confronted.id,
                proofMessageId,
              }),
            ),
          )
        : { model },

    ClickedCaseInfo: () => ({
      model: modifyFields(model, { sheet: () => Sheet.Intro() }),
    }),
    ClickedCaseFile: () => ({
      model: modifyFields(model, { sheet: () => Sheet.CaseFile() }),
    }),
    ClickedCloseSheet: () => ({
      model: modifyFields(model, { sheet: () => Sheet.Closed() }),
    }),
    ClickedClock: () => ({
      model: modifyFields(model, { sheet: () => Sheet.Clock() }),
    }),
    ClickedSkipPart: () =>
      sendToServer(
        modifyFields(model, { sheet: () => Sheet.Closed() }),
        ClientMessage.cases.SkipPart.make({}),
      ),
    ClickedGoToSleep: () =>
      isEarlyNight(model)
        ? { model: modifyFields(model, { sheet: () => Sheet.ConfirmSleep() }) }
        : goToSleep(model),
    ClickedConfirmSleep: () => goToSleep(model),
    ClickedStartArrest: () => toArrestStep(model, ArrestStep.PickSuspect()),
    ClickedSuspect: ({ suspect }) =>
      toArrestStep(model, ArrestStep.PickLie({ suspect })),
    ClickedLie: ({ messageId }) => pickLie(model, Option.some(messageId)),
    ClickedNoLie: () => pickLie(model, Option.none()),
    ClickedArrestBack: () =>
      Option.match(arrestStep(model), {
        onNone: () => ({ model }),
        onSome: step => arrestBack(model, step),
      }),
    ClickedConfirmArrest: () =>
      Option.match(arrestStep(model), {
        onNone: () => ({ model }),
        onSome: step => confirmArrest(model, step),
      }),
    ClickedShowResult: () => ({
      model: modifyFields(model, { sheet: () => Sheet.Result() }),
    }),
  })

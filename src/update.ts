import { Array, Option, String, pipe } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  type CaseResult,
  type ChatMessage,
  ClientMessage,
  MAX_MESSAGE_LENGTH,
  type RejectionReason,
  ServerMessage,
} from '../shared/protocol'
import {
  AFTER_POST_MILLIS,
  LONG_PRESS_MILLIS,
  MAX_RECONNECT_FAILURES,
  NIGHT_MILLIS,
  RECONNECT_MILLIS,
  WIFI_ENTRY_MILLIS,
  isSameThread,
  threadKey,
  typingMillis,
} from './chat'
import {
  BlurComposer,
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
    pendingSends: [],
    maybeOpenThread: Option.none(),
    unread: [],
    messageInput: '',
    isComposerFocused: false,
    maybeViewport: Option.none(),
    maybeNotice: Option.none(),
    sheet: Sheet.Closed(),
    maybePress: Option.none(),
    nextLocalId: 0,
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

export const isPlaying = (model: Model): boolean =>
  Option.exists(
    model.maybeBoard,
    board => board.phase === 'day' && Option.isNone(board.maybeResult),
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
    pendingSends: () => [],
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

const takePending = (model: Model, message: ChatMessage): Model => {
  const body = message.body
  const text = body._tag === 'Text' ? body.text : ''
  const sameThread = (index: number) =>
    Option.exists(Array.get(model.pendingSends, index), pending =>
      isSameThread(pending.thread, message.thread),
    )
  const maybeIndex = pipe(
    Array.findFirstIndex(
      model.pendingSends,
      pending =>
        isSameThread(pending.thread, message.thread) && pending.text === text,
    ),
    Option.orElse(() =>
      Array.findFirstIndex(model.pendingSends, (_, index) => sameThread(index)),
    ),
  )
  return Option.match(maybeIndex, {
    onNone: () => model,
    onSome: index =>
      modifyFields(model, {
        pendingSends: pending => Array.remove(pending, index),
      }),
  })
}

const applyPost = (model: Model, message: ChatMessage): UpdateReturn => {
  const posted = withBoard(model, board =>
    Array.some(board.messages, existing => existing.id === message.id)
      ? board
      : { ...board, messages: [...board.messages, message] },
  )
  if (message.sender._tag === 'Detective') {
    return { model: takePending(posted, message), commands: [ScrollToLatest()] }
  }
  if (isViewing(model, message)) {
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

const applyResult = (model: Model, result: CaseResult): Model =>
  modifyFields(
    withBoard(model, board => ({
      ...board,
      phase: 'arrest',
      maybeResult: Option.some(result),
    })),
    { sheet: () => Sheet.Result() },
  )

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
    StatusChange: ({ guest, status }) =>
      advance(
        withBoard(model, board => ({
          ...board,
          guests: Array.map(board.guests, profile =>
            profile.id === guest ? { ...profile, status } : profile,
          ),
        })),
      ),
    PhaseChange: ({ day, phase }) => {
      const changed = withBoard(model, board => ({ ...board, day, phase }))
      if (phase === 'night') {
        return hold(changed, NIGHT_MILLIS)
      }
      if (phase === 'arrest' && model.sheet._tag === 'Closed') {
        return advance(
          modifyFields(changed, {
            sheet: () => Sheet.Arrest({ step: ArrestStep.PickSuspect() }),
          }),
        )
      }
      return advance(changed)
    },
    Result: ({ result }) => advance(applyResult(model, result)),
  })

const advance = (model: Model): UpdateReturn =>
  model.playback._tag !== 'Idle'
    ? { model }
    : Array.match(model.incoming, {
        onEmpty: () => ({ model }),
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
  })

// SERVER MESSAGES

const NOTICES: Readonly<Record<RejectionReason, string>> = {
  asleep: 'They’re asleep. Try again tomorrow.',
  leftOnRead: 'They’ve stopped answering you for today.',
  notNow: 'That can’t happen right now.',
  tooFast: 'Slow down a little.',
  unknownMessage: 'That message isn’t in the case anymore.',
  invalid: 'That didn’t go through.',
}

const reject = (model: Model, reason: RejectionReason): UpdateReturn => {
  const restored = Array.match(model.pendingSends, {
    onEmpty: () => model,
    onNonEmpty: ([first, ...rest]) =>
      reason === 'unknownMessage'
        ? model
        : modifyFields(model, {
            pendingSends: () => rest,
            messageInput: input => (input === '' ? first.text : input),
          }),
  })
  return {
    model: modifyFields(restored, {
      maybeNotice: () => Option.some(NOTICES[reason]),
      sheet: sheet =>
        sheet._tag === 'Arrest' && sheet.step._tag === 'Submitted'
          ? Sheet.Arrest({ step: ArrestStep.PickSuspect() })
          : sheet,
    }),
  }
}

const receive = (model: Model, message: ServerMessage): UpdateReturn =>
  ServerMessage.match(message, {
    Snapshot: snapshot => {
      const maybeResult = Option.fromUndefinedOr(snapshot.result)
      const board: Board = {
        intro: snapshot.intro,
        guests: snapshot.guests,
        messages: snapshot.messages,
        caseFile: snapshot.caseFile,
        day: snapshot.day,
        phase: snapshot.phase,
        maybeResult,
      }
      return {
        model: modifyFields(model, {
          maybeBoard: () => Option.some(board),
          incoming: () => [],
          playback: () => Playback.Idle(),
          playbackEpoch: epoch => epoch + 1,
          pendingSends: () => [],
          sheet: sheet =>
            Option.isSome(maybeResult) && sheet._tag === 'Arrest'
              ? Sheet.Result()
              : sheet,
        }),
        commands: [ScrollToLatest()],
      }
    },
    Typing: () => ({ model }),
    MessagePosted: ({ message: posted }) =>
      enqueue(model, Incoming.Post({ message: posted })),
    GuestStatusChanged: ({ guest, status }) =>
      enqueue(model, Incoming.StatusChange({ guest, status })),
    PhaseChanged: ({ day, phase }) =>
      enqueue(model, Incoming.PhaseChange({ day, phase })),
    CaseFileChanged: ({ caseFile }) => ({
      model: withBoard(model, board => ({ ...board, caseFile })),
    }),
    ArrestResult: ({ result }) => enqueue(model, Incoming.Result({ result })),
    Rejected: ({ reason }) => reject(model, reason),
  })

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
    PickClaim: () => toArrestStep(model, ArrestStep.PickSuspect()),
    PickProof: ({ suspect }) =>
      toArrestStep(model, ArrestStep.PickClaim({ suspect })),
    Confirm: ({ suspect, claim }) =>
      toArrestStep(model, ArrestStep.PickProof({ suspect, claim })),
    Submitted: () => ({ model }),
  })

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
          pendingSends: () => [],
          maybeOpenThread: () => Option.none(),
          unread: () => [],
          messageInput: () => '',
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
      const isSame = Option.exists(model.maybeOpenThread, open =>
        isSameThread(open, thread),
      )
      const key = threadKey(thread)
      return {
        model: modifyFields(model, {
          maybeOpenThread: () => Option.some(thread),
          unread: unread => Array.filter(unread, other => other !== key),
          messageInput: input => (isSame ? input : ''),
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
      commands: [BlurComposer()],
    }),
    UpdatedMessageInput: ({ value }) => ({
      model: modifyFields(model, { messageInput: () => value }),
    }),
    SubmittedMessage: () => {
      const text = String.trim(model.messageInput).slice(0, MAX_MESSAGE_LENGTH)
      return Option.match(model.maybeOpenThread, {
        onNone: () => ({ model }),
        onSome: thread =>
          !isPlaying(model) || thread._tag === 'WifiLog' || text === ''
            ? { model }
            : {
                model: modifyFields(model, {
                  pendingSends: pending => [
                    ...pending,
                    { id: model.nextLocalId, thread, text },
                  ],
                  nextLocalId: id => id + 1,
                  messageInput: () => '',
                  maybeNotice: () => Option.none(),
                }),
                commands: [
                  SendToServer({
                    message: ClientMessage.cases.SendMessage.make({
                      thread,
                      text,
                    }),
                  }),
                  ScrollToLatest(),
                ],
              },
      })
    },
    FocusedComposer: () => ({
      model: modifyFields(model, { isComposerFocused: () => true }),
      commands: [ScrollToLatest()],
    }),
    BlurredComposer: () => ({
      model: modifyFields(model, { isComposerFocused: () => false }),
    }),
    ClickedThread: () =>
      model.isComposerFocused
        ? { model, commands: [BlurComposer()] }
        : { model },
    CompletedBlurComposer: () => ({ model }),
    CompletedScrollToLatest: () => ({ model }),
    ChangedViewport: ({ height, offsetTop }) => ({
      model: modifyFields(model, {
        maybeViewport: () => Option.some({ height, offsetTop }),
      }),
    }),

    PressedMessage: ({ messageId }) => ({
      model: modifyFields(model, {
        maybePress: () =>
          Option.some({ messageId, pressId: model.nextLocalId }),
        nextLocalId: id => id + 1,
      }),
      commands: [
        WaitForLongPress({
          pressId: model.nextLocalId,
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
                commands: [BlurComposer()],
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

    ClickedCaseInfo: () => ({
      model: modifyFields(model, { sheet: () => Sheet.Intro() }),
    }),
    ClickedCaseFile: () => ({
      model: modifyFields(model, { sheet: () => Sheet.CaseFile() }),
      commands: [BlurComposer()],
    }),
    ClickedCloseSheet: () => ({
      model: modifyFields(model, { sheet: () => Sheet.Closed() }),
    }),
    ClickedEndDay: () =>
      isPlaying(model)
        ? {
            model: modifyFields(model, { sheet: () => Sheet.ConfirmEndDay() }),
          }
        : { model },
    ClickedConfirmEndDay: () =>
      sendToServer(
        modifyFields(model, { sheet: () => Sheet.Closed() }),
        ClientMessage.cases.EndDay.make({}),
      ),
    ClickedStartArrest: () => toArrestStep(model, ArrestStep.PickSuspect()),
    ClickedSuspect: ({ suspect }) =>
      toArrestStep(model, ArrestStep.PickClaim({ suspect })),
    ClickedClaim: ({ messageId }) =>
      Option.match(arrestStep(model), {
        onNone: () => ({ model }),
        onSome: step =>
          step._tag === 'PickClaim'
            ? toArrestStep(
                model,
                ArrestStep.PickProof({
                  suspect: step.suspect,
                  claim: messageId,
                }),
              )
            : { model },
      }),
    ClickedProof: ({ messageId }) =>
      Option.match(arrestStep(model), {
        onNone: () => ({ model }),
        onSome: step =>
          step._tag === 'PickProof'
            ? toArrestStep(
                model,
                ArrestStep.Confirm({
                  suspect: step.suspect,
                  claim: step.claim,
                  proof: messageId,
                }),
              )
            : { model },
      }),
    ClickedArrestBack: () =>
      Option.match(arrestStep(model), {
        onNone: () => ({ model }),
        onSome: step => arrestBack(model, step),
      }),
    ClickedConfirmArrest: () =>
      Option.match(arrestStep(model), {
        onNone: () => ({ model }),
        onSome: step =>
          step._tag === 'Confirm'
            ? sendToServer(
                modifyFields(model, {
                  sheet: () => Sheet.Arrest({ step: ArrestStep.Submitted() }),
                }),
                ClientMessage.cases.MakeArrest.make({
                  suspect: step.suspect,
                  claimMessageId: step.claim,
                  proofMessageId: step.proof,
                }),
              )
            : { model },
      }),
    ClickedShowResult: () => ({
      model: modifyFields(model, { sheet: () => Sheet.Result() }),
    }),
  })

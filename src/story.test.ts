import { Array, Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { ClientMessage, ServerMessage } from '../shared/protocol'
import { MAX_RECONNECT_FAILURES, NIGHT_MILLIS, typingMillis } from './chat'
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
import {
  GAME_ID,
  board,
  daleClaim,
  detectiveSays,
  dmDale,
  dmMargot,
  fromServer,
  guestSays,
  lockedModel,
  playingModel,
  wifiEntry,
} from './fixture'
import { Message } from './message'
import { ArrestStep, Connection, Playback, Sheet } from './model'
import { init, update } from './update'

const boardOf = (target: typeof playingModel) =>
  Option.getOrThrow(target.maybeBoard)

const settle = Command.resolveAll(
  ...Array.makeBy(
    20,
    () => [ScrollToLatest, Message.CompletedScrollToLatest()] as const,
  ),
  ...Array.makeBy(
    20,
    () => [SendToServer, Message.CompletedSendToServer()] as const,
  ),
  ...Array.makeBy(
    5,
    () => [BlurComposer, Message.CompletedBlurComposer()] as const,
  ),
  ...Array.makeBy(5, () => [SaveGame, Message.CompletedSaveGame()] as const),
)

const playOut = (epoch: number) =>
  Command.resolveAll(
    ...Array.makeBy(
      20,
      () => [WaitForBeat, Message.CompletedWaitForBeat({ epoch })] as const,
    ),
  )

describe('starting', () => {
  test('a saved game reconnects on load, and a fresh visit waits', () => {
    expect(init({ gameId: GAME_ID, played: ['x'] }).model.connection).toEqual(
      Connection.Connecting({ gameId: GAME_ID, attempt: 0, failures: 0 }),
    )
    expect(lockedModel.connection).toEqual(Connection.NoCase())
  })

  test('tapping the notification starts a case and remembers it', () => {
    story(
      update,
      given({ ...lockedModel, played: ['old', 'silver-brooch'] }),
      message(Message.ClickedNotification()),
      Command.expectExact(StartCase),
      Command.resolve(
        StartCase,
        Message.SucceededStartCase({ gameId: GAME_ID, caseId: 'old' }),
      ),
      Command.expectExact(SaveGame),
      model(next => {
        expect(next.connection._tag).toBe('Connecting')
        expect(next.played).toEqual(['silver-brooch', 'old'])
        expect(next.sheet).toEqual(Sheet.Intro())
      }),
      settle,
    )
  })

  test('the snapshot fills the board', () => {
    story(
      update,
      given({
        ...lockedModel,
        connection: Connection.Open({ gameId: GAME_ID, attempt: 0 }),
      }),
      message(
        fromServer(
          ServerMessage.cases.Snapshot.make({
            intro: board.intro,
            guests: board.guests,
            messages: board.messages,
            caseFile: ['m2'],
            day: 2,
            phase: 'day',
          }),
        ),
      ),
      model(next => {
        const filled = boardOf(next)
        expect(filled.day).toBe(2)
        expect(filled.caseFile).toEqual(['m2'])
        expect(filled.maybeResult).toEqual(Option.none())
      }),
      settle,
    )
  })

  test('a frame from an old socket is ignored', () => {
    story(
      update,
      given(playingModel),
      message(
        Message.ReceivedServerMessage({
          gameId: GAME_ID,
          attempt: 7,
          message: ServerMessage.cases.CaseFileChanged.make({
            caseFile: ['m1'],
          }),
        }),
      ),
      Command.expectNone(),
      model(next => {
        expect(boardOf(next).caseFile).toEqual([])
      }),
    )
  })
})

describe('reconnecting', () => {
  test('a closed socket waits, then reconnects with a new attempt', () => {
    story(
      update,
      given(playingModel),
      message(Message.ClosedCaseSocket({ gameId: GAME_ID, attempt: 0 })),
      model(next => {
        expect(next.connection).toEqual(
          Connection.Lost({ gameId: GAME_ID, attempt: 0, failures: 0 }),
        )
      }),
      Command.resolve(
        WaitToReconnect,
        Message.CompletedWaitToReconnect({ attempt: 0 }),
      ),
      model(next => {
        expect(next.connection).toEqual(
          Connection.Connecting({ gameId: GAME_ID, attempt: 1, failures: 0 }),
        )
      }),
    )
  })

  test('a case that keeps failing is dropped', () => {
    story(
      update,
      given({
        ...playingModel,
        connection: Connection.Connecting({
          gameId: GAME_ID,
          attempt: 4,
          failures: MAX_RECONNECT_FAILURES - 1,
        }),
      }),
      message(Message.FailedAcquireCaseSocket()),
      Command.expectExact(SaveGame),
      model(next => {
        expect(next.connection).toEqual(Connection.NoCase())
        expect(next.maybeBoard).toEqual(Option.none())
        expect(Option.isSome(next.maybeNotice)).toBe(true)
      }),
      settle,
    )
  })
})

describe('pacing', () => {
  test('a guest reply shows typing, then posts, then holds', () => {
    const text = 'I went up at ten.'
    const reply = guestSays('m3', dmMargot, 'margot', text)
    story(
      update,
      given({ ...playingModel, maybeOpenThread: Option.some(dmMargot) }),
      message(
        fromServer(ServerMessage.cases.MessagePosted.make({ message: reply })),
      ),
      model(next => {
        expect(next.playback._tag).toBe('Typing')
        expect(boardOf(next).messages).not.toContainEqual(reply)
      }),
      Command.expectExact(WaitForBeat),
      Command.resolve(
        WaitForBeat({ epoch: 0, millis: typingMillis(text) }),
        Message.CompletedWaitForBeat({ epoch: 0 }),
      ),
      model(next => {
        expect(next.playback._tag).toBe('Holding')
        expect(boardOf(next).messages).toContainEqual(reply)
      }),
      playOut(0),
      model(next => {
        expect(next.playback._tag).toBe('Idle')
      }),
      settle,
    )
  })

  test('a reply in another thread marks it unread until opened', () => {
    const reply = guestSays('m3', dmMargot, 'margot', 'Morning!')
    story(
      update,
      given({ ...playingModel, maybeOpenThread: Option.some(dmDale) }),
      message(
        fromServer(ServerMessage.cases.MessagePosted.make({ message: reply })),
      ),
      playOut(0),
      model(next => {
        expect(next.unread).toEqual(['dm-margot'])
      }),
      message(Message.ClickedThreadRow({ thread: dmMargot })),
      model(next => {
        expect(next.unread).toEqual([])
      }),
      settle,
    )
  })

  test('a timer from before a snapshot is ignored', () => {
    story(
      update,
      given({
        ...playingModel,
        playbackEpoch: 3,
        playback: Playback.Holding(),
      }),
      message(Message.CompletedWaitForBeat({ epoch: 2 })),
      Command.expectNone(),
      model(next => {
        expect(next.playback._tag).toBe('Holding')
      }),
    )
  })
})

describe('sending', () => {
  test('a sent message shows as pending until the server posts it', () => {
    story(
      update,
      given({ ...playingModel, maybeOpenThread: Option.some(dmDale) }),
      message(Message.UpdatedMessageInput({ value: '  where were you?  ' })),
      message(Message.SubmittedMessage()),
      Command.expectHas(
        SendToServer({
          message: ClientMessage.cases.SendMessage.make({
            thread: dmDale,
            text: 'where were you?',
          }),
        }),
      ),
      model(next => {
        expect(next.messageInput).toBe('')
        expect(Array.map(next.pendingSends, send => send.text)).toEqual([
          'where were you?',
        ])
      }),
      settle,
      message(
        fromServer(
          ServerMessage.cases.MessagePosted.make({
            message: detectiveSays('m9', dmDale, 'where were you?'),
          }),
        ),
      ),
      model(next => {
        expect(next.pendingSends).toEqual([])
        expect(Array.last(boardOf(next).messages)).toEqual(
          Option.some(detectiveSays('m9', dmDale, 'where were you?')),
        )
      }),
      settle,
    )
  })

  test('a rejected message comes back to the composer with a notice', () => {
    story(
      update,
      given({
        ...playingModel,
        maybeOpenThread: Option.some(dmDale),
        pendingSends: [{ id: 0, thread: dmDale, text: 'hello?' }],
      }),
      message(
        fromServer(ServerMessage.cases.Rejected.make({ reason: 'asleep' })),
      ),
      model(next => {
        expect(next.pendingSends).toEqual([])
        expect(next.messageInput).toBe('hello?')
        expect(Option.isSome(next.maybeNotice)).toBe(true)
      }),
    )
  })

  test('the Wi-Fi log has no composer to send from', () => {
    story(
      update,
      given({
        ...playingModel,
        maybeOpenThread: Option.some(wifiEntry.thread),
        messageInput: 'hi',
      }),
      message(Message.SubmittedMessage()),
      Command.expectNone(),
    )
  })
})

describe('case file', () => {
  test('a long press opens the message menu', () => {
    story(
      update,
      given(playingModel),
      message(Message.PressedMessage({ messageId: 'm2' })),
      Command.resolve(
        WaitForLongPress,
        Message.CompletedWaitForLongPress({ pressId: 0 }),
      ),
      model(next => {
        expect(next.sheet).toEqual(Sheet.MessageActions({ messageId: 'm2' }))
      }),
      settle,
      message(Message.ClickedSaveMessage({ messageId: 'm2' })),
      Command.expectHas(
        SendToServer({
          message: ClientMessage.cases.SaveToCaseFile.make({ messageId: 'm2' }),
        }),
      ),
      model(next => {
        expect(boardOf(next).caseFile).toEqual(['m2'])
        expect(next.sheet).toEqual(Sheet.Closed())
      }),
      settle,
    )
  })

  test('letting go early is just a tap', () => {
    story(
      update,
      given({
        ...playingModel,
        maybePress: Option.some({ messageId: 'm2', pressId: 0 }),
      }),
      message(Message.ReleasedMessage()),
      message(Message.CompletedWaitForLongPress({ pressId: 0 })),
      Command.expectNone(),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Closed())
      }),
    )
  })
})

describe('days and the arrest', () => {
  test('ending the day asks first, then tells the server', () => {
    story(
      update,
      given(playingModel),
      message(Message.ClickedEndDay()),
      Command.expectNone(),
      message(Message.ClickedConfirmEndDay()),
      Command.expectExact(
        SendToServer({ message: ClientMessage.cases.EndDay.make({}) }),
      ),
      settle,
    )
  })

  test('night holds before the morning messages play', () => {
    story(
      update,
      given(playingModel),
      message(
        fromServer(
          ServerMessage.cases.PhaseChanged.make({ day: 1, phase: 'night' }),
        ),
      ),
      Command.expectExact(WaitForBeat({ epoch: 0, millis: NIGHT_MILLIS })),
      model(next => {
        expect(boardOf(next).phase).toBe('night')
      }),
      playOut(0),
    )
    story(
      update,
      given({
        ...playingModel,
        maybeBoard: Option.some({ ...board, phase: 'night' as const }),
        playback: Playback.Holding(),
      }),
      message(
        fromServer(
          ServerMessage.cases.PhaseChanged.make({ day: 2, phase: 'day' }),
        ),
      ),
      Command.expectNone(),
      model(next => {
        expect(boardOf(next).phase).toBe('night')
      }),
      message(Message.CompletedWaitForBeat({ epoch: 0 })),
      model(next => {
        expect(boardOf(next).day).toBe(2)
        expect(boardOf(next).phase).toBe('day')
      }),
      playOut(0),
    )
  })

  test('the arrest walks suspect, claim, proof, then confirm', () => {
    const saved = {
      ...playingModel,
      maybeBoard: Option.some({ ...board, caseFile: ['m1', 'm2'] }),
    }
    story(
      update,
      given(saved),
      message(Message.ClickedStartArrest()),
      message(Message.ClickedSuspect({ suspect: 'dale' })),
      message(Message.ClickedClaim({ messageId: daleClaim.id })),
      message(Message.ClickedProof({ messageId: wifiEntry.id })),
      model(next => {
        expect(next.sheet).toEqual(
          Sheet.Arrest({
            step: ArrestStep.Confirm({
              suspect: 'dale',
              claim: 'm2',
              proof: 'm1',
            }),
          }),
        )
      }),
      message(Message.ClickedArrestBack()),
      message(Message.ClickedProof({ messageId: wifiEntry.id })),
      message(Message.ClickedConfirmArrest()),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.MakeArrest.make({
            suspect: 'dale',
            claimMessageId: 'm2',
            proofMessageId: 'm1',
          }),
        }),
      ),
      settle,
      message(
        fromServer(
          ServerMessage.cases.ArrestResult.make({
            result: {
              ending: 'caseClosed',
              thief: 'dale',
              timeline: [{ time: '01:10', text: 'Dale takes the brooch.' }],
            },
          }),
        ),
      ),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Result())
        expect(
          Option.map(boardOf(next).maybeResult, result => result.ending),
        ).toEqual(Option.some('caseClosed'))
      }),
    )
  })

  test('day 3 ending opens the arrest', () => {
    story(
      update,
      given(playingModel),
      message(
        fromServer(
          ServerMessage.cases.PhaseChanged.make({ day: 3, phase: 'arrest' }),
        ),
      ),
      model(next => {
        expect(next.sheet).toEqual(
          Sheet.Arrest({ step: ArrestStep.PickSuspect() }),
        )
      }),
    )
  })
})

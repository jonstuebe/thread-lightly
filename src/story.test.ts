import { Array, Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { ClientMessage, ServerMessage } from '../shared/protocol'
import { MAX_RECONNECT_FAILURES, typingMillis } from './chat'
import {
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
  chip,
  daleClaim,
  detectiveSays,
  dmDale,
  dmMargot,
  fromServer,
  guestAnswers,
  guestSays,
  lockedModel,
  morning,
  playingModel,
  wifiEntry,
  withBoard,
} from './fixture'
import { Message } from './message'
import {
  ArrestStep,
  Asking,
  Connection,
  type Model,
  Playback,
  Sheet,
} from './model'
import { init, isReadyToAsk, update } from './update'

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
  ...Array.makeBy(5, () => [SaveGame, Message.CompletedSaveGame()] as const),
)

// NOTE: a story can't send a frame while a timer is pending, so a batch the
// server sends at once is folded in first, as the socket would deliver it.
const receiving = (
  start: Model,
  ...frames: ReadonlyArray<ServerMessage>
): Model =>
  Array.reduce(
    frames,
    start,
    (current, frame) => update(current, fromServer(frame)).model,
  )

const playOut = (epoch: number) =>
  Command.resolveAll(
    ...Array.makeBy(
      20,
      () => [WaitForBeat, Message.CompletedWaitForBeat({ epoch })] as const,
    ),
    ...Array.makeBy(
      20,
      () => [ScrollToLatest, Message.CompletedScrollToLatest()] as const,
    ),
  )

const result = {
  ending: 'caseClosed' as const,
  thief: 'dale',
  timeline: [
    {
      night: 0 as const,
      time: '01:10',
      text: 'Dale takes the brooch.',
      evidence: 'none' as const,
    },
  ],
  tally: { questionsAsked: 9, liesCaught: 1, wrongProofs: 0 },
}

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
    const clock = {
      day: 2 as const,
      part: 'afternoon' as const,
      phase: 'asking' as const,
      ticksLeft: 2,
      partBudget: 4,
    }
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
            menus: board.menus,
            caseFile: ['m3'],
            pressed: ['a1'],
            caught: [],
            clock,
          }),
        ),
      ),
      model(next => {
        const filled = boardOf(next)
        expect(filled.clock).toEqual(clock)
        expect(filled.caseFile).toEqual(['m3'])
        expect(filled.pressed).toEqual(['a1'])
        expect(filled.menus).toEqual(board.menus)
        expect(filled.maybeResult).toEqual(Option.none())
      }),
      settle,
    )
  })

  test('a snapshot after day 3 opens the arrest', () => {
    story(
      update,
      given(playingModel),
      message(
        fromServer(
          ServerMessage.cases.Snapshot.make({
            intro: board.intro,
            guests: board.guests,
            messages: [],
            menus: [],
            caseFile: [],
            pressed: [],
            caught: [],
            clock: { ...morning(0), day: 3, part: 'evening', phase: 'arrest' },
          }),
        ),
      ),
      model(next => {
        expect(next.sheet).toEqual(
          Sheet.Arrest({ step: ArrestStep.PickSuspect() }),
        )
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
    const reply = guestSays('m9', dmMargot, 'margot', text)
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
      Command.expectExact(WaitForBeat, ScrollToLatest),
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

  test('new chips wait until the reply that unlocked them has posted', () => {
    const reply = guestSays('m9', dmDale, 'dale', 'ask Margot about the lamp')
    const menu = {
      thread: dmMargot,
      chips: [chip('c-lamp', 'What about the lamp?', true)],
    }
    const queued = receiving(
      { ...playingModel, maybeOpenThread: Option.some(dmDale) },
      ServerMessage.cases.MessagePosted.make({ message: reply }),
      ServerMessage.cases.MenuChanged.make({ menu }),
    )
    expect(Option.getOrThrow(queued.maybeBoard).menus).toEqual(board.menus)
    story(
      update,
      given(queued),
      message(Message.CompletedWaitForBeat({ epoch: 0 })),
      model(next => {
        expect(boardOf(next).messages).toContainEqual(reply)
        expect(boardOf(next).menus).toEqual(board.menus)
      }),
      playOut(0),
      model(next => {
        expect(boardOf(next).menus).toContainEqual(menu)
        expect(next.incoming).toEqual([])
      }),
      settle,
    )
  })

  test('a reply in another thread marks it unread until opened', () => {
    const reply = guestSays('m9', dmMargot, 'margot', 'Morning!')
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

describe('asking', () => {
  test('tapping a chip sends its opaque ID and waits for the server', () => {
    story(
      update,
      given({ ...playingModel, maybeOpenThread: Option.some(dmDale) }),
      message(Message.ClickedChip({ thread: dmDale, chipId: 'c-kitchen' })),
      Command.expectHas(
        SendToServer({
          message: ClientMessage.cases.AskQuestion.make({
            thread: dmDale,
            chipId: 'c-kitchen',
          }),
        }),
      ),
      model(next => {
        expect(next.asking).toEqual(Asking.Waiting({ thread: dmDale }))
        expect(isReadyToAsk(next)).toBe(false)
      }),
      settle,
      message(Message.ClickedChip({ thread: dmDale, chipId: 'c-brooch' })),
      Command.expectNone(),
      message(
        fromServer(
          ServerMessage.cases.MessagePosted.make({
            message: detectiveSays(
              'm9',
              dmDale,
              'Why was your phone in the kitchen?',
            ),
          }),
        ),
      ),
      model(next => {
        expect(next.asking).toEqual(Asking.Ready())
        expect(Array.last(boardOf(next).messages)).toEqual(
          Option.some(
            detectiveSays('m9', dmDale, 'Why was your phone in the kitchen?'),
          ),
        )
      }),
      settle,
    )
  })

  test('a rejection frees the menu and says why', () => {
    story(
      update,
      given({ ...playingModel, asking: Asking.Waiting({ thread: dmDale }) }),
      message(
        fromServer(ServerMessage.cases.Rejected.make({ reason: 'away' })),
      ),
      model(next => {
        expect(next.asking).toEqual(Asking.Ready())
        expect(next.maybeNotice).toEqual(
          Option.some('They’re not around right now.'),
        )
      }),
    )
  })

  test('the clock ticks down in turn with the replies', () => {
    const reply = guestSays('m9', dmDale, 'dale', 'fine.')
    const queued = receiving(
      playingModel,
      ServerMessage.cases.MessagePosted.make({ message: reply }),
      ServerMessage.cases.ClockChanged.make({ clock: morning(2) }),
    )
    expect(Option.getOrThrow(queued.maybeBoard).clock.ticksLeft).toBe(3)
    story(
      update,
      given(queued),
      message(Message.CompletedWaitForBeat({ epoch: 0 })),
      playOut(0),
      model(next => {
        expect(boardOf(next).clock.ticksLeft).toBe(2)
      }),
      settle,
    )
  })

  test('nobody can be asked at bedtime', () => {
    expect(
      isReadyToAsk(withBoard({ clock: { ...morning(0), phase: 'bedtime' } })),
    ).toBe(false)
    expect(isReadyToAsk(playingModel)).toBe(true)
  })
})

describe('pressing and proof', () => {
  test('a long press opens the actions; Press sends the bubble', () => {
    story(
      update,
      given(playingModel),
      message(Message.PressedMessage({ messageId: daleClaim.id })),
      Command.resolve(
        WaitForLongPress,
        Message.CompletedWaitForLongPress({ pressId: 0 }),
      ),
      model(next => {
        expect(next.sheet).toEqual(
          Sheet.MessageActions({ messageId: daleClaim.id }),
        )
      }),
      message(Message.ClickedPressAnswer({ messageId: daleClaim.id })),
      Command.expectHas(
        SendToServer({
          message: ClientMessage.cases.Press.make({ messageId: daleClaim.id }),
        }),
      ),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Closed())
        expect(next.asking).toEqual(Asking.Waiting({ thread: dmDale }))
      }),
      settle,
      message(
        fromServer(ServerMessage.cases.AnswerPressed.make({ answerId: 'a1' })),
      ),
      model(next => {
        expect(boardOf(next).pressed).toEqual(['a1'])
      }),
    )
  })

  test('letting go early is just a tap', () => {
    story(
      update,
      given({
        ...playingModel,
        maybePress: Option.some({ messageId: 'm3', pressId: 0 }),
      }),
      message(Message.ReleasedMessage()),
      message(Message.CompletedWaitForLongPress({ pressId: 0 })),
      Command.expectNone(),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Closed())
      }),
    )
  })

  test('showing proof sends the confronted bubble and the saved item', () => {
    story(
      update,
      given(withBoard({ caseFile: ['m1'] })),
      message(Message.ClickedShowProof({ messageId: 'm4' })),
      model(next => {
        expect(next.sheet).toEqual(Sheet.ShowProof({ messageId: 'm4' }))
      }),
      message(Message.ClickedProofItem({ proofMessageId: 'm1' })),
      Command.expectHas(
        SendToServer({
          message: ClientMessage.cases.ShowProof.make({
            messageId: 'm4',
            proofMessageId: 'm1',
          }),
        }),
      ),
      settle,
      message(
        fromServer(
          ServerMessage.cases.LieCaught.make({
            lie: { guest: 'dale', claimMessageId: 'm3', proofMessageId: 'm1' },
          }),
        ),
      ),
      model(next => {
        expect(boardOf(next).caught).toEqual([
          { guest: 'dale', claimMessageId: 'm3', proofMessageId: 'm1' },
        ])
      }),
    )
  })

  test('a guest going quiet waits its turn behind their reply', () => {
    const reply = guestAnswers(
      'm9',
      'a2',
      dmDale,
      'dale',
      'that’s nothing to do with me?',
    )
    const queued = receiving(
      playingModel,
      ServerMessage.cases.MessagePosted.make({ message: reply }),
      ServerMessage.cases.GuestStatusChanged.make({
        guest: 'dale',
        status: { _tag: 'Quiet' },
      }),
    )
    story(
      update,
      given(queued),
      model(next => {
        expect(
          Array.map(boardOf(next).guests, guest => guest.status._tag),
        ).toEqual(['Around', 'Around'])
      }),
      message(Message.CompletedWaitForBeat({ epoch: 0 })),
      playOut(0),
      model(next => {
        expect(
          Array.map(boardOf(next).guests, guest => guest.status._tag),
        ).toEqual(['Around', 'Quiet'])
      }),
      settle,
    )
  })
})

describe('the case file', () => {
  test('saving shows straight away and tells the server', () => {
    story(
      update,
      given(playingModel),
      message(Message.ClickedSaveMessage({ messageId: 'm3' })),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.SaveToCaseFile.make({ messageId: 'm3' }),
        }),
      ),
      model(next => {
        expect(boardOf(next).caseFile).toEqual(['m3'])
        expect(next.sheet).toEqual(Sheet.Closed())
      }),
      settle,
    )
  })
})

describe('time and the arrest', () => {
  test('skipping and sleeping tell the server', () => {
    story(
      update,
      given(playingModel),
      message(Message.ClickedClock()),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Clock())
      }),
      message(Message.ClickedSkipPart()),
      Command.expectExact(
        SendToServer({ message: ClientMessage.cases.SkipPart.make({}) }),
      ),
      settle,
      message(Message.ClickedGoToSleep()),
      Command.expectNone(),
      model(next => {
        expect(next.sheet).toEqual(Sheet.ConfirmSleep())
      }),
      message(Message.ClickedConfirmSleep()),
      Command.expectExact(
        SendToServer({ message: ClientMessage.cases.GoToSleep.make({}) }),
      ),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Closed())
      }),
      settle,
    )
  })

  test('going to sleep in the evening needs no confirmation', () => {
    story(
      update,
      given(withBoard({ clock: { ...morning(2), part: 'evening' } })),
      message(Message.ClickedGoToSleep()),
      Command.expectExact(
        SendToServer({ message: ClientMessage.cases.GoToSleep.make({}) }),
      ),
      settle,
    )
  })

  test('backing out of an early night returns to the clock', () => {
    story(
      update,
      given(playingModel),
      message(Message.ClickedGoToSleep()),
      message(Message.ClickedClock()),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Clock())
      }),
    )
  })

  test('night holds before the morning clock and messages play', () => {
    const nextMorning = { ...morning(4), day: 2 as const }
    const entry = { ...wifiEntry, id: 'm20', day: 2 as const }
    const queued = receiving(
      withBoard({
        clock: { ...morning(0), part: 'evening', phase: 'bedtime' },
      }),
      ServerMessage.cases.ClockChanged.make({ clock: nextMorning }),
      ServerMessage.cases.MessagePosted.make({ message: entry }),
    )
    expect(queued.playback).toEqual(Playback.Night({ clock: nextMorning }))
    expect(Option.getOrThrow(queued.maybeBoard).clock.day).toBe(1)
    story(
      update,
      given(queued),
      message(Message.CompletedWaitForBeat({ epoch: 0 })),
      model(next => {
        expect(boardOf(next).clock).toEqual(nextMorning)
        expect(boardOf(next).messages).toContainEqual(entry)
      }),
      playOut(0),
      settle,
    )
  })

  test('the arrest walks suspect, caught lie, then confirm', () => {
    const caught = withBoard({
      caught: [{ guest: 'dale', claimMessageId: 'm3', proofMessageId: 'm1' }],
    })
    story(
      update,
      given(caught),
      message(Message.ClickedStartArrest()),
      message(Message.ClickedSuspect({ suspect: 'dale' })),
      message(Message.ClickedLie({ messageId: 'm3' })),
      model(next => {
        expect(next.sheet).toEqual(
          Sheet.Arrest({
            step: ArrestStep.Confirm({
              suspect: 'dale',
              maybeLie: Option.some('m3'),
            }),
          }),
        )
      }),
      message(Message.ClickedArrestBack()),
      message(Message.ClickedNoLie()),
      message(Message.ClickedArrestBack()),
      message(Message.ClickedLie({ messageId: 'm3' })),
      message(Message.ClickedConfirmArrest()),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.Arrest.make({
            suspect: 'dale',
            lie: 'm3',
          }),
        }),
      ),
      settle,
      message(fromServer(ServerMessage.cases.ArrestResult.make({ result }))),
      model(next => {
        expect(next.sheet).toEqual(Sheet.Result())
        expect(
          Option.map(boardOf(next).maybeResult, ended => ended.ending),
        ).toEqual(Option.some('caseClosed'))
      }),
    )
  })

  test('an arrest on no lie leaves the lie out', () => {
    story(
      update,
      given(playingModel),
      message(Message.ClickedStartArrest()),
      message(Message.ClickedSuspect({ suspect: 'margot' })),
      message(Message.ClickedNoLie()),
      message(Message.ClickedConfirmArrest()),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.Arrest.make({ suspect: 'margot' }),
        }),
      ),
      settle,
    )
  })

  test('the end of day 3 opens the arrest', () => {
    story(
      update,
      given(withBoard({ clock: { ...morning(0), day: 3, part: 'evening' } })),
      message(
        fromServer(
          ServerMessage.cases.ClockChanged.make({
            clock: { ...morning(0), day: 3, part: 'evening', phase: 'arrest' },
          }),
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

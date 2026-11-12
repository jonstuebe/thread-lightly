import { Option } from 'effect'
import {
  Command,
  click,
  expect,
  given,
  inside,
  pointerDown,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { ClientMessage } from '../shared/protocol'
import {
  ScrollToLatest,
  SendToServer,
  StartCase,
  WaitForLongPress,
} from './command'
import {
  board,
  dmDale,
  lockedModel,
  morning,
  playingModel,
  withBoard,
} from './fixture'
import { Message } from './message'
import { Asking, Sheet } from './model'
import { update } from './update'
import { view } from './view'

const inDale = (model: typeof playingModel) => ({
  ...model,
  maybeOpenThread: Option.some(dmDale),
})

const settle = Command.resolveAll(
  [SendToServer, Message.CompletedSendToServer()],
  [ScrollToLatest, Message.CompletedScrollToLatest()],
)

const menu = role('group', { name: 'Your move' })

const dale = (status: (typeof board.guests)[number]['status']) =>
  board.guests.map(guest =>
    guest.id === 'dale' ? { ...guest, status } : guest,
  )

describe('lock screen', () => {
  test('tapping the notification starts a case', () => {
    scene(
      { update, view },
      given(lockedModel),
      click(role('button', { name: /Thread Lightly/ })),
      Command.expectExact(StartCase),
      Command.resolve(StartCase, Message.FailedStartCase()),
      expect(role('button', { name: /Thread Lightly/ })).toBeEnabled(),
    )
  })
})

describe('conversations', () => {
  test('the list shows the clock, the Wi-Fi log, the group and each guest', () => {
    scene(
      { update, view },
      given(playingModel),
      expect(text('Day 1 · Morning')).toExist(),
      expect(role('img', { name: '3 of 5 ticks left' })).toExist(),
      expect(role('button', { name: 'Wi-Fi log' })).toExist(),
      expect(role('button', { name: 'Guests' })).toExist(),
      expect(role('button', { name: 'Margot Hale' })).toExist(),
      expect(role('button', { name: 'Dale Pruitt' })).toExist(),
      expect(role('button', { name: 'Case file, 0 saved' })).toExist(),
    )
  })

  test('an away guest shows their status line and an Away badge', () => {
    scene(
      { update, view },
      given(
        withBoard({
          guests: dale({ _tag: 'Away', status: 'out kayaking 🛶' }),
        }),
      ),
      settle,
      expect(text('out kayaking 🛶')).toExist(),
      expect(text('Away')).toExist(),
    )
  })

  test('status badges go away once the case is closed', () => {
    scene(
      { update, view },
      given(
        withBoard({
          guests: dale({ _tag: 'Asleep' }),
          maybeResult: Option.some({
            ending: 'caseClosed' as const,
            thief: 'dale',
            timeline: [],
            tally: { questionsAsked: 1, liesCaught: 1, wrongProofs: 0 },
          }),
        }),
      ),
      expect(text('Asleep')).not.toExist(),
      expect(text('The case is closed')).toExist(),
    )
  })
})

describe('the question menu', () => {
  test('a guest thread offers chips in authored order, and tapping one asks it', () => {
    scene(
      { update, view },
      given(playingModel),
      click(role('button', { name: 'Dale Pruitt' })),
      Command.resolveAll([ScrollToLatest, Message.CompletedScrollToLatest()]),
      expect(
        text('I was asleep by eleven fifteen, out like a light.'),
      ).toExist(),
      expect(
        role('button', { name: 'Why was your phone in the kitchen? (new)' }),
      ).toExist(),
      expect(
        role('button', { name: 'When did you last see the brooch?' }),
      ).toBeEnabled(),
      click(role('button', { name: /Why was your phone in the kitchen/ })),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.AskQuestion.make({
            thread: dmDale,
            chipId: 'c-kitchen',
          }),
        }),
        ScrollToLatest(),
      ),
      Command.resolveAll(
        [SendToServer, Message.CompletedSendToServer()],
        [ScrollToLatest, Message.CompletedScrollToLatest()],
      ),
      settle,
      expect(
        role('button', { name: 'When did you last see the brooch?' }),
      ).toBeDisabled(),
    )
  })

  test('the thread header shows the day, the part and the ticks', () => {
    scene(
      { update, view },
      given(inDale(playingModel)),
      click(
        role('button', { name: 'Time: Day 1 · Morning, 3 of 5 ticks left' }),
      ),
      inside(
        role('dialog'),
        expect(text('Day 1 · Morning')).toExist(),
        click(role('button', { name: 'Skip to the afternoon' })),
      ),
      Command.expectExact(
        SendToServer({ message: ClientMessage.cases.SkipPart.make({}) }),
      ),
      settle,
    )
  })

  test('an away guest’s menu is greyed out under their status line', () => {
    scene(
      { update, view },
      given(
        inDale(
          withBoard({
            guests: dale({ _tag: 'Away', status: 'out kayaking 🛶' }),
          }),
        ),
      ),
      inside(menu, expect(text('out kayaking 🛶')).toExist()),
      expect(
        role('button', { name: 'When did you last see the brooch?' }),
      ).toBeDisabled(),
    )
  })

  test('a quiet guest isn’t answering', () => {
    scene(
      { update, view },
      given(inDale(withBoard({ guests: dale({ _tag: 'Quiet' }) }))),
      expect(text('Dale isn’t answering right now')).toExist(),
      expect(
        role('button', { name: 'When did you last see the brooch?' }),
      ).toBeDisabled(),
    )
  })

  test('the group chat with no questions shows only its beats', () => {
    scene(
      { update, view },
      given(playingModel),
      click(role('button', { name: 'Guests' })),
      Command.resolveAll([ScrollToLatest, Message.CompletedScrollToLatest()]),
      expect(
        text('Guests post here as the day goes on. Ask your questions in DMs.'),
      ).toExist(),
    )
  })

  test('at bedtime the menu becomes one Go to sleep button', () => {
    scene(
      { update, view },
      given(
        inDale(
          withBoard({
            clock: { ...morning(0), part: 'evening', phase: 'bedtime' },
            guests: dale({ _tag: 'Asleep' }),
          }),
        ),
      ),
      inside(menu, expect(text('Everyone’s gone to bed 🌙')).toExist()),
      expect(
        role('button', { name: 'When did you last see the brooch?' }),
      ).not.toExist(),
      inside(menu, click(role('button', { name: 'Go to sleep' }))),
      Command.expectExact(
        SendToServer({ message: ClientMessage.cases.GoToSleep.make({}) }),
      ),
      settle,
    )
  })
})

describe('long-press', () => {
  test('holding a reply saves it to the case file', () => {
    scene(
      { update, view },
      given(inDale(playingModel)),
      pointerDown(
        role('button', { name: /out like a light\. Press and hold/ }),
      ),
      Command.resolve(
        WaitForLongPress,
        Message.CompletedWaitForLongPress({ pressId: 0 }),
      ),
      click(role('button', { name: 'Add to case file' })),
      Command.resolveAll([SendToServer, Message.CompletedSendToServer()]),
      expect(role('button', { name: 'Case file, 1 saved' })).toExist(),
      expect(role('img', { name: 'In your case file' })).toExist(),
    )
  })

  test('pressing a reply asks “Are you sure about that?”', () => {
    scene(
      { update, view },
      given({
        ...inDale(playingModel),
        sheet: Sheet.MessageActions({ messageId: 'm4' }),
      }),
      click(role('button', { name: 'Press: “Are you sure about that?”' })),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.Press.make({ messageId: 'm4' }),
        }),
        ScrollToLatest(),
      ),
      settle,
    )
  })

  test('an answer can be pressed once', () => {
    scene(
      { update, view },
      given({
        ...inDale(withBoard({ pressed: ['a1'], caseFile: ['m1'] })),
        sheet: Sheet.MessageActions({ messageId: 'm3' }),
      }),
      expect(
        role('button', { name: 'Press: “Are you sure about that?”' }),
      ).toBeDisabled(),
      expect(role('button', { name: 'Show proof' })).toBeEnabled(),
    )
  })

  test('the detective’s own lines can only be saved', () => {
    scene(
      { update, view },
      given({
        ...inDale(playingModel),
        sheet: Sheet.MessageActions({ messageId: 'm2' }),
      }),
      expect(role('button', { name: 'Add to case file' })).toExist(),
      expect(role('button', { name: 'Show proof' })).not.toExist(),
    )
  })

  test('showing proof picks a saved item from the case file', () => {
    scene(
      { update, view },
      given({
        ...inDale(withBoard({ caseFile: ['m1'] })),
        sheet: Sheet.MessageActions({ messageId: 'm3' }),
      }),
      click(role('button', { name: 'Show proof' })),
      inside(
        role('dialog'),
        expect(text('Show Dale proof')).toExist(),
        click(role('button', { name: /kitchen access point/ })),
      ),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.ShowProof.make({
            messageId: 'm3',
            proofMessageId: 'm1',
          }),
        }),
        ScrollToLatest(),
      ),
      settle,
    )
  })

  test('the menu waits while a question is in flight', () => {
    scene(
      { update, view },
      given({
        ...inDale(playingModel),
        asking: Asking.Waiting({ thread: dmDale }),
      }),
      expect(
        role('button', { name: 'When did you last see the brooch?' }),
      ).toBeDisabled(),
    )
  })
})

describe('the case file and the arrest', () => {
  test('a caught lie is stamped on both items', () => {
    scene(
      { update, view },
      given({
        ...withBoard({
          caseFile: ['m1', 'm4'],
          caught: [
            { guest: 'dale', claimMessageId: 'm3', proofMessageId: 'm1' },
          ],
        }),
        sheet: Sheet.CaseFile(),
      }),
      inside(
        role('dialog'),
        expect(text('Caught lies')).toExist(),
        expect(text('proved wrong by')).toExist(),
      ),
    )
  })

  test('the arrest picks a suspect, then one caught lie', () => {
    scene(
      { update, view },
      given(
        withBoard({
          caseFile: ['m1'],
          caught: [
            { guest: 'dale', claimMessageId: 'm3', proofMessageId: 'm1' },
          ],
        }),
      ),
      click(role('button', { name: 'Case file, 1 saved' })),
      inside(
        role('dialog'),
        click(role('button', { name: 'Make an arrest' })),
        expect(text('Who are you arresting?')).toExist(),
        click(role('button', { name: /Dale Pruitt/ })),
        expect(text('Which lie are you arresting Dale on?')).toExist(),
        click(role('button', { name: /eleven fifteen/ })),
        click(role('button', { name: 'Arrest Dale' })),
      ),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.Arrest.make({
            suspect: 'dale',
            lie: 'm3',
          }),
        }),
      ),
      Command.resolve(SendToServer, Message.CompletedSendToServer()),
      expect(text('Making the arrest…')).toExist(),
    )
  })
})

describe('the ending', () => {
  test('shows the solution, the tally and the timeline night by night', () => {
    scene(
      { update, view },
      given({
        ...withBoard({
          maybeResult: Option.some({
            ending: 'wrongPerson' as const,
            thief: 'dale',
            solution: {
              claim: 'Dale was asleep from 11:15pm',
              proof: 'Dale joined the kitchen Wi-Fi at 1:12am',
            },
            timeline: [
              {
                night: 0 as const,
                time: '1:12am',
                text: 'Dale sneaks into the kitchen.',
                evidence: 'saved' as const,
              },
              {
                night: 0 as const,
                time: '1:15am',
                text: 'Dale takes the brooch.',
                evidence: 'none' as const,
              },
              {
                night: 2 as const,
                time: '11:48pm',
                text: 'Dale slips out to the boathouse.',
                evidence: 'missed' as const,
              },
            ],
            tally: { questionsAsked: 14, liesCaught: 1, wrongProofs: 2 },
          }),
        }),
        sheet: Sheet.Result(),
      }),
      expect(text('Wrong person')).toExist(),
      expect(text('What would have held up')).toExist(),
      expect(text('Dale’s lie')).toExist(),
      expect(text('Dale joined the kitchen Wi-Fi at 1:12am')).toExist(),
      expect(text('Questions asked')).toExist(),
      expect(text('14')).toExist(),
      expect(text('Wrong proofs')).toExist(),
      expect(
        text('You uncovered 1 of the 2 events below that left a trace.'),
      ).toExist(),
      expect(text('The night of the theft')).toExist(),
      expect(text('Night 2')).toExist(),
      expect(text('In your case file')).toExist(),
      expect(text('Missed')).toExist(),
    )
  })
})

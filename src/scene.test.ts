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
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { ClientMessage } from '../shared/protocol'
import {
  BlurComposer,
  ScrollToLatest,
  SendToServer,
  StartCase,
  WaitForLongPress,
} from './command'
import { board, dmDale, lockedModel, playingModel } from './fixture'
import { Message } from './message'
import { update } from './update'
import { view } from './view'

describe('lock screen', () => {
  test('tapping the notification starts a case', () => {
    scene(
      { update, view },
      given(lockedModel),
      click(role('button', { name: /Pine Hollow/ })),
      Command.expectExact(StartCase),
      Command.resolve(StartCase, Message.FailedStartCase()),
      expect(role('button', { name: /Pine Hollow/ })).toBeEnabled(),
    )
  })
})

describe('conversations', () => {
  test('the list shows the Wi-Fi log, the group and each guest', () => {
    scene(
      { update, view },
      given(playingModel),
      expect(role('button', { name: 'Lodge Wi-Fi log' })).toExist(),
      expect(role('button', { name: 'Pine Hollow guests' })).toExist(),
      expect(role('button', { name: 'Margot Hale' })).toExist(),
      expect(role('button', { name: 'Dale Pruitt' })).toExist(),
      expect(role('button', { name: 'Case file, 0 saved' })).toExist(),
    )
  })

  test('opening a guest thread lets you message them', () => {
    scene(
      { update, view },
      given(playingModel),
      click(role('button', { name: 'Dale Pruitt' })),
      Command.resolveAll([ScrollToLatest, Message.CompletedScrollToLatest()]),
      expect(
        text('I was asleep by eleven fifteen, out like a light.'),
      ).toExist(),
      type(role('textbox', { name: 'Message' }), 'Which room?'),
      click(role('button', { name: 'Send' })),
      Command.expectHas(
        SendToServer({
          message: ClientMessage.cases.SendMessage.make({
            thread: { _tag: 'Direct', guest: 'dale' },
            text: 'Which room?',
          }),
        }),
      ),
      Command.resolveAll(
        [SendToServer, Message.CompletedSendToServer()],
        [ScrollToLatest, Message.CompletedScrollToLatest()],
      ),
      expect(text('Which room?')).toExist(),
    )
  })
})

describe('case file', () => {
  test('holding a message saves it to the case file', () => {
    scene(
      { update, view },
      given({ ...playingModel, maybeOpenThread: Option.some(dmDale) }),
      pointerDown(
        role('button', { name: /out like a light\. Press and hold/ }),
      ),
      Command.resolve(
        WaitForLongPress,
        Message.CompletedWaitForLongPress({ pressId: 0 }),
      ),
      Command.resolveAll([BlurComposer, Message.CompletedBlurComposer()]),
      click(role('button', { name: 'Add to case file' })),
      Command.resolveAll([SendToServer, Message.CompletedSendToServer()]),
      expect(role('button', { name: 'Case file, 1 saved' })).toExist(),
      expect(role('img', { name: 'In your case file' })).toExist(),
    )
  })

  test('the arrest picks a suspect, their lie and the proof', () => {
    scene(
      { update, view },
      given({
        ...playingModel,
        maybeBoard: Option.some({ ...board, caseFile: ['m1', 'm2'] }),
      }),
      click(role('button', { name: 'Case file, 2 saved' })),
      Command.resolveAll([BlurComposer, Message.CompletedBlurComposer()]),
      inside(
        role('dialog'),
        click(role('button', { name: 'Make an arrest' })),
        expect(text('Who are you arresting?')).toExist(),
        click(role('button', { name: /Dale Pruitt/ })),
        expect(text('What did Dale lie about?')).toExist(),
        click(role('button', { name: /eleven fifteen/ })),
        expect(text('What proves it’s a lie?')).toExist(),
        click(role('button', { name: /kitchen/ })),
        click(role('button', { name: 'Arrest Dale' })),
      ),
      Command.expectExact(
        SendToServer({
          message: ClientMessage.cases.MakeArrest.make({
            suspect: 'dale',
            claimMessageId: 'm2',
            proofMessageId: 'm1',
          }),
        }),
      ),
      Command.resolve(SendToServer, Message.CompletedSendToServer()),
    )
  })
})

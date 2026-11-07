import { Array } from 'effect'
import {
  Command,
  click,
  expect,
  given,
  label,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { DealNewCase, ScrollToLatest, WaitForBeat } from './command'
import { eveningModel, lockedModel, votingModel } from './fixture'
import { Message } from './message'
import { update } from './update'
import { view } from './view'

describe('lock screen', () => {
  test('tapping the notification opens the invite, and joining starts a case', () => {
    scene(
      { update, view },
      given(lockedModel),
      expect(text('Tap the message to join the group chat')).toExist(),
      click(role('button', { name: 'Open the Pine Hollow Lodge group chat' })),
      expect(text('You’re invited to Pine Hollow Lodge')).toExist(),
      type(label('What should the group call you?'), 'Jon'),
      click(role('button', { name: 'Join the chat' })),
      Command.expectExact(DealNewCase),
      Command.resolve(
        DealNewCase,
        Message.CompletedDealNewCase({
          caseNumber: 1,
          thief: 'Gus',
          seating: ['Wes', 'Gus', 'Margot', 'Theo', 'Lena', 'Priya'],
        }),
      ),
      expect(role('textbox', { name: 'Message' })).toBeEnabled(),
      Command.resolveAll(
        ...Array.makeBy(
          30,
          () =>
            [
              WaitForBeat,
              Message.CompletedWaitForBeat({ caseNumber: 1 }),
            ] as const,
        ),
        ...Array.makeBy(
          30,
          () => [ScrollToLatest, Message.CompletedScrollToLatest()] as const,
        ),
      ),
      expect(text('You’re the detective')).toExist(),
      expect(text('Jon, you got in late, did you see anything? 🙏')).toExist(),
    )
  })
})

describe('chat', () => {
  test('the header counts the player with the guests', () => {
    scene(
      { update, view },
      given(eveningModel),
      expect(text('· 7 people ›')).toExist(),
      expect(role('button', { name: 'Go to bed' })).toBeEnabled(),
    )
  })

  test('the composer is paused at night', () => {
    scene(
      { update, view },
      given({
        ...eveningModel,
        phase: { _tag: 'Night', maybePending: { _tag: 'None' } },
      }),
      expect(role('textbox', { name: 'Message' })).toBeDisabled(),
      expect(role('button', { name: 'Skip to morning' })).toBeDisabled(),
    )
  })

  test('the poll lists every guest still in the chat', () => {
    scene(
      { update, view },
      given(votingModel(1)),
      expect(text('Who should we turn in to the lodge manager?')).toExist(),
      expect(role('button', { name: 'Lena, 0 votes' })).toBeEnabled(),
      expect(role('button', { name: 'Wes, 0 votes' })).toBeEnabled(),
      expect(role('button', { name: 'Gus, 0 votes' })).toBeEnabled(),
    )
  })
})

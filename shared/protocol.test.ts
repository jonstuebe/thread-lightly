import { Exit, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  ClientMessage,
  ClientMessageJson,
  ServerMessage,
  ServerMessageJson,
} from './protocol'

const roundTrip = (message: ClientMessage): ClientMessage =>
  Schema.decodeSync(ClientMessageJson)(
    Schema.encodeSync(ClientMessageJson)(message),
  )

describe('protocol', () => {
  test('every client action survives a JSON round trip', () => {
    const messages: ReadonlyArray<ClientMessage> = [
      ClientMessage.cases.AskQuestion.make({
        thread: { _tag: 'Direct', guest: 'bea' },
        chipId: 'c4',
      }),
      ClientMessage.cases.Press.make({ messageId: 'm7' }),
      ClientMessage.cases.ShowProof.make({
        messageId: 'm7',
        proofMessageId: 'w1',
      }),
      ClientMessage.cases.SaveToCaseFile.make({ messageId: 'w1' }),
      ClientMessage.cases.SkipPart.make({}),
      ClientMessage.cases.GoToSleep.make({}),
      ClientMessage.cases.Arrest.make({ suspect: 'bea', lie: 'm7' }),
      ClientMessage.cases.Arrest.make({ suspect: 'bea' }),
    ]
    for (const message of messages) {
      expect(roundTrip(message)).toEqual(message)
    }
  })

  test('rejects free text: there is no SendMessage', () => {
    const json = JSON.stringify({
      _tag: 'SendMessage',
      thread: { _tag: 'Group' },
      text: 'who did it?',
    })
    expect(Exit.isFailure(Schema.decodeExit(ClientMessageJson)(json))).toBe(
      true,
    )
  })

  test('a posted answer carries text and an answer ID, never fact IDs', () => {
    const message = ServerMessage.cases.MessagePosted.make({
      message: {
        id: 'm1',
        thread: { _tag: 'Direct', guest: 'bea' },
        sender: { _tag: 'Guest', guest: 'bea' },
        body: { _tag: 'Text', text: 'asleep by 10, honest 😴' },
        role: { _tag: 'Answer', answerId: 'a1' },
        day: 1,
        part: 'morning',
      },
    })
    const json = Schema.encodeSync(ServerMessageJson)(message)
    expect(json).not.toContain('factIds')
    expect(Schema.decodeSync(ServerMessageJson)(json)).toEqual(message)
  })

  test('a menu carries chip text and opaque IDs', () => {
    const message = ServerMessage.cases.MenuChanged.make({
      menu: {
        thread: { _tag: 'Direct', guest: 'theo' },
        chips: [
          { id: 'c1', text: 'Did you see Bea go out that night?', isNew: true },
        ],
      },
    })
    const json = Schema.encodeSync(ServerMessageJson)(message)
    expect(Schema.decodeSync(ServerMessageJson)(json)).toEqual(message)
  })

  test('a snapshot carries the clock, statuses and caught stamps', () => {
    const message = ServerMessage.cases.Snapshot.make({
      intro: { title: 't', premise: 'p', missingItem: 'a ribbon' },
      guests: [
        { id: 'bea', name: 'Bea', role: 'r', status: { _tag: 'Quiet' } },
        {
          id: 'max',
          name: 'Max',
          role: 'r',
          status: { _tag: 'Away', status: 'out on the lake 🛶' },
        },
      ],
      messages: [],
      menus: [],
      caseFile: ['m1', 'w1'],
      pressed: ['a1'],
      caught: [{ guest: 'bea', claimMessageId: 'm1', proofMessageId: 'w1' }],
      clock: {
        day: 2,
        part: 'afternoon',
        phase: 'asking',
        ticksLeft: 3,
        partBudget: 4,
      },
    })
    const json = Schema.encodeSync(ServerMessageJson)(message)
    expect(Schema.decodeSync(ServerMessageJson)(json)).toEqual(message)
  })
})

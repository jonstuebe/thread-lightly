import { Exit, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  ClientMessage,
  ClientMessageJson,
  MAX_MESSAGE_LENGTH,
  ServerMessage,
  ServerMessageJson,
} from './protocol'

describe('protocol', () => {
  test('a client message survives a JSON round trip', () => {
    const message = ClientMessage.cases.SendMessage.make({
      thread: { _tag: 'Direct', guest: 'dale' },
      text: 'where were you friday?',
    })
    const json = Schema.encodeSync(ClientMessageJson)(message)
    expect(Schema.decodeSync(ClientMessageJson)(json)).toEqual(message)
  })

  test('rejects a message longer than the limit', () => {
    const json = JSON.stringify({
      _tag: 'SendMessage',
      thread: { _tag: 'Group' },
      text: 'a'.repeat(MAX_MESSAGE_LENGTH + 1),
    })
    expect(Exit.isFailure(Schema.decodeExit(ClientMessageJson)(json))).toBe(
      true,
    )
  })

  test('a posted message carries no fact IDs', () => {
    const message = ServerMessage.cases.MessagePosted.make({
      message: {
        id: 'm1',
        thread: { _tag: 'Direct', guest: 'wes' },
        sender: { _tag: 'Guest', guest: 'wes' },
        body: { _tag: 'Text', text: 'Couch! Great room!' },
        day: 1,
      },
    })
    const json = Schema.encodeSync(ServerMessageJson)(message)
    expect(json).not.toContain('factIds')
    expect(Schema.decodeSync(ServerMessageJson)(json)).toEqual(message)
  })
})

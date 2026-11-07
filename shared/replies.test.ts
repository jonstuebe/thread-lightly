import { Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import silverBrooch from '../cases/silver-brooch.json'
import { Case, type ReplySet } from './case'
import { activeReplies, destroyedFacts } from './replies'

const caseData = Schema.decodeUnknownSync(Case)(silverBrooch)

const replySet: ReplySet = {
  variants: [{ text: 'before', factIds: ['a'] }],
  afterNight: [
    { night: 2, variants: [{ text: 'after night 2', factIds: ['b'] }] },
    { night: 1, variants: [{ text: 'after night 1', factIds: ['a', 'c'] }] },
  ],
}

const texts = (
  set: ReplySet,
  day: 1 | 2 | 3,
  destroyed: ReadonlyArray<string>,
) => activeReplies(set, day, new Set(destroyed)).map(reply => reply.text)

describe('activeReplies', () => {
  test('uses the base variants until the first override night has passed', () => {
    expect(texts(replySet, 1, [])).toEqual(['before'])
  })

  test('uses the latest override whose night has passed', () => {
    expect(texts(replySet, 2, [])).toEqual(['after night 1'])
    expect(texts(replySet, 3, [])).toEqual(['after night 2'])
  })

  test('switches to the ifFactDestroyed replies once a fact is destroyed', () => {
    const withFallback: ReplySet = {
      ...replySet,
      ifFactDestroyed: [{ text: 'all gone', factIds: [] }],
    }
    expect(texts(withFallback, 1, ['a'])).toEqual(['all gone'])
    expect(texts(withFallback, 3, ['a'])).toEqual(['after night 2'])
  })

  test('drops replies carrying a destroyed fact when there is no fallback', () => {
    expect(texts(replySet, 1, ['a'])).toEqual([])
  })
})

describe('destroyedFacts', () => {
  test('a fact destroyed on night 1 is gone from day 2', () => {
    expect([...destroyedFacts(caseData, 1)]).toEqual([])
    expect([...destroyedFacts(caseData, 2)]).toEqual(['muddy-boots'])
  })
})

import { Array, Effect, Exit, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { type Answer, Case, type Guest, type Question } from './case'
import { type Check, findProblems, isError, searchDay, validateCase } from './checker'
import tinyCase from './fixtures/tiny-case.json'

// NOTE: tiny-case is a test fixture, not a playable case. Bea is the thief:
// she says she was asleep by 10, and the Wi-Fi log has her phone joining the
// garden at 11:52pm.
const base = Schema.decodeUnknownSync(Case)(tinyCase)

const errorChecks = (caseData: Case): ReadonlyArray<Check> =>
  Array.dedupe(
    Array.map(Array.filter(findProblems(caseData), isError), problem => problem.check),
  )

const warnings = (caseData: Case): ReadonlyArray<string> =>
  Array.map(
    Array.filter(findProblems(caseData), problem => !isError(problem)),
    problem => problem.message,
  )

const withGuest = (
  caseData: Case,
  guestId: string,
  change: (guest: Guest) => Guest,
): Case => ({
  ...caseData,
  guests: Array.map(caseData.guests, guest =>
    guest.id === guestId ? change(guest) : guest,
  ),
})

const withQuestion = (
  caseData: Case,
  guestId: string,
  questionId: string,
  change: (question: Question) => Question,
): Case =>
  withGuest(caseData, guestId, guest => ({
    ...guest,
    questions: Array.map(guest.questions, question =>
      question.id === questionId ? change(question) : question,
    ),
  }))

const withAnswer = (
  caseData: Case,
  guestId: string,
  questionId: string,
  change: (answer: Answer) => Answer,
): Case =>
  withQuestion(caseData, guestId, questionId, question => ({
    ...question,
    answer: change(question.answer),
  }))

describe('the fixture', () => {
  test('has no problems at all', () => {
    expect(findProblems(base)).toEqual([])
  })

  test('passes validateCase', () => {
    expect(Exit.isSuccess(Effect.runSyncExit(validateCase(tinyCase)))).toBe(true)
  })

  test('is won on a fresh day 3 by asking Bea, then showing the Wi-Fi entry', () => {
    expect(searchDay(base, 3)).toEqual({
      _tag: 'Won',
      actions: [
        'morning: ask bea-night0',
        'afternoon: prove bea-night0 with bea-in-garden',
      ],
    })
  })

  test('waits for Bea to come back on day 1, when she is away all afternoon', () => {
    expect(searchDay(base, 1)).toEqual({
      _tag: 'Won',
      actions: [
        'morning: ask bea-night0',
        'evening: prove bea-night0 with bea-in-garden',
      ],
    })
  })
})

describe('schema', () => {
  test('rejects a case with a missing field', () => {
    const { thief: _thief, ...withoutThief } = tinyCase
    expect(Exit.isFailure(Effect.runSyncExit(validateCase(withoutThief)))).toBe(true)
  })

  test('rejects an empty budget', () => {
    const exit = Effect.runSyncExit(
      validateCase({ ...tinyCase, budget: { ...tinyCase.budget, evening: 0 } }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  test('rejects an answer of more than three bubbles', () => {
    const line = { text: 'hm', factIds: [] }
    const caseData = {
      ...tinyCase,
      guests: tinyCase.guests.map(guest => ({
        ...guest,
        questions: guest.questions.map(question => ({
          ...question,
          answer: { ...question.answer, lines: [line, line, line, line] },
        })),
      })),
    }
    expect(Exit.isFailure(Effect.runSyncExit(validateCase(caseData)))).toBe(true)
  })
})

describe('references', () => {
  test('flags an unknown fact in an answer', () => {
    const caseData = withAnswer(base, 'theo', 'theo-june', answer => ({
      ...answer,
      lines: [{ text: 'hm', factIds: ['nope'] }],
    }))
    expect(errorChecks(caseData)).toEqual(['references'])
  })

  test('flags an unlock on an unknown contradiction', () => {
    const caseData = withQuestion(base, 'theo', 'theo-june', question => ({
      ...question,
      unlock: [{ _tag: 'Caught', contradiction: 'nope' }],
    }))
    expect(errorChecks(caseData)).toEqual(['references'])
  })

  test('flags a question ID used twice', () => {
    const caseData = withQuestion(base, 'theo', 'theo-june', question => ({
      ...question,
      id: 'bea-june',
    }))
    expect(errorChecks(caseData)).toEqual(['references'])
  })
})

describe('answers', () => {
  test('an answer carrying a claim needs a caught reply', () => {
    const caseData = withAnswer(base, 'max', 'max-night0', ({ caught: _caught, ...answer }) => answer)
    expect(errorChecks(caseData)).toContain('answers')
  })

  test('only an answer carrying a claim may have a caught reply', () => {
    const caseData = withAnswer(base, 'max', 'max-bea', answer => ({
      ...answer,
      caught: [{ text: 'ok fine', factIds: [] }],
    }))
    expect(errorChecks(caseData)).toEqual(['answers'])
  })

  test('a claim only in the group chat is flagged, since it can never be confronted there', () => {
    const caseData: Case = {
      ...base,
      groupQuestions: [
        {
          id: 'group-sleep',
          ask: 'Did everyone sleep ok?',
          from: 1,
          unlock: [],
          replies: [{ guest: 'max', text: 'Early night.', factIds: ['max-early-night'] }],
        },
      ],
    }
    expect(errorChecks(caseData)).toContain('answers')
  })

  test('a guest who is away can’t speak in a beat', () => {
    const caseData: Case = {
      ...base,
      beats: Array.map(base.beats, beat =>
        beat.day === 2 && beat.part === 'afternoon'
          ? { ...beat, lines: [{ guest: 'max', text: 'hi', factIds: [] }] }
          : beat,
      ),
    }
    expect(errorChecks(caseData)).toEqual(['answers'])
  })

  test('every day needs a morning beat', () => {
    const caseData: Case = {
      ...base,
      beats: Array.filter(base.beats, beat => beat.day !== 3),
    }
    expect(errorChecks(caseData)).toEqual(['answers'])
  })
})

describe('reachable', () => {
  test('a question that unlocks on a fact nobody ever says can never be asked', () => {
    const caseData = withQuestion(base, 'theo', 'theo-june', question => ({
      ...question,
      unlock: [{ _tag: 'Seen', fact: 'bea-took-ribbon' }],
    }))
    expect(errorChecks(caseData)).toEqual(['reachable'])
  })

  test('a question that closes before its unlock can hold is flagged', () => {
    const caseData = withQuestion(base, 'june', 'june-light', question => ({
      ...question,
      from: 1,
      until: 2,
    }))
    expect(errorChecks(caseData)).toContain('reachable')
  })
})

describe('winnable', () => {
  test('fails when the thief is away all of day 3', () => {
    const caseData = withGuest(base, 'bea', guest => ({
      ...guest,
      away: [
        ...guest.away,
        { day: 3, part: 'morning', status: 'out' },
        { day: 3, part: 'afternoon', status: 'out' },
        { day: 3, part: 'evening', status: 'out' },
      ],
    }))
    expect(errorChecks(caseData)).toContain('winnable')
  })

  // NOTE: hide Bea's alibi behind catching Max, so a fresh day 3 needs four
  // actions: ask Max, catch Max, ask Bea, catch Bea.
  const chained = withQuestion(base, 'bea', 'bea-night0', question => ({
    ...question,
    unlock: [{ _tag: 'Caught', contradiction: 'max-call' }],
  }))

  test('fails when the shortest win needs more ticks than day 3 holds', () => {
    expect(searchDay(chained, 3)).toEqual({ _tag: 'Lost' })
    expect(errorChecks(chained)).toEqual(['winnable'])
  })

  test('passes once the budget fits the chain', () => {
    const roomier: Case = {
      ...chained,
      budget: { morning: 2, afternoon: 2, evening: 1 },
    }
    expect(searchDay(roomier, 3)).toEqual({
      _tag: 'Won',
      actions: [
        'morning: ask max-night0',
        'morning: prove max-night0 with max-in-lounge',
        'afternoon: ask bea-night0',
        'afternoon: prove bea-night0 with bea-in-garden',
      ],
    })
    expect(errorChecks(roomier)).toEqual([])
  })

  test('presses when the lie only comes out under pressure', () => {
    const slip = withAnswer(base, 'bea', 'bea-night0', answer => ({
      ...answer,
      lines: [{ text: 'why do you ask', factIds: [] }],
    }))
    expect(searchDay(slip, 3)).toEqual({
      _tag: 'Won',
      actions: [
        'morning: ask bea-night0',
        'afternoon: press bea-night0',
        'evening: prove bea-night0 with bea-in-garden',
      ],
    })
  })

  test('uses a group question when that is where the proof is', () => {
    const caseData: Case = {
      ...withGuest(base, 'theo', guest => ({
        ...guest,
        knows: [...guest.knows, 'bea-in-garden'],
      })),
      wifiLog: Array.map(base.wifiLog, entry =>
        entry.id === 'w-bea-garden' ? { ...entry, factIds: [] } : entry,
      ),
      groupQuestions: [
        {
          id: 'group-garden',
          ask: 'Did anyone see someone in the garden late?',
          from: 1,
          unlock: [],
          replies: [
            { guest: 'theo', text: 'Bea, I think. Around midnight.', factIds: ['bea-in-garden'] },
          ],
        },
      ],
    }
    expect(errorChecks(caseData)).toEqual([])
    expect(searchDay(caseData, 3)).toMatchObject({ _tag: 'Won' })
  })
})

describe('contradictions', () => {
  test('a claim must be false', () => {
    const caseData: Case = {
      ...base,
      facts: Array.map(base.facts, fact =>
        fact.id === 'max-early-night' ? { ...fact, isTrue: true } : fact,
      ),
    }
    expect(errorChecks(caseData)).toEqual(['contradictions'])
  })

  test('a claim must be said in a DM answer', () => {
    const caseData: Case = {
      ...base,
      contradictions: [
        ...base.contradictions,
        {
          id: 'max-again',
          suspect: 'max',
          claimFact: 'june-heard-nothing',
          proofFact: 'june-up-at-midnight',
          concernsTheft: false,
        },
      ],
    }
    expect(errorChecks(caseData)).toContain('contradictions')
  })
})

describe('night moves', () => {
  test('a destroyed fact needs an ifDestroyed answer after the night', () => {
    const caseData = withQuestion(base, 'theo', 'theo-path', ({ ifDestroyed: _gone, ...question }) => question)
    expect(errorChecks(caseData)).toEqual(['nightMoves'])
  })

  test('a destroyed fact can’t be in the Wi-Fi log', () => {
    const caseData: Case = {
      ...base,
      wifiLog: Array.map(base.wifiLog, entry =>
        entry.id === 'w-bea-house' ? { ...entry, factIds: ['pin-on-path'] } : entry,
      ),
    }
    expect(errorChecks(caseData)).toContain('nightMoves')
  })

  test('a coached guest has to give the tell when pressed', () => {
    const caseData = withAnswer(base, 'june', 'june-light', answer => ({
      ...answer,
      pressed: [{ text: 'her light was off', factIds: [] }],
    }))
    expect(errorChecks(caseData)).toEqual(['nightMoves'])
  })

  test('a coached claim can’t be said before the night', () => {
    const caseData = withQuestion(base, 'june', 'june-light', question => ({
      ...question,
      from: 1,
      unlock: [],
    }))
    expect(errorChecks(caseData)).toEqual(['nightMoves'])
  })
})

describe('no false proof', () => {
  test('the fact that disproves a coached claim must be findable on day 3', () => {
    const caseData: Case = {
      ...base,
      nightMoves: Array.map(base.nightMoves, move =>
        move._tag === 'Coach' ? { ...move, disprovedBy: 'pin-on-path' } : move,
      ),
    }
    expect(errorChecks(caseData)).toEqual(['noFalseProof'])
  })
})

describe('no leaks', () => {
  test('a guest can only say what they know or claim', () => {
    const caseData = withAnswer(base, 'max', 'max-bea', answer => ({
      ...answer,
      lines: [{ text: 'she was in the garden', factIds: ['bea-in-garden'] }],
    }))
    expect(errorChecks(caseData)).toEqual(['noLeaks'])
  })

  test('the theft fact may only appear in the timeline', () => {
    const caseData = withGuest(
      withAnswer(base, 'bea', 'bea-ribbon', answer => ({
        ...answer,
        lines: [{ text: 'I took it', factIds: ['bea-took-ribbon'] }],
      })),
      'bea',
      guest => ({ ...guest, knows: [...guest.knows, 'bea-took-ribbon'] }),
    )
    expect(errorChecks(caseData)).toEqual(['noLeaks'])
  })
})

describe('menu shape', () => {
  test('every guest needs a lie to catch', () => {
    const caseData: Case = {
      ...base,
      contradictions: Array.filter(
        base.contradictions,
        contradiction => contradiction.id !== 'max-call',
      ),
    }
    expect(errorChecks(caseData)).toContain('menuShape')
  })

  test('the thief can’t have more questions than any innocent', () => {
    const caseData = withGuest(base, 'bea', guest => ({
      ...guest,
      questions: [
        ...guest.questions,
        {
          id: 'bea-weather',
          ask: 'Nice weather?',
          from: 1,
          unlock: [],
          answer: {
            lines: [{ text: 'gorgeous ☀️', factIds: [] }],
            pressed: [{ text: 'yes??', factIds: [] }],
          },
        },
      ],
    }))
    expect(errorChecks(caseData)).toEqual(['menuShape'])
  })
})

describe('tuning', () => {
  test('warns, without failing, when there are too few questions for the budget', () => {
    const caseData: Case = {
      ...base,
      budget: { morning: 4, afternoon: 4, evening: 3 },
    }
    expect(errorChecks(caseData)).toEqual([])
    expect(warnings(caseData)).toEqual([
      expect.stringContaining('20 questions on offer for a budget of 33'),
      expect.stringContaining('can be won on day 1 in 2 actions'),
    ])
  })
})

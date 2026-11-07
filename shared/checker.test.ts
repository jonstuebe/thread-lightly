/// <reference types="vite/client" />

import { Array, Effect, Exit, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import silverBrooch from '../cases/silver-brooch.json'
import { Case, type Guest, type Topic } from './case'
import { type Check, findProblems, validateCase } from './checker'

const base = Schema.decodeUnknownSync(Case)(silverBrooch)

const checksFailed = (caseData: Case): ReadonlyArray<Check> =>
  Array.dedupe(Array.map(findProblems(caseData), problem => problem.check))

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

const withTopic = (
  caseData: Case,
  guestId: string,
  topicId: string,
  change: (topic: Topic) => Topic,
): Case =>
  withGuest(caseData, guestId, guest => ({
    ...guest,
    dictionary: {
      ...guest.dictionary,
      topics: Array.map(guest.dictionary.topics, topic =>
        topic.id === topicId ? change(topic) : topic,
      ),
    },
  }))

describe('the case library', () => {
  const cases = import.meta.glob<unknown>('../cases/*.json', {
    eager: true,
    import: 'default',
  })

  test('has at least one case', () => {
    expect(Object.keys(cases).length).toBeGreaterThan(0)
  })

  test.each(Object.entries(cases))('%s passes every check', (_path, json) => {
    const exit = Effect.runSyncExit(validateCase(json))
    if (Exit.isFailure(exit)) {
      expect.fail(JSON.stringify(exit.cause, null, 2))
    }
  })
})

describe('schema', () => {
  test('rejects a case with a missing field', () => {
    const { thief: _thief, ...withoutThief } = silverBrooch
    const exit = Effect.runSyncExit(validateCase(withoutThief))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  test('rejects a malformed bedtime', () => {
    const exit = Effect.runSyncExit(
      validateCase({
        ...silverBrooch,
        guests: silverBrooch.guests.map(guest => ({
          ...guest,
          bedtime: '10:30pm',
        })),
      }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe('references', () => {
  test('catches a reply that names an unknown fact', () => {
    const broken = withTopic(base, 'wes', 'about-dale', topic => ({
      ...topic,
      variants: [{ text: 'Dale did it!', factIds: ['no-such-fact'] }],
    }))
    expect(findProblems(broken)).toContainEqual({
      check: 'references',
      message: 'wes.topics.about-dale names unknown fact "no-such-fact"',
    })
  })

  test('catches a thief who is not a guest', () => {
    expect(checksFailed({ ...base, thief: 'nobody' })).toEqual(['references'])
  })
})

describe('contradictions', () => {
  test('catches a contradiction whose claim is true', () => {
    const broken: Case = {
      ...base,
      contradictions: [
        ...base.contradictions,
        {
          suspect: 'dale',
          claimFact: 'brooch-seen-at-toast',
          proofFact: 'case-found-open',
          concernsTheft: true,
        },
      ],
    }
    expect(checksFailed(broken)).toEqual(['contradictions'])
  })
})

describe('thiefProvable', () => {
  test('fails when the only theft proof is destroyed before day 3', () => {
    const broken: Case = {
      ...base,
      contradictions: Array.filter(
        base.contradictions,
        contradiction =>
          contradiction.suspect !== 'dale' ||
          contradiction.proofFact === 'muddy-boots',
      ),
    }
    expect(checksFailed(broken)).toEqual(['thiefProvable'])
  })

  test('fails when the thief never repeats the claim on day 3', () => {
    const onlyBeforeNight1 = (topic: Topic): Topic => ({
      ...topic,
      afterNight: [
        {
          night: 1,
          variants: [{ text: 'not talking about friday', factIds: [] }],
        },
      ],
    })
    const quiet = withTopic(
      withTopic(base, 'dale', 'whereabouts-friday', onlyBeforeNight1),
      'dale',
      'going-outside',
      onlyBeforeNight1,
    )
    const broken: Case = {
      ...withTopic(quiet, 'dale', 'his-phone', onlyBeforeNight1),
      contradictions: Array.filter(
        quiet.contradictions,
        contradiction =>
          contradiction.claimFact !== 'dale-slept-saturday' &&
          contradiction.claimFact !== 'dale-bed-early-sunday',
      ),
    }
    expect(checksFailed(broken)).toContain('thiefProvable')
  })
})

describe('nightMoves', () => {
  test('needs exactly one move per night', () => {
    expect(
      findProblems({ ...base, nightMoves: base.nightMoves.slice(0, 1) }),
    ).toContainEqual({
      check: 'nightMoves',
      message: 'night 2 has 0 moves; it needs exactly one',
    })
  })

  test('catches a planted fact that shows up before it is planted', () => {
    const broken: Case = {
      ...base,
      groupBeats: Array.map(base.groupBeats, beat =>
        beat.trigger._tag === 'Morning' && beat.trigger.day === 2
          ? {
              ...beat,
              lines: [
                {
                  guest: 'margot',
                  text: 'Wes hid the box!',
                  factIds: ['velvet-box-in-tackle'],
                },
              ],
            }
          : beat,
      ),
    }
    expect(checksFailed(broken)).toContain('nightMoves')
  })

  test('refuses to destroy a Wi-Fi log entry', () => {
    const broken: Case = {
      ...base,
      nightMoves: [
        { _tag: 'Destroy', night: 1, fact: 'wifi-dale-kitchen-0112' },
        ...base.nightMoves.slice(1),
      ],
    }
    expect(findProblems(broken)).toContainEqual({
      check: 'nightMoves',
      message:
        "Destroy on night 1: wifi-dale-kitchen-0112 is in the Wi-Fi log, which the thief can't edit",
    })
  })

  describe('coaching', () => {
    const coached: Case = {
      ...withTopic(
        withGuest(base, 'priya', guest => ({
          ...guest,
          knows: [...guest.knows, 'dale-asked-priya'],
          claims: [...guest.claims, 'priya-saw-dale-asleep'],
          dictionary: {
            ...guest.dictionary,
            pressed: {
              ...guest.dictionary.pressed,
              afterNight: [
                {
                  night: 2,
                  variants: [
                    {
                      text: 'Fine. Dale asked me to say that.',
                      factIds: ['dale-asked-priya'],
                    },
                  ],
                },
              ],
            },
          },
        })),
        'priya',
        'about-dale',
        topic => ({
          ...topic,
          afterNight: [
            {
              night: 2,
              variants: [
                {
                  text: 'I looked in on Dale at 1. He was asleep.',
                  factIds: ['priya-saw-dale-asleep'],
                },
              ],
            },
          ],
        }),
      ),
      facts: [
        ...base.facts,
        {
          id: 'priya-saw-dale-asleep',
          text: 'Priya saw Dale asleep in his room at 1am on Friday',
          isTrue: false,
          about: ['dale', 'priya'],
          concernsTheft: true,
        },
        {
          id: 'dale-asked-priya',
          text: 'Dale asked Priya to say she saw him asleep',
          isTrue: true,
          about: ['dale', 'priya'],
          concernsTheft: true,
        },
      ],
      nightMoves: [
        base.nightMoves[0]!,
        {
          _tag: 'Coach',
          night: 2,
          guest: 'priya',
          fact: 'priya-saw-dale-asleep',
          tellFact: 'dale-asked-priya',
          disprovedBy: 'wifi-dale-kitchen-0112',
        },
      ],
      groupBeats: Array.map(base.groupBeats, beat => ({
        ...beat,
        lines: Array.map(beat.lines, line => ({
          ...line,
          factIds: Array.filter(
            line.factIds,
            fact => fact !== 'velvet-box-in-tackle',
          ),
        })),
      })),
    }

    test('accepts a valid coach move', () => {
      expect(findProblems(coached)).toEqual([])
    })

    test('catches a coached guest with no tell', () => {
      const noTell = withGuest(coached, 'priya', guest => ({
        ...guest,
        dictionary: {
          ...guest.dictionary,
          pressed: { variants: guest.dictionary.pressed.variants },
        },
      }))
      expect(findProblems(noTell)).toContainEqual({
        check: 'nightMoves',
        message: 'Coach on night 2: priya never gives the tell under pressure',
      })
    })
  })
})

describe('noFalseProof', () => {
  test('fails when nothing reachable disproves the plant', () => {
    const broken = withTopic(base, 'margot', 'whereabouts-sunday', topic => ({
      ...topic,
      afterNight: [
        { night: 2, variants: [{ text: 'I stayed in.', factIds: [] }] },
      ],
    }))
    expect(checksFailed(broken)).toEqual(['noFalseProof'])
  })
})

describe('noLeaks', () => {
  test("catches a guest saying a fact they don't know", () => {
    const broken = withTopic(base, 'priya', 'about-wes', topic => ({
      ...topic,
      variants: [
        { text: 'Wes owes Margot money.', factIds: ['wes-owes-margot'] },
      ],
    }))
    expect(findProblems(broken)).toContainEqual({
      check: 'noLeaks',
      message:
        "priya says wes-owes-margot, which isn't in their knows or claims",
    })
  })

  test('catches the theft fact said outright', () => {
    const broken = withGuest(base, 'wes', guest => ({
      ...guest,
      knows: [...guest.knows, 'dale-took-brooch'],
      dictionary: {
        ...guest.dictionary,
        pressed: {
          variants: [{ text: 'Dale took it!', factIds: ['dale-took-brooch'] }],
        },
      },
    }))
    expect(checksFailed(broken)).toEqual(['noLeaks'])
  })
})

describe('traits', () => {
  test('catches a thief whose temperament is unique', () => {
    const broken = withGuest(base, 'dale', guest => ({
      ...guest,
      temperament: 'prickly',
    }))
    expect(checksFailed(broken)).toEqual(['traits'])
  })
})

describe('coverage', () => {
  test('catches a guest with no whereabouts for a night', () => {
    const broken = withGuest(base, 'wes', guest => ({
      ...guest,
      dictionary: {
        ...guest.dictionary,
        topics: [
          guest.dictionary.topics[0]!,
          ...Array.filter(
            guest.dictionary.topics.slice(1),
            topic => topic.id !== 'whereabouts-saturday',
          ),
        ],
      },
    }))
    expect(findProblems(broken)).toEqual([
      {
        check: 'coverage',
        message: 'wes has no whereabouts topic for night 1',
      },
    ])
  })

  test('catches a missing morning beat', () => {
    const broken: Case = {
      ...base,
      groupBeats: Array.filter(
        base.groupBeats,
        beat => !(beat.trigger._tag === 'Morning' && beat.trigger.day === 2),
      ),
    }
    expect(findProblems(broken)).toContainEqual({
      check: 'coverage',
      message: 'day 2 has no morning beat',
    })
  })
})

describe('variants', () => {
  test('catches a fact only some variants carry', () => {
    const broken = withTopic(base, 'priya', 'whereabouts-friday', topic => ({
      ...topic,
      variants: [
        topic.variants[0],
        { text: 'Out on the dock, if you must know.', factIds: [] },
      ],
    }))
    expect(findProblems(broken)).toContainEqual({
      check: 'variants',
      message:
        "priya's whereabouts-friday variants carry different facts; every reply in a group must carry the same ones",
    })
  })
})

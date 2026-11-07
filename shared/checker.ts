// NOTE: the solvability checker (docs/design.md, section 9). A case is used
// only when `findProblems` returns nothing.

import { Array, Data, Effect, Option, pipe } from 'effect'

import {
  type Case,
  DAYS,
  type Day,
  type Fact,
  type FactId,
  type Guest,
  type GuestId,
  LAST_DAY,
  MOVE_NIGHTS,
  type MoveNight,
  NIGHTS,
  NightMove,
  type Reply,
  decodeCase,
} from './case'
import { type Sighting, allReplies, isSpokenBy, sightingsOn } from './replies'

export type Check =
  | 'schema'
  | 'references'
  | 'contradictions'
  | 'thiefProvable'
  | 'nightMoves'
  | 'noFalseProof'
  | 'noLeaks'
  | 'traits'
  | 'coverage'

export type Problem = Readonly<{ check: Check; message: string }>

export class CaseRejected extends Data.TaggedError('CaseRejected')<{
  readonly caseId: string
  readonly problems: ReadonlyArray<Problem>
}> {}

export const MIN_DODGES = 5

const problem = (check: Check, message: string): Problem => ({
  check,
  message,
})

const problemIf = (
  condition: boolean,
  check: Check,
  message: string,
): ReadonlyArray<Problem> => (condition ? [problem(check, message)] : [])

// REFERENCES

type Reference = Readonly<{ id: string; where: string }>

const replyFactRefs = (
  replies: ReadonlyArray<Reply>,
  where: string,
): ReadonlyArray<Reference> =>
  Array.flatMap(replies, reply =>
    Array.map(reply.factIds, id => ({ id, where })),
  )

const guestFactRefs = (guest: Guest): ReadonlyArray<Reference> => [
  ...Array.map(guest.knows, id => ({ id, where: `${guest.id}.knows` })),
  ...Array.map(guest.claims, id => ({ id, where: `${guest.id}.claims` })),
  ...(guest.secret === undefined
    ? []
    : [{ id: guest.secret, where: `${guest.id}.secret` }]),
  ...Array.flatMap(guest.dictionary.topics, topic =>
    replyFactRefs(allReplies(topic), `${guest.id}.topics.${topic.id}`),
  ),
  ...replyFactRefs(allReplies(guest.dictionary.pressed), `${guest.id}.pressed`),
]

const factRefs = (caseData: Case): ReadonlyArray<Reference> => [
  { id: caseData.theftFact, where: 'theftFact' },
  ...Array.flatMap(caseData.guests, guestFactRefs),
  ...Array.flatMap(caseData.timeline, (event, index) =>
    Array.map(event.factIds, id => ({ id, where: `timeline[${index}]` })),
  ),
  ...Array.flatMap(caseData.wifiLog, entry =>
    Array.map(entry.factIds, id => ({ id, where: `wifiLog.${entry.id}` })),
  ),
  ...Array.flatMap(caseData.groupBeats, (beat, index) =>
    Array.flatMap(beat.lines, line =>
      Array.map(line.factIds, id => ({ id, where: `groupBeats[${index}]` })),
    ),
  ),
  ...Array.flatMap(caseData.nightMoves, move => {
    const where = `nightMoves.${move._tag}(night ${move.night})`
    return [
      { id: move.fact, where },
      ...(move._tag === 'Destroy' ? [] : [{ id: move.disprovedBy, where }]),
      ...(move._tag === 'Coach' ? [{ id: move.tellFact, where }] : []),
    ]
  }),
  ...Array.flatMap(caseData.contradictions, (contradiction, index) => [
    { id: contradiction.claimFact, where: `contradictions[${index}]` },
    { id: contradiction.proofFact, where: `contradictions[${index}]` },
  ]),
]

const guestRefs = (caseData: Case): ReadonlyArray<Reference> => [
  { id: caseData.thief, where: 'thief' },
  ...Array.flatMap(caseData.facts, fact =>
    Array.map(fact.about, id => ({ id, where: `facts.${fact.id}.about` })),
  ),
  ...Array.flatMap(caseData.guests, guest =>
    Array.flatMap(guest.dictionary.topics, topic =>
      topic.subject._tag === 'Guest'
        ? [
            {
              id: topic.subject.guest,
              where: `${guest.id}.topics.${topic.id}`,
            },
          ]
        : [],
    ),
  ),
  ...Array.map(caseData.wifiLog, entry => ({
    id: entry.guest,
    where: `wifiLog.${entry.id}`,
  })),
  ...Array.flatMap(caseData.groupBeats, (beat, index) =>
    Array.map(beat.lines, line => ({
      id: line.guest,
      where: `groupBeats[${index}]`,
    })),
  ),
  ...Array.flatMap(caseData.nightMoves, move =>
    move._tag === 'Coach'
      ? [{ id: move.guest, where: `nightMoves.Coach` }]
      : [],
  ),
  ...Array.map(caseData.contradictions, (contradiction, index) => ({
    id: contradiction.suspect,
    where: `contradictions[${index}]`,
  })),
]

const duplicates = (ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  pipe(
    ids,
    Array.filter((id, index) => ids.indexOf(id) !== index),
    Array.dedupe,
  )

const checkReferences = (caseData: Case): ReadonlyArray<Problem> => {
  const factIds = new Set(Array.map(caseData.facts, fact => fact.id))
  const guestIds = new Set(Array.map(caseData.guests, guest => guest.id))
  const accessPoints = new Set(caseData.setting.accessPoints)

  const missing = (
    references: ReadonlyArray<Reference>,
    known: ReadonlySet<string>,
    kind: string,
  ): ReadonlyArray<Problem> =>
    Array.flatMap(references, reference =>
      known.has(reference.id)
        ? []
        : [
            problem(
              'references',
              `${reference.where} names unknown ${kind} "${reference.id}"`,
            ),
          ],
    )

  const duplicated = (
    ids: ReadonlyArray<string>,
    kind: string,
  ): ReadonlyArray<Problem> =>
    Array.map(duplicates(ids), id =>
      problem('references', `${kind} "${id}" is defined more than once`),
    )

  return [
    ...duplicated(
      Array.map(caseData.facts, fact => fact.id),
      'fact',
    ),
    ...duplicated(
      Array.map(caseData.guests, guest => guest.id),
      'guest',
    ),
    ...duplicated(
      Array.map(caseData.wifiLog, entry => entry.id),
      'wifi entry',
    ),
    ...Array.flatMap(caseData.guests, guest =>
      duplicated(
        Array.map(guest.dictionary.topics, topic => topic.id),
        `${guest.id} topic`,
      ),
    ),
    ...missing(factRefs(caseData), factIds, 'fact'),
    ...missing(guestRefs(caseData), guestIds, 'guest'),
    ...Array.flatMap(caseData.wifiLog, entry =>
      accessPoints.has(entry.accessPoint)
        ? []
        : [
            problem(
              'references',
              `wifiLog.${entry.id} names unknown access point "${entry.accessPoint}"`,
            ),
          ],
    ),
  ]
}

// LOOKUPS

type Lookups = Readonly<{
  caseData: Case
  fact: (id: FactId) => Fact
  guest: (id: GuestId) => Guest
  sightings: (day: Day) => ReadonlyArray<Sighting>
}>

// NOTE: only called after checkReferences passes, so every ID resolves.
const makeLookups = (caseData: Case): Lookups => {
  const facts = new Map(Array.map(caseData.facts, fact => [fact.id, fact]))
  const guests = new Map(Array.map(caseData.guests, guest => [guest.id, guest]))
  const sightingsByDay = new Map(
    Array.map(DAYS, day => [day, sightingsOn(caseData, day)]),
  )
  const orThrow = <A>(value: A | undefined, id: string): A => {
    if (value === undefined) {
      throw new Error(`Unresolved ID "${id}" after the references check`)
    }
    return value
  }
  return {
    caseData,
    fact: id => orThrow(facts.get(id), id),
    guest: id => orThrow(guests.get(id), id),
    sightings: day => orThrow(sightingsByDay.get(day), String(day)),
  }
}

const seenOn = (
  lookups: Lookups,
  day: Day,
  fact: FactId,
  spokenBy?: GuestId,
): boolean =>
  Array.some(
    lookups.sightings(day),
    sighting =>
      sighting.fact === fact &&
      (spokenBy === undefined || isSpokenBy(sighting.source, spokenBy)),
  )

const seenEver = (
  lookups: Lookups,
  fact: FactId,
  spokenBy?: GuestId,
): boolean => Array.some(DAYS, day => seenOn(lookups, day, fact, spokenBy))

const daysAfter = (night: MoveNight): ReadonlyArray<Day> =>
  Array.filter(DAYS, day => day > night)

const daysUntil = (night: MoveNight): ReadonlyArray<Day> =>
  Array.filter(DAYS, day => day <= night)

// CONTRADICTIONS

const checkContradictions = (lookups: Lookups): ReadonlyArray<Problem> =>
  Array.flatMap(lookups.caseData.contradictions, contradiction => {
    const name = `${contradiction.suspect}: ${contradiction.claimFact} vs ${contradiction.proofFact}`
    const claim = lookups.fact(contradiction.claimFact)
    const proof = lookups.fact(contradiction.proofFact)
    const suspect = lookups.guest(contradiction.suspect)
    return [
      ...problemIf(
        claim.isTrue,
        'contradictions',
        `${name}: the claim is true`,
      ),
      ...problemIf(
        !proof.isTrue,
        'contradictions',
        `${name}: the proof is false`,
      ),
      ...problemIf(
        !suspect.claims.includes(claim.id),
        'contradictions',
        `${name}: the claim isn't one of the suspect's claims`,
      ),
      ...problemIf(
        contradiction.concernsTheft !== claim.concernsTheft,
        'contradictions',
        `${name}: concernsTheft doesn't match the claim fact`,
      ),
      ...problemIf(
        !seenEver(lookups, claim.id, suspect.id),
        'contradictions',
        `${name}: the suspect never says the claim`,
      ),
      ...problemIf(
        !seenEver(lookups, proof.id),
        'contradictions',
        `${name}: the proof never appears`,
      ),
    ]
  })

const checkThiefProvable = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const provableOnLastDay = Array.some(
    caseData.contradictions,
    contradiction =>
      contradiction.suspect === caseData.thief &&
      contradiction.concernsTheft &&
      seenOn(lookups, LAST_DAY, contradiction.claimFact, caseData.thief) &&
      seenOn(lookups, LAST_DAY, contradiction.proofFact),
  )
  return problemIf(
    !provableOnLastDay,
    'thiefProvable',
    `no theft contradiction against ${caseData.thief} can still be found on day ${LAST_DAY}, after every night move`,
  )
}

// NIGHT MOVES

const checkNightMoves = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups

  const onePerNight = Array.flatMap(MOVE_NIGHTS, night => {
    const count = Array.filter(
      caseData.nightMoves,
      move => move.night === night,
    ).length
    return problemIf(
      count !== 1,
      'nightMoves',
      `night ${night} has ${count} moves; it needs exactly one`,
    )
  })

  const perMove = Array.flatMap(caseData.nightMoves, move => {
    const name = `${move._tag} on night ${move.night}`
    const fact = lookups.fact(move.fact)
    return NightMove.match(move, {
      Destroy: () => [
        ...problemIf(
          !fact.isTrue,
          'nightMoves',
          `${name}: ${fact.id} must be true`,
        ),
        ...problemIf(
          Array.some(caseData.wifiLog, entry =>
            entry.factIds.includes(fact.id),
          ),
          'nightMoves',
          `${name}: ${fact.id} is in the Wi-Fi log, which the thief can't edit`,
        ),
        ...problemIf(
          !Array.some(daysUntil(move.night), day =>
            seenOn(lookups, day, fact.id),
          ),
          'nightMoves',
          `${name}: ${fact.id} can't be found before it's destroyed`,
        ),
      ],
      Plant: () => [
        ...problemIf(
          fact.isTrue,
          'nightMoves',
          `${name}: ${fact.id} must be false`,
        ),
        ...problemIf(
          !fact.concernsTheft,
          'nightMoves',
          `${name}: ${fact.id} must concern the theft`,
        ),
        ...problemIf(
          Array.isReadonlyArrayEmpty(fact.about) ||
            fact.about.includes(caseData.thief),
          'nightMoves',
          `${name}: ${fact.id} must point at an innocent`,
        ),
        ...problemIf(
          Array.some(daysUntil(move.night), day =>
            seenOn(lookups, day, fact.id),
          ),
          'nightMoves',
          `${name}: ${fact.id} appears before it's planted`,
        ),
        ...problemIf(
          !Array.some(daysAfter(move.night), day =>
            seenOn(lookups, day, fact.id),
          ),
          'nightMoves',
          `${name}: ${fact.id} never appears`,
        ),
      ],
      Coach: coach => [
        ...problemIf(
          coach.guest === caseData.thief,
          'nightMoves',
          `${name}: the thief can't coach themselves`,
        ),
        ...problemIf(
          fact.isTrue,
          'nightMoves',
          `${name}: ${fact.id} must be false`,
        ),
        ...problemIf(
          !lookups.guest(coach.guest).claims.includes(fact.id),
          'nightMoves',
          `${name}: ${fact.id} must be one of ${coach.guest}'s claims`,
        ),
        ...problemIf(
          Array.some(daysUntil(move.night), day =>
            seenOn(lookups, day, fact.id, coach.guest),
          ),
          'nightMoves',
          `${name}: ${coach.guest} says ${fact.id} before being coached`,
        ),
        ...problemIf(
          !Array.some(daysAfter(move.night), day =>
            seenOn(lookups, day, fact.id, coach.guest),
          ),
          'nightMoves',
          `${name}: ${coach.guest} never says ${fact.id}`,
        ),
        ...problemIf(
          !lookups.fact(coach.tellFact).isTrue,
          'nightMoves',
          `${name}: the tell ${coach.tellFact} must be true`,
        ),
        ...problemIf(
          !Array.some(daysAfter(move.night), day =>
            Array.some(
              lookups.sightings(day),
              sighting =>
                sighting.fact === coach.tellFact &&
                sighting.source.kind === 'pressed' &&
                sighting.source.guest === coach.guest,
            ),
          ),
          'nightMoves',
          `${name}: ${coach.guest} never gives the tell under pressure`,
        ),
      ],
    })
  })

  return [...onePerNight, ...perMove]
}

const checkNoFalseProof = (lookups: Lookups): ReadonlyArray<Problem> =>
  Array.flatMap(lookups.caseData.nightMoves, move => {
    if (move._tag === 'Destroy') {
      return []
    }
    const name = `${move._tag} on night ${move.night}`
    return [
      ...problemIf(
        !lookups.fact(move.disprovedBy).isTrue,
        'noFalseProof',
        `${name}: ${move.disprovedBy} must be true to disprove ${move.fact}`,
      ),
      ...problemIf(
        !seenOn(lookups, LAST_DAY, move.disprovedBy),
        'noFalseProof',
        `${name}: ${move.disprovedBy} can't be found on day ${LAST_DAY}`,
      ),
    ]
  })

// LEAKS

const checkNoLeaks = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const planted = new Set(
    Array.flatMap(caseData.nightMoves, move =>
      move._tag === 'Plant' ? [move.fact] : [],
    ),
  )

  const perGuest = Array.flatMap(caseData.guests, guest => {
    const speakable = new Set([...guest.knows, ...guest.claims])
    const replies: ReadonlyArray<Reply> = [
      ...Array.flatMap(guest.dictionary.topics, topic => allReplies(topic)),
      ...allReplies(guest.dictionary.pressed),
    ]
    const replyFacts = Array.flatMap(replies, reply => reply.factIds)
    const lineFacts = pipe(
      caseData.groupBeats,
      Array.flatMap(beat => beat.lines),
      Array.filter(line => line.guest === guest.id),
      Array.flatMap(line => line.factIds),
    )
    const secret = Option.fromUndefinedOr(guest.secret)
    return [
      ...Array.map(
        Array.dedupe(Array.filter(replyFacts, fact => !speakable.has(fact))),
        fact =>
          problem(
            'noLeaks',
            `${guest.id} says ${fact}, which isn't in their knows or claims`,
          ),
      ),
      ...Array.map(
        Array.dedupe(
          Array.filter(
            lineFacts,
            fact => !speakable.has(fact) && !planted.has(fact),
          ),
        ),
        fact =>
          problem(
            'noLeaks',
            `${guest.id} says ${fact} in the group chat, which isn't in their knows or claims`,
          ),
      ),
      ...Array.flatMap(guest.knows, fact =>
        lookups.fact(fact).isTrue
          ? []
          : [
              problem(
                'noLeaks',
                `${guest.id} knows ${fact}, but it's false; lies go in claims`,
              ),
            ],
      ),
      ...Option.match(secret, {
        onNone: () => [],
        onSome: fact => [
          ...problemIf(
            !guest.knows.includes(fact),
            'noLeaks',
            `${guest.id}'s secret ${fact} isn't in their knows`,
          ),
          ...problemIf(
            lookups.fact(fact).concernsTheft,
            'noLeaks',
            `${guest.id}'s secret ${fact} must not concern the theft`,
          ),
          ...problemIf(
            guest.id === caseData.thief,
            'noLeaks',
            `the thief can't have a secret; secrets belong to innocents`,
          ),
        ],
      }),
    ]
  })

  const theftFact = lookups.fact(caseData.theftFact)
  const revealsThief = Array.some(
    [
      ...Array.flatMap(caseData.guests, guest => [
        ...Array.flatMap(guest.dictionary.topics, topic => allReplies(topic)),
        ...allReplies(guest.dictionary.pressed),
      ]),
      ...Array.flatMap(caseData.groupBeats, beat => beat.lines),
      ...caseData.wifiLog,
    ],
    source => source.factIds.includes(theftFact.id),
  )

  return [
    ...perGuest,
    ...problemIf(
      !theftFact.isTrue || !theftFact.concernsTheft,
      'noLeaks',
      `theftFact ${theftFact.id} must be true and concern the theft`,
    ),
    ...problemIf(
      revealsThief,
      'noLeaks',
      `theftFact ${theftFact.id} is said outright somewhere; it may only appear in the timeline`,
    ),
  ]
}

// TRAITS

const checkTraits = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups
  const thief = lookups.guest(caseData.thief)
  const innocents = Array.filter(
    caseData.guests,
    guest => guest.id !== thief.id,
  )
  const budgets = Array.map(innocents, guest => guest.patience.perDay)
  const lowest = Math.min(...budgets)
  const highest = Math.max(...budgets)
  return [
    ...problemIf(
      !Array.some(innocents, guest => guest.temperament === thief.temperament),
      'traits',
      `the thief is the only ${thief.temperament} guest`,
    ),
    ...problemIf(
      thief.patience.perDay < lowest || thief.patience.perDay > highest,
      'traits',
      `the thief's patience (${thief.patience.perDay}) is outside the innocents' range (${lowest}-${highest})`,
    ),
  ]
}

// COVERAGE

const checkCoverage = (lookups: Lookups): ReadonlyArray<Problem> => {
  const { caseData } = lookups

  const perGuest = Array.flatMap(caseData.guests, guest => {
    const subjects = Array.map(guest.dictionary.topics, topic => topic.subject)
    const has = (predicate: (subject: (typeof subjects)[number]) => boolean) =>
      Array.some(subjects, predicate)
    return [
      ...Array.flatMap(NIGHTS, night =>
        problemIf(
          !has(
            subject =>
              subject._tag === 'Whereabouts' && subject.night === night,
          ),
          'coverage',
          `${guest.id} has no whereabouts topic for night ${night}`,
        ),
      ),
      ...problemIf(
        !has(subject => subject._tag === 'Item'),
        'coverage',
        `${guest.id} has no topic about ${caseData.setting.missingItem}`,
      ),
      ...Array.flatMap(caseData.guests, other =>
        other.id === guest.id
          ? []
          : problemIf(
              !has(
                subject =>
                  subject._tag === 'Guest' && subject.guest === other.id,
              ),
              'coverage',
              `${guest.id} has no topic about ${other.id}`,
            ),
      ),
      ...problemIf(
        guest.secret !== undefined &&
          !has(subject => subject._tag === 'Secret'),
        'coverage',
        `${guest.id} has a secret but no topic about it`,
      ),
      ...problemIf(
        !Array.some(
          guest.dictionary.topics,
          topic => topic.visibility === 'public',
        ),
        'coverage',
        `${guest.id} has no public topics, so they can't answer in the group chat`,
      ),
      ...problemIf(
        guest.dictionary.dodges.length < MIN_DODGES,
        'coverage',
        `${guest.id} has ${guest.dictionary.dodges.length} dodges; they need at least ${MIN_DODGES}`,
      ),
    ]
  })

  const mornings = Array.flatMap(DAYS, day =>
    problemIf(
      !Array.some(
        caseData.groupBeats,
        beat => beat.trigger._tag === 'Morning' && beat.trigger.day === day,
      ),
      'coverage',
      `day ${day} has no morning beat`,
    ),
  )

  return [...perGuest, ...mornings]
}

// CHECK

export const findProblems = (caseData: Case): ReadonlyArray<Problem> => {
  const referenceProblems = [
    ...checkReferences(caseData),
    ...problemIf(
      !Array.some(caseData.guests, guest => guest.id === caseData.thief),
      'references',
      `thief "${caseData.thief}" isn't a guest`,
    ),
  ]
  if (Array.isArrayNonEmpty(referenceProblems)) {
    return referenceProblems
  }

  const lookups = makeLookups(caseData)
  return [
    ...checkContradictions(lookups),
    ...checkThiefProvable(lookups),
    ...checkNightMoves(lookups),
    ...checkNoFalseProof(lookups),
    ...checkNoLeaks(lookups),
    ...checkTraits(lookups),
    ...checkCoverage(lookups),
  ]
}

const caseIdOf = (input: unknown): string =>
  typeof input === 'object' &&
  input !== null &&
  'id' in input &&
  typeof input.id === 'string'
    ? input.id
    : 'unknown'

export const validateCase = (
  input: unknown,
): Effect.Effect<Case, CaseRejected> =>
  pipe(
    decodeCase(input),
    Effect.mapError(
      error =>
        new CaseRejected({
          caseId: caseIdOf(input),
          problems: [problem('schema', error.message)],
        }),
    ),
    Effect.flatMap(caseData =>
      Array.match(findProblems(caseData), {
        onEmpty: () => Effect.succeed(caseData),
        onNonEmpty: problems =>
          Effect.fail(new CaseRejected({ caseId: caseData.id, problems })),
      }),
    ),
  )

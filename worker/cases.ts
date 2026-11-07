/// <reference types="vite/client" />

// NOTE: the case library, bundled into the Worker at build time. Cases hold
// the answer, so only the Worker may import this module, never the client.

import { Array, Option, Order, Schema, pipe } from 'effect'

import { Case } from '../shared/case'

const files = import.meta.glob<unknown>('../cases/*.json', {
  eager: true,
  import: 'default',
})

// NOTE: every file is checked in CI by shared/checker.test.ts, so decoding
// here can't fail for a build that passed its tests.
export const CASES: ReadonlyMap<string, Case> = new Map(
  Array.map(Object.values(files), json => {
    const caseData = Schema.decodeUnknownSync(Case)(json)
    return [caseData.id, caseData]
  }),
)

// NOTE: `played` is oldest first. Unplayed cases come first, in ID order;
// once everything is played, the case played longest ago repeats.
export const pickCase = (
  caseIds: ReadonlyArray<string>,
  played: ReadonlyArray<string>,
): Option.Option<string> =>
  pipe(
    Array.sort(caseIds, Order.String),
    Array.findFirst(id => !played.includes(id)),
    Option.orElse(() => Array.findFirst(played, id => caseIds.includes(id))),
  )

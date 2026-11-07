// NOTE: patience comes from a guest's temperament, never from the case, so
// every chatty guest is as patient as every other and the thief can't stand
// out (docs/design.md, section 4). Playtest tuning happens here.
//
// A day's budget, and what each message costs. Gossips and flattered guests
// warm to a friendly message (it gives a point back); guarded and prickly
// guests count it like any other question.

import type { Temperament } from '../../shared/case'
import type { Tone } from './ai'

export type Patience = Readonly<{
  perDay: number
  costs: Readonly<Record<Tone | 'repeated', number>>
}>

export const PATIENCE: Readonly<Record<Temperament, Patience>> = {
  chatty: {
    perDay: 10,
    costs: { neutral: 1, friendly: 0, rude: 2, accusatory: 3, repeated: 1 },
  },
  gossip: {
    perDay: 9,
    costs: { neutral: 1, friendly: -1, rude: 2, accusatory: 3, repeated: 1 },
  },
  flattered: {
    perDay: 8,
    costs: { neutral: 1, friendly: -1, rude: 3, accusatory: 3, repeated: 1 },
  },
  anxious: {
    perDay: 7,
    costs: { neutral: 1, friendly: 0, rude: 2, accusatory: 3, repeated: 2 },
  },
  prickly: {
    perDay: 6,
    costs: { neutral: 1, friendly: 1, rude: 3, accusatory: 2, repeated: 2 },
  },
  guarded: {
    perDay: 5,
    costs: { neutral: 1, friendly: 1, rude: 3, accusatory: 3, repeated: 2 },
  },
}

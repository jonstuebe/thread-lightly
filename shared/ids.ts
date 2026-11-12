// NOTE: the primitives the wire protocol shares with the case schema. The
// client reaches this module through protocol.ts, so it must stay free of
// anything about a case's contents.

import { Schema } from 'effect'

export const Slug = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
)

export const GuestId = Slug
export type GuestId = typeof GuestId.Type

// NOTE: day 1 is the morning after the theft. Day 3 ends with the arrest.
export const Day = Schema.Literals([1, 2, 3])
export type Day = typeof Day.Type

export const DAYS: ReadonlyArray<Day> = [1, 2, 3]
export const LAST_DAY: Day = 3

// NOTE: night 0 is the night of the theft, before day 1. The thief makes a
// move on nights 1 and 2. Day 3 ends with the arrest, so there is no night 3.
export const Night = Schema.Literals([0, 1, 2])
export type Night = typeof Night.Type

export const NIGHTS: ReadonlyArray<Night> = [0, 1, 2]

// NOTE: each day has three parts, each with its own question budget.
export const Part = Schema.Literals(['morning', 'afternoon', 'evening'])
export type Part = typeof Part.Type

export const PARTS: ReadonlyArray<Part> = ['morning', 'afternoon', 'evening']

// NOTE: the primitives the wire protocol shares with the case schema. The
// client reaches this module through protocol.ts, so it must stay free of
// anything about a case's contents.

import { Schema } from 'effect'

export const Slug = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
)

export const GuestId = Slug
export type GuestId = typeof GuestId.Type

// NOTE: day 1 is Saturday, the morning after the theft. Day 3 ends with the
// arrest.
export const Day = Schema.Literals([1, 2, 3])
export type Day = typeof Day.Type

export const DAYS: ReadonlyArray<Day> = [1, 2, 3]
export const LAST_DAY: Day = 3

import { Array, Option, Schema } from 'effect'

import { CAST, GUEST_NAMES, type Guest } from '../shared/cast'

export { CAST, GUEST_NAMES, type Guest, type LineKind } from '../shared/cast'

export const GuestName = Schema.Literals(GUEST_NAMES)
export type GuestName = typeof GuestName.Type

// NOTE: every GuestName has exactly one CAST entry, so this never throws.
export const guestOf = (name: GuestName): Guest =>
  Option.getOrThrow(Array.findFirst(CAST, guest => guest.name === name))

const DAYS: ReadonlyArray<string> = ['Friday', 'Saturday', 'Sunday', 'Monday']

export const dayName = (day: number): string => DAYS[day] ?? 'Monday'

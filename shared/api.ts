// NOTE: the wire contract for POST /api/guest-texts, shared by the Foldkit
// client and the Cloudflare Worker. The client sends game state, never a
// prompt; the Worker owns the prompt so the endpoint can't be used as an
// open proxy to the Claude API.

import type { GuestName } from './cast'

export const GUEST_TEXTS_PATH = '/api/guest-texts'

export const MAX_HISTORY = 30
export const MAX_TEXT_LENGTH = 200
export const MAX_LINES = 6

export type GuestTextsSituation =
  | Readonly<{ kind: 'morning'; victim: GuestName | null }>
  | Readonly<{ kind: 'reply'; text: string }>

export type HistoryEntry = Readonly<{
  from: string
  text: string
}>

export type GuestTextsRequest = Readonly<{
  situation: GuestTextsSituation
  playerName: string
  alive: ReadonlyArray<GuestName>
  gone: ReadonlyArray<GuestName>
  thief: GuestName
  wifiLog: ReadonlyArray<GuestName>
  history: ReadonlyArray<HistoryEntry>
  count: number
}>

export type GuestTextsResponse = Readonly<{
  messages: ReadonlyArray<Readonly<{ from: GuestName; text: string }>>
}>

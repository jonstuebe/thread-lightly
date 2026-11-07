import Anthropic from '@anthropic-ai/sdk'

import {
  GUEST_TEXTS_PATH,
  type GuestTextsRequest,
  type GuestTextsResponse,
  type GuestTextsSituation,
  type HistoryEntry,
  MAX_HISTORY,
  MAX_LINES,
  MAX_TEXT_LENGTH,
} from '../shared/api'
import { CAST, GUEST_NAMES, type GuestName } from '../shared/cast'

export interface Env {
  ASSETS: Fetcher
  ANTHROPIC_API_KEY?: string
  CLAUDE_MODEL: string
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

// REQUEST VALIDATION

const isGuestName = (value: unknown): value is GuestName =>
  typeof value === 'string' && GUEST_NAMES.some(name => name === value)

const guestList = (value: unknown): Array<GuestName> | null =>
  Array.isArray(value) && value.every(isGuestName) ? [...new Set(value)] : null

const clip = (value: unknown, max: number): string | null =>
  typeof value === 'string' ? value.trim().slice(0, max) : null

const parseSituation = (value: unknown): GuestTextsSituation | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const record: Record<string, unknown> = { ...value }
  if (record['kind'] === 'morning') {
    const victim = record['victim']
    return isGuestName(victim)
      ? { kind: 'morning', victim }
      : victim === null
        ? { kind: 'morning', victim: null }
        : null
  }
  if (record['kind'] === 'reply') {
    const text = clip(record['text'], MAX_TEXT_LENGTH)
    return text ? { kind: 'reply', text } : null
  }
  return null
}

const parseHistory = (value: unknown): Array<HistoryEntry> =>
  Array.isArray(value)
    ? value.slice(-MAX_HISTORY).flatMap(entry => {
        if (typeof entry !== 'object' || entry === null) {
          return []
        }
        const record: Record<string, unknown> = { ...entry }
        const from = clip(record['from'], 24)
        const text = clip(record['text'], MAX_TEXT_LENGTH)
        return from && text ? [{ from, text }] : []
      })
    : []

const parseRequest = (body: unknown): GuestTextsRequest | null => {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const record: Record<string, unknown> = { ...body }
  const situation = parseSituation(record['situation'])
  const playerName = clip(record['playerName'], 16)
  const alive = guestList(record['alive'])
  const gone = guestList(record['gone'])
  const wifiLog = guestList(record['wifiLog'])
  const thief = record['thief']
  const count = record['count']
  if (
    !situation ||
    !playerName ||
    !alive ||
    alive.length === 0 ||
    !gone ||
    !wifiLog ||
    !isGuestName(thief) ||
    typeof count !== 'number'
  ) {
    return null
  }
  return {
    situation,
    playerName,
    alive,
    gone,
    thief,
    wifiLog,
    history: parseHistory(record['history']),
    count: Math.max(1, Math.min(MAX_LINES, Math.floor(count))),
  }
}

// PROMPT

const systemPrompt = (request: GuestTextsRequest): string => {
  const people = CAST.filter(guest => request.alive.includes(guest.name))
    .map(guest => `- ${guest.name}: ${guest.bio}`)
    .join('\n')
  const thiefStillHere = request.alive.includes(request.thief)
  return `You write in-character group chat texts for a lighthearted cozy-mystery party game. Keep it PG: no violence, no romance, no cruelty.

Setting: a weekend at Pine Hollow Lodge, a lakeside cabin. On Friday at dinner, Margot’s grandmother’s silver brooch vanished from the mantel. Since then, each night someone’s phone gets stolen and that guest drops out of the group chat.

Guests still in the chat (all adults):
${people}
- ${request.playerName}: the human player, another guest. Never write messages for ${request.playerName}.

Guests whose phones were taken or who were turned in: ${request.gone.join(', ') || 'none yet'}.

${
  thiefStillHere
    ? `SECRET known only to ${request.thief}: ${request.thief} is the thief. ${request.thief} acts normal, never confesses, gives a slightly too-convenient alibi, and gently nudges suspicion toward someone else. Everyone else genuinely does not know who did it; they speculate, share alibis, joke, and react.`
    : 'Nobody in the chat knows who the thief is; they speculate, share alibis, joke, and react.'
}

Today’s public clue: ${
    request.wifiLog.length > 0
      ? `the lodge router showed these phones online between 1 and 4 AM: ${request.wifiLog.join(' and ')}`
      : 'none yet'
  }.

Each text is 2 to 22 words in that guest’s texting style. Only these guests may speak: ${request.alive.join(', ')}.`
}

const instruction = (request: GuestTextsRequest): string => {
  const { situation, thief, playerName, count } = request
  if (situation.kind === 'reply') {
    return `${playerName} just texted: "${situation.text}". Write 1 to ${count} short replies from guests who would naturally respond. Anyone addressed or accused answers first.`
  }
  const news = situation.victim
    ? `${situation.victim}’s phone was stolen overnight`
    : 'no phone was stolen, but the brooch is still missing'
  return `Write the next ${count - 1} or ${count} messages: guests waking up and reacting to this morning’s news (${news}) and the Wi‑Fi clue. Several different guests talk; ${thief} appears once or twice if still in the chat. Someone may ask ${playerName} a question.`
}

const transcript = (history: ReadonlyArray<HistoryEntry>): string =>
  history.length > 0
    ? history
        .map(entry =>
          entry.from === '(event)'
            ? `[${entry.text}]`
            : `${entry.from}: ${entry.text}`,
        )
        .join('\n')
    : '(empty)'

const outputSchema = (alive: ReadonlyArray<GuestName>) => ({
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', enum: alive },
          text: { type: 'string' },
        },
        required: ['from', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['messages'],
  additionalProperties: false,
})

// CLAUDE

const generateGuestTexts = async (
  env: Env & { ANTHROPIC_API_KEY: string },
  request: GuestTextsRequest,
): Promise<GuestTextsResponse> => {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: 25_000,
    maxRetries: 1,
  })
  const response = await client.beta.messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: outputSchema(request.alive) },
    },
    system: systemPrompt(request),
    messages: [
      {
        role: 'user',
        content: `Recent chat:\n${transcript(request.history)}\n\n${instruction(request)}\n\nWrite at most ${request.count} messages.`,
      },
    ],
  })
  if (response.stop_reason === 'refusal') {
    return { messages: [] }
  }
  const text = response.content
    .flatMap(block => (block.type === 'text' ? [block.text] : []))
    .join('')
  const parsed: unknown = JSON.parse(text)
  const messages =
    typeof parsed === 'object' &&
    parsed !== null &&
    'messages' in parsed &&
    Array.isArray(parsed.messages)
      ? parsed.messages
      : []
  return {
    messages: messages
      .flatMap((message: unknown) => {
        if (typeof message !== 'object' || message === null) {
          return []
        }
        const record: Record<string, unknown> = { ...message }
        const from = record['from']
        const text = clip(record['text'], 180)
        return isGuestName(from) && request.alive.includes(from) && text
          ? [{ from, text }]
          : []
      })
      .slice(0, request.count),
  }
}

const handleGuestTexts = async (
  incoming: Request,
  env: Env,
): Promise<Response> => {
  if (incoming.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json({ error: 'live_texts_unavailable' }, 503)
  }
  const body: unknown = await incoming.json().catch(() => null)
  const request = parseRequest(body)
  if (!request) {
    return json({ error: 'bad_request' }, 400)
  }
  try {
    return json(
      await generateGuestTexts({ ...env, ANTHROPIC_API_KEY: apiKey }, request),
    )
  } catch (error) {
    console.error('guest-texts failed', error)
    return json({ error: 'upstream_failed' }, 502)
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === GUEST_TEXTS_PATH) {
      return handleGuestTexts(request, env)
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, 404)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

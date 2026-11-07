import { Option, Schema } from 'effect'

import { NEW_CASE_PATH, NewCaseRequest } from '../shared/protocol'
import { CASES, pickCase } from './cases'
import type { Env } from './env'

export { CaseObject } from './case-object'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

const CASE_SOCKET = /^\/api\/case\/([0-9a-f]{64})\/ws$/

const handleNewCase = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }
  const body = await request.json().catch(() => null)
  const played = Schema.decodeUnknownOption(NewCaseRequest)(body).pipe(
    Option.match({ onNone: () => [], onSome: ({ played }) => played }),
  )
  return Option.match(pickCase([...CASES.keys()], played), {
    onNone: () => json({ error: 'no_cases' }, 503),
    onSome: async caseId => {
      const id = env.CASES.newUniqueId()
      await env.CASES.get(id).init(caseId)
      return json({ gameId: id.toString(), caseId })
    },
  })
}

const handleCaseSocket = (
  request: Request,
  env: Env,
  gameId: string,
): Promise<Response> | Response => {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'expected_websocket' }, 426)
  }
  const id = (() => {
    try {
      return Option.some(env.CASES.idFromString(gameId))
    } catch {
      return Option.none()
    }
  })()
  return Option.match(id, {
    onNone: () => json({ error: 'not_found' }, 404),
    onSome: found => env.CASES.get(found).fetch(request),
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === NEW_CASE_PATH) {
      return handleNewCase(request, env)
    }
    const socket = CASE_SOCKET.exec(url.pathname)
    if (socket?.[1] !== undefined) {
      return handleCaseSocket(request, env, socket[1])
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, 404)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

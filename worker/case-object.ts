// NOTE: one Durable Object per game. It's a thin shell: it loads the stored
// state, runs the engine for each WebSocket message, saves the result and
// sends the engine's messages out. Sockets use hibernation, so an idle game
// costs nothing.

import { DurableObject } from 'cloudflare:workers'
import { Clock, Effect, Option, Schema, pipe } from 'effect'

import type { Case } from '../shared/case'
import {
  ClientMessageJson,
  ServerMessage,
  ServerMessageJson,
} from '../shared/protocol'
import { liveAiLayer } from './ai-live'
import { CASES } from './cases'
import type { Env } from './env'
import { handle, snapshot, startGame } from './game/engine'
import { GameState } from './game/state'

const STATE_KEY = 'game'

const encode = Schema.encodeSync(ServerMessageJson)

const toSenderOnly = (message: ServerMessage): boolean =>
  message._tag === 'Snapshot' || message._tag === 'Rejected'

export class CaseObject extends DurableObject<Env> {
  private queue: Promise<void> = Promise.resolve()

  async init(caseId: string): Promise<void> {
    const caseData = CASES.get(caseId)
    if (caseData === undefined) {
      throw new Error(`Unknown case "${caseId}"`)
    }
    const existing = await this.ctx.storage.get(STATE_KEY)
    if (existing === undefined) {
      await this.ctx.storage.put(
        STATE_KEY,
        Schema.encodeSync(GameState)(startGame(caseData)),
      )
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    const loaded = await this.load()
    if (Option.isNone(loaded)) {
      return new Response('No such game', { status: 404 })
    }
    const { caseData, state } = loaded.value
    const [client, server] = Object.values(new WebSocketPair())
    if (client === undefined || server === undefined) {
      return new Response('WebSocket pair failed', { status: 500 })
    }
    this.ctx.acceptWebSocket(server)
    server.send(encode(snapshot(caseData, state)))
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    // NOTE: model calls await, so without the queue two messages could
    // interleave and the second would overwrite the first one's state.
    this.queue = this.queue
      .then(() => this.process(socket, data))
      .catch(error => console.error('case message failed', error))
    return this.queue
  }

  override async webSocketClose(
    socket: WebSocket,
    code: number,
  ): Promise<void> {
    socket.close(code, 'closing')
  }

  private async load(): Promise<
    Option.Option<{ caseData: Case; state: GameState }>
  > {
    const stored = await this.ctx.storage.get(STATE_KEY)
    if (stored === undefined) {
      return Option.none()
    }
    const state = Schema.decodeUnknownSync(GameState)(stored)
    return Option.map(
      Option.fromUndefinedOr(CASES.get(state.caseId)),
      caseData => ({
        caseData,
        state,
      }),
    )
  }

  private async process(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    const loaded = await this.load()
    if (Option.isNone(loaded)) {
      socket.close(4404, 'No such game')
      return
    }
    const { caseData, state } = loaded.value
    const env = this.env
    const storage = this.ctx.storage
    const sockets = this.ctx.getWebSockets()

    const program = Effect.gen(function* () {
      const maybeMessage = yield* Effect.option(
        Schema.decodeEffect(ClientMessageJson)(
          typeof data === 'string' ? data : '',
        ),
      )
      if (Option.isNone(maybeMessage)) {
        return [ServerMessage.cases.Rejected.make({ reason: 'invalid' })]
      }
      const now = yield* Clock.currentTimeMillis
      const step = yield* handle(caseData, state, maybeMessage.value, now)
      if (step.state !== state) {
        const encoded = yield* Effect.orDie(
          Schema.encodeEffect(GameState)(step.state),
        )
        yield* Effect.promise(() => storage.put(STATE_KEY, encoded))
      }
      return step.out
    })

    const out = await pipe(
      program,
      Effect.provide(liveAiLayer(env.AI, caseData, env.SMALLTALK_MODEL)),
      Effect.runPromise,
    )

    out.forEach(message => {
      const encoded = encode(message)
      if (toSenderOnly(message)) {
        socket.send(encoded)
      } else {
        sockets.forEach(open => open.send(encoded))
      }
    })
  }
}

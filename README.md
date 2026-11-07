# Thread Lightly

**Pine Hollow** is a cozy murder-free mystery played inside a fake group chat. Someone at the lodge took Margot’s grandmother’s silver brooch. You’re secretly the detective: look into one guest each night, read the Wi‑Fi log each morning, and get the group to vote the thief out before everyone checks out on Monday.

It will live at **threadlightly.jonstuebe.com**.

## Stack

- **Client:** [Foldkit](https://foldkit.dev) (Elm architecture on [Effect](https://effect.website)), built with Vite.
- **Server:** a Cloudflare Worker that serves the built client as static assets and answers `POST /api/guest-texts`, which asks Claude to write the guests’ texts in character.
- **Fallback:** without an Anthropic API key the endpoint returns 503 and the guests use built-in lines, so the game is fully playable offline.

## Getting started

```bash
pnpm install
pnpm dev          # Vite + the Worker together, via @cloudflare/vite-plugin
```

To get live guest texts locally, copy `.dev.vars.example` to `.dev.vars` and set `ANTHROPIC_API_KEY`.

```bash
pnpm test         # Story (update) and Scene (view) tests
pnpm lint         # oxlint with the Foldkit and Effect rule sets
pnpm typecheck    # client and Worker
pnpm format
```

## Layout

```
src/                Foldkit client
  entry.ts          boots the runtime (the only file that calls Runtime.run)
  model.ts          Model and the domain unions (Phase, FeedItem, Beat, ...)
  message.ts        every Message
  update.ts         init + update: the game's state machine and script playback
  command.ts        side effects: timers, dice rolls, the guest-texts fetch, DOM
  game.ts           pure scripts, pacing, and the Random-driven rolls
  subscription.ts   visual viewport tracking for the on-screen keyboard
  view/             header, thread and cards, composer, lock screen, sheets
shared/             plain TypeScript used by both sides (cast, API contract)
worker/             the Cloudflare Worker
wrangler.jsonc      Worker, assets and custom domain config
```

### How the chat is paced

Guests don’t text all at once. `update` keeps a queue of **beats** (`Model.script`). Each beat shows typing, posts a text, or shows an event, then a `WaitForBeat` Command sleeps for a reading-speed delay (about 170 words per minute) before the next one plays. Every timer carries the case number, so starting a new case mid-script makes stale timers harmless.

All randomness (who the thief is, whose phone vanishes, how guests vote) runs inside Commands using Effect’s `Random`, so `update` stays pure and the tests can feed in exact outcomes.

## Deploying

Not wired up yet, but the config is ready:

```bash
pnpm wrangler login
pnpm wrangler secret put ANTHROPIC_API_KEY   # optional; enables live texts
pnpm deploy
```

`wrangler.jsonc` routes the Worker to the `threadlightly.jonstuebe.com` custom domain, which needs `jonstuebe.com` to be a zone on the same Cloudflare account. The model is set by the `CLAUDE_MODEL` var.

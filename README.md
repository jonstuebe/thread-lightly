# Thread Lightly

**Thread Lightly** is a cozy, murder-free mystery played over text messages. Something has gone missing, and each case is set somewhere new. You're the detective: tap questions to DM the guests, read the Wi-Fi log each morning, and save messages to your case file. Press a guest on a reply, or show saved proof that it's a lie. Each part of the day has a budget of questions, so choose carefully. By the end of day 3, arrest the thief on a lie you caught.

It will live at **threadlightly.jonstuebe.com**. The design is in [`docs/design.md`](./docs/design.md).

## Stack

- **Client:** [Foldkit](https://foldkit.dev) (Elm architecture on [Effect](https://effect.website)), built with Vite.
- **Server:** a Cloudflare Worker. It serves the built client, starts cases at `POST /api/case/new`, and runs each case in a Durable Object that the client talks to over a WebSocket.
- **Guests:** every line is written in the case: each guest's questions, their answers, and what they say when pressed or caught. There are no model calls at runtime, Workers AI or Anthropic.
- **Cases:** hand-written or generated locally by a Claude Code skill, then committed to `cases/`. The Worker never generates cases.

## Getting started

`mise.toml` pins Bun and Node; `mise install` sets them up.

```bash
mise install
bun install
bun run dev          # Vite + the Worker together, via @cloudflare/vite-plugin
```

```bash
bun run test         # client Story/Scene tests, engine and checker tests
bun run lint         # oxlint with the Foldkit and Effect rule sets
bun run typecheck    # client and Worker
bun run format
bun run cases:check  # run the solvability checker on cases/ (or on files you name); exits 1 on errors, prints warnings
```

### Adding a case

Run the `/generate-case` skill in Claude Code. It plots a mystery, writes it as JSON, checks it with `bun run cases:check` until it has no errors, and saves it to `cases/`. Commit the file and the Worker bundles it on the next build. The checker searches the game: every question must be askable, and the case must be winnable from a fresh day 3 within that day's budget (`docs/design.md`, section 9).

## Layout

```
src/                Foldkit client
  entry.ts          boots the runtime (the only file that calls Runtime.run)
  model.ts          Model, Connection, Board, the playback queue and sheets
  message.ts        every Message
  update.ts         init + update: connection, pacing, sends, case file, arrest
  command.ts        side effects: start a case, socket sends, timers, storage, DOM
  socket.ts         the case WebSocket as a ManagedResource
  subscription.ts   socket messages, and viewport tracking for the keyboard
  chat.ts           pure helpers: threads, names, pacing constants
  view/             lock screen, conversation list, threads, sheets
shared/             used by both sides; depends only on effect
  protocol.ts       the WebSocket protocol (the only shared module the client imports)
  case.ts           the case schema (holds the answer; server only)
  rules.ts          the deterministic game rules the engine and checker share
  checker.ts        searches a case to prove it's solvable
  fixtures/         a tiny test case (not playable)
worker/             the Cloudflare Worker
  game/             the rules as a pure function
  case-object.ts    the Durable Object for one case
cases/              case files, one JSON per case
scripts/            local tooling (check-cases.ts behind bun run cases:check)
wrangler.jsonc      Worker, assets, Durable Object and custom domain config
```

### How the chat is paced

The server sends each reply as soon as it has one. The client queues what arrives and plays it back like a real chat. A guest's reply shows a typing bubble for a time based on its length, posts, then holds briefly before the next one. Wi-Fi entries post quickly, and night holds longer before the morning messages. A timer carries the playback epoch, so a fresh snapshot makes any pending timers harmless.

Time in the game doesn't follow the wall clock. It moves in ticks: each question, press or proof spends ticks from the current part of the day (`docs/design.md`, section 2). Pacing is only how fast replies appear.

Your own question shows immediately as pending and settles when the server echoes it back. If the server rejects it (the guest is away or quiet, say), the chip comes back with a note.

### Reconnecting

The game ID is kept in `localStorage`, so a reload rejoins the same case. If the socket drops, the client waits and reconnects. After three failures in a row it drops the case and shows the lock screen again.

## Deploying

Not wired up yet, but the config is ready:

```bash
bunx wrangler login
bun run deploy
```

`wrangler.jsonc` routes the Worker to the `threadlightly.jonstuebe.com` custom domain, which needs `jonstuebe.com` to be a zone on the same Cloudflare account.

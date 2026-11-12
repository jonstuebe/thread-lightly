# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Project Notes

See `README.md` for the layout and how chat pacing works.

- **Vocabulary.** A _case_ is one mystery (`cases/*.json`); a _game_ is one playthrough of it, named by `gameId`. The _board_ is the client's copy of what the detective can see. The _case file_ is the messages the detective saved. The _thief_ is secret server state; the player is the _detective_.
- **Time lives in Commands.** Timers (`WaitForBeat`, `WaitToReconnect`, `WaitForLongPress`) are Commands. `update` never reads the clock.
- **Stale results are ignored.** Socket messages carry `gameId` and `attempt`; pacing timers carry `playbackEpoch`; long-press timers carry `pressId`. Drop anything that doesn't match the Model.
- **The socket is a ManagedResource.** `src/socket.ts` opens it while `Connection` is `Connecting` or `Open`; the `caseSocket` subscription reads it. Send with the `SendToServer` Command.
- **No model calls at runtime,** Workers AI or Anthropic. Every guest line is authored in the case and the game is deterministic. Cases are generated locally by the `generate-case` skill (`.agents/skills/generate-case`), never by the Worker. Check a case with `bun run cases:check`.
- **`shared/` depends only on `effect`**, because the Worker imports it too. It holds the case schema, the reply rules, the solvability checker and the WebSocket protocol for the detective redesign (`docs/design.md`).
- **The detective game's server** lives in `worker/game/` (`engine.ts`: `handle` is a pure function of case, stored state, client message and the current time, playing by `shared/rules.ts`) and `worker/case-object.ts` (the Durable Object shell). Test rules through `handle` in `worker/game/engine.test.ts` against `shared/fixtures/tiny-case.json`, which is never bundled as a playable case.
- **Cases hold the answer.** `cases/*.json` and `shared/case.ts` data must never reach the client bundle. The client imports `shared/protocol.ts` only.
- **Vite plugin order matters.** `cloudflare()` must come before `foldkit()` in `vite.config.ts`; the other way round, the dev server fails to serve the devtools script injected into `index.html`.
- **Deploy target:** Cloudflare Workers, custom domain `threadlightly.jonstuebe.com` (see `wrangler.jsonc`). No secrets.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `jonstuebe/thread-lightly` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

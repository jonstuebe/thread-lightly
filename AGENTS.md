# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Project Notes

See `README.md` for the layout and how chat pacing works.

- **Vocabulary.** A _case_ is one playthrough (`caseNumber` increments on every new case). The _feed_ is what's rendered in the thread. A _beat_ is one scripted step of the conversation waiting in `Model.script`. The _thief_ is secret game state; the player is the _detective_.
- **Randomness and time live in Commands.** `game.ts` holds the `Random`-based rolls; `command.ts` wraps them. `update` never rolls dice or reads the clock.
- **Every async result carries `caseNumber`.** Ignore results whose number doesn't match the Model.
- **The Worker owns the prompt.** The client sends game state to `POST /api/guest-texts`, never prompt text, so the endpoint can't be used as a general Claude proxy. The wire contract is `shared/api.ts`.
- **`shared/` is plain TypeScript** with no runtime dependencies, because the Worker imports it too.
- **Vite plugin order matters.** `cloudflare()` must come before `foldkit()` in `vite.config.ts`; the other way round, the dev server fails to serve the devtools script injected into `index.html`.
- **Deploy target:** Cloudflare Workers, custom domain `threadlightly.jonstuebe.com` (see `wrangler.jsonc`). Secret: `ANTHROPIC_API_KEY`. Var: `CLAUDE_MODEL`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `jonstuebe/thread-lightly` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

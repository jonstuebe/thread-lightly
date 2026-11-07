# Pine Hollow: detective redesign

Status: draft, 2026-11-07

## 1. Overview

Pine Hollow moves away from Mafia. You're still the detective. Instead of watching guests vote, you investigate:

- You DM any guest directly, or ask questions in the group chat.
- You save messages that matter to a case file.
- At the end of day 3 you arrest one guest, and you have to back the arrest with evidence.

The app becomes a real iMessage-style app: a conversation list, one thread per guest, and the group chat.

Goals:

- **Skill over luck.** You win by reading closely, catching a lie and proving it, not by guessing one of six names.
- **Typed questions.** You ask in your own words.
- **Cheap to run.** Most replies come from a dictionary written when the case is generated. Models only route messages and handle small talk.
- **No cheating.** The answer never reaches the browser.
- **Solvable every time.** A case is checked by code before anyone plays it.

## 2. Game loop

A case lasts **three days**. Each day has three parts:

1. **Morning.** Night events are revealed in the group chat (a guest finds something, something has gone missing). The Wi-Fi log for the previous night is published (see below).
2. **Day.** You question guests by DM and in the group chat. Every guest has a patience budget for the day, and some go to bed early.
3. **Night.** The thief makes one move (section 7). You can't question anyone at night. Guests who went to bed don't reply.

Time moves forward when you choose to end the day, or when everyone is asleep or out of patience. After the third night you go straight to the arrest.

### The Wi-Fi log

The lodge's Wi-Fi log stays as the one source of hard evidence. It's a pinned thread in the conversation list, styled like a router admin page, that shows when each guest's phone joined or left the network and which access point it used (lodge, kitchen, boathouse).

- Each morning it shows entries for the previous night. Every entry is a true fact.
- Log entries can be saved to the case file like messages, and can be the proof half of a contradiction.
- The thief can't edit the log, but the log can be ambiguous on its own: a phone left in a room, or two phones on the same access point. Ambiguous entries need a guest's testimony to mean anything.

## 3. Case schema

A case is one JSON document in `cases/`, decoded with the Effect Schema in `shared/case.ts` (the source of truth; this is a summary). It lives only in the Worker and the Durable Object.

```ts
Case {
  id
  setting: { title, premise, missingItem, accessPoints }
  guests: Guest[]                  // 4–8; generation aims for 6
  thief: GuestId
  theftFact: FactId                // "Dale took the brooch". Only the timeline may carry it.
  timeline: TimelineEvent[]        // what really happened, revealed at the end
  facts: Fact[]                    // every checkable statement in the case
  groupBeats: GroupBeat[]          // section 6
  nightMoves: NightMove[]          // section 7
  contradictions: Contradiction[]  // section 8
  wifiLog: WifiEntry[]             // section 2
}

Fact { id, text, isTrue, about: GuestId[], concernsTheft }

Guest {
  id, name, role, voice
  temperament                      // section 4
  patience: { perDay, costs: { neutral, friendly, rude, accusatory, repeated } }
  bedtime                          // "22:30"
  knows: FactId[]                  // true facts they can say
  claims: FactId[]                 // what they say even if it's false
  secret?: FactId                  // innocents only
  dictionary: { topics, pressed, dodges, greetings, thanks, goodnight }   // section 5
}

WifiEntry { id, night, time, guest, event: 'joined' | 'left', accessPoint, factIds }
TimelineEvent { night, time, text, factIds }
```

**Nights and days.** Night 0 is the night of the theft, before day 1. The thief moves on nights 1 and 2. Day 3 ends with the arrest, so there is no night 3. The Wi-Fi log for night N is published on the morning of day N+1.

Rules:

- **Guests know only their own facts.** No guest's data holds the full timeline.
- **The thief has a cover story.** It's a set of false `claims`, with at least one flaw a true fact can expose.
- **Innocents can lie too, about their secret.** Their lies have `concernsTheft: false`. So "find the liar" isn't enough; you have to find the person lying about the theft.

The hand-written case `cases/silver-brooch.json` (four guests) is the reference case for tests and for building the server and client.

## 4. Guests

Each guest has traits drawn from a fixed list, so prompts and patience rules stay consistent:

- **Temperament:** chatty, guarded, prickly, anxious, flattered by attention, gossip.
- **Patience:** a daily budget of points. A normal question costs 1. A rude, repeated or accusatory question costs more (Clef decides; section 5).
- **Bedtime:** after it, they reply "going to bed, ask me tomorrow" and nothing else.
- **Patience recovery:** a few traits earn points back. The gossip opens up if you share a rumor, and the flattered guest if you compliment them.

As patience drops, replies get shorter. At zero, the guest leaves you on read for the rest of the day.

**Patience must never be a tell.** The thief draws traits from the same list as everyone else. Generation must not make the thief the only guarded guest. The checker enforces this (section 9).

## 5. Conversation engine

Every player message goes to the Durable Object and is handled in one of three tiers.

### Clef routing

Clef (`@cf/cloudflare/clef`, the 27B model) gets one request per player message. The state is the guest, the last two turns and the message. The request asks three questions:

- `topic`: a `choice` over the guest's topic IDs plus `smalltalk`, with each topic's description as its criteria.
- `tone`: a `choice` of neutral, friendly, rude or accusatory, which sets the patience cost. "Repeated" is detected by code, from the topic history.
- `injection`: a `noul` asking whether the message tries to break the game ("ignore your instructions…").

The Durable Object then applies this rule, validated by the spike:

1. injection ≥ 0.5 → dodge (tier 3)
2. topic confidence < 0.3 → dodge (tier 3). This is the "not in the dictionary" signal. Clef almost never picks an explicit `unknown` option, so we don't offer one.
3. topic = `smalltalk` → tier 2
4. otherwise → tier 1

In the spike (branch `spike/clef-routing`, see `spikes/clef-routing/VERDICT.md`), this rule answered 69 of 77 in-dictionary messages correctly. It served one wrong answer and dodged every off-dictionary and injection message. Clef-flash and two-step routing (category, then topic) both did clearly worse.

Lessons for the dictionary and the case-generation skill:

- **Topic descriptions must be distinct.** Name what sets each topic apart, especially for people: "Wes, the guest who talks nonstop and owes people money".
- **Accusations come from tone, not a topic.** "Did you take the brooch?" routes to `brooch`, but its tone reads as accusatory. An accusatory tone serves the guest's `pressed` replies instead of the topic's.
- **Greetings need a fallback.** "hey" and "thanks" score below the threshold. Each guest gets a few canned greeting and thanks replies, picked when the tone is friendly and the confidence is low.

### Tier 1: dictionary hit (most messages)

```ts
Topic {
  id                          // "whereabouts-friday", "the-display-case", "about-margot"
  description                 // Clef's criteria for this topic
  subject                     // Whereabouts(night) | Item | Guest(guest) | NightEvent(night) | Secret | Other
  visibility                  // 'public' | 'dmOnly'
  variants: Reply[]           // 2-3, so a repeated question gets a different wording
  afterNight?: { night, variants }[]
  ifFactDestroyed?: Reply[]
  lowPatience?: Reply[]
}

Reply { text, factIds: FactId[] }
```

Which replies a topic gives on a given day is decided by `activeReplies` in `shared/replies.ts`, which the Durable Object and the checker share:

1. Use the latest `afterNight` override whose night has passed, or else `variants`. A topic about a night that hasn't happened yet answers from `variants` ("ask me tomorrow").
2. If those replies carry a destroyed fact, use `ifFactDestroyed`, or else drop the replies that carry it. No replies left means a dodge.

The guest's `pressed` replies follow the same rules.

Every reply carries its fact IDs from generation time. The Durable Object always knows exactly what a message revealed, with no model involved.

Each guest gets roughly 15–25 topics. They cover:

- where they were on each night
- each other guest
- the missing item
- each night's events
- their secret, if they have one
- common pressure ("are you lying?", "I know you did it")

### Tier 2: small talk, no facts

When the topic is `smalltalk` (weather, the lodge, flirting, jokes), a cheap Workers AI model replies in character. **Its prompt has the guest's name, traits and voice, and no case facts at all.** It can't leak what it doesn't know.

Clef still checks its output for fact-like claims (times, places, names tied to the theft). Anything flagged gets swapped for a canned dodge.

### Tier 3: unknown, on topic

The guest deflects in character with a pre-written dodge: "lol what? ask Margot", "why would I know that". Each guest gets 5–8 dodges written with their dictionary. Being cagey reads as personality, not a broken bot.

### Later, maybe: rephrasing

A cheap model could reword a matched tier-1 reply to fit the exact question. The facts would stay fixed, and Clef would check that no fact was added or dropped. We'd add this only if tier 1 feels stiff in testing.

## 6. Group chat director

The group chat is AI-driven, but most of it is known when the case is generated:

```ts
GroupBeat {
  trigger: Morning(day) | Idle(day)
  lines: { guest, text, factIds }[]
}
```

- **Morning beats** play from the script and announce the night's events, with typing indicators and reading-speed pacing as today.
- **Idle chatter** plays occasionally while you're in other threads, so the group chat feels alive.
- **When you post in the group chat**, Clef picks zero to two guests who would plausibly answer, from their traits and mood. Then each one goes through the section 5 engine using that guest's **public** topic list.

Guests are guarded in public. Each topic entry is flagged `public` or `dmOnly`, and the group chat never serves a `dmOnly` topic.

We could also have guests repeat what you DMed them. That would make DMs a social risk: "the detective was asking me about Dale…". It would be a group beat triggered when you ask a gossip-trait guest about another guest. It's optional, and not in v1.

## 7. Thief night moves

On nights 1 and 2 the thief makes exactly one move, fixed when the case is generated so the checker can verify it. Letting the Durable Object pick from a pre-validated set is a possible later change.

```ts
NightMove =
  | Destroy { night, fact }
  | Plant   { night, fact, disprovedBy }
  | Coach   { night, guest, fact, tellFact, disprovedBy }
```

- **Destroy.** One fact becomes unavailable. It has to be physical evidence, not a Wi-Fi log entry. Replies that would reveal it switch to their `ifFactDestroyed` variant. If you already saved a message containing that fact, the evidence stays good. Asking early pays off.
- **Plant.** A false fact pointing at an innocent appears, such as "Priya's coat pocket had a velvet pouch". There's always a true fact that disproves it.
- **Coach.** The thief gets another guest to back up their alibi. That guest's dictionary gains a false claim. The coached guest has a tell: a reply under pressure in which they admit "Dale asked me to say that".

The coached guest's new claim lives in their topics' `afterNight` replies, and the tell in their `pressed` replies' `afterNight`. Each move is announced vaguely in the morning beat ("someone was in the kitchen at 2am"), so you know something happened without knowing what.

## 8. Evidence and arrest

### The case file

- **Long-press any message** in a DM or the group chat, then choose **Add to case file**. It works like an iMessage reaction or pin.
- The case file lists saved messages grouped by guest, each showing who said it and when.
- The case file stores message IDs. The Durable Object maps each ID to the fact IDs it carried. The client never sees fact IDs or whether a fact is true.

### The arrest

At the end of day 3, or earlier if you choose:

1. Pick the guest to arrest.
2. Pick **two saved messages**: one where the suspect claimed something, and one that proves it false.
3. The Durable Object checks whether that pair matches one of the case's `contradictions`:

```ts
Contradiction {
  suspect: GuestId
  claimFact: FactId     // a false claim the suspect made
  proofFact: FactId     // a true fact that disproves it
  concernsTheft: boolean
}
```

### Endings

| Arrested    | Evidence                                      | Ending                                                   |
| ----------- | --------------------------------------------- | -------------------------------------------------------- |
| The thief   | A contradiction about the theft               | **Case closed.** Full reveal of the timeline.            |
| The thief   | A contradiction about something else, or none | **They walk.** Right person, the case doesn't hold.      |
| An innocent | Anything                                      | **Wrong person.** The thief leaves Monday with the item. |

Every ending reveals the true timeline, so you learn what you missed.

## 9. Case generation and solvability

### Generation

Cases are generated **offline, never by the Worker**. Generation is a local Claude Code skill, to be written later, that we run by hand whenever we want new cases. It runs on Claude Opus 5.5 at high effort. No API key is involved, and the Worker never calls Claude.

Each run of the skill:

1. Writes a case as JSON matching the case schema.
2. Runs the checker on it (`pnpm cases:check`). If a check fails, the skill fixes the case and checks again.
3. Saves the case to `cases/<id>.json`, which gets committed.

The skill's instructions ask for:

- A setting and a missing item. These are small, cozy stakes, not murder.
- Six guests with traits and voices.
- A true timeline, the thief, and a cover story with one or two flaws.
- One secret for each of two or three innocents.
- Dictionaries, group beats and night moves.

The prompt may borrow tropes from classic mysteries, such as the alibi with a gap, the too-obvious suspect, the witness who saw the right thing but misread it, and the innocent with a secret. It must not borrow plots, characters or details from specific books.

### The checker

The checker is pure Effect code in `shared/`. A generated case is used only if every check passes:

1. **Schema and references.** The JSON decodes, every ID referenced exists, and no ID is defined twice.
2. **Contradictions are sound.** Each claim is false and one of the suspect's claims, each proof is true, and both can actually be found.
3. **Thief is provable on day 3.** At least one theft contradiction against the thief can still be found on the last day, after both night moves: the thief still says the claim that day, and the proof is in a reply that day, the Wi-Fi log or a morning beat. Earlier contradictions can be destroyed, so asking early pays off, but a slow player can still win.
4. **Night moves are sound.** One move per night. Destroyed facts are true, findable before the move and not in the Wi-Fi log. Planted facts are false, point at an innocent, and appear only after the night. Coached claims appear only after the night, and the coached guest gives a true tell when pressed.
5. **No false proof against innocents.** Every planted or coached fact is disproved by a true fact that can be found on day 3.
6. **No leaks.** Every fact a guest says is in their `knows` or `claims`, `knows` holds only true facts, secrets don't concern the theft, and the theft fact appears only in the timeline.
7. **Traits aren't a tell.** The thief shares a temperament with an innocent, and their patience is within the innocents' range.
8. **Coverage.** Every guest has whereabouts for nights 0–2, the item, each other guest, their secret if they have one, at least one public topic and at least five dodges. Each day has a morning beat.
9. **Variants agree.** Every reply in a group (a topic's `variants`, each `afterNight`, `ifFactDestroyed`, `lowPatience`, and the same for `pressed`) carries the same facts. The engine rotates through a group and the first ask gets the first reply, so a fact in only some replies would hide behind repeated questions.

"Can be found" means: some guest's active reply that day carries it, or it's in a published Wi-Fi entry or morning beat. Idle beats don't count, because they aren't guaranteed to play.

The skill runs the checker itself. The build and CI run it on every file in `cases/` too, so a broken case can't ship.

### The case library

Validated cases live in `cases/` and are bundled into the Worker. They must never be imported by the client or served as static assets, because each one contains the answer. A test should assert that the client bundle contains no case data.

- "New case" picks a case the player hasn't played. The client keeps the IDs of played cases in `localStorage` and sends them with the request.
- When the player has played everything, cases repeat, starting with the one played longest ago.
- If the library grows past what fits comfortably in the Worker bundle, we can move it to KV with an upload script. A case is probably 100–200 KB, so a few dozen fit fine.

## 10. Architecture

```
Browser (Foldkit + Effect)
  │  WebSocket, Effect Schema messages
  ▼
Worker (Effect)  ── /api/case/new  → picks a case from the bundled library, creates a Durable Object
  │               ── /api/case/:id/ws → upgrades to the case's Durable Object
  ▼
CaseObject (Durable Object, Effect)
  - holds the Case and the game state (day, patience, destroyed facts, transcript, case file)
  - runs the conversation engine and the group director
  - calls Workers AI: Clef for routing, a cheap model for small talk
  - stores everything in Durable Object storage; uses WebSocket hibernation

Local only, never deployed:
  case-generation skill (Claude Code, Opus 5.5 high effort) → cases/*.json → pnpm cases:check
```

### Effect on both sides

- `shared/` now depends on `effect`. It holds the Schemas for the case, the wire protocol and the checker. **This changes the rule in `AGENTS.md` that `shared/` has no runtime dependencies.**
- On the server, Workers AI, Clef, storage and the clock are Effect services provided by Layers. Tests swap in fakes, the same way the client tests feed exact outcomes today.
- The Durable Object class is a thin shell that runs an Effect program for each WebSocket message.

### Wire protocol

These are tagged unions defined with Effect Schema.

Client to server:

Threads are `Group`, `Direct(guest)` and `WifiLog`. Every chat message, Wi-Fi entries included, has a message ID, so any of them can be saved to the case file.

- `SendMessage { thread, text }`
- `SaveToCaseFile { messageId }`
- `RemoveFromCaseFile { messageId }`
- `EndDay`
- `MakeArrest { suspect, claimMessageId, proofMessageId }`
- `Resume`

Server to client:

- `Snapshot { intro, guests, messages, caseFile, day, phase, result? }`, sent on connect or resume. `result` is there once the case is over, so a reload still shows the ending.
- `Typing { thread, guest }`
- `MessagePosted { thread, message }`
- `GuestStatusChanged { guest, status }`, where status is `available`, `annoyed`, `leftOnRead` or `asleep`.
- `PhaseChanged { day, phase }`
- `CaseFileChanged { caseFile }`
- `ArrestResult { result: { ending, thief, timeline } }`
- `Rejected { reason }`, such as asleep, too fast or an unknown message ID.

Messages to the client carry text and IDs only, never fact IDs or truth values.

### Identity

There are no accounts. The case ID is kept in `localStorage`, and refreshing resumes the case by reconnecting to the same Durable Object. Losing the ID means losing the case, and that's acceptable.

### Server rules, as built

- **Clock.** Each day starts at 9:00 and every message the detective sends moves it 20 minutes. A guest whose bedtime has passed says their `goodnight` line once and stops replying.
- **Patience.** Each message costs the tone's cost, plus the `repeated` cost when the topic was already asked that day. A friendly message can cost less than nothing, up to the daily budget. At a third of the budget a guest is `annoyed` (and uses `lowPatience` replies when a topic has them); at zero they leave you on read.
- **Wording.** Repeated questions rotate through a topic's variants, and dodges rotate too, so there's no randomness to fake in tests.
- **Greetings.** A friendly message below the confidence threshold gets a greeting if it's the first message to that guest today, or a thanks line after that.
- **Group chat.** Clef asks one yes/no question per awake guest; up to two guests with ≥ 0.5 answer, or the single most likely one if nobody clears it. They answer from public topics only.
- **Small talk.** The small-talk model (`SMALLTALK_MODEL`) gets the guest's name, role, voice and temperament and no facts. Clef then checks its line for times, whereabouts or anything about the item; a flagged line becomes a dodge. Any model failure also becomes a dodge.
- **Pacing.** The server sends `Typing` and the reply together. The client paces them at reading speed.
- **Arrest.** Both messages must be in the case file. The claim must be the suspect's own message, and the pair must match a theft contradiction for `caseClosed`. After the arrest everything but `Resume` is rejected.

### Cost controls

- Patience budgets cap model calls per case.
- Each Durable Object rate-limits messages.
- Tier 2 is the only free-text generation, and it's short.
- Generation costs nothing at runtime, because it happens locally.

## 11. Client UX

- **iPhone:** conversation list → tap → thread, with a back button. It works like Messages.
- **iPad and desktop:** the conversation list goes in the sidebar from the split view we already have, with the thread in the main pane.
- **Conversation list rows:** avatar, name, last message preview, unread dot, and a status badge for guests who are asleep or not replying.
- **Long-press on a message** opens a menu with **Add to case file** (and **Remove** if it's already saved). Saved messages show a small pin.
- **Case file** is reachable from the header. It's a sheet listing saved messages grouped by guest.
- **Arrest** opens from the case file. Pick a suspect, then the claim, then the proof, then confirm. Only saved messages can be picked.
- **Day and phase** show in the header, like the current phase bar. "End day" asks for confirmation.
- **Removed:** voting, stolen phones, the "look into one guest" night action, and the current scripted Mafia flow.

## 12. Build plan

All of this happens on a branch, since it replaces the current game.

1. ~~**Clef routing spike.**~~ Done. The dictionary approach works with Clef (27B) and a 0.3 confidence threshold. See section 5 and `spikes/clef-routing/VERDICT.md` on branch `spike/clef-routing`. The follow-up is to rerun it with test messages from someone who didn't write the dictionary.
2. ~~**Schemas and checker.**~~ Done. `shared/case.ts`, `shared/replies.ts`, `shared/checker.ts` and `shared/protocol.ts`, tested against `cases/silver-brooch.json`.
3. ~~**Server foundation.**~~ Done. `worker/game/engine.ts` holds the rules as a pure Effect function (state and client message in, state and server messages out), with Clef and small talk behind the `Router` and `SmallTalk` services (`worker/game/ai.ts`, live versions in `worker/ai-live.ts`). `worker/case-object.ts` is the Durable Object shell. The engine tests play the silver brooch case end to end with a scripted fake, and a manual WebSocket run against live Clef closed the case.
4. ~~**Client rewrite.**~~ Done. The Foldkit client in `src/` plays the silver brooch case over the WebSocket: the conversation list, DM, group and Wi-Fi log threads, long-press (or right-click, or Enter) to save, the case file, the arrest steps and the result with its timeline. The socket is a `ManagedResource` (`src/socket.ts`). The client paces replies itself; see "How the chat is paced" in the README. `/api/guest-texts`, the Anthropic SDK and the Mafia flow are gone.
5. ~~**Case generation.**~~ Done. The `generate-case` skill (`.agents/skills/generate-case`) writes a case and checks it with `pnpm cases:check` (`scripts/check-cases.ts`). The checker gained rule 9, variants agree. The first batch is `the-recipe-tin`, `the-regatta-cup` and `the-last-exposure`. `src/no-case-data.test.ts` keeps the client's imports away from case data, and the wire protocol's primitives moved to `shared/ids.ts` so the client no longer bundles the case schema.
6. **Make the guests feel alive.** Group chat director, idle chatter, night moves, patience tuning, endings and the timeline reveal.

## 13. Open questions

- **Small-talk model.** Which cheap Workers AI model sounds most natural in character? We'll pick one during the spike.
- **Early arrest.** Is there any bonus for arresting before day 3 ends, or is the only benefit finishing sooner?
- **Gossip leaks.** Do guests repeat your DMs to the group chat in v1 or later?

## Decided

- Cases are generated by a local Claude Code skill on Opus 5.5 at high effort, run by hand and committed to `cases/`. There's no runtime generation, cron job or pool.
- The Worker doesn't use the Anthropic API at all. `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `@anthropic-ai/sdk` and `/api/guest-texts` all go away.
- The Wi-Fi log stays, as the source of hard evidence.
- There's no offline play. The built-in fallback lines and the 503 path go away.
- Night moves are fixed when the case is generated, one each on nights 1 and 2. The theft happens on night 0.

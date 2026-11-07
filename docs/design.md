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

A case is one JSON document, validated with an Effect Schema. It lives only in the Durable Object. Sketch:

```ts
Case {
  id
  setting: { title, premise, missingItem }           // "Margot's grandmother's silver brooch"
  guests: Guest[]                                    // 6
  thief: GuestId
  timeline: Event[]                                  // what really happened, minute by minute
  facts: Fact[]                                      // every checkable statement in the case
  dictionaries: Record<GuestId, TopicEntry[]>        // DM replies (section 5)
  groupBeats: GroupBeat[]                            // group chat lines (section 6)
  nightMoves: NightMove[]                            // what the thief can do each night (section 7)
  contradictions: Contradiction[]                    // the ways the case can be proved (section 8)
  wifiLog: Record<1|2|3, WifiEntry[]>                // published each morning (section 2)
}

WifiEntry { id, time, guest, event: 'joined' | 'left', accessPoint, factIds }

Fact {
  id
  text                       // "Dale's phone was online at 11:40pm"
  isTrue: boolean            // a lie is a Fact with isTrue = false
  about: GuestId[]
  concernsTheft: boolean     // true = it bears on the theft timeline
  destroyableOnNight?: 1 | 2 | 3
}

Guest {
  id, name, role             // "Dale, Margot's brother-in-law"
  traits: Trait[]            // drives tone and patience (section 4)
  patience: { perDay, costs }
  bedtime                    // "10:30pm"
  knows: FactId[]            // what they can truthfully say
  claims: FactId[]           // what they'll say even if it's false: alibis, cover stories
  secret?: FactId            // innocents' unrelated secret (affair, debt, smoking)
}
```

Rules:

- **Guests know only their own facts.** No guest's data holds the full timeline.
- **The thief has a cover story.** It's a set of false `claims`, with at least one flaw a true fact can expose.
- **Innocents can lie too, about their secret.** Their lies have `concernsTheft: false`. So "find the liar" isn't enough; you have to find the person lying about the theft.

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

Clef-flash gets the guest, the last few turns, and the list of topic IDs available to that guest. It returns:

- `topic`: one of the guest's topic IDs, `smalltalk`, or `unknown`
- `tone`: normal, rude, repeated or accusatory, which sets the patience cost
- `isInjection`: whether the message tries to break the game ("ignore your instructions…")

Including the last few turns lets it handle follow-ups like "what about after that?"

### Tier 1: dictionary hit (most messages)

```ts
TopicEntry {
  topic                       // "whereabouts-night-1", "the-display-case", "relationship-with-margot"
  variants: Reply[]           // 2-3, so a repeated question gets a different wording
  byState?: {                 // optional overrides
    lowPatience?: Reply[]
    afterNight?: Record<1|2|3, Reply[]>
    ifFactDestroyed?: Reply[]
  }
}

Reply { text, factIds: FactId[] }
```

Every reply carries its fact IDs from generation time. The Durable Object always knows exactly what a message revealed, with no model involved.

Each guest gets roughly 15–25 topics. They cover:

- where they were and when
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
  trigger: { kind: 'morning', day } | { kind: 'nightEvent', moveId } | { kind: 'idle', day }
  lines: { guest, text, factIds }[]
}
```

- **Morning and night-event beats** play from the script, with typing indicators and reading-speed pacing as today.
- **Idle chatter** plays occasionally while you're in other threads, so the group chat feels alive.
- **When you post in the group chat**, Clef picks zero to two guests who would plausibly answer, from their traits and mood. Then each one goes through the section 5 engine using that guest's **public** topic list.

Guests are guarded in public. Each topic entry is flagged `public` or `dmOnly`, and the group chat never serves a `dmOnly` topic.

We could also have guests repeat what you DMed them. That would make DMs a social risk: "the detective was asking me about Dale…". It would be a group beat triggered when you ask a gossip-trait guest about another guest. It's optional, and not in v1.

## 7. Thief night moves

Each night the thief makes one move, chosen at generation time (so the checker can verify it) or picked by the Durable Object from a pre-validated set:

- **Destroy.** One fact becomes unavailable. Replies that would reveal it switch to their `ifFactDestroyed` variant. If you already saved a message containing that fact, the evidence stays good. Asking early pays off.
- **Plant.** A false fact pointing at an innocent appears, such as "Priya's coat pocket had a velvet pouch". There's always a true fact that disproves it.
- **Coach.** The thief gets another guest to back up their alibi. That guest's dictionary gains a false claim. The coached guest has a tell: a reply under pressure in which they admit "Dale asked me to say that".

Each move is announced vaguely in the morning beat ("someone was in the kitchen at 2am"), so you know something happened without knowing what.

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

| Arrested | Evidence | Ending |
| --- | --- | --- |
| The thief | A contradiction about the theft | **Case closed.** Full reveal of the timeline. |
| The thief | A contradiction about something else, or none | **They walk.** Right person, the case doesn't hold. |
| An innocent | Anything | **Wrong person.** The thief leaves Monday with the item. |

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

1. **Schema valid.** Every ID referenced exists.
2. **Thief is provable.** At least one contradiction with `concernsTheft: true` stays reachable after every possible night move. Its claim and proof both appear in some reply, and not only in `dmOnly` replies from a guest whose bedtime makes them unreachable.
3. **No false proof against innocents.** Every planted or coached fact is disproved by a reachable true fact.
4. **No leaks.** No reply from a non-thief reveals a fact that guest doesn't know, and no reply states the thief's identity.
5. **Traits aren't a tell.** The thief's traits aren't unique among the guests, and their patience is within the normal range.
6. **Coverage.** Every guest has a minimum set of topics: whereabouts each night, the item, and each other guest.

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
  - calls Workers AI: Clef-flash for routing, a cheap model for small talk
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

- `SendMessage { thread, text }`
- `SaveToCaseFile { messageId }`
- `RemoveFromCaseFile { messageId }`
- `EndDay`
- `MakeArrest { suspect, claimMessageId, proofMessageId }`
- `Resume`

Server to client:

- `Snapshot { threads, caseFile, day, phase, guestStatus }`, sent on connect or resume.
- `Typing { thread, guest }`
- `MessagePosted { thread, message }`
- `GuestStatusChanged { guest, status }`, where status is `available`, `annoyed`, `left you on read` or `asleep`.
- `PhaseChanged { day, phase }`
- `ArrestResult { ending, timeline }`

Messages to the client carry text and IDs only, never fact IDs or truth values.

### Identity

There are no accounts. The case ID is kept in `localStorage`, and refreshing resumes the case by reconnecting to the same Durable Object. Losing the ID means losing the case, and that's acceptable.

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

1. **Clef routing spike.** A throwaway script with one hand-written guest dictionary (about 20 topics). Write 100 or so test messages, including odd phrasings, follow-ups and jailbreak attempts, and measure how often Clef-flash picks the right topic. **This decides whether the dictionary approach works**, so do it first.
2. **Schemas and checker.** Case schema, wire protocol and solvability checker in `shared/`, with tests that use a hand-written case.
3. **Server foundation.** Effect in the Worker, the `CaseObject` Durable Object, the WebSocket protocol, and AI services with fakes. Play the hand-written case end to end without the client.
4. **Client rewrite.** Conversation list, threads, long-press save, case file and arrest, all against the hand-written case.
5. **Case generation.** Write the local skill, add `pnpm cases:check`, and generate the first batch of cases into `cases/`.
6. **Make the guests feel alive.** Group chat director, idle chatter, night moves, patience tuning, endings and the timeline reveal.

## 13. Open questions

- **Small-talk model.** Which cheap Workers AI model sounds most natural in character? We'll pick one during the spike.
- **Clef's interface.** Can Clef-flash reliably choose among roughly 25 labels in one call, or do we need two steps (category, then topic)? The spike answers this.
- **Early arrest.** Is there any bonus for arresting before day 3 ends, or is the only benefit finishing sooner?
- **Gossip leaks.** Do guests repeat your DMs to the group chat in v1 or later?

## Decided

- Cases are generated by a local Claude Code skill on Opus 5.5 at high effort, run by hand and committed to `cases/`. There's no runtime generation, cron job or pool.
- The Worker doesn't use the Anthropic API at all. `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `@anthropic-ai/sdk` and `/api/guest-texts` all go away.
- The Wi-Fi log stays, as the source of hard evidence.
- There's no offline play. The built-in fallback lines and the 503 path go away.

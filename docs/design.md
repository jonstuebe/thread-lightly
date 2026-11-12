# Thread Lightly: design

Status: decided 2026-11-12, replacing the free-typing design. The research behind it is in [`docs/research/la-noire-interrogation.md`](./research/la-noire-interrogation.md). The schema and the checker are built (`shared/`); the engine and the client are being rewritten to match.

## 1. Overview

Thread Lightly is a cozy, murder-free mystery played over text messages. Something has gone missing. You're the detective:

- You DM the guests by tapping questions from a menu. There's no free typing.
- Clues you see unlock new questions.
- You press a guest on a reply, or show proof that it's a lie.
- You save messages and Wi-Fi log entries to a case file.
- By the end of day 3 you arrest one guest, on a lie you caught.

**Goals:**

- **Skill over luck.** You win by reading closely, catching a lie and proving it, not by guessing.
- **Every line is written in advance.** No model calls at runtime. Each reply is authored in the case and fixed.
- **No cheating.** The answer never reaches the browser.
- **Solvable every time.** The game is deterministic, so a checker searches it before anyone plays a case.

**What we took from L.A. Noire:** a question list per person that grows as you find clues, accusing a lie only with proof, and wrong calls that cost you without ending the game. **What we left out:** tone labels (every option is the detective's exact text), reading faces, closing a line of questioning because you believed someone, and intuition points.

## 2. The day

A case lasts **three days**. The theft happens on night 0, before day 1. Each day has three **parts**: morning, afternoon and evening.

### Ticks

- **Each part has a budget of ticks,** set per case. The starting point is morning 5, afternoon 5, evening 4: 14 a day, 42 a case.
- **The header shows the part and its ticks** (Day 1 · Morning ●●●○).
- **What costs ticks:**

| Action                                             | Ticks |
| -------------------------------------------------- | ----- |
| Ask a question (DM or group)                       | 1     |
| Press a reply                                      | 1     |
| Show proof, right                                  | 1     |
| Show proof, wrong                                  | 2     |
| Read, save, open the Wi-Fi log, open the case file | 0     |

- **Ticks never carry over.** When a part runs out, the next part starts and a short group beat may mark it ("lunch is out ☀️").
- **An action may overspend.** Wrong proof with one tick left takes that tick and ends the part.

### Who's around

- **Each guest has an authored away schedule:** the parts of each day they're out, each with a status line ("out kayaking 🛶"). An early sleeper is away in the evening.
- **A guest who's away** shows their status line, their menu greys out, and they don't reply in the group chat.
- **The schedule can be part of the mystery.** "Bea was 'out on the lake' all afternoon", but the Wi-Fi log says otherwise.
- **A guest who's quiet** (after wrong proof, section 4) is out of reach until the next part.

### Skipping and sleeping

- **Skip to the next part, or go to sleep, any time.** Leftover ticks are lost. There's no reward for hurrying; it's the player's choice, and the game never forces it.
- **Beats belong to parts.** A part you skip still plays its beat. A part you sleep through doesn't, so only morning beats are certain to be seen.
- **When evening runs out,** everyone goes to bed: "Everyone's gone to bed 🌙". The menus are replaced by one **Go to sleep** button. Each guest's goodnight line posts.
- **Night:** the thief makes their move (section 6), and the Wi-Fi log records the night. Then the morning beat posts.
- **After day 3's evening,** or whenever you choose, you make the arrest.

### The Wi-Fi log

The house Wi-Fi log is the one source of hard evidence. It's a pinned thread, styled like a router admin page, showing when each guest's phone joined or left the network and which access point it used.

- **Each morning it shows the previous night's entries.** Every entry is true.
- **Entries can be saved and used as proof.**
- **The thief can't edit the log,** but an entry can be ambiguous on its own: a phone left in a room, or two phones on one access point.

## 3. The question menu

Each DM thread has a row of question chips instead of a composer, like iMessage's suggested replies. Tap one and the detective sends that exact text. The guest replies with one to three bubbles, paced with typing indicators.

```
┌─ Theo Marsh ─────────────────── Day 1 · Morning ●●●○ ─┐
│  you: Where were you last night after dinner?       │
│  Theo: on the porch till like 11, then bed          │
│  Theo: Bea was still up when I went in tho          │
├─────────────────────────────────────────────────────┤
│ [What was Bea doing up?] •new                       │
│ [Did you see the ribbon at dinner?]                 │
│ [What do you make of June?]                         │
└─────────────────────────────────────────────────────┘
```

- **A question is gone once it's asked.** Its reply stays in the thread, where you can save it.
- **Every question gets a reply in character.** A dodge is authored too, and carries no facts.
- **The answer depends only on the day you ask.** A question can have a different answer after a night move (`afterNight`), and a different one if the thief destroyed a fact it would mention (`ifDestroyed`). Nothing else changes it: not the order you asked things in, and not who you are talking to next.
- **The menu keeps the case's authored order.** A chip that just unlocked stays in its authored place, marked _new_; it isn't moved to the top, so the menu never points the detective at the next step.
- **A question can have a window.** It appears from day `from` and, if it has an `until`, leaves after that day. "Where were you last night?" is a separate question each day.

### How questions unlock

A question reaches the menu when all its unlocks hold:

| Unlock                     | Holds when                                                                                                   | Example                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Seen** a fact            | A message carrying it was posted where you can read it: any reply, Wi-Fi entry or beat. Saving isn't needed. | Theo says Bea was up late → "What was Bea doing up?"               |
| **Caught** a contradiction | You caught that lie (section 4)                                                                              | Bea admits she went outside → "What were you doing in the garden?" |
| **Asked** a question       | You asked it                                                                                                 | A follow-up chain                                                  |
| **After night** N          | Night N has passed                                                                                           | A coached guest's new story                                        |

Unlocks only ever add questions. The only things that take options away are the window on a question, away schedules and night moves, and the case fixes all three.

## 4. Pressing and showing proof

Long-press a guest's reply to a question, as you do to save it, and you get two more options besides **Add to case file**. A reply's bubbles act together: pressing or confronting any bubble acts on the whole answer.

### Press ("Are you sure about that?")

- **Costs one tick. One press per answer.** No proof needed.
- **The guest gives the answer's authored `pressed` reply.** Three things can happen:
  - **They stand firm.** True statements and confident liars repeat themselves.
  - **They slip.** A nervous liar adds a detail, which may unlock a question. A slip can also carry a lie, which you can then confront.
  - **They give a tell.** A coached guest admits "ok Bea asked me to say that".

### Show proof ("That's not what this says.")

- **You pick a saved item:** a message or a Wi-Fi entry from the case file.
- **The detective sends a line quoting it.**
- **Right proof** costs one tick. The answer carried a contradiction's claim against this guest, and the item carries its proof. The guest gives the answer's authored **caught** reply, both items get a ✓ _caught_ stamp in the case file, and questions may unlock. The thief's caught reply is a fallback story, not a confession. An innocent's usually gives up their secret ("fine. I smoke. please don't tell Hazel 😭").
- **Wrong proof** costs two ticks, and the guest goes **quiet** until the next part: "Theo isn't answering right now". They reply with a wrong-proof line ("that's literally nothing to do with what I said?"), the answer's own if it has one, else the guest's, rotating. Wrong calls show in the ending tally.
- **An answer can be caught only once.**
- **No confronting in the group chat.** You confront by DM only.

## 5. The group chat

The group chat carries **beats**: authored lines that post at the start of a part. Every day has a morning beat, which announces the night's events vaguely ("someone tidied the garden at dawn").

**Open question: does the group chat get its own question menu?** The options are a small menu of group questions with no confronting, or beats only. The schema supports both: a case's `groupQuestions` may be empty, and the checker works either way. If group questions stay:

- **A group question costs one tick,** like a DM.
- **Guests reply in a fixed order,** skipping any who are away or quiet.
- **Group replies can be saved and used as proof,** but never pressed or confronted. So a group reply may not carry a lie that's in a contradiction, and nobody gives away their secret in the group.

## 6. The thief's night moves

On nights 1 and 2 the thief makes exactly one move, fixed in the case:

```ts
NightMove =
  | Destroy { night, fact }
  | Plant   { night, fact, disprovedBy }
  | Coach   { night, guest, fact, tellFact, disprovedBy }
```

- **Destroy.** A piece of physical evidence goes. From the next morning, any answer that would carry it gives its `ifDestroyed` version. Anything already saved stays good, so asking early pays off. It can't be a Wi-Fi entry.
- **Plant.** A false fact pointing at an innocent turns up after the night. A true fact always disproves it.
- **Coach.** The thief gets another guest to back up their story. The coached guest's new claim is in an answer after the night (a question that unlocks after the night, or an `afterNight` answer). Pressing it gives the tell.

## 7. The case file and the arrest

### The case file

- **Long-press any message or Wi-Fi entry, then Add to case file.**
- **Saved items are grouped by guest,** with ✓ caught stamps on caught lies and their proof.
- **The client stores message IDs only.** The server maps each to the facts it carried.

### The arrest

Open it from the case file at any time. It's forced after day 3's evening.

1. **Pick a suspect.**
2. **Pick one caught lie against them,** or none.

| Arrested    | Caught lie                    | Ending           |
| ----------- | ----------------------------- | ---------------- |
| The thief   | About the theft               | **Case closed**  |
| The thief   | About something else, or none | **They walk**    |
| An innocent | Anything                      | **Wrong person** |

The skill is in the confront. The arrest is a clean final decision: which caught lie is about the theft? The red herring is an innocent whose caught lie _looks_ theft-related.

### The ending

- **The solution:** the thief's lie about the theft and its proof, as fact texts. It's the pair you caught, or else the one you came closest to.
- **The true timeline, night by night,** each event marked _in your case file_, _you saw this_ or _missed_.
- **A tally:** clues found and saved, questions asked, lies caught, wrong proofs.

## 8. The case schema

A case is one JSON file in `cases/`, decoded with the Effect Schema in `shared/case.ts` (the source of truth; this is a summary). Only the Worker and local tooling read it.

```ts
Case {
  id, setting: { title, premise, missingItem, accessPoints }
  budget: { morning, afternoon, evening }     // ticks per part, every day
  guests: Guest[]                             // 4–5
  thief, theftFact                            // the theft fact appears only in the timeline
  timeline: TimelineEvent[]                   // the truth, revealed at the end
  facts: Fact[]                               // { id, text, isTrue, about, concernsTheft }
  beats: Beat[]                               // { day, part, lines: GroupLine[] }
  groupQuestions: GroupQuestion[]             // may be empty (section 5)
  nightMoves: NightMove[]                     // one per night, nights 1 and 2
  contradictions: Contradiction[]             // { id, suspect, claimFact, proofFact, concernsTheft }
  wifiLog: WifiEntry[]                        // { id, night, time, guest, event, accessPoint, factIds }
}

Guest {
  id, name, role
  voice                                       // for the case writer; temperament is voice only
  knows, claims, secret?                      // what they may say: true facts, lies, a secret
  away: { day, part, status }[]               // "out kayaking 🛶"
  goodnight: string
  wrongProof: string[][]                      // replies to wrong proof, rotated; no facts
  questions: Question[]                       // ~25–35 across three days
}

Question {
  id, ask                                     // ask is the detective's exact text
  from: Day, until?: Day                      // the window it can appear in
  unlock: Unlock[]                            // all must hold
  answer: Answer
  afterNight?: { night, answer }[]            // the latest past night wins
  ifDestroyed?: Answer                        // when the answer would carry a destroyed fact
}

GroupQuestion { id, ask, from, until?, unlock, replies: GroupLine[] }

Unlock = Seen { fact } | Caught { contradiction } | Asked { question } | AfterNight { night }

Answer {
  lines: Line[]                               // 1–3 bubbles; Line = { text, factIds }
  pressed: Line[]                             // "Are you sure about that?"
  caught?: Line[]                             // exactly when the answer carries a claim
  wrongProof?: string[]                       // overrides the guest's own
}
```

**Writing a case:** a cast of four or five, about 25–35 questions each across the three days. Every guest has a lie to catch: the thief their cover story, each innocent a secret or a small lie of their own.

## 9. The checker

The checker is pure Effect code in `shared/checker.ts`, using the same rules the engine plays by (`shared/rules.ts`). It returns problems marked **error** or **warning**. A case with any error is rejected; warnings are tuning advice. `bun run cases:check` prints both.

**Errors:**

1. **Schema and references.** The JSON decodes. Every fact, guest, question, contradiction and access point referenced exists, and no ID is defined twice. Question IDs are unique across the whole case.
2. **Answers are well formed.** An answer whose lines or pressed lines carry a contradiction's claim against that guest has a `caught` reply, and no other answer has one. An answer carries at most one such claim, since it can be caught only once. Group replies and beats carry no contradiction claims. Beat speakers aren't away. `until` isn't before `from`, and every `afterNight` can actually be given. Every day has a morning beat.
3. **Every question can be asked, and every contradiction caught.** With an unlimited budget from day 1, each question's unlocks can all hold on a day inside its window when its guest is around, and each contradiction can be caught.
4. **Winnable from a fresh day 3.** From the morning of day 3, with nothing asked or caught but the Wi-Fi log and morning beats already published, a breadth-first search finds a path that catches a theft contradiction against the thief within day 3's budget. It respects the away schedules and comes after both night moves. A player who wasted days 1 and 2 can still win, and nothing earlier can make that harder, because unlocks only add.
5. **Contradictions are sound.** Each claim is false and one of the suspect's claims, each proof is true, `concernsTheft` matches the claim fact, and the suspect says the claim in a DM answer.
6. **Night moves are sound.** One per night. A destroyed fact is true, not in the Wi-Fi log, findable before its night, and gone afterwards: every answer that would carry it has an `ifDestroyed` without it, and no later beat or group reply carries it. A planted fact is false, concerns the theft, points at an innocent, and appears only after its night. A coached claim belongs to the coached guest (never the thief), appears only after its night in a DM answer, and pressing it gives a true tell.
7. **No false proof against innocents.** Every planted or coached fact is disproved by a true fact that can be found from a fresh day 3.
8. **No leaks.** Every fact a guest says is in their `knows` or `claims` (beats may also carry planted facts). `knows` holds only true facts. A secret is in `knows`, doesn't concern the theft, isn't the thief's, and isn't said in the group chat. The theft fact appears only in the timeline.
9. **No tells in the menu's shape.** Every guest has a contradiction against them. The thief's question count and away count sit within the innocents' range.

**Warnings:**

- **Too few questions.** The questions on offer are fewer than twice the case's whole budget, so the player barely has to choose.
- **Too easy.** The shortest win from a fresh day 1 fits in one part's budget.

**How the search works.** Every action on a winning path costs one tick, since wrong proof never helps. The checker first works backwards from the goal to the actions that could help (the questions whose answers carry the needed claims, proofs and unlock facts, the presses whose replies carry them, and the catches whose replies do), then searches breadth-first over those, part by part. Skipping a part is free. It gives up past 200,000 states and reports an error.

**Determinism** needs no check of its own: there's no variant rotation, and an answer depends only on the day it's asked.

## 10. Case generation

Cases are written **offline, never by the Worker**, by the local `generate-case` Claude Code skill (`.agents/skills/generate-case`). It writes a case as JSON, runs `bun run cases:check` until there are no errors, and saves it to `cases/<id>.json`, which gets committed. The current five free-typing cases were deleted; new ones need writing for this format. `shared/fixtures/tiny-case.json` is a test fixture, not a playable case.

The prompt may borrow tropes from classic mysteries (the alibi with a gap, the too-obvious suspect, the innocent with a secret), never plots, characters or details from specific books.

## 11. Architecture

```
Browser (Foldkit + Effect)
  │  WebSocket, Effect Schema messages
  ▼
Worker (Effect)  ── /api/case/new    → picks a case from the bundled library, creates a Durable Object
  │               ── /api/case/:id/ws → upgrades to the case's Durable Object
  ▼
CaseObject (Durable Object, Effect)
  - holds the Case and the game state (clock, asked, pressed, caught, quiet guests, transcript, case file)
  - plays by shared/rules.ts; no AI binding, no model calls
  - stores everything in Durable Object storage; uses WebSocket hibernation
```

- **`shared/` depends only on `effect`.** It holds the case schema, the game rules, the checker and the wire protocol.
- **The client imports `shared/protocol.ts` only,** never the case schema or its rules.

### Wire protocol

Tagged unions in `shared/protocol.ts`. Threads are `Group`, `Direct(guest)` and `WifiLog`. Every chat message, Wi-Fi entries included, has a message ID, so any of them can be saved.

**Client to server:**

- `AskQuestion { thread, chipId }`
- `Press { messageId }`: any bubble of an answer.
- `ShowProof { messageId, proofMessageId }`: the proof must be in the case file.
- `SaveToCaseFile { messageId }`, `RemoveFromCaseFile { messageId }`
- `SkipPart`, `GoToSleep`
- `Arrest { suspect, lie? }`: `lie` is the claim message of a caught lie against the suspect.
- `Resume`

**Server to client:**

- `Snapshot { intro, guests, messages, menus, caseFile, pressed, caught, clock, result? }`, on connect or resume.
- `Typing { thread, guest }`, `MessagePosted { message }`
- `MenuChanged { menu }`: a thread's chips, each `{ id, text, isNew }`. Chip IDs are opaque, never the case's question slugs.
- `AnswerPressed { answerId }`, `LieCaught { lie: { guest, claimMessageId, proofMessageId } }`
- `GuestStatusChanged { guest, status }`: `Around`, `Away { status }`, `Quiet` or `Asleep`.
- `ClockChanged { clock: { day, part, phase, ticksLeft, partBudget } }`, where phase is `asking`, `bedtime` or `arrest`.
- `CaseFileChanged { caseFile }`
- `ArrestResult { result: { ending, thief, solution?, timeline, tally } }`
- `Rejected { reason }`: away, quiet, asleep, an unknown question, not an answer, already pressed, already caught, not in the case file, not caught, not now, too fast, an unknown message, invalid.

A message has a `role`: `Answer { answerId }` for a guest's reply to a DM question, which can be pressed and confronted, or `Plain` for everything else. **Nothing sent to the client carries fact IDs, truth values, contradictions, the case's question IDs or the thief.**

### Identity

No accounts. The game ID is kept in `localStorage`, and a reload reconnects to the same Durable Object. Losing it means losing the game.

## 12. Client UX

- **iPhone:** conversation list → thread, like Messages. **iPad and desktop:** the list in a sidebar, the thread beside it.
- **Conversation list rows:** avatar, name, last message, unread dot, and a status for guests who are away or quiet.
- **A DM thread** has question chips where the composer was, greyed out with the status line when the guest is away or quiet.
- **Long-press a reply:** Add to case file, Press, Show proof. Long-press anything else: Add to case file.
- **The header** shows the day, the part and its ticks, with Skip and Go to sleep.
- **The case file** is a sheet of saved items grouped by guest, with caught stamps. The arrest opens from it: pick a suspect, then a caught lie.

## 13. Build plan

All on the `choice-redesign` branch.

1. ~~**Schema, rules, protocol and checker.**~~ Done. `shared/case.ts`, `shared/rules.ts`, `shared/protocol.ts`, `shared/checker.ts`, tested against `shared/fixtures/tiny-case.json`. The old cases, `shared/replies.ts`, the Workers AI services and the AI binding are gone.
2. **Engine.** Rewrite `worker/game/` fresh on `shared/rules.ts`, and `worker/case-object.ts` around it.
3. **Client.** The question menu, press and proof, the clock header, away and quiet statuses, caught stamps and the new arrest.
4. **Cases.** Update the `generate-case` skill for this schema, then write a first batch.

## 14. Open questions

- **The group chat:** a small menu of group questions with no confronting, or beats only? (Section 5.)
- **Budgets:** the default is 5/5/4 (raised from 4/4/3 after the first playtest). Keep tuning; the target is that a careful player can ask roughly half of what's on offer.

## Decided

- **Questions from a menu,** no free typing. A question is gone once asked.
- **No Workers AI and no Anthropic API at runtime.** Every line is authored. Temperament is voice only; patience is gone.
- **Time:** three parts a day with a tick budget per part, set per case, plus authored away schedules. Skipping ahead and sleeping early are always allowed, with no reward.
- **Costs:** a question, a press and right proof cost one tick each. Wrong proof costs two, and the guest goes quiet until the next part.
- **Unlocks** on a fact being seen, on a caught lie, on an asked question, or after a night.
- **Press** is a long-press action on a reply, once per answer.
- **Arrest** on a suspect plus one caught lie against them.
- **No hints** or intuition points.
- **Cast:** four or five guests, about 25–35 questions each.
- **The Wi-Fi log stays.** Night moves stay fixed in the case, one each on nights 1 and 2.
- **Cases are written by a local Claude Code skill** and committed. The five free-typing cases were deleted.
- **The engine is rewritten fresh,** not reshaped.

---
name: generate-case
description: Write a new Thread Lightly mystery into cases/, checked solvable by bun run cases:check.
disable-model-invocation: true
model: claude-opus-5-5
effort: high
argument-hint: '[optional setting, premise, item or twist to build around]'
---

# Generate a case

You are writing one cozy, murder-free mystery for Thread Lightly. Four or five guests share one roof for a long weekend; something precious goes missing on Friday night (night 0); the detective texts them over three days (Saturday, Sunday, Monday) by tapping authored questions, presses replies, shows saved proof, and arrests one guest on a caught lie. Every reply is written by you, in advance. The finished case is one JSON file, `cases/<id>.json`, that `bun run cases:check` passes with **no errors**, and ideally no warnings.

The checker proves the case solvable. You make it fair, fun and in voice.

## Read first

- `docs/design.md` sections 2–9: time and ticks, the menu and unlocks, press and proof, the group chat, night moves, the arrest, the schema and every checker rule. These are the rules the case plays by.
- `GLOSSARY.md`: the words (claim, secret, contradiction, beat, tell).
- `shared/case.ts`: the schema, the source of truth for every field.
- `shared/fixtures/tiny-case.json`: the JSON shape in miniature. It is a test fixture, not a model for tone or size.
- `ls cases/` and each case's `setting` and guest names. Your case differs from every one there in place, item, thief's method and twist, and reuses none of their first names. Also avoid the retired settings: a lodge, a sleeper train, a regatta, a recipe tin, a photo darkroom.

## Steps

### 1. Plot on paper

Write a plot note in your scratchpad before any JSON. It holds:

- **Setting:** `title`, a two-sentence `premise` (the host, the occasion, the item and where it vanished from), `missingItem`, and 3–4 `accessPoints` (rooms or outbuildings a phone moves between). The host can sit outside the cast; only guests can be texted.
- **Cast of 4–5 guests.** For each: name, age, relation to the host, and a `voice` that says how they type (case, punctuation, sentence length, pet words) and names their emoji outright, matched to age per `docs/research/genz-emoji.md`: a guest under 30 types lowercase and uses 😭 or 🙏, sparingly; a millennial may use ✨ or "haha"; an older guest uses 👍, one literal emoji, or none. Never 😂 for a young guest. Temperament is voice only.
- **The true timeline,** nights 0–2, minute by minute where it matters: the theft on night 0, the thief's two night moves, and what each innocent was really doing (innocents up and about for their own reasons are what make the log a puzzle).
- **The thief's cover story:** 2–4 theft lies (`concernsTheft: true`), each broken by a true fact someone else holds or the Wi-Fi log shows. Each caught reply is a fallback story, never a confession; a fallback can carry the next lie, confronted in a follow-up question that unlocks on the catch. Optionally one non-theft lie (a hidden motive or past), whose catch alone ends in "They walk".
- **One pressable lie per innocent:** their secret. A true, non-theft fact they hide behind a false claim in a DM answer; the caught reply gives the secret up in voice ("please don't tell Odette 😭").
- **The red herring:** one innocent whose caught lie _looks_ theft-related (they were in the room with the item that night) but is about their secret. Their catch should be the easiest in the case, so a hasty detective arrests them.
- **Night moves:** exactly one on night 1 and one on night 2. **Destroy** physical evidence that is _present_ (a battery in the frost, mud on a step), findable on day 1, so the next day it is honestly gone. **Plant** a false theft fact pointing at an innocent, posted in a later beat, with a true `disprovedBy` findable from a fresh day 3 (a Wi-Fi entry is ideal). **Coach** another guest into a false claim that appears only after the night; pressing it gives a true tell. Tie the moves to the plot: a destroyed battery explains why the thief's headlamp is dead, and why on night 2 they use their phone as a torch and land in the Wi-Fi log.
- **The Wi-Fi log:** entries for everyone's movements on all three nights, each tagged with the fact it proves. The thief's night-0 phone can stay put (left charging), so the log alone never names them.
- **The solve:** the shortest day-1 path and the shortest fresh-day-3 path, written as question → claim → proof.

Done when every claim, secret and night move names its proof, and both solve paths reach a theft contradiction using only facts that are still findable on their day.

### 2. Write the JSON with a builder

Around 120 questions is too much JSON to hand-type safely. Write a small builder script in the scratchpad (`build-<id>.mjs`) with helpers for lines, answers, questions and unlocks, and have it write the JSON. Write it in passes: facts, then one guest at a time, then beats, group questions, night moves, contradictions, timeline and Wi-Fi log.

**Facts.** Every checkable statement is one fact with `isTrue`, `about` and `concernsTheft`. True facts a guest may say go in their `knows`; their lies go in `claims`; a secret is also in `knows`. List these by hand: the checker's leak check is only useful when the lists are written from the plot, not derived from the answers. `concernsTheft` is true for anything bearing on who took the item or the thief's cover story, false for secrets and innocents' private errands. The `theftFact` appears only in the timeline.

**Lines carry exactly the facts their text states.** A time, a place, a person seen: tag it. Harmless flavour nobody disputes stays fact-free.

**Each guest gets 25–35 questions across three days:**

- **Day-1 core,** open from day 1: where they were after the evening broke up, when they last saw the item, whether they saw or heard anything that night, who they think took it, what they make of each other guest, how they know the host, their room, the evening's event, "Anything odd this morning?" (`until: 1`), and the question that draws out their lie.
- **Per-day questions** with windows: "Where were you on Saturday night?" (`from: 2, until: 2`, `AfterNight 1`), "Anything odd this morning?" for days 2 and 3, what they did yesterday, the day's occasion. Name the night in the question ("on Sunday night"), never "last night", since a question can stay open past its first day.
- **Follow-ups** that unlock on `Seen` (a clue someone else said), `Caught` (a follow-up to their own caught lie), or `Asked`. These are the chains the detective climbs.
- **Day-3 reactions** to the plant or coaching, unlocked on `Seen` of the planted fact.

**Answers.** One to three bubbles. Every answer has a `pressed` reply: liars and truth-tellers stand firm by repeating their facts; a nervous liar may slip a detail; a coached guest gives the tell. `caught` exists exactly when the lines or pressed lines carry a contradiction's claim against that guest, and an answer carries at most one such claim. Write the secret's confession and any new clue into `caught`. A claim said only inside a `caught` reply can't be confronted there, so repeat it in a follow-up question's lines.

**Away schedules:** 2–3 slots per guest with a status line in voice ("asleep 😴", "loading the car"). Keep the thief's count of away slots and of questions inside the innocents' range, or the menu's shape gives them away.

**Beats:** a morning beat every day (day 1 announces the theft; day 2 hints vaguely at the night move; day 3 can carry the plant), plus a few fact-free afternoon and evening beats. Speakers must be around in that part.

**Budget:** `{ morning: 5, afternoon: 5, evening: 4 }` (14 ticks a day) unless the plot needs otherwise.

**Menu order is the order you write the questions in.** New chips are marked _new_ but stay where you put them, so order each guest's questions as a natural conversation, and never put a solve step first just because it unlocks late.

**Group questions:** include 1–2 per day. Replies run in the guests' order, carry no contradiction claims and no secrets, and are best kept fact-free.

**`goodnight`** and 2–3 **`wrongProof`** replies per guest, fact-free and in voice ("that's literally not what i said??").

Done when the builder writes `<scratch>/<id>.json`, where `<id>` is a short slug of the title and matches the file name.

### 3. Check until clean

```bash
bun <scratch>/build-<id>.mjs <scratch>/<id>.json && bun run cases:check <scratch>/<id>.json
```

Each problem names its check and the fact, guest or question at fault. Fix the plot, not the checker's view of it: if a proof isn't findable on day 3, give someone a day-3 answer that carries it rather than deleting the contradiction. Common fixes:

- **`menuShape`:** add or cut a fact-free question so the thief's count sits within the innocents' range.
- **`winnable`:** a proof or unlock needed on day 3 is only said on days 1–2, or its guest is away all day 3.
- **`noLeaks`:** a guest says a fact missing from their `knows`/`claims`; decide whether they should know it.
- **`tuning`, too easy:** the shortest day-1 win fits in one part. Lengthen the chain: put the theft claim behind a `Seen` unlock whose fact comes from another guest.

Then print the shortest wins and read them: a fresh day-3 win of one or two actions is a gift, so gate the day-3 lie behind a clue too. Put this in the scratchpad and run it with the absolute repo path:

```ts
import { readFileSync } from 'node:fs'
import { searchDay } from '<repo>/shared/checker'
const caseData = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const day of [1, 2, 3] as const) console.log(day, searchDay(caseData, day))
```

Done when the file prints `✓` with no warnings, or the warnings left are ones you'd defend to the person.

### 4. Play it in your head

Read the case as a detective would, day by day, and fix anything that fails:

- **Fair:** each step of the theft chain is a question a curious detective would tap, and the menu hints at it.
- **Not a trail:** the chain isn't a straight line of one new chip per guest. The proof that breaks the thief's first lie should need a clue the detective digs for (a Wi-Fi entry, or a detail from a question that isn't obviously about the theft), not unlock just because the lie was told.
- **Not a tell:** the thief isn't the only liar, the only one up at night, or the only one in the log at the theft hour. On day 1 at least one innocent looks worse than the thief. The thief's replies are no shorter or shiftier than an innocent's.
- **Deterministic:** each answer reads right whatever was asked before it and whoever was asked next.
- **In voice:** text messages, not prose. Each guest sounds like themselves and nobody else.
- **Cozy:** small stakes, warm people, no violence. The thief has a sympathetic motive.
- **Original:** classic tropes are welcome (the alibi with a gap, the too-obvious suspect, the innocent with a secret); plots, characters and details from specific books, films or games are not.

Rebuild and rerun the check after every fix.

### 5. Save it

Write the case to `cases/<id>.json` with the builder, format it with `bunx oxfmt cases/<id>.json` (`bun run format` rewrites unrelated files), then run `bun run cases:check` with no arguments, which checks every case and catches a duplicate ID. It must pass.

Report the premise, the thief, the red herring, the two night moves, the day-1 and day-3 solve paths, and any warnings left. Leave committing to the person.

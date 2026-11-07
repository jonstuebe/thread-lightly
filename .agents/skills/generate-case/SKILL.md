---
name: generate-case
description: Write a new Pine Hollow mystery into cases/, checked solvable by bun run cases:check.
disable-model-invocation: true
model: claude-opus-5-5
effort: high
argument-hint: '[optional premise, item or twist to build around]'
---

# Generate a case

You are writing one cozy, murder-free mystery for Pine Hollow: a host and their guests spend a long weekend at the Pine Hollow lodge, something precious goes missing on Friday night, and the player, a detective texting everyone, must catch the thief by Monday. The finished case is one JSON file in `cases/` that passes `bun run cases:check`.

Night 0 is Friday (the theft), night 1 Saturday, night 2 Sunday. Day 1 is Saturday, day 3 Monday. The Wi-Fi log for night N is published on the morning of day N+1.

## Read first

- `docs/design.md` sections 3–9: the case model, guests, conversation engine, group chat, night moves and arrest. They are the rules this case must play by.
- `shared/case.ts`: the schema, the source of truth for every field.
- `cases/silver-brooch.json`: a complete, passing case. Match its shape and tone; borrow nothing else from it.
- `ls cases/`, each case's `setting` and its guests' names: your case must differ from every one already there in item, host, thief's method and twist, and reuse none of their first names.

## Steps

### 1. Plot on paper

Write a plot note in the scratchpad before any JSON. It holds:

- **Setting:** title, premise (two sentences, naming the host and how many guests), the missing item, and 3–4 Wi-Fi access points (rooms or outbuildings of the lodge).
- **Background:** what every guest knows and nobody disputes: the lodge's rooms and how they connect, the weekend's schedule up to the theft (arrivals, dinner, the moment everyone last saw the item together), who is staying in which room, and what the item looks like. Players ask these things constantly ("which room is the case in?", "when was the toast?"), and any guest may answer from it in their own words. So it must hold nothing a player could use as evidence: no one's movements after the group broke up, no times that a claim or proof depends on, and nothing a liar would deny.
- **Cast of six:** the host plus five guests. For each: name, relationship to the host, temperament (from the six in `shared/case.ts`; it also sets their patience, per `worker/game/patience.ts`), voice (how they type: case, punctuation, emoji, sentence length), bedtime. Name a voice's emoji outright and match them to the guest's age, per `docs/research/genz-emoji.md`: a young guest gets one kind per text and not often (😭 for funny, never 😂), and an older guest gets one literal emoji that fits them (⚓, 🦉) or none at all. Never write "the odd emoji" or a mixed string like ✨🎶. Give the thief the temperament the existing cases' thieves use least, shared with at least one innocent.
- **The true timeline,** nights 0–2, minute by minute where it matters. The theft on night 0, the thief's move on nights 1 and 2, and what innocents were doing, including the ones who were up and about for their own reasons.
- **The thief's cover story:** 3–5 false claims, each one breakable by a true fact someone else holds or the Wi-Fi log shows. At least one break must survive both night moves and be findable on day 3. A lie that hides the thief's movements, the item, or the motive that made them take it concerns the theft. The thief may also tell a lie unrelated to the theft (`concernsTheft: false`): catching only that one ends in "They walk".
- **Secrets** for two or three innocents: a true, non-theft fact they lie about, with their lie and its proof. These are red herrings: they make innocents look guilty without being guilty.
- **Night moves:** one on night 1, one on night 2 (Destroy, Plant or Coach; favor kinds the existing cases use least). Each Plant names the true fact that clears the framed innocent; each Coach names the true fact that disproves the coached claim (its `disprovedBy`). Destroy only evidence that is _present_ (a pouch in a pocket, mud on boots), so the day after, the guest honestly finds it gone; a fact someone remembers can't be destroyed without reading as amnesia.
- **The solve:** the path a careful player takes to the arrest, and the path a slow player takes on day 3.

The step is done when every claim, secret and night move in the note has its proof named, and the solve path reaches a theft contradiction on day 3 using only facts that are still findable that day.

### 2. Write the JSON

Write the case to `<scratch>/<id>.json` (your scratchpad directory, outside `cases/` until it passes), where `<id>` is a short slug of the title (`the-copper-kettle`). The file name must match `id`.

- **Facts first.** Every checkable statement is one fact with `isTrue`, `about` and `concernsTheft`. Lies are false facts in the liar's `claims`; truths go in the `knows` of whoever can say them. `concernsTheft` is true when the fact bears on who took the item or the thief's cover story (including the thief's Wi-Fi entries), and false for secrets and innocents' private errands.
- **Every guest gets 15–25 topics:** whereabouts for nights 0, 1 and 2; the item; each other guest; each night's events; their secret if they have one; their own phone, room or habits where the plot touches them. Also give every guest:
  - **Suspicions:** who they think took it and why, the question players ask most. Innocents point at whoever looks worst to them (a red herring, a grudge, the secret they half-noticed); the thief steers toward someone else. Keep it opinion unless you mean it to carry a fact.
  - **The evening:** what they did between dinner and bed on night 0, and who they talked to.
  - **Saw or heard anything:** one topic per night, separate from their whereabouts, for noises, lights and people glimpsed. Innocents with nothing to report say so in voice.
- **Breadth beats depth.** The engine has a model pick from a guest's replies and reword the best fit to the question, so a reply that half-answers still works but no reply at all is a dodge. Cover the questions a curious player would ask, including small true details that lead nowhere (someone stepped out to call home, the dog barked at midnight): they give the player threads to pull, and as fact-free lines they cost the checker nothing. Topics about a night that hasn't happened answer from `variants` ("ask me tomorrow") and give the real answer in `afterNight`.
- **Topic descriptions are Clef's routing criteria.** Make each one say what sets it apart from the guest's other topics: "Wes, the guest who sleeps on the couch and owes Margot money", never "about Wes". Two topics that a single question could match will misroute; this bites hardest when a guest has both a lie and a later admission about the same place or night, so tell them apart by what the player is asking for.
- **Two or three `variants` per topic,** worded differently but carrying exactly the same `factIds`, so a repeated question gets a fresh line. The engine rotates through them and the first ask always gets the first, so a fact in only some variants would hide behind repeated questions; the `variants` check rejects it. The same holds for each `afterNight`, `ifFactDestroyed` and `lowPatience` group.
- **`pressed`** is what the guest says when accused. The thief deflects; a coached guest's `pressed.afterNight` carries the tell ("ok fine, Dale asked me to say that"). A coached guest's other topics keep their truthful replies, which sit beside the coached lie; decide on purpose whether that's an extra clue or should be reworded.
- **Facts in replies are the only facts.** A reply's text says exactly what its `factIds` carry. Anything a player could save as evidence (a time, a place, a person seen) is a fact on that reply; harmless flavor nobody disputes (an innocent's undisputed bedtime) can stay fact-free.
- **Group beat lines** may carry a planted fact without it being in that guest's `claims`: the line reports what was found ("there's a velvet box in Wes's tackle box!"). Everywhere else, a guest only says facts from their `knows` or `claims`.
- **Daytime events** have no slot of their own: the timeline only has nights 0–2. File a Saturday-afternoon event under night 1 and a Sunday one under night 2, and give it a clock time that says when it happened.
- **Secret topics** carry the guest's denial (a claim); the confession goes in their `pressed` replies, so the truth costs the player an accusation.
- **Visibility:** `public` for what a guest would say in front of everyone; `dmOnly` for secrets, accusations of others, anything embarrassing.
- **Group beats:** a Morning beat for each day (day 1 announces the theft; days 2 and 3 hint vaguely that something happened in the night) and an Idle beat or two per day of fact-free chatter in each guest's voice.
- **Wi-Fi log:** entries for the thief's movements and for innocents' movements too, so the log is a puzzle rather than a confession. Each entry carries the fact it proves. Destroyed facts can't come from the log.
- **Contradictions:** list every claim/proof pair the player could use, against the thief and against innocents (with `concernsTheft: false` for secrets).
- **Dictionary extras:** 5–8 dodges, 1–3 greetings, 1–3 thanks and a goodnight line per guest, all in voice.

Write it in a few passes (setting and background, facts, timeline and Wi-Fi log; then one guest at a time; then beats, moves and contradictions) rather than one giant write.

### 3. Check until clean

```bash
bun run cases:check <scratch>/<id>.json
```

Each problem names its check and the fact or guest at fault. Fix the case, not the claim: if a proof isn't findable on day 3, give someone a day 3 reply that carries it rather than deleting the contradiction. Repeat until the file prints `✓`.

### 4. Play it in your head

The checker proves the case solvable; you make it fair and fun. Read it as a player would, day by day, and fix anything that fails one of these:

- **Fair:** the thief's flaw is discoverable by asking natural questions. No fact needs a question nobody would think to ask.
- **Not too easy:** the thief isn't the only liar, the only one up at night, or the only one in the Wi-Fi log at the theft hour. At least one innocent looks worse than the thief on day 1.
- **Not a tell:** the thief's temperament matches at least one innocent, and their replies are no shorter, shiftier or more defensive than an innocent with a secret.
- **In voice:** each guest sounds like themselves and nobody else. Text messages, not prose: short, casual, the odd typo where the voice calls for it.
- **Cozy:** small stakes, warm people, no violence, nothing cruel. The thief has a sympathetic or comic motive.
- **Original:** classic mystery tropes are welcome (the alibi with a gap, the witness who misread what they saw, the too-obvious suspect). Plots, characters and details from specific books, films or games are not.

Run `bun run cases:check` again after every fix.

### 5. Save it

Move the file to `cases/<id>.json`, format just that file with `bunx oxfmt cases/<id>.json` (`bun run format` rewrites unrelated files), then run `bun run cases:check` (all cases, which also catches a duplicate ID) and `bun run test`. Both must pass.

Report the title, the thief, the two night moves and the solve path in a few lines. Leave committing to the person.

# Clef routing spike: verdict

**Question** (docs/design.md §12.1): can Clef route a player's typed message to the right topic in a guest's reply dictionary well enough to make dictionary-first replies work?

**Answer: yes, with Clef (27B), one call per message, and a confidence threshold.** Clef-flash is not good enough. Two-step routing (category, then topic) is worse than one call.

## Setup

- One guest (Theo) with 22 topics, plus `smalltalk` and `unknown`, in one `choice` question. A second `choice` question asks for the tone, and a `noul` question asks whether the message tries to break the game. All three go in one request.
- 103 test messages:
  - 77 that belong in the dictionary: direct, paraphrased, casual or typo-ridden, follow-ups that need the previous turn, ambiguous, and hostile.
  - 26 that don't: small talk, questions on the case that the dictionary doesn't cover, and injection attempts.
- Run with `pnpm spike:clef`. Raw output goes to `results/` (gitignored).

## Results, one call per message

|                                                     | Clef (27B)   | Clef-flash (9B) |
| --------------------------------------------------- | ------------ | --------------- |
| Topic accuracy, all 103                             | 83%          | 79%             |
| In-dictionary messages answered at confidence ≥ 0.3 | 70 / 77      | 55 / 77         |
| …of those, right                                    | 69           | 52              |
| Injection flag (≥ 0.5) correct                      | 102 / 103    | 102 / 103       |
| Tone correct                                        | 91%          | 89%             |
| Latency p50 / p95 (AI.run inside the Worker)        | 325 / 611 ms | 143 / 236 ms    |
| Input tokens per message                            | ~1,200       | ~1,200          |

Two-step routing on Clef reached the same 83% overall, but at 0.4 confidence it answered fewer messages, made more wrong answers (3 against 1), and added about 200 ms. Category mistakes can't be recovered in the second step.

## What we learned

1. **`unknown` as an option doesn't work. Low confidence does.** Clef almost never picks `unknown`. Off-dictionary questions instead land on a catch-all topic (here `whereabouts-night`) with very low confidence: 0.03–0.16 for nearly all unknown and injection messages. The confidence score is the real "not in the dictionary" signal.
2. **The rule that works** (Clef, single call):
   - injection ≥ 0.5 → dodge
   - topic confidence < 0.3 → dodge (tier 3)
   - topic = `smalltalk` → small-talk model (tier 2)
   - otherwise → dictionary reply (tier 1)

   On this set the rule answers 69 in-dictionary messages correctly. It dodges 7 (including "Did you take the brooch?", which picked `brooch` at 0.18), and serves one wrong answer ("the guy who talks nonstop" → `gus` instead of `wes`, at 0.33). Every unknown and injection message gets dodged. The only off-dictionary message served was "What's the Wi-Fi password?" → `wifi-log`, which is harmless.

3. **Short greetings fall below the threshold.** "hey" and "thanks for talking to me" score under 0.1 and would get a dodge instead of small talk. A canned greeting reply per guest, or a second `noul` asking "is this about the case at all?", would fix it.
4. **Accusations route to the object, not to `pressed`.** "Did you take the brooch?" picks `brooch`. The tone answer gets accusatory messages right, so `pressed` could be driven by tone instead of being a topic.
5. **Follow-ups work.** With the last two turns in `state`, every follow-up routed correctly on Clef.
6. **Similar descriptions blur.** "the guy who talks nonstop" picked `gus` over `wes`. Generated topic descriptions need distinguishing details, so the case-generation skill should write them with that in mind.

## Caveats

- One guest, 103 messages, all written by the same author as the dictionary. That's likely optimistic. Real players will phrase things in ways nobody planned for.
- Latency is measured inside the Worker, so it excludes network time to the player. Either model fits under a typing indicator.
- Clef pricing isn't on its model page yet. Clef-flash is $0.038 per million input tokens, so about $0.00005 per message.

## Next

- Have someone who didn't write the dictionary text Theo for 15 minutes, then rerun the spike with their messages added.
- Try the two fixes above: tone-driven `pressed`, and a greeting check.

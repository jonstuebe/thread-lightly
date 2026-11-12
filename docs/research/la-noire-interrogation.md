# How L.A. Noire's interrogations work

Researched 2026-11-12 for the choice-based redesign of Thread Lightly (see [`docs/design.md`](../design.md)). L.A. Noire is Team Bondi's 2011 detective game, published by Rockstar; the remaster came out in November 2017.

**Confidence labels.** **[P]** is a primary source: the developers' own words, or a review or preview written from hands-on play. **[S]** is secondary: a wiki summary, or a search-result excerpt I couldn't open in full. **[M]** is from memory of the game, and no source I could fetch confirmed it. Treat [M] as likely but unchecked.

## Summary

- **Every interview is a list of questions.** You pick a question from the notebook. The person answers, and you judge the answer with one of three responses. You can't re-ask a question you got wrong.
- **Clues add questions.** Evidence found at the scene, or learned from another person, opens new lines of questioning. Interviewing witnesses before suspects is the standard advice.
- **The three responses were Truth, Doubt and Lie.** Lie needs proof: you choose a notebook item that specifically contradicts the statement. Doubt is the "I think you're hiding something, but I can't prove it" option.
- **Wrong calls cost you, but never end the game.** The person shuts down, you lose that line of questioning, and your case rating drops. The story still moves on, sometimes toward the wrong suspect.
- **Intuition points are a small hint budget.** Spend one to remove a wrong response, filter the evidence list, or see what other players chose.
- **The labels were renamed twice.** They started as Coax / Force / Lie during development, shipped as Truth / Doubt / Lie, and became Good Cop / Bad Cop / Accuse in the 2017 remaster. The scripts and performances stayed the same.
- **The main criticism is that Doubt was unpredictable.** Players couldn't tell what Cole would actually say. The aggressive line recorded for "Force" played under the label "Doubt", so a mild choice produced an outburst. Reviewers also called the system "weirdly strict" and too much guesswork. The fix most critics asked for: show the actual line, or use plain verbs.

---

## 1. How an interview runs

- **The notebook holds the questions.** It lists the people, places and evidence in a case. During an interview you pick questions from it [S: [Wikipedia, "L.A. Noire", Gameplay](https://en.wikipedia.org/wiki/L.A._Noire), citing Giant Bomb and IGN].
- **You choose a tone, not a line.** Game Informer: "you aren't prompted with actual dialogue options, but you select the tone of the responses" [P: [Matt Helgeson, Game Informer, 2011-05-12](https://www.gameinformer.com/games/la_noire/b/xbox360/archive/2011/05/12/everything-you-need-to-know-about-l-a-noire.aspx)].
- **You read the face.** MotionScan facial capture was the selling point. Studio head Brendan McNamara said the team knew early on "that the key moments in a detective game would be the interrogation of the game's main suspects", and built the tech alongside the design [P: [Develop/MCV, "The art of lying"](https://mcvuk.com/development-news/the-art-of-lying-la-noire/)]. Watch each answer, because you can't replay it [P: [Engadget, "Be a better L.A. Noire interrogator", 2011-05-20](https://www.engadget.com/2011-05-20-be-a-better-l-a-noire-interrogator.html)].
- **You can reread what was said.** You can pause and review the conversation log [P: Engadget, 2011-05-20, above].
- **Each answer is scored on the spot.** A chime plays and the question gets a tick or a cross. Each question gets one try; the only way to retry is to restart from a checkpoint [M]. One review: "there's no back-tracking or second guessing" [S: search excerpt from [GameSpot user review](https://www.gamespot.com/l-a-noire/user-reviews/2200-528194/)].

## 2. How clues unlock questions

- **Clues open lines of questioning.** Helgeson: clues often open new lines of questioning, so search thoroughly before you interview anyone [P: Game Informer, 2011-05-12, above].
- **Evidence comes from two places.** Players get it from physical clues (scenes, locations, bodies) or from other characters. Some items can be examined further. The investigation music stops when you've found every key clue [S: [Wikipedia](https://en.wikipedia.org/wiki/L.A._Noire), citing Eurogamer and the Prima guide].
- **Order matters.** "When given a choice, interview witnesses before suspects", because witnesses give you the proof you'll need against suspects [P: Engadget, 2011-05-20].
- **Missing a clue removes a question.** If you never found the clue, its question never appears and you can't prove the lie it would have exposed [M].

## 3. The three responses

| Original (2011) | Remaster (2017) | What it means | Needs evidence |
| --- | --- | --- | --- |
| Truth | Good Cop | Accept the answer; move on, or coax a little more | No |
| Doubt | Bad Cop | "You're holding something back," without proof; press them | No |
| Lie | Accuse | "That's a lie, and here's why": present a notebook item | Yes |

- **Truth:** pick it when the answer seems straight, shows no tells, and nothing in the notebook contradicts it [P: Engadget, 2011-05-20].
- **Doubt:** for "a half-truth or holding back info" [P: Engadget, 2011-05-20]. It sits "between truth and lie" [P: [Radek Koncewicz, Game Developer, 2011-05-21](https://www.gamedeveloper.com/design/l-a-noire-s-interrogation-system)].
- **Lie:** "You have to be able to prove a lie. That means, you have to have evidence in your notebook that specifically contradicts the statement" [P: Engadget, 2011-05-20]. Accusing someone means opening the notebook and presenting a specific item that refutes their testimony [P: Game Informer, 2011-05-12].
- **Backing out of a Lie.** If you pick Lie and then realise you have no proof, you can back out to Doubt. You lose some experience, and that answer's face becomes harder to read [P: Engadget, 2011-05-20].

## 4. What a wrong call costs

- **The person shuts down.** A failed accusation leaves the suspect "emboldened" and they "shut down" [P: Game Informer, 2011-05-12].
- **Being too soft costs too.** Believing someone too easily can let a dubious alibi stand [P: Game Informer, 2011-05-12].
- **Lines of questioning close.** Koncewicz found that choosing Truth could close a line for good, even when the answer was honest and something important (the murder weapon) still needed asking about [P: Koncewicz, 2011-05-21].
- **The case rating drops.** Every case ends with a five-star rating based on investigations, interrogations and driving. Charging the wrong suspect lowers it [S: [Wikipedia](https://en.wikipedia.org/wiki/L.A._Noire), citing Giant Bomb and Edge].
- **You can't lose.** "You can't lose the game making wrong guesses." The story carries on, and a wrong guess can take Phelps somewhere new [P: Engadget, 2011-05-20]. The flip side, noted by a reviewer: the game could give more stars for arresting one of two wrong suspects, so the stars could matter more than whether you got it right [S: search excerpt, user review].
- **Interviews don't have to go perfectly.** Koncewicz counts this as a strength: the case still moves forward [P: Koncewicz, 2011-05-21].

## 5. Intuition points

- **You hold up to five.** You earn one each time your rank goes up [S: search excerpt from [Prima Games eGuide, "Intuition / Rank"](https://primagames.com/eguides/la-noire-2017-remaster/basics/intuition-rank)].
- **Three ways to spend one:** remove a wrong response (leaving two), see the most common choice among other players (the "community" option), or reveal every clue at a crime scene [S: [Wikipedia](https://en.wikipedia.org/wiki/L.A._Noire), citing Edge and GameTrailers].
- **During an accusation, one point also removes evidence that doesn't matter.** If every item gets removed, you either lack the proof or the person is telling the truth, so back out to Doubt [P: Engadget, 2011-05-20].

## 6. Why the labels changed twice

- **Development: Coax / Force / Lie.** McNamara, Bradford Animation Festival, November 2011: "When we originally wrote the game the questions you asked were coax, force and lie." Force was the aggressive option, and Aaron Staton (Cole Phelps) recorded his lines for it [P: [Engadget, 2011-11-10](https://www.engadget.com/2011-11-10-mcnamara-explains-why-la-noires-cole-seemed-like-a-psycho.html); [GameRant, 2011-11-11](https://gamerant.com/la-noire-different-interrogation-options-tao-115919/), citing Edge].
- **Ship: Truth / Doubt / Lie.** The relabel turned a proactive tool (how hard do I push?) into a reactive judgement (is this person lying?). That made it more of a detective game, but the recorded lines no longer fit their labels. McNamara: "Everyone always says Aaron on the second question is a psycho. So that's not his fault" [P: Engadget, 2011-11-10].
- **Remaster: Good Cop / Bad Cop / Accuse.** It was renamed so the label describes how Cole will behave [S: [Push Square, 2017-11-09](https://www.pushsquare.com/news/2017/11/l_a_noire_remaster_does_away_with_its_often_confusing_trust_doubt_lie_system); [Destructoid, Peter Glagowski, 2017-11-09](https://destructoid.com/?p=208008)].

## 7. What players and critics disliked

- **"Doubt" was unpredictable.** It could mean "I don't believe you" or "tell me more", and Cole's reaction varied wildly. "Choosing Doubt can easily cause confusion and frustration" [S: search excerpts from 2011 [Giant Bomb user reviews](https://giantbomb.com/user-reviews/id/125732/la-noire-no-angels-in-this-city)]. Koncewicz: Doubt led to very different reactions, and he couldn't predict which [P: Koncewicz, 2011-05-21].
- **The player's intent didn't reach the game.** "I've repeatedly found myself taking the wrong conversational turn not because my assumptions about the case were incorrect" [P: Koncewicz, 2011-05-21]. He wanted "more information to accompany the delicate and often volatile interrogations".
- **Too strict, too much guessing.** Pocket-lint: "weirdly strict and slightly confusing… it's not always apparent when to merely express your concerns or accuse your interviewee" [S: search excerpt, [Pocket-lint review](https://www.pocket-lint.com/games/reviews/72418-l-a-noire-game-review)]. Collider: "a little too much guesswork"; once you're down to Doubt or Lie, "you're in trouble" [S: search excerpt, [Collider review](https://collider.com/la-noire-review/)].
- **Edge and Eurogamer:** the choices could be vague or illogical. OXM criticised the passive nature of interviews [S: [Wikipedia](https://en.wikipedia.org/wiki/L.A._Noire), Reception].
- **The remaster's labels only partly fixed it.** Kotaku: "These terms encompass a wide range of possible actions." A Bad Cop pick might threaten arrest, threaten violence or just sound grumpy, and it's "hard to say" which. The writer suggested clearer verbs ("Believe, Doubt, Accuse"), or letting players preview Cole's exact line before choosing [P: [Heather Alexandra, Kotaku, 2017-11-16](https://kotaku.com/the-l-a-noire-remasters-new-dialogue-system-isnt-speci-1820520119)]. Push Square found the new labels "more fitting"; Nintendo Life and GameSpot found them still too vague [S: [Wikipedia](https://en.wikipedia.org/wiki/L.A._Noire)].
- **What critics praised.** Game Informer called the interrogations "the most compelling aspect of L.A. Noire" [S: Wikipedia, citing Game Informer]. The facial performances and the tension of a live accusation landed.

## 8. Takeaways for Thread Lightly

1. **Show the exact line.** Our menu should be the detective's actual text, not a tone. That fixes the biggest complaint for free.
2. **Proof checks are crisp; judging tone is not.** "This saved message contradicts that one" can be checked exactly. "Is this person nervous?" is the vague part. We have no faces, so we keep only the evidence-backed confront and a clearly labelled press.
3. **Never close a line of questioning because you believed someone.** Moving on is free. Only a wrong *accusation* costs anything.
4. **A wrong call should cost something without ending the game.** L.A. Noire's shutdown plus a lower rating fits a cozy game, as long as the case stays winnable.
5. **Clues unlocking questions is the core loop.** It makes order and reading closely matter, and it maps directly onto our case file and Wi-Fi log.
6. **Intuition is optional.** A small hint budget softens strictness. Consider it later if playtests find confronts too punishing.

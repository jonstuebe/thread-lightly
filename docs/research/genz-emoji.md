# How Gen Z uses emoji in texts (and how older texters differ)

Researched 2026-11-07, for rewriting guest `voice` strings in `cases/*.json` and the reply prompts in `worker/ai-live.ts` (`composePrompt` and the `SmallTalk` system prompt). "Gen Z" means born 1997–2012, so aged about 14–29 in late 2026.

**Confidence labels.** **[P]** is a primary source: a peer-reviewed or working paper, a first-party survey with published method, or platform data. **[P-via]** is primary data that I could only read through press coverage; the original is paywalled or a PDF I couldn't fetch. **[S]** is secondary only (a dictionary, Emojipedia, press or expert commentary), so treat it as lower confidence. Every finding has a date. ⚠️ marks a finding that is likely stale by late 2026.

## Summary

- **😭 is the default "I can't" emoji, and no longer a youth marker.** It became the most-used emoji worldwide in 2025 Gboard data (over 6% of all emoji). It covers funny, cute, embarrassing and overwhelming, not sadness. For young texters, 😭 fits on almost anything that would once have taken 😂.
- **😂 and 🤣 read as older.** Young people call them overused. On Reddit, 😂 is the top emoji in r/GenX. For a Gen Z guest, using 😂 sincerely is the clearest tell of a caricature.
- **💀 is real but already fading.** Teen use of 💀 ("I'm dead", meaning very funny) rose in 2022–23, then dropped quickly. It still reads as young, but it isn't new any more.
- **The "rude" readings are only partly backed by evidence.** One survey (2023 data) found Gen Z rates 👍 and 😊 as more passive-aggressive than older generations do. Every generation still rates the smiley as friendly overall. 🙂 as fake or ironic is documented by dictionaries and in Chinese-language studies. The claim that 👍 is "hostile" comes from a Reddit post and a PR poll, and press coverage inflated it.
- **For approval, teens use 🔥 and 🙏, while older users use 💯 and 👍** (Gboard plus Reddit, 2025 data).
- **The newest signals belong to Gen Alpha (born about 2013 on), not Gen Z.** 🥀 (about 8% of r/GenAlpha replies vs 2% of r/GenZ) and 🗿 are examples. If a twenty-something guest uses them heavily, she will read as a teenager trying too hard.
- **Younger people read emoji pragmatically (as tone); older people read them literally.** Older texters lean on object and people emoji (⚓🦉🌹), classic yellow faces, and greetings and salutations. Many of the current older-guest voices already fit this.
- **The texture of young texting is all lowercase and no final period.** A final period reads as less sincere. Emoji are used sparingly overall, but repeated in a burst when they are used (😭😭).

---

## 1. Which emoji Gen Z uses, and what they mean

| Emoji | Claimed young meaning | Verdict | Evidence |
|---|---|---|---|
| 😭 | Laughing, cute, embarrassing, "I can't" | **Confirmed**, now universal | It became the #1 emoji worldwide in 2025, up from #4 in 2024, at over 6% of use. The data is an anonymous sample of 665M emoji from Gboard, collected Nov 2024–Jan 2025 and Nov 2025–Jan 2026. The NYT analysis glosses it as "so funny, emotional or embarrassing you could cry" [P-via: [NYT Upshot, "😭 or 😂: Do Your Emojis Make You Look Old?", 2026-08-12](https://www.nytimes.com/interactive/2026/08/12/upshot/emoji-generations.html), read through [Deseret News, 2026-08-13](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/) and the [Edling list repost, 2026-08-13](https://listserv.linguistlist.org/pipermail/edling/2026-August/008984.html)]. Jennifer Daniel's write-up of the same Gboard data says the top spot moved from 😂 (2021) to 🤣 (2024) to 😭 (2025), and that 😭 is now the reaction for things too funny, embarrassing or cute to cope with [S: [Daniel, "Why 😭 Drowned Out 😂", 2026-08-18](https://jenniferdaniel.substack.com/p/why-drowned-out)]. It first overtook 😂 on Twitter for a full month in March 2021 [P: [Emojipedia, 2021-04](https://blog.emojipedia.org/loudly-crying-becomes-top-tier-emoji); [Emojipedia, 2022-04-14](https://blog.emojipedia.org/10-years-of-tears-of-joy-vs-loudly-crying-face-on-twitter/)]. Dictionary.com: positive overwhelm, "so funny, cute, or sweet" [S: [Dictionary.com, 2022-09-28](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)]. On r/teenagers, 😭 is the top crying emoji [P-via: NYT, through [WordSmarts summary](https://wordsmarts.com/emojis-look-old/)]. |
| 💀 | "I'm dead", meaning very funny | **Confirmed, but fading** ⚠️ | Rose among teens in 2022–23, then "dropped quickly" [P-via: [NYT, 2026-08-12](https://www.nytimes.com/interactive/2026/08/12/upshot/emoji-generations.html), through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/)]. Used for laughter or embarrassment in Gen Z slang (a qualitative study of social posts) [P: [Kostadinovska-Stojchevska & Shalevska, *Teacher* 27, 2024](https://eprints.uklo.edu.mk/id/eprint/10828/)]. Radboud researchers note that a skull after a joke can mean "dying from laughter" [P: [Verheijen & Mauro, Radboud Univ., 2025-01-20](https://www.ru.nl/en/about-us/news/on-smileys-and-skulls-how-do-kids-use-emoji)]. Dictionary.com: "a line of them" means "dying with laughter" [S: [2022-09-28](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)]. 💀 ranked #7 in Apple's US data as early as 2017 [S: Emojipedia citing Apple, [2021-02-16](https://blog.emojipedia.org/is-the-laughing-crying-emoji-cancelled-heres-what-we-know/)]. |
| 😂 | Dated, "for boomers" | **Partly confirmed.** It reads as older and is often used ironically. It is not dead: it is still #3 worldwide. | Young people consider 🤣 and 😂 overused, which helped 😭 take the top spot; 😂 is the most-used emoji on r/GenX [P-via: NYT 2026-08-12, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/) and [WordSmarts](https://wordsmarts.com/emojis-look-old/)]. Gen Z avoids 😂 "or may use it ironically to represent older people's usage" [P: [Zhukova & Herring, *Language@Internet* 22, 2024-12-20](https://scholarworks.iu.edu/journals/index.php/li/article/view/40800), citing CNN 2021]. Emojipedia (2021) found no age-split data behind the "cancelled" claim, and 😂 was then still #1 [S: [Emojipedia, 2021-02-16](https://blog.emojipedia.org/is-the-laughing-crying-emoji-cancelled-heres-what-we-know/)]. Adobe's 2022 US survey still ranked 😂 as the favourite emoji across all ages [P: [Adobe Emoji Trend Report, 2022-09-13](https://news.adobe.com/assets/downloads/pdfs/2022/09/091322adobefocemojitrendreport.pdf)]. |
| 🙂 | Fake smile, passive-aggressive, ironic | **Confirmed as ironic or awkward. "Passive-aggressive" is moderately supported.** | Dictionary.com: an "ironic or fake smile, used in awkward or uncomfortable situations" [S: [2022-09-28](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)]. Emojipedia's Keith Broni calls it "highly performative and slightly passive aggressive" to teens and twenty-somethings [S: Daily Mail, [2022-10-27](https://www.pressreader.com/uk/daily-mail/20221027/281891597209965)]. Experimental evidence comes from Chinese speakers: the smile emoji was read as sarcastic or mean by younger participants when the sender was young, while older participants read it as positive regardless of sender [P: Cui 2022, *Frontiers in Psychology*, summarised in [Zhukova & Herring 2024](https://scholarworks.iu.edu/journals/index.php/li/article/view/40800)]. Younger WeChat users read 🙂 as sarcastic or impolite; older users read it as positive [P-via: Yang & Qian 2024, *Social Science Computer Review*]. No English-language experiment tests 🙂 specifically. |
| 👍 | Curt or hostile | **Weakly confirmed.** Mildly more passive-aggressive to Gen Z, and "old" more than rude. | US survey of 273 adults, Feb–Mar 2023 (97 Gen Z): younger generations rated 👍 (and 😊) as more passive-aggressive [P: [Zhukova & Herring, 2024-12-20](https://scholarworks.iu.edu/journals/index.php/li/article/view/40800)]. Perspectus Global surveyed 2,000 UK 16–29s and found 👍 topped the emoji that make you look "officially old", followed by ❤️, 👌 and ✔️ [S, method unpublished: [Hello Rayo, 2021-04-08](https://www.hellorayo.co.uk/cool-fm/world/trending-news/emojis-old)]. The "hostile" framing came from a single Reddit post [S: [Fox News, 2021](https://www.foxnews.com/lifestyle/gen-z-says-emoji-passive-aggressive-you-using-it)]. Teens use 🙏 instead of 👍, and 👍 is "particularly popular with Gen X"; 👍 slid from #7 (2024) to #8 (2025) [P-via: NYT 2026-08-12, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/)]. |
| 🙏 | "Thanks" or "please", and approval | **Confirmed, and rising** | Rose from #6 (2024) to #5 (2025); teens use it in place of 👍 [P-via: NYT, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/), [ThePrint, 2026-08-19](https://theprint.in/feature/most-used-emoji-gen-z-google-data/3019664/)]. Dictionary.com: "thank you," or hoping for something [S: [2022-09-28](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)]. |
| 🔥 | Approval, "hot", "fire" | **Confirmed** | Teens use 🔥 where older people use 💯 [P-via: NYT, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/)]. Note that older generations rated 🔥 more negatively, reading it literally or as a threat [P: [Zhukova & Herring 2024](https://scholarworks.iu.edu/journals/index.php/li/article/view/40800)]. |
| 🥀 | Mock heartbreak, ironic sadness | **Confirmed, but mainly Gen Alpha** ⚠️ | The fastest-rising emoji, at #93 in 2025. It was almost nonexistent among millennials and Gen X, about 2% of r/GenZ replies, and almost 8% of r/GenAlpha [P-via: NYT, through [BuzzFeed, 2026-08-25](https://www.buzzfeed.com/aglover/wilting-rose-emoji-gen-alpha)]. A linguist called it a "forced emoji" that replaces 💔 once parents adopted that [S: [YPulse, 2026-09-17](https://www.ypulse.com/newsfeed/2026/09/17/what-does-the-wilting-rose-emoji-mean-to-gen-z-and-gen-alpha/), citing the Guardian]. Merriam-Webster lists it as slang for heartbreak [S: [M-W](https://www.merriam-webster.com/slang/dead-rose-emoji-d83edd40)]. |
| 🗿 | Deadpan, "raised eyebrow" | **Gen Alpha marker** | Rose to #33 in 2025, used mainly on Reddit for a deadpan reply [P-via: NYT, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/)]. |
| 🤭 | Giggle, "oops", coy | **Confirmed as rising** (meaning not tested) | One of the risers, at #16 in 2025 [P-via: NYT, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/)]. |
| 🫠 | Melting, meaning overwhelmed, dread, embarrassed, sarcastic | **Plausible, but no age data** | Added in Unicode 14.0 (2021). Emojipedia lists sarcasm, embarrassment, slow dread and overwhelm [S: [Emojipedia](https://emojipedia.org/melting-face)]. I found no study tying it to Gen Z. |
| 🧍 | Awkward silence, "standing there" | **Plausible, low confidence** | Emojipedia: "Commonly used to convey awkwardness, particularly on TikTok" [S: [Emojipedia](https://emojipedia.org/person-standing)]. No usage data. |
| 🙃 | "This is terrible", FML | **Plausible** | Dictionary.com [S: [2022-09-28](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)]. Adobe's 2022 survey ranks 🙃 the #3 most misunderstood emoji [P: [Adobe 2022](https://news.adobe.com/assets/downloads/pdfs/2022/09/091322adobefocemojitrendreport.pdf)]. |
| 👀 | "Tell me more", "I'm listening" | **Plausible** | Dictionary.com [S: [2022-09-28](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)]. |
| ❤️ after a "no" | A softened refusal: "no ❤️" | **Plausible** | Dictionary.com [S: [2022-09-28](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)]. Zhukova & Herring call "No ❤" a "fairy comment": soft emoji such as ✨ 🦋 ❤️ framing a sharp message [P: [2024](https://scholarworks.iu.edu/journals/index.php/li/article/view/40800)]. The same mechanism explains ironic ✨word✨ framing. |
| 😔 | Mock sadness, "tragic" | **Unverified** | Emojipedia lists only sincere meanings [S: [Emojipedia](https://emojipedia.org/pensive-face)]. I found no source for ironic use. |
| 🫶, ✌️ | Heart hands (affection), a breezy sign-off | **Unverified** | No primary or reputable secondary source found. 🫰 (the K-pop finger heart) is a 2025 riser at #84 [P-via: NYT, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/)]. Use 🫶 sparingly if at all. |

**Broader pattern.** Younger people are "less literal and more fanciful" with emoji, and an emoji gets dropped once older relatives adopt it [P-via: NYT 2026-08-12, through [WordSmarts](https://wordsmarts.com/emojis-look-old/), [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/)]. In Adobe's 2022 survey, 74% of Gen Z said they use emoji with meanings other than the intended one, against 65% of millennials, 48% of Gen X and 24% of boomers [P: [Adobe, 2022-09-13](https://news.adobe.com/assets/downloads/pdfs/2022/09/091322adobefocemojitrendreport.pdf); 5,000 US frequent emoji users, Mar–Apr 2022].

## 2. How they use them

**Frequency.** Younger people use emoji more, but not on every message.
- 34% of US 18–29-year-olds use emoji in messages multiple times a day. That is the highest of any age group [P-via: YouGov poll, Dec 2023, through [Statista](https://www.statista.com/statistics/1457670/us-adults-emoji-usage-frequency-age)].
- UK 16–29-year-olds send about 76 emoji a week, roughly 11 a day [S: Perspectus Global, [2021-04-08](https://www.hellorayo.co.uk/cool-fm/world/trending-news/emojis-old)].
- Gen Z sends over five times more emoji than people aged 55+ [S, vendor survey: Customer Thermometer, 2019, through [PR Newswire](https://prnewswire.com/news-releases/emoji-getting-a-thumbs-up-in-workplace-comms-according-to-a-survey-by-customer-thermometer-300930465.html)].
- Adobe's frequent emoji users put an emoji in roughly half their texts [P: Adobe 2022, through [Adobe blog](https://blog.adobe.com/en/publish/2022/09/13/emoji-trend-report-2022)].

Read together, these say a guest who emojis every single message is overdoing it, even for Gen Z.

**Repetition.** Young texters repeat one emoji (😭😭😭, 💀💀) rather than mixing several different ones.
- Children repeat emoji more, for example five identical smileys in a row [P: Verheijen's research, reported by [Radboud, 2025-01-20](https://www.ru.nl/en/about-us/news/on-smileys-and-skulls-how-do-kids-use-emoji)].
- 💀 is used "in a line" [S: [Dictionary.com 2022](https://www.dictionary.com/e/gen-z-explains-emoji-to-millennials/)].
- In emoji corpora, repeated pairs are far likelier than in words: 3.2% of emoji bigrams vs 0.4% of word bigrams [P: [arXiv 1611.02027, 2016](https://arxiv.org/pdf/1611.02027)].

Treat the repetition as an intensifier, used once in a while rather than as a habit.

**Placement.**
- Adults and children both put emoji mostly at the end of a message. Older children and active social-media users more often use emoji in place of punctuation mid-message [P: [Radboud, 2025-01-20](https://www.ru.nl/en/about-us/news/on-smileys-and-skulls-how-do-kids-use-emoji)].
- The other common young pattern, a reply made of a single emoji (just "😭"), is widely observed. I found no study that counts it, so it is unverified.

**Irony.** Younger readers default to tone and sarcasm readings.
- Respondents over 30 "often did not understand the functions or interpreted the emoji literally, while younger users interpreted them in more conventionalized ways" [P: [Herring & Dainas, *ACM Trans. Social Computing* 3(2), 2020](https://homes.luddy.indiana.edu/herring/EmojiGenderandAge.pdf); N=519, 354 under 30].
- Gen Z rated emoji-bearing messages as more sarcastic, passive-aggressive and threatening overall [P: [Zhukova & Herring 2024](https://scholarworks.iu.edu/journals/index.php/li/article/view/40800)].

**Lowercase and no punctuation.**
- All-lowercase reads as a "younger, trendier, more online texter" and as "carefully-calibrated casualness", and younger raters reacted more strongly [P: [Abirou, Kerrigan, Michell & Wade, *Penn Working Papers in Linguistics* 30.1, 2024](https://repository.upenn.edu/handle/20.500.14332/59864)].
- In the same study, one exclamation point reads as more laid-back than none, and two read as trendier.
- Text replies ending in a period are rated less sincere, but handwritten ones are not [P: Gunraj et al., *Computers in Human Behavior*, 2016, [abstract](https://researchconnect.suny.edu/en/publications/texting-insincerely-the-role-of-the-period-in-text-messaging/)].
- So "terse lowercase with a period" (the existing "k." voice) correctly reads as cold.

**Keyboard emoticons vs emoji.** `:)` and `:D` are now the older, or millennial, form.
- Twitter users who adopted emoji used fewer emoticons afterwards [P: [Pavalanathan & Eisenstein, *First Monday* 21(11), 2016](https://firstmonday.org/ojs/index.php/fm/article/view/6879); data from 2014–15].
- In a German WhatsApp corpus, `:)` and `:D` were used more by the younger volunteers (mean age 27). That data was collected around 2014, when today's millennials were the young cohort [P: [Koch, Romero & Stachl, *Computers in Human Behavior* 126, 2022](https://alexandria.unisg.ch/server/api/core/bitstreams/3e500c15-dc08-468d-8d3f-0adb6b3acc71/content)]. ⚠️ That youth association is a decade old.
- I found no direct data on current Gen Z use of `:)` or `:/`. Treat keyboard emoticons as a millennial or older marker; this is an inference.

**Laughter words.** On Facebook in 2015, emoji-laughers had the youngest median age, and "lol" and "hehe" users were the oldest. "haha" was the most common form at every age [P: [Facebook Research, 2015-08-06](https://research.facebook.com/blog/2015/08/the-not-so-universal-language-of-laughter/)] ⚠️. The NYT team, mostly millennials, say they use a closing "lol" instead of a period to soften tone [P-via: [WordSmarts summary of NYT](https://wordsmarts.com/emojis-look-old/)].

**Reactions and tapbacks.** Since iOS 18 (Sept 2024), iMessage tapbacks accept any emoji or sticker, not just the six fixed icons [S: [MacRumors, 2024-06-17](https://www.macrumors.com/2024/06/17/everything-new-in-ios-18-messages-app/)]. I found no data on generational tapback habits. The game has no tapbacks, so this matters only if guests ever "react".

**Moving away from emoji.** Some teens are moving from emoji to stickers and inside-joke reaction images [P-via: NYT, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/); [YPulse 2026-09-17](https://www.ypulse.com/newsfeed/2026/09/17/what-does-the-wilting-rose-emoji-mean-to-gen-z-and-gen-alpha/)]. This supports keeping emoji sparse for a teen in a text-only game.

## 3. Millennials and older texters

**Millennials (born 1981–96, aged about 30–45 in 2026).**
- They are the cohort that made 😂 the 2015 Oxford word of the year. In 2023 they rated 👍 and 😊 as friendlier than Gen Z did [P: [Zhukova & Herring 2024](https://scholarworks.iu.edu/journals/index.php/li/article/view/40800)].
- Still heavy emoji users: 65% say they use emoji with non-literal meanings, close to Gen Z [P: [Adobe 2022](https://news.adobe.com/assets/downloads/pdfs/2022/09/091322adobefocemojitrendreport.pdf)].
- Typical markers (inferred from the sources above): 😂 and 🤣, 🙃, 😅, "lol" or "haha" as a tone softener, `:)`, more standard capitalisation than Gen Z, and the occasional ironic emoji.

**Gen X (born 1965–80).**
- 😂 is their most-used emoji on Reddit, and 👍 is "particularly popular" with them [P-via: NYT 2026-08-12].
- 48% use emoji non-literally [P: Adobe 2022].
- Older texters signal approval with 💯 or 👍 [P-via: NYT].

**Boomers and older (born 1946–64 and before).**
- Only 24% use emoji non-literally [P: Adobe 2022].
- They read emoji literally, as virtual actions, or answer "I don't know". Older men are the likeliest to find emoji confusing or annoying [P: [Herring & Dainas 2020](https://homes.luddy.indiana.edu/herring/EmojiGenderandAge.pdf)].
- A study of WeChat users aged 60+ (Nov 2023) found they use emoji "occasionally" and prefer classic yellow faces (75%) and nature themes (84%, vs 7% of 18–44s) [P: [Wu, Zhang & Zhang, *Frontiers in Psychology* 15, 2024-07-11](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1424728/full)].
- In German WhatsApp data, older volunteers used more object and people emoji. Younger volunteers used more emotion faces. Older volunteers also wrote more salutations ("greetings", "good morning") [P: [Koch et al. 2022](https://alexandria.unisg.ch/server/api/core/bitstreams/3e500c15-dc08-468d-8d3f-0adb6b3acc71/content)].
- Using 😀, ❤️ or 👍 for their literal meanings signals an older texter [P-via: NYT, through [WordSmarts](https://wordsmarts.com/emojis-look-old/)].
- Ellipses as neutral connectors ("see you soon...") are an older habit that younger readers take as ominous. McCulloch traces it to postcard and note-writing conventions [S: [Marketplace, 2019-10-21](https://www.marketplace.org/2019/10/21/ellipses-and-emoji-how-age-affects-communication-at-work); [The Outline](https://theoutline.com/post/3333/why-do-old-people-text-like-this-an-investigation)]. No controlled study.

**Implication for the existing cases.** Older voices like "the odd ⚓", "the occasional 🦉" and "the odd 💛" already match the evidence: older texters use one literal, on-topic object emoji or a heart, in full sentences.

## 4. How fast this drifts

- **Turnover is fast at the edge and slow at the core.** The top 10 emoji make up 36% of all use and have barely changed in years. 😭 moved from #4 to #1 in a single year (2024 to 2025) [P-via: NYT, through [Deseret](https://www.deseret.com/lifestyle/2026/08/13/the-most-popular-emojis/), [ThePrint](https://theprint.in/feature/most-used-emoji-gen-z-google-data/3019664/)].
- **Youth markers last about 1–3 years.** 💀 rose in 2022–23 and was already falling by 2025. 🥀 went from a February 2025 TikTok trend to Gen Alpha property within about 18 months.
- **The mechanism:** teenage girls lead change, and younger users abandon emoji that older people adopt [P-via: NYT 2026-08-12; [YPulse 2026-09-17](https://www.ypulse.com/newsfeed/2026/09/17/what-does-the-wilting-rose-emoji-mean-to-gen-z-and-gen-alpha/)].
- **Likely stale by late 2026 or soon after:**
  - 💀 as a fresh signal (already declining).
  - 🥀 and 🗿 as cutting-edge (and they belong to Gen Alpha anyway).
  - The Dictionary.com 2022 list (👁️👄👁️, 🤰 and ⏳ already feel 2021–22).
  - The Perspectus "officially old" list (2021).
  - Emoticon findings from 2014–15 data.
- **Likely durable:**
  - 😭 as the all-purpose reaction.
  - 😂 and 👍 reading as older.
  - Lowercase, with no final period, for young texters.
  - Literal and object emoji for older texters.
  - Sparse use, with an occasional repeated burst.
- **Gaps:** Unicode's own frequency page could not be fetched. Its 2021 top 10, as reported, was 😂 ❤️ 🤣 👍 😭 🙏 😘 🥰 😍 😊 [S: [Macworld, 2021-12](https://www.macworld.com/article/678201/revealed-the-most-popular-emoji-of-2021.html)]. The NYT's per-generation chart numbers were not accessible; only press summaries were.

---

## Recommendations for guest voices

Both `composePrompt` and `SmallTalk` paste `guest.voice` in raw. That makes the voice string the right place for per-guest emoji rules. One shared rule line in both prompts can carry the global do-nots (section (d) below).

### (a) Gen Z guest (about 18–29; e.g. a photography student, a grandson home from engineering school)

Prompt-ready rules:
- Write all in lowercase. Leave off the final period. Use "?" only when it's really a question. "!" is fine once in a while.
- Use emoji in at most about one message in three. A plain text with no emoji is normal.
- When there is an emoji, it's one emoji at the end of the message. Or the emoji repeated two or three times (😭😭) for big reactions only. Never several different emoji in one text.
- Funny, cute or overwhelming gets 😭. Never use 😂 or 🤣.
- Awkward or "yikes" gets 🫠 or 😬. Thanks or please gets 🙏. Approval gets 🔥 or "so real". Giggly gets 🤭.
- 💀 is fine for something genuinely funny, but at most once in a conversation.
- 🙂 means fake-fine or annoyed, never happy. Never use 👍 as a friendly yes; write "ok" or "yeah" instead.
- Use "lol", "omg", "ngl" and "like" lightly, at most one per message.

Example texts:
- `wait he said WHAT 😭😭`
- `ngl i was asleep by like 11`
- `i didn't take it 🙏 ask theo`
- `ok that's so embarrassing 🫠`
- `no ❤️`
- `lol sure 🙂` (annoyed)

Fixes to current voices:
- "lots of 😭 and ✨" becomes "😭 now and then; never more than one kind of emoji per text".
- "✨🎶 … proper capitals" reads as a millennial theatre kid, which may be intended. If she's Gen Z, drop the capitals and the double emoji.
- Don't give a Gen Z guest 🥀 or 🗿 as a signature. They read as early-teen (Gen Alpha).

### (b) Millennial guest (about 30–45; e.g. a baking blogger, a college roommate)

Prompt-ready rules:
- Use normal capitalisation, though it can slip when relaxed. Exclamation marks are fine, and "haha" or "lol" can sit at the end in place of a period.
- Use emoji in about half of messages, usually one at the end. Typical ones: 😂, 🙃, 😅, 🤦‍♀️, 🙌, and the occasional `:)`.
- Mild irony is fine (🙃 for "great, just great"), but nothing newer than about 2020.
- ☕ and 👀 for gossip suit this cohort.

Example texts:
- `Honestly no idea, I was in bed by 11 haha`
- `Oh god, the brooch?? 😅`
- `Love that for her 🙃`
- `Ok so between you and me 👀`

### (c) Older guest (Gen X or boomer, about 46+; e.g. a jib trimmer of twenty years, Nana's friend of fifty years)

Prompt-ready rules:
- Write full sentences with standard punctuation. Ellipses and dashes can join thoughts ("Well... I suppose so."). A greeting or sign-off is fine ("Good morning!", "Best, Walt", "x").
- Emoji are rare: at most one, and only in a warm or light message. Use it literally, matching the topic (⚓ 🦉 🌹 ☀️ 🎂) or as a plain feeling (😊 ❤️ 👍 😀). Gen X may use 😂 sincerely to mean "that's funny."
- Never use 😭, 💀, 🫠, 🙏 as "thanks", or any ironic emoji. 👍 is a sincere "yes", and 👍 alone is a complete reply.
- Some older guests use none at all. Keep "no emoji, ever" voices exactly as they are.

Example texts:
- `I was asleep by ten, I'm afraid. Ask Ruth.`
- `Thank you, dear! 😊`
- `Saw nothing... it was blowing a gale out there ⚓`
- `👍`
- `That's very funny 😂` (Gen X)

### (d) Do-nots for the LLM (one shared line in both prompts)

- Don't add emoji the voice doesn't call for, and don't add one to every message. Most texts from most guests carry no emoji.
- Never give a guest under 30 😂 or 🤣 when the voice says young, and never use 🙂 or 👍 to mean happy for a young guest.
- Never give an older guest 😭, 💀, 🫠, 🥀, 🗿, or emoji strings.
- Never mix several different emoji in one text (no 🎉✨💖). Repeating one emoji is the young form; mixing is the caricature.
- An emoji goes at the end of a message, or replaces it entirely. Never more than one cluster per text.
- Don't explain slang or emoji, and don't stack slang ("omg lol fr ngl" in one line).
- Young voices: no final period. A trailing period from a young guest means cold or annoyed, so only use it when the voice says so ("k.").

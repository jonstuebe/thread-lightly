import { Array, Match, Option, String } from 'effect'
import { type Runtime, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { GUEST_NAMES, type GuestName, dayName } from './cast'
import {
  BlurComposer,
  CastGuestVotes,
  DealNewCase,
  DetectOs,
  FetchGuestTexts,
  PickFallbackLines,
  RollMorning,
  ScrollToLatest,
  WaitForBeat,
} from './command'
import {
  FINAL_DAY,
  introScript,
  mentionedGuest,
  morningScript,
  readMillis,
  typingMillis,
  voteOutcomeScript,
} from './game'
import { Message } from './message'
import {
  Beat,
  Check,
  FeedItem,
  LiveTexts,
  Menu,
  type Model,
  NightCandidate,
  Os,
  Phase,
  Playback,
  Screen,
  Situation,
  Vote,
  Voter,
} from './model'

type UpdateReturn = Update.Return<Model, Message>

const DEFAULT_PLAYER_NAME = 'Riley'

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    os: Os.Ios(),
    screen: Screen.Locked(),
    menu: Menu.Closed(),
    nameInput: DEFAULT_PLAYER_NAME,
    playerName: DEFAULT_PLAYER_NAME,
    messageInput: '',
    isComposerFocused: false,
    maybeViewport: Option.none(),
    caseNumber: 0,
    thief: 'Margot',
    alive: GUEST_NAMES,
    gone: [],
    day: 0,
    phase: Phase.Evening(),
    checks: [],
    wifiLog: [],
    feed: [],
    nextFeedId: 0,
    script: [],
    playback: Playback.Idle(),
    usedLines: [],
    liveTexts: LiveTexts.Untried(),
  },
  commands: [DetectOs()],
})

// HELPERS

export const isBusy = (model: Model): boolean =>
  model.playback._tag !== 'Idle' || Array.isReadonlyArrayNonEmpty(model.script)

export const canChat = (model: Model): boolean =>
  model.phase._tag === 'Evening' || model.phase._tag === 'Day'

const appendFeed = (model: Model, make: (id: number) => FeedItem): Model =>
  modifyFields(model, {
    feed: feed => [...feed, make(model.nextFeedId)],
    nextFeedId: id => id + 1,
  })

const withScroll = (result: UpdateReturn): UpdateReturn => ({
  model: result.model,
  commands: [...(result.commands ?? []), ScrollToLatest()],
})

const hold = (model: Model, millis: number): UpdateReturn => ({
  model: modifyFields(model, { playback: () => Playback.Holding() }),
  commands: [WaitForBeat({ caseNumber: model.caseNumber, millis })],
})

const updatePoll = (
  model: Model,
  feedId: number,
  change: (poll: typeof FeedItem.Poll.Type) => FeedItem,
): Model =>
  modifyFields(model, {
    feed: feed =>
      Array.map(feed, item =>
        item._tag === 'Poll' && item.id === feedId ? change(item) : item,
      ),
  })

const latestPollId = (model: Model): Option.Option<number> =>
  Option.map(
    Array.findLast(model.feed, item => item._tag === 'Poll'),
    item => item.id,
  )

const isStale = (model: Model, caseNumber: number): boolean =>
  caseNumber !== model.caseNumber

const checkFor = (model: Model, name: GuestName): Option.Option<Check> =>
  Array.findLast(model.checks, check => check.name === name)

// PHASES

const enterNight = (model: Model): Model => {
  const withTimestamp = appendFeed(model, id =>
    FeedItem.Timestamp({ id, label: dayName(model.day), time: '11:48 PM' }),
  )
  const withEvent = appendFeed(withTimestamp, id =>
    FeedItem.Event({ id, text: 'Everyone went to bed. The lodge is quiet.' }),
  )
  const withPick = appendFeed(withEvent, id =>
    FeedItem.NightPick({
      id,
      candidates: Array.map(model.alive, name =>
        NightCandidate.make({ name, maybeCheck: checkFor(model, name) }),
      ),
      maybePick: Option.none(),
    }),
  )
  return modifyFields(withPick, {
    phase: () => Phase.Night({ maybePending: Option.none() }),
  })
}

const endingCard = (model: Model, isWin: boolean): Model => {
  const checks = Array.match(model.checks, {
    onEmpty: () => 'You didn’t check anyone this time.',
    onNonEmpty: checks =>
      `Your night checks: ${Array.join(
        Array.map(
          checks,
          check => `${check.name} (${check.isGuilty ? 'guilty' : 'clean'})`,
        ),
        ', ',
      )}.`,
  })
  const withEnding = appendFeed(model, id =>
    FeedItem.Ending({
      id,
      title: isWin ? 'Case closed 🎉' : 'The thief got away',
      body: isWin
        ? `${model.thief} took the brooch, and you caught them on ${dayName(model.day)}. Margot is thrilled.`
        : `It was ${model.thief} all along. By Monday night, nobody was left to back you up.`,
      small: checks,
    }),
  )
  return modifyFields(withEnding, { phase: () => Phase.Over() })
}

const startNewCase = (model: Model): UpdateReturn => {
  const caseNumber = model.caseNumber + 1
  return {
    model: modifyFields(model, {
      caseNumber: () => caseNumber,
      screen: () => Screen.InChat(),
      menu: () => Menu.Closed(),
      phase: () => Phase.Evening(),
      feed: () => [],
      script: () => [],
      playback: () => Playback.Preparing(),
      usedLines: () => [],
    }),
    commands: [DealNewCase({ caseNumber })],
  }
}

// PLAYBACK

const advance = (model: Model): UpdateReturn => {
  if (model.playback._tag !== 'Idle') {
    return { model }
  }
  return Array.match(model.script, {
    onEmpty: () => ({ model }),
    onNonEmpty: ([beat, ...rest]) =>
      playBeat(modifyFields(model, { script: () => rest }), beat),
  })
}

const playBeat = (model: Model, beat: Beat): UpdateReturn =>
  Beat.match(beat, {
    GuestSays: ({ line }) =>
      Array.contains(model.alive, line.from)
        ? withScroll({
            model: modifyFields(model, {
              playback: () => Playback.Typing({ line }),
            }),
            commands: [
              WaitForBeat({
                caseNumber: model.caseNumber,
                millis: typingMillis(line.text),
              }),
            ],
          })
        : advance(model),

    ShowEvent: ({ text, holdMillis }) =>
      withScroll(
        hold(
          appendFeed(model, id => FeedItem.Event({ id, text })),
          holdMillis,
        ),
      ),

    ShowTimestamp: ({ label, time }) =>
      withScroll(
        advance(
          appendFeed(model, id => FeedItem.Timestamp({ id, label, time })),
        ),
      ),

    ShowNotice: ({ isPrivate, title, body, maybeSmall, holdMillis }) => {
      const withNotice = appendFeed(model, id =>
        FeedItem.Notice({ id, isPrivate, title, body, maybeSmall }),
      )
      return withScroll(
        holdMillis > 0 ? hold(withNotice, holdMillis) : advance(withNotice),
      )
    },

    Pause: ({ millis }) => hold(model, millis),

    DepartGuest: ({ name }) =>
      advance(
        modifyFields(model, {
          alive: alive => Array.filter(alive, guest => guest !== name),
          gone: gone => [...gone, name],
        }),
      ),

    AskGuests: ({ situation, count, maybeHint }) =>
      Array.match(model.alive, {
        onEmpty: () => advance(model),
        onNonEmpty: alive => {
          const typist = Option.getOrElse(
            Option.filter(maybeHint, hint => Array.contains(alive, hint)),
            () => alive[model.feed.length % alive.length] ?? alive[0],
          )
          const awaiting = modifyFields(model, {
            playback: () => Playback.AwaitingGuests({ typist, situation }),
          })
          return withScroll({
            model: awaiting,
            commands: [
              model.liveTexts._tag === 'Unavailable'
                ? PickFallbackLines({
                    caseNumber: model.caseNumber,
                    situation,
                    alive: model.alive,
                    playerName: model.playerName,
                    usedLines: model.usedLines,
                  })
                : FetchGuestTexts({
                    caseNumber: model.caseNumber,
                    situation,
                    count,
                    playerName: model.playerName,
                    alive: model.alive,
                    gone: model.gone,
                    thief: model.thief,
                    wifiLog: model.wifiLog,
                    feed: model.feed,
                  }),
            ],
          })
        },
      }),

    RevealVote: ({ vote, holdMillis }) =>
      Option.match(latestPollId(model), {
        onNone: () => advance(model),
        onSome: pollId =>
          hold(
            updatePoll(model, pollId, poll =>
              FeedItem.Poll({ ...poll, votes: [...poll.votes, vote] }),
            ),
            holdMillis,
          ),
      }),

    BeginNight: () => withScroll(advance(enterNight(model))),

    ShowEnding: ({ isWin }) => withScroll(advance(endingCard(model, isWin))),
  })

const playLines = (
  model: Model,
  lines: ReadonlyArray<{ readonly from: GuestName; readonly text: string }>,
): UpdateReturn =>
  advance(
    modifyFields(model, {
      playback: () => Playback.Idle(),
      script: script => [
        ...Array.map(lines, line => Beat.GuestSays({ line })),
        ...script,
      ],
    }),
  )

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedDetectOs: ({ os }) => ({
      model: modifyFields(model, { os: () => os }),
    }),

    ClickedNotification: () => ({
      model: modifyFields(model, { screen: () => Screen.Joining() }),
    }),

    UpdatedNameInput: ({ value }) => ({
      model: modifyFields(model, { nameInput: () => value }),
    }),

    SubmittedJoin: () => {
      const name = model.nameInput.trim()
      return startNewCase(
        modifyFields(model, {
          playerName: current => (String.isEmpty(name) ? current : name),
        }),
      )
    },

    ClickedMenu: () => ({
      model: modifyFields(model, { menu: () => Menu.Open() }),
    }),

    ClickedCloseMenu: () => ({
      model: modifyFields(model, { menu: () => Menu.Closed() }),
    }),

    ClickedNewCase: () => startNewCase(model),

    CompletedDealNewCase: ({ caseNumber, thief, seating }) => {
      if (isStale(model, caseNumber)) {
        return { model }
      }
      return advance(
        modifyFields(model, {
          thief: () => thief,
          alive: () => seating,
          gone: () => [],
          day: () => 0,
          phase: () => Phase.Evening(),
          checks: () => [],
          wifiLog: () => [],
          script: () => introScript(model.playerName),
          playback: () => Playback.Idle(),
        }),
      )
    },

    UpdatedMessageInput: ({ value }) => ({
      model: modifyFields(model, { messageInput: () => value }),
    }),

    SubmittedMessage: () => {
      const text = model.messageInput.trim()
      if (String.isEmpty(text) || isBusy(model) || !canChat(model)) {
        return { model }
      }
      const withText = appendFeed(
        modifyFields(model, {
          messageInput: () => '',
          script: () => [
            Beat.AskGuests({
              situation: Situation.Reply({ text }),
              count: 3,
              maybeHint: mentionedGuest(text, model.alive),
            }),
          ],
        }),
        id => FeedItem.PlayerText({ id, text }),
      )
      return withScroll(advance(withText))
    },

    FocusedComposer: () => ({
      model: modifyFields(model, { isComposerFocused: () => true }),
    }),

    BlurredComposer: () => ({
      model: modifyFields(model, { isComposerFocused: () => false }),
    }),

    ClickedThread: () => ({ model, commands: [BlurComposer()] }),

    CompletedBlurComposer: () => ({ model }),

    CompletedScrollToLatest: () => ({ model }),

    ChangedViewport: ({ height, offsetTop }) => ({
      model: modifyFields(model, {
        maybeViewport: () => Option.some({ height, offsetTop }),
      }),
      commands: [ScrollToLatest()],
    }),

    ClickedGoToBed: () =>
      model.phase._tag === 'Evening' && !isBusy(model)
        ? withScroll({ model: enterNight(model) })
        : { model },

    ClickedNightCandidate: ({ feedId, name }) =>
      Match.value(model.phase).pipe(
        Match.withReturnType<UpdateReturn>(),
        Match.tag('Night', ({ maybePending }) =>
          Option.isNone(maybePending) && Array.contains(model.alive, name)
            ? {
                model: modifyFields(model, {
                  phase: () => Phase.Night({ maybePending: Option.some(name) }),
                  feed: feed =>
                    Array.map(feed, item =>
                      item._tag === 'NightPick' && item.id === feedId
                        ? FeedItem.NightPick({
                            ...item,
                            maybePick: Option.some(name),
                          })
                        : item,
                    ),
                }),
              }
            : { model },
        ),
        Match.orElse(() => ({ model })),
      ),

    ClickedSkipToMorning: () =>
      model.phase._tag === 'Night' &&
      Option.isSome(model.phase.maybePending) &&
      !isBusy(model)
        ? {
            model: modifyFields(model, {
              playback: () => Playback.Preparing(),
            }),
            commands: [
              RollMorning({
                caseNumber: model.caseNumber,
                day: model.day + 1,
                alive: model.alive,
                thief: model.thief,
              }),
            ],
          }
        : { model },

    CompletedRollMorning: ({ caseNumber, maybeVictim, wifiLog, minute }) => {
      if (isStale(model, caseNumber) || model.phase._tag !== 'Night') {
        return { model }
      }
      const maybePending = model.phase.maybePending
      const day = model.day + 1
      return advance(
        modifyFields(model, {
          day: () => day,
          phase: () => Phase.Day(),
          wifiLog: () => wifiLog,
          checks: checks => [
            ...checks,
            ...Option.toArray(
              Option.map(maybePending, name =>
                Check.make({ name, isGuilty: name === model.thief }),
              ),
            ),
          ],
          playback: () => Playback.Idle(),
          script: () =>
            morningScript({
              day,
              minute,
              maybeVictim,
              maybePending,
              thief: model.thief,
              wifiLog,
            }),
        }),
      )
    },

    ClickedCallVote: () =>
      model.phase._tag === 'Day' && !isBusy(model)
        ? withScroll({
            model: modifyFields(
              appendFeed(model, id =>
                FeedItem.Poll({
                  id,
                  candidates: model.alive,
                  votes: [],
                  maybeChoice: Option.none(),
                }),
              ),
              { phase: () => Phase.Vote() },
            ),
          })
        : { model },

    ClickedPollOption: ({ feedId, name }) => {
      const isOpenPoll = Option.contains(latestPollId(model), feedId)
      if (model.phase._tag !== 'Vote' || !isOpenPoll || isBusy(model)) {
        return { model }
      }
      return {
        model: modifyFields(
          updatePoll(model, feedId, poll =>
            FeedItem.Poll({
              ...poll,
              maybeChoice: Option.some(name),
              votes: [
                ...poll.votes,
                Vote.make({ voter: Voter.Player(), choice: name }),
              ],
            }),
          ),
          { playback: () => Playback.Preparing() },
        ),
        commands: [
          CastGuestVotes({
            caseNumber: model.caseNumber,
            choice: name,
            thief: model.thief,
            alive: model.alive,
            wifiLog: model.wifiLog,
            playerName: model.playerName,
            usedLines: model.usedLines,
            isFinalVote: model.day >= FINAL_DAY,
          }),
        ],
      }
    },

    CompletedCastGuestVotes: ({
      caseNumber,
      votes,
      turnedIn,
      maybeReaction,
      usedLines,
    }) => {
      if (isStale(model, caseNumber)) {
        return { model }
      }
      return advance(
        modifyFields(model, {
          usedLines: () => usedLines,
          playback: () => Playback.Idle(),
          script: () =>
            voteOutcomeScript({
              votes,
              turnedIn,
              thief: model.thief,
              aliveAfter: Array.filter(model.alive, name => name !== turnedIn),
              maybeReaction,
              isFinalVote: model.day >= FINAL_DAY,
            }),
        }),
      )
    },

    CompletedWaitForBeat: ({ caseNumber }) => {
      if (isStale(model, caseNumber)) {
        return { model }
      }
      return Playback.match(model.playback, {
        Typing: ({ line }) =>
          withScroll(
            hold(
              appendFeed(model, id =>
                FeedItem.GuestText({ id, from: line.from, text: line.text }),
              ),
              readMillis(line.text),
            ),
          ),
        Holding: () =>
          advance(modifyFields(model, { playback: () => Playback.Idle() })),
        Idle: () => ({ model }),
        Preparing: () => ({ model }),
        AwaitingGuests: () => ({ model }),
      })
    },

    SucceededFetchGuestTexts: ({ caseNumber, lines }) =>
      isStale(model, caseNumber) || model.playback._tag !== 'AwaitingGuests'
        ? { model }
        : playLines(
            modifyFields(model, { liveTexts: () => LiveTexts.Available() }),
            lines,
          ),

    FailedFetchGuestTexts: ({ caseNumber, isUnavailable }) => {
      if (
        isStale(model, caseNumber) ||
        model.playback._tag !== 'AwaitingGuests'
      ) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          liveTexts: liveTexts =>
            isUnavailable ? LiveTexts.Unavailable() : liveTexts,
        }),
        commands: [
          PickFallbackLines({
            caseNumber: model.caseNumber,
            situation: model.playback.situation,
            alive: model.alive,
            playerName: model.playerName,
            usedLines: model.usedLines,
          }),
        ],
      }
    },

    CompletedPickFallbackLines: ({ caseNumber, lines, usedLines }) =>
      isStale(model, caseNumber) || model.playback._tag !== 'AwaitingGuests'
        ? { model }
        : playLines(modifyFields(model, { usedLines: () => usedLines }), lines),
  })

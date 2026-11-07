import { Array, Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import {
  CastGuestVotes,
  DealNewCase,
  FetchGuestTexts,
  PickFallbackLines,
  RollMorning,
  ScrollToLatest,
  WaitForBeat,
} from './command'
import { eveningModel, lockedModel, votingModel } from './fixture'
import { Message } from './message'
import { FeedItem, Line, Vote, Voter } from './model'
import { update } from './update'

const playOut = (caseNumber: number) =>
  Command.resolveAll(
    ...Array.makeBy(
      60,
      () =>
        [WaitForBeat, Message.CompletedWaitForBeat({ caseNumber })] as const,
    ),
    ...Array.makeBy(
      60,
      () => [ScrollToLatest, Message.CompletedScrollToLatest()] as const,
    ),
  )

const titles = (feed: ReadonlyArray<FeedItem>) =>
  Array.flatMap(feed, item =>
    item._tag === 'Notice' || item._tag === 'Ending' ? [item.title] : [],
  )

describe('joining', () => {
  test('joining deals a new case and plays the intro', () => {
    story(
      update,
      given(lockedModel),
      message(Message.ClickedNotification()),
      message(Message.UpdatedNameInput({ value: '  Jon ' })),
      message(Message.SubmittedJoin()),
      model(model => {
        expect(model.screen._tag).toBe('InChat')
        expect(model.playerName).toBe('Jon')
        expect(model.playback._tag).toBe('Preparing')
      }),
      Command.resolve(
        DealNewCase,
        Message.CompletedDealNewCase({
          caseNumber: 1,
          thief: 'Gus',
          seating: ['Wes', 'Gus', 'Margot', 'Theo', 'Lena', 'Priya'],
        }),
      ),
      model(model => {
        expect(model.thief).toBe('Gus')
        expect(model.alive[0]).toBe('Wes')
        expect(model.playback._tag).toBe('Typing')
      }),
      playOut(1),
      model(model => {
        expect(model.playback._tag).toBe('Idle')
        expect(model.script).toHaveLength(0)
        expect(titles(model.feed)).toEqual(['You’re the detective'])
        expect(
          Array.some(
            model.feed,
            item =>
              item._tag === 'GuestText' &&
              item.text === 'Jon, you got in late, did you see anything? 🙏',
          ),
        ).toBe(true)
      }),
    )
  })

  test('a blank name keeps the default', () => {
    story(
      update,
      given(lockedModel),
      message(Message.UpdatedNameInput({ value: '   ' })),
      message(Message.SubmittedJoin()),
      model(model => {
        expect(model.playerName).toBe('Riley')
      }),
      Command.resolve(
        DealNewCase,
        Message.CompletedDealNewCase({
          caseNumber: 1,
          thief: 'Gus',
          seating: ['Wes', 'Gus', 'Margot', 'Theo', 'Lena', 'Priya'],
        }),
      ),
      playOut(1),
    )
  })
})

describe('playback', () => {
  test('a timer from an earlier case is ignored', () => {
    story(
      update,
      given({ ...eveningModel, caseNumber: 2 }),
      message(Message.CompletedWaitForBeat({ caseNumber: 1 })),
      Command.expectNone(),
      model(model => {
        expect(model.feed).toEqual(eveningModel.feed)
      }),
    )
  })

  test('the player cannot text while guests are mid-conversation', () => {
    story(
      update,
      given({
        ...eveningModel,
        playback: { _tag: 'Holding' },
        messageInput: 'hello',
      }),
      message(Message.SubmittedMessage()),
      Command.expectNone(),
      model(model => {
        expect(model.messageInput).toBe('hello')
      }),
    )
  })
})

describe('nights and mornings', () => {
  test('looking into the thief reveals them, and texts fall back to built-in lines when Claude is off', () => {
    story(
      update,
      given(eveningModel),
      message(Message.ClickedGoToBed()),
      Command.resolve(ScrollToLatest, Message.CompletedScrollToLatest()),
      model(model => {
        expect(model.phase._tag).toBe('Night')
      }),
      message(Message.ClickedNightCandidate({ feedId: 3, name: 'Lena' })),
      model(model => {
        expect(model.phase).toEqual({
          _tag: 'Night',
          maybePending: Option.some('Lena'),
        })
      }),
      message(Message.ClickedSkipToMorning()),
      Command.resolve(
        RollMorning,
        Message.CompletedRollMorning({
          caseNumber: 1,
          maybeVictim: Option.none(),
          wifiLog: ['Lena', 'Wes'],
          minute: 45,
        }),
      ),
      model(model => {
        expect(model.day).toBe(1)
        expect(model.phase._tag).toBe('Day')
        expect(model.checks).toEqual([{ name: 'Lena', isGuilty: true }])
      }),
      Command.resolveAll(
        ...Array.makeBy(
          30,
          () =>
            [
              WaitForBeat,
              Message.CompletedWaitForBeat({ caseNumber: 1 }),
            ] as const,
        ),
        ...Array.makeBy(
          30,
          () => [ScrollToLatest, Message.CompletedScrollToLatest()] as const,
        ),
        [
          FetchGuestTexts,
          Message.FailedFetchGuestTexts({ caseNumber: 1, isUnavailable: true }),
        ],
        [
          PickFallbackLines,
          Message.CompletedPickFallbackLines({
            caseNumber: 1,
            lines: [Line.make({ from: 'Wes', text: 'Sorry, I was asleep.' })],
            usedLines: ['Sorry, I was asleep.'],
          }),
        ],
      ),
      model(model => {
        expect(model.liveTexts._tag).toBe('Unavailable')
        expect(model.usedLines).toEqual(['Sorry, I was asleep.'])
        expect(titles(model.feed)).toContain('Lena has the brooch.')
        expect(Array.last(model.feed)).toEqual(
          Option.some(
            FeedItem.GuestText({
              id: model.nextFeedId - 1,
              from: 'Wes',
              text: 'Sorry, I was asleep.',
            }),
          ),
        )
        expect(model.playback._tag).toBe('Idle')
      }),
    )
  })

  test('a phone stolen overnight removes that guest from the chat', () => {
    story(
      update,
      given({
        ...eveningModel,
        day: 1,
        phase: { _tag: 'Night', maybePending: Option.some('Gus') },
        liveTexts: { _tag: 'Unavailable' },
      }),
      message(Message.ClickedSkipToMorning()),
      Command.resolve(
        RollMorning,
        Message.CompletedRollMorning({
          caseNumber: 1,
          maybeVictim: Option.some('Theo'),
          wifiLog: ['Wes', 'Lena'],
          minute: 50,
        }),
      ),
      Command.resolveAll(
        ...Array.makeBy(
          30,
          () =>
            [
              WaitForBeat,
              Message.CompletedWaitForBeat({ caseNumber: 1 }),
            ] as const,
        ),
        ...Array.makeBy(
          30,
          () => [ScrollToLatest, Message.CompletedScrollToLatest()] as const,
        ),
        [
          PickFallbackLines,
          Message.CompletedPickFallbackLines({
            caseNumber: 1,
            lines: [],
            usedLines: [],
          }),
        ],
      ),
      model(model => {
        expect(model.day).toBe(2)
        expect(model.alive).not.toContain('Theo')
        expect(model.gone).toEqual(['Theo'])
        expect(titles(model.feed)).toContain('Gus is clean.')
      }),
    )
  })
})

describe('voting', () => {
  const guestVote = (
    voter: 'Lena' | 'Wes' | 'Gus',
    choice: 'Lena' | 'Wes' | 'Gus',
  ) => Vote.make({ voter: Voter.Guest({ name: voter }), choice })

  test('turning in the thief closes the case', () => {
    story(
      update,
      given(votingModel(1)),
      message(Message.ClickedPollOption({ feedId: 0, name: 'Lena' })),
      model(model => {
        expect(model.playback._tag).toBe('Preparing')
      }),
      Command.resolve(
        CastGuestVotes,
        Message.CompletedCastGuestVotes({
          caseNumber: 1,
          votes: [
            guestVote('Wes', 'Lena'),
            guestVote('Gus', 'Lena'),
            guestVote('Lena', 'Wes'),
          ],
          turnedIn: 'Lena',
          maybeReaction: Option.none(),
          usedLines: [],
        }),
      ),
      playOut(1),
      model(model => {
        expect(model.phase._tag).toBe('Over')
        expect(titles(model.feed)).toEqual(['Case closed 🎉'])
        const poll = Array.findFirst(model.feed, item => item._tag === 'Poll')
        expect(
          Option.map(poll, item =>
            item._tag === 'Poll' ? item.votes.length : 0,
          ),
        ).toEqual(Option.some(4))
      }),
    )
  })

  test('a wrong vote before Monday leads to another night', () => {
    story(
      update,
      given(votingModel(1)),
      message(Message.ClickedPollOption({ feedId: 0, name: 'Wes' })),
      Command.resolve(
        CastGuestVotes,
        Message.CompletedCastGuestVotes({
          caseNumber: 1,
          votes: [guestVote('Lena', 'Wes'), guestVote('Gus', 'Wes')],
          turnedIn: 'Wes',
          maybeReaction: Option.some(Line.make({ from: 'Gus', text: 'Hm.' })),
          usedLines: ['Hm.'],
        }),
      ),
      playOut(1),
      model(model => {
        expect(model.phase._tag).toBe('Night')
        expect(model.alive).toEqual(['Lena', 'Gus'])
      }),
    )
  })

  test('a wrong vote on Monday lets the thief get away', () => {
    story(
      update,
      given(votingModel(3)),
      message(Message.ClickedPollOption({ feedId: 0, name: 'Wes' })),
      Command.resolve(
        CastGuestVotes,
        Message.CompletedCastGuestVotes({
          caseNumber: 1,
          votes: [guestVote('Lena', 'Wes'), guestVote('Gus', 'Wes')],
          turnedIn: 'Wes',
          maybeReaction: Option.none(),
          usedLines: [],
        }),
      ),
      playOut(1),
      model(model => {
        expect(model.phase._tag).toBe('Over')
        expect(titles(model.feed)).toEqual(['The thief got away'])
      }),
    )
  })
})

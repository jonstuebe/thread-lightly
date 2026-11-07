import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { type GuestName, guestOf } from '../cast'
import { THREAD_END_ID } from '../command'
import { Message } from '../message'
import { FeedItem, type Model, type NightCandidate, Voter } from '../model'
import { isBusy } from '../update'
import * as Icon from './icon'

// AVATAR

export const avatar = (
  name: GuestName,
  h: HtmlBuilder<Message>,
  className = '',
): Html =>
  h.span(
    [
      h.Class(`avatar ${className}`),
      h.Style({ background: guestOf(name).color }),
      h.AriaHidden(true),
    ],
    [name.slice(0, 1)],
  )

// BUBBLES

const PLAYER = '~you'

const speakerOf = (item: FeedItem): Option.Option<string> =>
  FeedItem.match(item, {
    GuestText: ({ from }) => Option.some(from),
    PlayerText: () => Option.some(PLAYER),
    Timestamp: () => Option.none(),
    Event: () => Option.none(),
    Notice: () => Option.none(),
    NightPick: () => Option.none(),
    Poll: () => Option.none(),
    Ending: () => Option.none(),
  })

const sameSpeaker = (
  maybeItem: Option.Option<FeedItem>,
  speaker: string,
): boolean =>
  Option.exists(
    Option.flatMap(maybeItem, speakerOf),
    other => other === speaker,
  )

type Grouping = Readonly<{ isFirst: boolean; isLast: boolean }>

const rowClass = (direction: 'in' | 'out', grouping: Grouping): string =>
  [
    'row',
    direction,
    grouping.isFirst ? 'first' : '',
    grouping.isLast ? 'last' : '',
  ].join(' ')

const guestBubble = (
  id: number,
  from: GuestName,
  text: string,
  grouping: Grouping,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    `feed-${id}`,
    [h.Class(rowClass('in', grouping))],
    [
      avatar(from, h),
      h.div(
        [h.Class('col')],
        [h.div([h.Class('name')], [from]), h.div([h.Class('bubble')], [text])],
      ),
    ],
  )

const playerBubble = (
  id: number,
  text: string,
  grouping: Grouping,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    `feed-${id}`,
    [h.Class(rowClass('out', grouping))],
    [h.div([h.Class('col')], [h.div([h.Class('bubble')], [text])])],
  )

const typingRow = (from: GuestName, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    'typing',
    [h.Class('row in first last typing')],
    [
      avatar(from, h),
      h.div(
        [h.Class('col')],
        [
          h.div([h.Class('name')], [from]),
          h.div(
            [h.Class('bubble'), h.AriaLabel(`${from} is typing`)],
            [h.span([h.Class('dots')], [h.i([]), h.i([]), h.i([])])],
          ),
        ],
      ),
    ],
  )

// CARDS

const privateTag = (h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('tag')], [Icon.lock(), h.span([], ['Only you can see this'])])

const cardShell = (
  id: number,
  isPrivate: boolean,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    `feed-${id}`,
    [h.Class(isPrivate ? 'card private' : 'card')],
    children,
  )

const cardText = (
  title: string,
  body: string,
  maybeSmall: Option.Option<string>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.h3([], [title]),
  h.p([h.Class('b')], [body]),
  Option.match(maybeSmall, {
    onNone: () => h.empty,
    onSome: small => h.p([h.Class('small')], [small]),
  }),
]

const nightNote = (candidate: NightCandidate, h: HtmlBuilder<Message>): Html =>
  Option.match(candidate.maybeCheck, {
    onNone: () => h.empty,
    onSome: check =>
      h.span(
        [h.Class('note')],
        [check.isGuilty ? 'checked: has the brooch' : 'checked: clean'],
      ),
  })

const nightPickCard = (
  item: typeof FeedItem.NightPick.Type,
  h: HtmlBuilder<Message>,
): Html =>
  cardShell(
    item.id,
    true,
    [
      privateTag(h),
      ...cardText(
        'Who do you want to look into tonight?',
        Option.match(item.maybePick, {
          onNone: () => 'You’ll find out what you learned in the morning.',
          onSome: name =>
            `You’re looking into ${name} tonight. Tap “Skip to morning” when you’re ready.`,
        }),
        Option.none(),
        h,
      ),
      h.div(
        [h.Class('opts')],
        Array.map(item.candidates, candidate =>
          h.keyed('button')(
            candidate.name,
            [
              h.Type('button'),
              h.Class(
                Option.contains(item.maybePick, candidate.name)
                  ? 'opt sel'
                  : 'opt',
              ),
              h.Disabled(Option.isSome(item.maybePick)),
              h.OnClick(
                Message.ClickedNightCandidate({
                  feedId: item.id,
                  name: candidate.name,
                }),
              ),
            ],
            [
              avatar(candidate.name, h),
              h.span([h.Class('on')], [candidate.name]),
              nightNote(candidate, h),
            ],
          ),
        ),
      ),
    ],
    h,
  )

const voterChip = (
  voter: Voter,
  playerName: string,
  h: HtmlBuilder<Message>,
): Html =>
  Voter.match(voter, {
    Player: () => h.i([h.Class('you')], [playerName.slice(0, 1) || 'Y']),
    Guest: ({ name }) =>
      h.i([h.Style({ background: guestOf(name).color })], [name.slice(0, 1)]),
  })

const pollCard = (
  item: typeof FeedItem.Poll.Type,
  model: Model,
  h: HtmlBuilder<Message>,
): Html => {
  const total = Math.max(1, item.votes.length)
  const isClosed = Option.isSome(item.maybeChoice) || isBusy(model)
  return cardShell(
    item.id,
    false,
    [
      h.div([h.Class('tag')], ['📊 ', h.span([], ['Poll'])]),
      ...cardText(
        'Who should we turn in to the lodge manager?',
        Option.match(item.maybeChoice, {
          onNone: () => 'Tap to vote. Everyone else votes after you.',
          onSome: name => `You voted for ${name}.`,
        }),
        Option.none(),
        h,
      ),
      h.div(
        [h.Class('opts')],
        Array.map(item.candidates, name => {
          const votes = Array.filter(item.votes, vote => vote.choice === name)
          return h.keyed('button')(
            name,
            [
              h.Type('button'),
              h.Class(
                Option.contains(item.maybeChoice, name) ? 'opt sel' : 'opt',
              ),
              h.Disabled(isClosed),
              h.AriaLabel(`${name}, ${votes.length} votes`),
              h.OnClick(Message.ClickedPollOption({ feedId: item.id, name })),
            ],
            [
              h.span([
                h.Class('fill'),
                h.Style({ width: `${(votes.length / total) * 100}%` }),
              ]),
              avatar(name, h),
              h.span([h.Class('on')], [name]),
              h.span(
                [h.Class('voters')],
                Array.map(votes, vote =>
                  voterChip(vote.voter, model.playerName, h),
                ),
              ),
              h.span([h.Class('cnt')], [`${votes.length}`]),
            ],
          )
        }),
      ),
    ],
    h,
  )
}

const endingCard = (
  item: typeof FeedItem.Ending.Type,
  h: HtmlBuilder<Message>,
): Html =>
  cardShell(
    item.id,
    false,
    [
      ...cardText(item.title, item.body, Option.some(item.small), h),
      h.div(
        [h.Class('actions')],
        [
          h.button(
            [
              h.Type('button'),
              h.Class('btn'),
              h.OnClick(Message.ClickedNewCase()),
            ],
            ['Play again'],
          ),
        ],
      ),
    ],
    h,
  )

// FEED

const feedItemView = (
  item: FeedItem,
  index: number,
  model: Model,
  h: HtmlBuilder<Message>,
): Html => {
  const grouping = (speaker: string): Grouping => ({
    isFirst: !sameSpeaker(Array.get(model.feed, index - 1), speaker),
    isLast: !sameSpeaker(Array.get(model.feed, index + 1), speaker),
  })
  return FeedItem.match(item, {
    GuestText: ({ id, from, text }) =>
      guestBubble(id, from, text, grouping(from), h),
    PlayerText: ({ id, text }) => playerBubble(id, text, grouping(PLAYER), h),
    Timestamp: ({ id, label, time }) =>
      h.keyed('div')(
        `feed-${id}`,
        [h.Class('sys')],
        [h.b([], [label]), ` ${time}`],
      ),
    Event: ({ id, text }) =>
      h.keyed('div')(`feed-${id}`, [h.Class('event')], [text]),
    Notice: ({ id, isPrivate, title, body, maybeSmall }) =>
      cardShell(
        id,
        isPrivate,
        [
          isPrivate ? privateTag(h) : h.empty,
          ...cardText(title, body, maybeSmall, h),
        ],
        h,
      ),
    NightPick: nightPick => nightPickCard(nightPick, h),
    Poll: poll => pollCard(poll, model, h),
    Ending: ending => endingCard(ending, h),
  })
}

export const threadView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.main(
    [
      h.Class('thread'),
      h.AriaLive('polite'),
      h.OnClick(Message.ClickedThread()),
    ],
    [
      ...Array.map(model.feed, (item, index) =>
        feedItemView(item, index, model, h),
      ),
      model.playback._tag === 'Typing'
        ? typingRow(model.playback.line.from, h)
        : model.playback._tag === 'AwaitingGuests'
          ? typingRow(model.playback.typist, h)
          : h.empty,
      h.keyed('div')('end', [h.Id(THREAD_END_ID), h.Class('thread-end')]),
    ],
  )

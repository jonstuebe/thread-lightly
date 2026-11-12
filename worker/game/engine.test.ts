import { Option, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { Case, type GuestId } from '../../shared/case'
import tinyCase from '../../shared/fixtures/tiny-case.json'
import {
  type ChatMessage,
  type ClientMessage,
  type Menu,
  type ServerMessage,
  ServerMessageJson,
  type Thread,
} from '../../shared/protocol'
import { CASES, pickCase } from '../cases'
import {
  BEDTIME_TEXT,
  MIN_ACTION_INTERVAL_MS,
  PRESS_TEXT,
  type Step,
  handle,
  snapshot,
  startGame,
} from './engine'
import { GameState } from './state'

const tiny = Schema.decodeUnknownSync(Case)(tinyCase)

const withChanges = (changes: Partial<Case>): Case => ({ ...tiny, ...changes })

// NOTE: room to act more than once per part.
const roomy = withChanges({ budget: { morning: 4, afternoon: 4, evening: 3 } })

// HARNESS

type Game = Readonly<{
  caseData: Case
  state: GameState
  last: Step
  now: number
}>

const start = (caseData: Case = tiny): Game => {
  const state = startGame(caseData)
  return { caseData, state, last: { state, out: [] }, now: 10_000 }
}

const send = (game: Game, message: ClientMessage, gap = 1_000): Game => {
  const now = game.now + gap
  const last = handle(game.caseData, game.state, message, now)
  return { ...game, state: last.state, last, now }
}

const sendAll = (game: Game, messages: ReadonlyArray<ClientMessage>): Game =>
  messages.reduce(send, game)

const dm = (guest: GuestId): Thread => ({ _tag: 'Direct', guest })
const GROUP: Thread = { _tag: 'Group' }

const viewOf = (game: Game) => {
  const view = snapshot(game.caseData, game.state)
  if (view._tag !== 'Snapshot') {
    throw new Error('expected a snapshot')
  }
  return view
}

const menuOf = (game: Game, thread: Thread): Menu => {
  const menu = viewOf(game).menus.find(
    candidate => JSON.stringify(candidate.thread) === JSON.stringify(thread),
  )
  if (menu === undefined) {
    throw new Error('no such menu')
  }
  return menu
}

const chipFor = (game: Game, thread: Thread, ask: string): string => {
  const chip = menuOf(game, thread).chips.find(c => c.text === ask)
  if (chip === undefined) {
    throw new Error(`no chip "${ask}"`)
  }
  return chip.id
}

// NOTE: chips keep the case's authored order; new ones aren't moved first.
const isInCaseOrder = (game: Game, guest: GuestId, menu: Menu): boolean => {
  const authored =
    game.caseData.guests
      .find(candidate => candidate.id === guest)
      ?.questions.map(question => question.ask) ?? []
  const positions = menu.chips.map(chip => authored.indexOf(chip.text))
  return positions.every(
    (position, index) =>
      position >= 0 && (index === 0 || position > positions[index - 1]!),
  )
}

const ask = (game: Game, guest: GuestId, text: string): Game =>
  send(game, {
    _tag: 'AskQuestion',
    thread: dm(guest),
    chipId: chipFor(game, dm(guest), text),
  })

const posted = (step: Step): ReadonlyArray<ChatMessage> =>
  step.out.flatMap(message =>
    message._tag === 'MessagePosted' ? [message.message] : [],
  )

const textOf = (message: ChatMessage): string =>
  message.body._tag === 'Text' ? message.body.text : ''

const tagsOf = (step: Step): ReadonlyArray<string> =>
  step.out.map(message => message._tag)

const rejection = (step: Step) => {
  const [only] = step.out
  return step.out.length === 1 && only?._tag === 'Rejected'
    ? only.reason
    : undefined
}

const messageWithText = (game: Game, text: string): ChatMessage => {
  const found = game.state.messages.find(
    stored => textOf(stored.message) === text,
  )
  if (found === undefined) {
    throw new Error(`no message "${text}"`)
  }
  return found.message
}

const wifiMessage = (game: Game, guest: GuestId, time: string): ChatMessage => {
  const found = game.state.messages.find(
    ({ message }) =>
      message.body._tag === 'WifiEntry' &&
      message.body.guest === guest &&
      message.body.time === time,
  )
  if (found === undefined) {
    throw new Error(`no Wi-Fi entry for ${guest} at ${time}`)
  }
  return found.message
}

const save = (game: Game, message: ChatMessage): Game =>
  send(game, { _tag: 'SaveToCaseFile', messageId: message.id })

const statusChanges = (step: Step) =>
  step.out.flatMap(message =>
    message._tag === 'GuestStatusChanged'
      ? [{ guest: message.guest, status: message.status._tag }]
      : [],
  )

const clockOf = (game: Game) => viewOf(game).clock

const NIGHT0 = 'Where were you the night the ribbon went missing?'

// NOTE: day 2 morning of the tiny case, with nothing asked.
const toDay = (game: Game, day: 2 | 3): Game =>
  day === 2
    ? send(game, { _tag: 'GoToSleep' })
    : send(send(game, { _tag: 'GoToSleep' }), { _tag: 'GoToSleep' })

// START

describe('a new game', () => {
  test('opens on day 1 morning with the Wi-Fi log and the morning beat', () => {
    const game = start()
    expect(clockOf(game)).toEqual({
      day: 1,
      part: 'morning',
      phase: 'asking',
      ticksLeft: 1,
      partBudget: 1,
    })
    const messages = viewOf(game).messages
    expect(messages.map(m => m.thread._tag)).toEqual([
      'WifiLog',
      'WifiLog',
      'Group',
    ])
    expect(messages[0]?.body).toEqual({
      _tag: 'WifiEntry',
      time: '11:30pm',
      guest: 'max',
      event: 'joined',
      accessPoint: 'lounge',
    })
    expect(textOf(messages[2]!)).toBe(
      "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
    )
    expect(messages.every(m => m.role._tag === 'Plain')).toBe(true)
  })

  test('offers each thread its open, unlocked questions, none of them new', () => {
    const game = start()
    const bea = menuOf(game, dm('bea'))
    expect(bea.chips.map(c => c.text)).toEqual([
      NIGHT0,
      'Did you see the ribbon at dinner?',
      'What do you make of Theo?',
      'What do you make of June?',
      'What do you make of Max?',
    ])
    expect(bea.chips.every(c => !c.isNew)).toBe(true)
    // NOTE: locked behind a Seen, a Caught and a day-3 window.
    expect(menuOf(game, dm('max')).chips.map(c => c.text)).not.toContain(
      'June says she slept right through. True?',
    )
    expect(menuOf(game, dm('theo')).chips.map(c => c.text)).not.toContain(
      'Did you see Bea go out that night?',
    )
    expect(menuOf(game, dm('june')).chips.map(c => c.text)).not.toContain(
      'Did you notice Bea that night?',
    )
    expect(menuOf(game, GROUP).chips).toEqual([])
  })

  test('chip IDs are opaque', () => {
    const game = start()
    const ids = viewOf(game).menus.flatMap(menu => menu.chips.map(c => c.id))
    expect(ids.every(id => /^c\d+$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ASKING

describe('asking', () => {
  test('posts the question, a typing bubble and the answer, and spends a tick', () => {
    const game = ask(start(roomy), 'bea', NIGHT0)
    const [question, answer] = posted(game.last)
    expect(question?.sender).toEqual({ _tag: 'Detective' })
    expect(textOf(question!)).toBe(NIGHT0)
    expect(answer?.sender).toEqual({ _tag: 'Guest', guest: 'bea' })
    expect(textOf(answer!)).toBe(
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    expect(answer?.role._tag).toBe('Answer')
    expect(tagsOf(game.last)).toEqual([
      'MessagePosted',
      'Typing',
      'MessagePosted',
      'MenuChanged',
      'ClockChanged',
    ])
    expect(clockOf(game).ticksLeft).toBe(3)
  })

  test('a question is gone once asked', () => {
    const before = start(roomy)
    const chip = chipFor(before, dm('bea'), NIGHT0)
    const after = ask(before, 'bea', NIGHT0)
    expect(menuOf(after, dm('bea')).chips.map(c => c.id)).not.toContain(chip)
    const again = send(after, {
      _tag: 'AskQuestion',
      thread: dm('bea'),
      chipId: chip,
    })
    expect(rejection(again.last)).toBe('unknownQuestion')
  })

  test('every bubble of a multi-bubble answer shares one answer ID', () => {
    const caseData = withChanges({
      budget: roomy.budget,
      guests: tiny.guests.map(guest =>
        guest.id !== 'bea'
          ? guest
          : {
              ...guest,
              questions: guest.questions.map(question =>
                question.id !== 'bea-theo'
                  ? question
                  : {
                      ...question,
                      answer: {
                        ...question.answer,
                        lines: [
                          { text: 'theo is sweet', factIds: [] },
                          { text: 'eats a lot tho', factIds: [] },
                        ],
                      },
                    },
              ),
            },
      ),
    })
    const game = ask(start(caseData), 'bea', 'What do you make of Theo?')
    const replies = posted(game.last).filter(m => m.sender._tag === 'Guest')
    expect(replies).toHaveLength(2)
    expect(replies[0]?.role).toEqual(replies[1]?.role)
    expect(tagsOf(game.last).filter(tag => tag === 'Typing')).toHaveLength(1)
  })
})

// UNLOCKING

describe('unlocking', () => {
  test('a seen fact unlocks a question in another thread, marked new in its authored place', () => {
    const game = ask(
      start(roomy),
      'june',
      'Did you hear anything the night the ribbon went missing?',
    )
    const max = menuOf(game, dm('max'))
    expect(max.chips.map(c => [c.text, c.isNew])).toEqual([
      [NIGHT0, false],
      ['June says she slept right through. True?', true],
      ['Did you see the ribbon at dinner?', false],
      ['What do you make of Bea?', false],
      ['What do you make of Theo?', false],
    ])
    const changed = game.last.out.flatMap(m =>
      m._tag === 'MenuChanged' ? [m.menu.thread] : [],
    )
    expect(changed).toContainEqual(dm('max'))
  })

  test('a chip stops being new once the detective asks in that thread', () => {
    const unlocked = ask(
      start(roomy),
      'june',
      'Did you hear anything the night the ribbon went missing?',
    )
    const asked = ask(unlocked, 'max', 'What do you make of Bea?')
    expect(
      menuOf(asked, dm('max')).chips.find(c => c.text.startsWith('June says'))
        ?.isNew,
    ).toBe(false)
  })

  test('a caught lie unlocks a question', () => {
    const game = catchBea(start(roomy))
    const theo = menuOf(game, dm('theo'))
    expect(theo.chips.find(c => c.isNew)?.text).toBe(
      'Did you see Bea go out that night?',
    )
    expect(isInCaseOrder(game, 'theo', theo)).toBe(true)
  })

  test('an asked question unlocks a follow-up', () => {
    const caseData = withChanges({
      budget: roomy.budget,
      guests: tiny.guests.map(guest =>
        guest.id !== 'bea'
          ? guest
          : {
              ...guest,
              questions: guest.questions.map(question =>
                question.id !== 'bea-max'
                  ? question
                  : {
                      ...question,
                      unlock: [
                        { _tag: 'Asked' as const, question: 'bea-june' },
                      ],
                    },
              ),
            },
      ),
    })
    const game = start(caseData)
    const texts = (g: Game) => menuOf(g, dm('bea')).chips.map(c => c.text)
    expect(texts(game)).not.toContain('What do you make of Max?')
    expect(texts(ask(game, 'bea', 'What do you make of June?'))).toContain(
      'What do you make of Max?',
    )
  })

  test('a question unlocked after a night appears on its day', () => {
    const day2 = toDay(start(), 2)
    expect(menuOf(day2, dm('june')).chips.map(c => c.text)).not.toContain(
      'Did you notice Bea that night?',
    )
    const day3 = send(day2, { _tag: 'GoToSleep' })
    const june = menuOf(day3, dm('june'))
    expect(june.chips.find(c => c.isNew)?.text).toBe(
      'Did you notice Bea that night?',
    )
    expect(isInCaseOrder(day3, 'june', june)).toBe(true)
  })
})

// TIME

describe('parts and days', () => {
  test('running out of ticks starts the next part in the same step', () => {
    const game = ask(start(), 'theo', 'What do you make of June?')
    expect(clockOf(game)).toEqual({
      day: 1,
      part: 'afternoon',
      phase: 'asking',
      ticksLeft: 1,
      partBudget: 1,
    })
    // NOTE: Bea's away schedule starts with the afternoon.
    expect(statusChanges(game.last)).toEqual([{ guest: 'bea', status: 'Away' }])
    const clocks = game.last.out.filter(m => m._tag === 'ClockChanged')
    expect(clocks).toHaveLength(2)
  })

  test('skipping a part loses its ticks but still plays the next beat', () => {
    const day2 = toDay(start(), 2)
    const skipped = send(day2, { _tag: 'SkipPart' })
    expect(clockOf(skipped)).toMatchObject({ part: 'afternoon', ticksLeft: 1 })
    expect(posted(skipped.last).map(textOf)).toEqual(['lunch is out ☀️'])
  })

  test('sleeping early skips the beats of the parts slept through', () => {
    const day2 = toDay(start(), 2)
    const day3 = send(day2, { _tag: 'GoToSleep' })
    expect(
      day3.state.messages.some(m => textOf(m.message) === 'lunch is out ☀️'),
    ).toBe(false)
  })

  test('evening running out puts everyone to bed', () => {
    const evening = sendAll(start(), [
      { _tag: 'SkipPart' },
      { _tag: 'SkipPart' },
    ])
    const bed = ask(evening, 'june', 'What do you make of Bea?')
    expect(clockOf(bed)).toMatchObject({ phase: 'bedtime', ticksLeft: 0 })
    const lines = posted(bed.last).map(textOf)
    expect(lines).toContain(BEDTIME_TEXT)
    expect(lines).toEqual(
      expect.arrayContaining(tiny.guests.map(g => g.goodnight)),
    )
    expect(viewOf(bed).guests.every(g => g.status._tag === 'Asleep')).toBe(true)
    expect(rejection(ask2(bed, 'june', 'What do you make of Theo?'))).toBe(
      'asleep',
    )
    expect(rejection(send(bed, { _tag: 'SkipPart' }).last)).toBe('notNow')
  })

  test('go to sleep brings the next morning: Wi-Fi log, then the beat', () => {
    const day2 = toDay(start(), 2)
    expect(clockOf(day2)).toEqual({
      day: 2,
      part: 'morning',
      phase: 'asking',
      ticksLeft: 1,
      partBudget: 1,
    })
    const morning = posted(day2.last).filter(m => m.day === 2)
    expect(morning.map(m => m.thread._tag)).toEqual(['WifiLog', 'Group'])
    expect(morning[0]?.body).toMatchObject({ guest: 'bea', time: '6:10am' })
    expect(textOf(morning[1]!)).toBe('Someone tidied the garden at dawn. Keen.')
  })

  test('each morning publishes only the night before', () => {
    const day3 = toDay(start(), 3)
    const wifi = day3.state.messages.filter(
      m => m.message.thread._tag === 'WifiLog',
    )
    expect(wifi.map(m => m.message.day)).toEqual([1, 1, 2, 3])
  })

  test('after day 3 the arrest is all that is left', () => {
    const day3 = toDay(start(), 3)
    const done = send(day3, { _tag: 'GoToSleep' })
    expect(clockOf(done).phase).toBe('arrest')
    expect(rejection(send(done, { _tag: 'GoToSleep' }).last)).toBe('notNow')
    expect(rejection(send(done, { _tag: 'SkipPart' }).last)).toBe('notNow')
    expect(rejection(ask2(done, 'june', 'What do you make of Bea?'))).toBe(
      'notNow',
    )
  })
})

// NOTE: asks by text even when the menu can't be read for the chip any more:
// the chip is taken from a fresh day 1.
const ask2 = (game: Game, guest: GuestId, text: string): Step =>
  send(game, {
    _tag: 'AskQuestion',
    thread: dm(guest),
    chipId: chipFor(start(game.caseData), dm(guest), text),
  }).last

// AWAY AND QUIET

describe('who is around', () => {
  test('an away guest shows their status and can’t be asked', () => {
    const afternoon = send(start(), { _tag: 'SkipPart' })
    expect(viewOf(afternoon).guests.find(g => g.id === 'bea')?.status).toEqual({
      _tag: 'Away',
      status: "at the farmers' market 🍓",
    })
    expect(rejection(ask2(afternoon, 'bea', NIGHT0))).toBe('away')
  })

  test('wrong proof costs two ticks and makes the guest quiet until the next part', () => {
    const game = ask(
      save(
        start(roomy),
        messageWithText(
          start(roomy),
          "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
        ),
      ),
      'theo',
      NIGHT0,
    )
    const answer = messageWithText(game, 'Upstairs all night, reading.')
    const beat = messageWithText(
      game,
      "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
    )
    const wrong = send(game, {
      _tag: 'ShowProof',
      messageId: answer.id,
      proofMessageId: beat.id,
    })
    expect(posted(wrong.last).map(textOf)).toEqual([
      `That's not what this says: "${textOf(beat)}"`,
      "I'm not sure what you're getting at.",
    ])
    expect(posted(wrong.last).every(m => m.role._tag === 'Plain')).toBe(true)
    expect(clockOf(wrong).ticksLeft).toBe(1)
    expect(statusChanges(wrong.last)).toEqual([
      { guest: 'theo', status: 'Quiet' },
    ])
    expect(rejection(ask2(wrong, 'theo', 'What do you make of June?'))).toBe(
      'quiet',
    )
    expect(
      rejection(send(wrong, { _tag: 'Press', messageId: answer.id }).last),
    ).toBe('quiet')

    const next = send(wrong, { _tag: 'SkipPart' })
    expect(statusChanges(next.last)).toContainEqual({
      guest: 'theo',
      status: 'Around',
    })
    expect(viewOf(next).guests.find(g => g.id === 'theo')?.status._tag).toBe(
      'Around',
    )
  })

  test('wrong proof may overspend and end the part', () => {
    const base = start()
    const saved = save(
      base,
      messageWithText(
        base,
        "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
      ),
    )
    const asked = ask(saved, 'theo', NIGHT0) // afternoon now, 1 tick
    const wrong = send(asked, {
      _tag: 'ShowProof',
      messageId: messageWithText(asked, 'Upstairs all night, reading.').id,
      proofMessageId: messageWithText(
        asked,
        "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
      ).id,
    })
    expect(clockOf(wrong)).toMatchObject({ part: 'evening', ticksLeft: 1 })
    // NOTE: Quiet is sent, then cleared by the new part, where Bea is back
    // and Theo is away.
    expect(statusChanges(wrong.last)).toEqual([
      { guest: 'theo', status: 'Quiet' },
      { guest: 'bea', status: 'Around' },
      { guest: 'theo', status: 'Away' },
    ])
  })

  test('wrong-proof replies rotate per guest', () => {
    let game = start(
      withChanges({ budget: { morning: 8, afternoon: 8, evening: 8 } }),
    )
    const beat = messageWithText(
      game,
      "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
    )
    game = save(game, beat)
    game = ask(game, 'bea', 'What do you make of Theo?')
    game = ask(game, 'bea', 'What do you make of June?')
    const first = send(game, {
      _tag: 'ShowProof',
      messageId: messageWithText(game, "theo's sweet. eats a LOT tho 😂").id,
      proofMessageId: beat.id,
    })
    const afternoon = send(first, { _tag: 'SkipPart' })
    const evening = send(afternoon, { _tag: 'SkipPart' })
    const second = send(evening, {
      _tag: 'ShowProof',
      messageId: messageWithText(
        evening,
        "june's lovely, we're in rooms next door",
      ).id,
      proofMessageId: beat.id,
    })
    expect(posted(first.last).map(textOf)[1]).toBe(
      "up reading?? that's not a crime 🙄",
    )
    expect(posted(second.last).map(textOf)[1]).toBe(
      'what does that have to do with me',
    )
  })
})

// PRESSING

describe('pressing', () => {
  test('any bubble presses the whole answer once, for a tick', () => {
    const game = ask(start(roomy), 'bea', NIGHT0)
    const answer = messageWithText(
      game,
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    const pressed = send(game, { _tag: 'Press', messageId: answer.id })
    expect(posted(pressed.last).map(textOf)).toEqual([
      PRESS_TEXT,
      'yes?? I was exhausted',
    ])
    expect(posted(pressed.last).every(m => m.role._tag === 'Plain')).toBe(true)
    const role = answer.role
    expect(pressed.last.out).toContainEqual({
      _tag: 'AnswerPressed',
      answerId: role._tag === 'Answer' ? role.answerId : '',
    })
    expect(clockOf(pressed).ticksLeft).toBe(2)
    expect(viewOf(pressed).pressed).toEqual([
      role._tag === 'Answer' ? role.answerId : '',
    ])
    expect(
      rejection(send(pressed, { _tag: 'Press', messageId: answer.id }).last),
    ).toBe('alreadyPressed')
  })

  test('a press can give a coached tell', () => {
    const day3 = toDay(start(), 3)
    const asked = ask(day3, 'june', 'Did you notice Bea that night?')
    const pressed = send(asked, {
      _tag: 'Press',
      messageId: messageWithText(
        asked,
        'her light was off by 10 im right next door',
      ).id,
    })
    expect(posted(pressed.last).map(textOf)).toContain(
      'ok she asked me to say that. sorry 😬',
    )
  })

  test('only answers can be pressed', () => {
    const game = start(roomy)
    const beat = messageWithText(
      game,
      "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
    )
    expect(
      rejection(send(game, { _tag: 'Press', messageId: beat.id }).last),
    ).toBe('notAnAnswer')
    expect(
      rejection(send(game, { _tag: 'Press', messageId: 'm999' }).last),
    ).toBe('unknownMessage')
  })
})

// PROOF

// NOTE: catches Bea's alibi with the night-0 Wi-Fi entry. Needs a roomy case.
const catchBea = (game: Game): Game => {
  const saved = save(game, wifiMessage(game, 'bea', '11:52pm'))
  const asked = ask(saved, 'bea', NIGHT0)
  return send(asked, {
    _tag: 'ShowProof',
    messageId: messageWithText(
      asked,
      'asleep by 10, honest. that fair wiped me out 😴',
    ).id,
    proofMessageId: wifiMessage(asked, 'bea', '11:52pm').id,
  })
}

describe('showing proof', () => {
  test('right proof catches the lie for a tick', () => {
    const game = catchBea(start(roomy))
    const claim = messageWithText(
      game,
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    const proof = wifiMessage(game, 'bea', '11:52pm')
    expect(posted(game.last).map(textOf)).toEqual([
      `That's not what this says: "11:52pm · Bea's phone joined garden"`,
      "ok fine. I couldn't sleep, I went out to the garden for air",
      "that's all it was",
    ])
    const lie = {
      guest: 'bea',
      claimMessageId: claim.id,
      proofMessageId: proof.id,
    }
    expect(game.last.out).toContainEqual({ _tag: 'LieCaught', lie })
    expect(viewOf(game).caught).toEqual([lie])
    expect(clockOf(game).ticksLeft).toBe(2)
  })

  test('an answer is caught only once', () => {
    const game = catchBea(start(roomy))
    const claim = messageWithText(
      game,
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    const proof = wifiMessage(game, 'bea', '11:52pm')
    const again = send(game, {
      _tag: 'ShowProof',
      messageId: claim.id,
      proofMessageId: proof.id,
    })
    expect(rejection(again.last)).toBe('alreadyCaught')
    expect(
      rejection(send(game, { _tag: 'Press', messageId: claim.id }).last),
    ).toBe('alreadyCaught')
  })

  test('a claim told only when pressed can be confronted once pressed', () => {
    // NOTE: Max's night-0 claim is in his lines too, so press then prove with
    // his lounge entry; the pressed bubble counts as a claim message.
    let game = start(roomy)
    game = save(game, wifiMessage(game, 'max', '11:30pm'))
    game = ask(game, 'max', NIGHT0)
    const answer = messageWithText(game, 'Early night. I was shattered.')
    game = send(game, { _tag: 'Press', messageId: answer.id })
    game = send(game, {
      _tag: 'ShowProof',
      messageId: answer.id,
      proofMessageId: wifiMessage(game, 'max', '11:30pm').id,
    })
    expect(viewOf(game).caught).toHaveLength(1)
    expect(viewOf(game).caught[0]?.claimMessageId).toBe(answer.id)
  })

  test('proof must be in the case file', () => {
    const game = ask(start(roomy), 'bea', NIGHT0)
    const shown = send(game, {
      _tag: 'ShowProof',
      messageId: messageWithText(
        game,
        'asleep by 10, honest. that fair wiped me out 😴',
      ).id,
      proofMessageId: wifiMessage(game, 'bea', '11:52pm').id,
    })
    expect(rejection(shown.last)).toBe('notInCaseFile')
  })

  test('proof against a reply that is not an answer is rejected', () => {
    const game = save(start(roomy), wifiMessage(start(roomy), 'bea', '11:52pm'))
    const shown = send(game, {
      _tag: 'ShowProof',
      messageId: messageWithText(
        game,
        "Has anyone seen Hazel's ribbon? It's gone from the mantel.",
      ).id,
      proofMessageId: wifiMessage(game, 'bea', '11:52pm').id,
    })
    expect(rejection(shown.last)).toBe('notAnAnswer')
  })
})

// NIGHT MOVES

describe('night moves', () => {
  test('a destroyed fact gives the ifDestroyed answer from the next morning', () => {
    const day1 = ask(start(), 'theo', 'Anything odd outside this morning?')
    expect(posted(day1.last).map(textOf)).toContain(
      "There's a little gold pin on the garden path.",
    )
    const day2 = ask(
      toDay(start(), 2),
      'theo',
      'Anything odd outside this morning?',
    )
    expect(posted(day2.last).map(textOf)).toContain(
      "Someone's swept the path. Very tidy.",
    )
  })

  test('something saved before the night stays in the case file', () => {
    const asked = ask(start(), 'theo', 'Anything odd outside this morning?')
    const pin = messageWithText(
      asked,
      "There's a little gold pin on the garden path.",
    )
    const day2 = send(save(asked, pin), { _tag: 'GoToSleep' })
    expect(viewOf(day2).caseFile).toEqual([pin.id])
  })
})

// GROUP CHAT

describe('the group chat', () => {
  const withGroup = withChanges({
    groupQuestions: [
      {
        id: 'group-dinner',
        ask: 'Who was last up after dinner?',
        from: 1,
        unlock: [],
        replies: [
          { guest: 'bea', text: 'not me 😴', factIds: [] },
          { guest: 'theo', text: 'I was reading upstairs.', factIds: [] },
        ],
      },
    ],
  })

  test('a group question costs a tick and skips guests who are away', () => {
    const afternoon = send(start(withGroup), { _tag: 'SkipPart' })
    const chip = chipFor(afternoon, GROUP, 'Who was last up after dinner?')
    const asked = send(afternoon, {
      _tag: 'AskQuestion',
      thread: GROUP,
      chipId: chip,
    })
    const lines = posted(asked.last)
    expect(lines.map(textOf)).toEqual([
      'Who was last up after dinner?',
      'I was reading upstairs.',
    ])
    expect(lines.every(m => m.role._tag === 'Plain')).toBe(true)
    expect(clockOf(asked).part).toBe('evening')
  })

  test('group chips belong to the group thread only', () => {
    const game = start(withGroup)
    const chip = chipFor(game, GROUP, 'Who was last up after dinner?')
    const wrongThread = send(game, {
      _tag: 'AskQuestion',
      thread: dm('bea'),
      chipId: chip,
    })
    expect(rejection(wrongThread.last)).toBe('unknownQuestion')
  })
})

// RECONNECTING

describe('reconnecting', () => {
  test('Resume sends a snapshot of the whole board', () => {
    let game = catchBea(start(roomy))
    game = ask(
      game,
      'june',
      'Did you hear anything the night the ribbon went missing?',
    )
    const resumed = send(game, { _tag: 'Resume' })
    expect(resumed.state).toBe(game.state)
    expect(resumed.last.out).toHaveLength(1)
    const view = viewOf(game)
    expect(resumed.last.out[0]).toEqual(view)
    expect(view.messages).toEqual(game.state.messages.map(m => m.message))
    expect(view.caseFile).toEqual([wifiMessage(game, 'bea', '11:52pm').id])
    expect(view.caught).toHaveLength(1)
    expect(view.result).toBeUndefined()
  })

  test('the stored state survives a round trip through its schema', () => {
    const game = catchBea(start(roomy))
    const stored = Schema.encodeSync(GameState)(game.state)
    const loaded = Schema.decodeUnknownSync(GameState)(structuredClone(stored))
    expect(snapshot(roomy, loaded)).toEqual(snapshot(roomy, game.state))
  })
})

// ARREST

describe('the arrest', () => {
  const arrested = (game: Game, suspect: GuestId, lie?: string) =>
    send(game, {
      _tag: 'Arrest',
      suspect,
      ...(lie === undefined ? {} : { lie }),
    })

  const resultOf = (step: Step) => {
    const found = step.out.find(m => m._tag === 'ArrestResult')
    if (found?._tag !== 'ArrestResult') {
      throw new Error('no arrest result')
    }
    return found.result
  }

  test('the thief on a caught theft lie closes the case', () => {
    const game = catchBea(start(roomy))
    const claim = messageWithText(
      game,
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    const done = arrested(game, 'bea', claim.id)
    const result = resultOf(done.last)
    expect(result.ending).toBe('caseClosed')
    expect(result.thief).toBe('bea')
    expect(result.solution).toEqual({
      claim: 'Bea was asleep by 10pm.',
      proof: 'Bea was in the garden at 11:52pm.',
    })
    expect(result.tally).toEqual({
      questionsAsked: 1,
      liesCaught: 1,
      wrongProofs: 0,
    })
    // NOTE: Max's lounge entry was seen, the theft has no evidence, Bea's
    // garden entry was saved, and the rest was never posted.
    expect(result.timeline.map(e => e.evidence)).toEqual([
      'seen',
      'none',
      'saved',
      'missed',
      'missed',
      'missed',
    ])
    expect(clockOf(done).phase).toBe('arrest')
    expect(viewOf(done).result).toEqual(result)
  })

  test('any bubble of the caught answer names the lie', () => {
    const game = catchBea(start(roomy))
    const claim = messageWithText(
      game,
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    expect(resultOf(arrested(game, 'bea', claim.id).last).ending).toBe(
      'caseClosed',
    )
  })

  test('the thief on no lie walks', () => {
    const result = resultOf(arrested(start(), 'bea').last)
    expect(result.ending).toBe('theyWalk')
    // NOTE: the closest pair is still shown.
    expect(result.solution?.claim).toBe('Bea was asleep by 10pm.')
  })

  test('the thief on a lie not about the theft walks', () => {
    const caseData = withChanges({
      budget: roomy.budget,
      contradictions: tiny.contradictions.map(c =>
        c.id === 'bea-alibi' ? { ...c, concernsTheft: false } : c,
      ),
    })
    const game = catchBea(start(caseData))
    const claim = messageWithText(
      game,
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    expect(resultOf(arrested(game, 'bea', claim.id).last).ending).toBe(
      'theyWalk',
    )
  })

  test('an innocent is the wrong person', () => {
    expect(resultOf(arrested(start(), 'theo').last).ending).toBe('wrongPerson')
  })

  test('the lie must be a caught one against the suspect', () => {
    const game = catchBea(start(roomy))
    const claim = messageWithText(
      game,
      'asleep by 10, honest. that fair wiped me out 😴',
    )
    expect(rejection(arrested(game, 'theo', claim.id).last)).toBe('notCaught')
    const uncaught = ask(game, 'bea', 'What do you make of Theo?')
    const other = messageWithText(uncaught, "theo's sweet. eats a LOT tho 😂")
    expect(rejection(arrested(uncaught, 'bea', other.id).last)).toBe(
      'notCaught',
    )
    expect(rejection(arrested(game, 'bea', 'm999').last)).toBe('unknownMessage')
    expect(rejection(arrested(game, 'hazel').last)).toBe('invalid')
  })

  test('the game is over after the arrest, but Resume still works', () => {
    const done = arrested(start(), 'bea')
    expect(rejection(send(done, { _tag: 'SkipPart' }).last)).toBe('notNow')
    expect(rejection(arrested(done, 'theo').last)).toBe('notNow')
    expect(
      rejection(send(done, { _tag: 'SaveToCaseFile', messageId: 'm1' }).last),
    ).toBe('notNow')
    const resumed = send(done, { _tag: 'Resume' })
    expect(resumed.last.out[0]?._tag).toBe('Snapshot')
  })

  test('the arrest is open from bedtime and from the arrest phase', () => {
    const bed = sendAll(start(), [
      { _tag: 'SkipPart' },
      { _tag: 'SkipPart' },
      { _tag: 'SkipPart' },
    ])
    expect(clockOf(bed).phase).toBe('bedtime')
    expect(resultOf(arrested(bed, 'bea').last).ending).toBe('theyWalk')
    const end = send(toDay(start(), 3), { _tag: 'GoToSleep' })
    expect(resultOf(arrested(end, 'bea').last).ending).toBe('theyWalk')
  })
})

// INVALID AND STALE

describe('stale and invalid messages', () => {
  test('unknown chips and the Wi-Fi thread are rejected', () => {
    const game = start(roomy)
    expect(
      rejection(
        send(game, { _tag: 'AskQuestion', thread: dm('bea'), chipId: 'c999' })
          .last,
      ),
    ).toBe('unknownQuestion')
    expect(
      rejection(
        send(game, {
          _tag: 'AskQuestion',
          thread: { _tag: 'WifiLog' },
          chipId: 'c1',
        }).last,
      ),
    ).toBe('invalid')
    expect(
      rejection(
        send(game, { _tag: 'AskQuestion', thread: dm('hazel'), chipId: 'c1' })
          .last,
      ),
    ).toBe('invalid')
  })

  test('a chip whose window has closed is rejected', () => {
    const caseData = withChanges({
      guests: tiny.guests.map(guest =>
        guest.id !== 'bea'
          ? guest
          : {
              ...guest,
              questions: guest.questions.map(question =>
                question.id === 'bea-theo'
                  ? { ...question, until: 1 as const }
                  : question,
              ),
            },
      ),
    })
    const day1 = start(caseData)
    const chip = chipFor(day1, dm('bea'), 'What do you make of Theo?')
    const day2 = toDay(day1, 2)
    expect(menuOf(day2, dm('bea')).chips.map(c => c.id)).not.toContain(chip)
    expect(
      rejection(
        send(day2, { _tag: 'AskQuestion', thread: dm('bea'), chipId: chip })
          .last,
      ),
    ).toBe('unknownQuestion')
  })

  test('a double tap is too fast', () => {
    const game = ask(start(roomy), 'bea', NIGHT0)
    const again = send(
      game,
      {
        _tag: 'AskQuestion',
        thread: dm('bea'),
        chipId: chipFor(game, dm('bea'), 'What do you make of June?'),
      },
      MIN_ACTION_INTERVAL_MS - 1,
    )
    expect(rejection(again.last)).toBe('tooFast')
    expect(again.state).toBe(game.state)
  })

  test('saving needs a real message, and costs nothing', () => {
    const game = start()
    expect(
      rejection(send(game, { _tag: 'SaveToCaseFile', messageId: 'm999' }).last),
    ).toBe('unknownMessage')
    const saved = save(game, wifiMessage(game, 'bea', '11:52pm'))
    expect(saved.last.out).toEqual([
      {
        _tag: 'CaseFileChanged',
        caseFile: [wifiMessage(game, 'bea', '11:52pm').id],
      },
    ])
    expect(clockOf(saved).ticksLeft).toBe(1)
    const removed = send(saved, {
      _tag: 'RemoveFromCaseFile',
      messageId: wifiMessage(game, 'bea', '11:52pm').id,
    })
    expect(viewOf(removed).caseFile).toEqual([])
  })
})

// NO LEAKS

describe('what reaches the client', () => {
  const secrets = [
    ...tiny.facts.map(f => f.id),
    ...tiny.guests.flatMap(g => g.questions.map(q => q.id)),
    ...tiny.contradictions.map(c => c.id),
    ...tiny.wifiLog.map(w => w.id),
    tiny.theftFact,
  ]

  const leaks = (
    messages: ReadonlyArray<ServerMessage>,
  ): ReadonlyArray<string> => {
    const wire = messages
      .map(m => Schema.encodeSync(ServerMessageJson)(m))
      .join('\n')
    return secrets.filter(secret => wire.includes(`"${secret}"`))
  }

  test('no fact, question, contradiction or Wi-Fi ID is ever sent before the arrest', () => {
    let game = catchBea(start(roomy))
    const out: Array<ServerMessage> = [...game.last.out]
    game = ask(
      game,
      'june',
      'Did you hear anything the night the ribbon went missing?',
    )
    out.push(...game.last.out)
    game = send(game, { _tag: 'GoToSleep' })
    out.push(...game.last.out, snapshot(roomy, game.state))
    expect(leaks(out)).toEqual([])
    expect(JSON.stringify(out)).not.toMatch(
      /isTrue|factIds|concernsTheft|thief/,
    )
  })
})

// CASES

describe('the case library', () => {
  test('the test fixture is not a playable case', () => {
    expect(CASES.has('tiny-case')).toBe(false)
  })

  test('picks unplayed cases first, then the one played longest ago', () => {
    expect(Option.getOrUndefined(pickCase(['b', 'a', 'c'], ['a']))).toBe('b')
    expect(Option.getOrUndefined(pickCase(['a', 'b'], ['b', 'a']))).toBe('b')
    expect(Option.isNone(pickCase([], []))).toBe(true)
  })
})

// NOTE: the real case, played through its known solutions.
describe('the Kestrel Hill case', () => {
  const kestrelHill = (() => {
    const found = CASES.get('kestrel-hill')
    if (found === undefined) {
      throw new Error('no kestrel-hill case')
    }
    return found
  })()

  const ROZ_LIE =
    "No. I lent it to Pip after the session. She couldn't find hers."
  const PIP_CHIP =
    "Roz says she lent you her headlamp on Friday. Didn't you have your own?"
  const PIP_DENIAL =
    "i have my own, it's pink with cat ears. roz never lent me anything"

  const resultOf = (step: Step) => {
    const found = step.out.find(m => m._tag === 'ArrestResult')
    if (found?._tag !== 'ArrestResult') {
      throw new Error('no arrest result')
    }
    return found.result
  }

  const headlampLie = (): Game => {
    let game = start(kestrelHill)
    game = ask(game, 'wren', 'Did you see or hear anything on Friday night?')
    game = ask(game, 'desmond', 'Whose headlamp flickers?')
    game = ask(
      game,
      'roz',
      'Were you out with your headlamp after midnight on Friday?',
    )
    // NOTE: Pip's chip needs Wren's aside about Pip's own headlamp too.
    expect(menuOf(game, dm('pip')).chips.map(c => c.text)).not.toContain(
      PIP_CHIP,
    )
    game = ask(game, 'wren', 'What happened during the session?')
    game = ask(game, 'pip', PIP_CHIP)
    return game
  }

  test('day 1: the borrowed headlamp lie closes the case', () => {
    let game = headlampLie()
    expect(clockOf(game)).toMatchObject({ day: 1, part: 'afternoon' })
    const claim = messageWithText(game, ROZ_LIE)
    const proof = messageWithText(game, PIP_DENIAL)
    game = save(save(game, claim), proof)
    // NOTE: Roz is out for a run on day 1 afternoon, so wait for evening.
    expect(
      rejection(
        send(game, {
          _tag: 'ShowProof',
          messageId: claim.id,
          proofMessageId: proof.id,
        }).last,
      ),
    ).toBe('away')
    game = send(game, { _tag: 'SkipPart' })
    game = send(game, {
      _tag: 'ShowProof',
      messageId: claim.id,
      proofMessageId: proof.id,
    })
    expect(viewOf(game).caught).toEqual([
      { guest: 'roz', claimMessageId: claim.id, proofMessageId: proof.id },
    ])
    expect(posted(game.last).map(textOf)).toContain('Right. Fine. I had it.')

    const done = send(game, { _tag: 'Arrest', suspect: 'roz', lie: claim.id })
    const result = resultOf(done.last)
    expect(result.ending).toBe('caseClosed')
    expect(result.thief).toBe('roz')
    expect(result.tally).toEqual({
      questionsAsked: 5,
      liesCaught: 1,
      wrongProofs: 0,
    })
  })

  test('day 3: the barn entry catches her Sunday-night story', () => {
    let game = start(kestrelHill)
    game = send(game, { _tag: 'GoToSleep' })
    game = send(game, { _tag: 'GoToSleep' })
    expect(clockOf(game)).toMatchObject({ day: 3, part: 'morning' })
    game = ask(
      game,
      'wren',
      'The box was under your camera bag. How did it get there?',
    )
    game = ask(
      game,
      'roz',
      'Wren left her camera bag in the barn on Sunday. Were you out there that night?',
    )
    const claim = messageWithText(game, 'No. Slept straight through.')
    const proof = wifiMessage(game, 'roz', '1:52am')
    game = save(save(game, claim), proof)
    game = send(game, {
      _tag: 'ShowProof',
      messageId: claim.id,
      proofMessageId: proof.id,
    })
    expect(viewOf(game).caught).toHaveLength(1)
    expect(clockOf(game)).toMatchObject({
      day: 3,
      part: 'morning',
      ticksLeft: 2,
    })
    const done = send(game, { _tag: 'Arrest', suspect: 'roz', lie: claim.id })
    expect(resultOf(done.last).ending).toBe('caseClosed')
  })

  test('her lie about never visiting is caught, but she walks', () => {
    let game = start(kestrelHill)
    game = ask(game, 'roz', 'Have you been to Kestrel Hill before?')
    game = ask(
      game,
      'desmond',
      'Has Roz really never been to Kestrel Hill before?',
    )
    const claim = messageWithText(
      game,
      'Never. First time up here. Lovely spot.',
    )
    const proof = messageWithText(
      game,
      "The 1986 star party here lists 'R. Thackery, aged 6'.",
    )
    game = save(save(game, claim), proof)
    game = send(game, {
      _tag: 'ShowProof',
      messageId: claim.id,
      proofMessageId: proof.id,
    })
    expect(viewOf(game).caught).toHaveLength(1)
    const done = send(game, { _tag: 'Arrest', suspect: 'roz', lie: claim.id })
    expect(resultOf(done.last).ending).toBe('theyWalk')
  })

  test('wrong proof costs two ticks and Roz goes quiet until the next part', () => {
    let game = start(kestrelHill)
    game = ask(game, 'roz', 'Have you been to Kestrel Hill before?')
    const claim = messageWithText(
      game,
      'Never. First time up here. Lovely spot.',
    )
    const beat = messageWithText(
      game,
      "Good morning, all. I'm afraid Odette's meteorite has gone from the shelf in the dome.",
    )
    game = save(game, beat)
    game = send(game, {
      _tag: 'ShowProof',
      messageId: claim.id,
      proofMessageId: beat.id,
    })
    expect(clockOf(game)).toMatchObject({ part: 'morning', ticksLeft: 2 })
    expect(viewOf(game).caught).toEqual([])
    expect(statusChanges(game.last)).toEqual([
      { guest: 'roz', status: 'Quiet' },
    ])
    expect(rejection(ask(game, 'roz', 'Who do you think took it?').last)).toBe(
      'quiet',
    )
    const next = send(game, { _tag: 'SkipPart' })
    expect(clockOf(next)).toMatchObject({ part: 'afternoon', ticksLeft: 5 })
    expect(viewOf(next).guests.find(g => g.id === 'roz')?.status._tag).toBe(
      'Away',
    )
  })
})

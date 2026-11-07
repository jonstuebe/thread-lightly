// NOTE: plain TypeScript with no runtime dependencies, shared by the Foldkit
// client (src/) and the Cloudflare Worker (worker/).

export const GUEST_NAMES = [
  'Margot',
  'Theo',
  'Priya',
  'Gus',
  'Lena',
  'Wes',
] as const

export type GuestName = (typeof GUEST_NAMES)[number]

export type LineKind = 'chatter' | 'defend' | 'react'

export type Guest = Readonly<{
  name: GuestName
  color: string
  bio: string
  chatter: ReadonlyArray<string>
  defend: ReadonlyArray<string>
  react: ReadonlyArray<string>
}>

// NOTE: line templates use {s} for another guest, {you} for the player and
// {v} for the guest whose phone was taken overnight.
export const CAST: ReadonlyArray<Guest> = [
  {
    name: 'Margot',
    color: '#c8643a',
    bio: 'owns the lodge; warm and motherly, flustered, uses lots of emoji',
    chatter: [
      'Coffee’s on ☕ come down when you’re up',
      'I just want my brooch back 😩 no questions asked!!',
      '{s}, were you up late? I heard the stairs creak 🙈',
      'Poor {v} 💔 this was supposed to be a relaxing weekend',
    ],
    defend: [
      'Me?? It’s MY brooch 😅',
      'I was doing dishes until midnight, ask anyone 🍽️',
    ],
    react: ['Oh dear 😬', 'Good thinking {you} 👍', 'Hmm I’m not so sure 🤔'],
  },
  {
    name: 'Theo',
    color: '#3a6fd8',
    bio: 'software developer; types all lowercase with no punctuation, terse, dry humor',
    chatter: [
      'router log doesnt lie',
      'so who was online at 3am',
      '{s} you were definitely awake',
      'not me. asleep by 11',
    ],
    defend: ['i was literally asleep', 'check the router log. not me'],
    react: ['fair', 'eh', '{s} seems sus tbh'],
  },
  {
    name: 'Priya',
    color: '#7d4fc4',
    bio: 'lawyer; organized, full proper sentences, likes facts and timelines, suspicious of everyone',
    chatter: [
      'Let’s be methodical. Who went upstairs after dessert?',
      '{s}, you’ve been quiet. Where were you last night?',
      'Phones don’t walk off on their own.',
      'For the record, I’m keeping notes.',
    ],
    defend: [
      'I was reading in my room. With the door open.',
      'I have nothing to hide. Ask me anything.',
    ],
    react: ['Noted.', 'That’s a fair point.', 'I’m not convinced.'],
  },
  {
    name: 'Gus',
    color: '#2f8a5f',
    bio: 'retired fishing guide in his 70s; texts like a grandpa, sometimes signs messages “- Gus”, occasional ALL CAPS',
    chatter: [
      'Slept like a log. Heard nothing. - Gus',
      'IN MY DAY WE LOCKED OUR DOORS',
      'Somebody here is fibbing. - Gus',
      '{s} was poking around the mantel. Just saying.',
    ],
    defend: ['I’m 74 and asleep by 9. - Gus', 'WASN’T ME'],
    react: ['Hm.', 'Agreed. - Gus', 'Don’t know about that.'],
  },
  {
    name: 'Lena',
    color: '#c93f72',
    bio: 'lifestyle influencer; dramatic, says omg and literally, uses 💀 and 😭',
    chatter: [
      'omg {v} is GONE?? 😭',
      'literally shaking rn',
      '{s} has been acting so weird 💀',
      'this is giving true crime podcast',
    ],
    defend: ['me?? i was doing my skincare 😭', 'literally how dare you 💀'],
    react: ['omg ok', 'LMAO', 'valid tbh'],
  },
  {
    name: 'Wes',
    color: '#9a6b10',
    bio: 'nervous accountant; apologizes constantly, overexplains, trails off with ellipses',
    chatter: [
      'Sorry, I was asleep. I think. I mean I was.',
      'This is so stressful, sorry',
      'Not to point fingers but... {s}?',
      'I locked my phone in my suitcase last night, sorry, is that weird',
    ],
    defend: [
      'It wasn’t me! Sorry. I mean it really wasn’t.',
      'I was in my room the whole time, sorry...',
    ],
    react: ['Sorry, good point', 'Oh... yeah maybe', 'I don’t know, sorry'],
  },
]

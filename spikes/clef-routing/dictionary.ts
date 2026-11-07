// PROTOTYPE, throwaway. One hand-written guest dictionary: the topics Theo can
// be asked about. Only the topic ids and descriptions matter for routing; the
// replies are here so the transcript reads like the game would.

export type Topic = {
  id: string
  category: Category
  description: string
  reply: string
}

export const CATEGORIES = {
  timeline:
    'Where Theo was, what he did, or what he saw or heard, at some time',
  evidence:
    'Physical things and records: the brooch, the display case, keys, the Wi-Fi log, phones',
  people: 'What Theo thinks of, or knows about, one of the other guests',
  self: 'Theo himself: his job, why he came, his money, his habits',
  pressure:
    'Accusing Theo, asking who he suspects, or pushing him on whether he is lying',
  smalltalk:
    'Casual chat with nothing to do with the theft: weather, food, the lodge, jokes, flirting',
  unknown:
    'About the case or the weekend, but none of the other categories fit',
} as const

export type Category = keyof typeof CATEGORIES

export const TOPICS: ReadonlyArray<Topic> = [
  {
    id: 'whereabouts-night',
    category: 'timeline',
    description:
      'Where Theo was and what he was doing on Friday night, the night the brooch went missing, from dinner until morning',
    reply: 'played cards in the den till like 10:30 then went up to my room',
  },
  {
    id: 'bedtime',
    category: 'timeline',
    description:
      'When Theo went to bed or fell asleep, and whether he was awake late',
    reply: 'asleep by 11. i was wrecked',
  },
  {
    id: 'alibi-witness',
    category: 'timeline',
    description: 'Who can confirm where Theo was, or who he was with',
    reply: 'gus was at cards with me. after that nobody i guess',
  },
  {
    id: 'noises',
    category: 'timeline',
    description:
      'Footsteps, creaks, doors, voices or other sounds Theo heard during the night',
    reply: 'stairs creaked once. figured it was margot',
  },
  {
    id: 'kitchen',
    category: 'timeline',
    description:
      'The kitchen, late-night snacks, or anyone getting food or drinks at night',
    reply: 'didnt go to the kitchen. wes was raiding the fridge around 10 tho',
  },
  {
    id: 'porch',
    category: 'timeline',
    description:
      'Going outside, the porch, the deck, smoking or vaping, fresh air at night',
    reply: 'i dont smoke. why',
  },
  {
    id: 'morning',
    category: 'timeline',
    description:
      'Saturday morning: when Theo got up and what he saw when the theft was discovered',
    reply: 'came down at 8 and margot was already freaking out',
  },
  {
    id: 'brooch',
    category: 'evidence',
    description:
      'The missing silver brooch itself: what it looks like, its value, when Theo last saw it',
    reply: 'saw it in the case at dinner. looks expensive i guess',
  },
  {
    id: 'display-case',
    category: 'evidence',
    description:
      'The glass display case in the hall where the brooch was kept: its lock, the glass, anything odd about it',
    reply: 'the latch on that thing is a joke. anyone could open it',
  },
  {
    id: 'keys',
    category: 'evidence',
    description: 'Keys: room keys, the display case key, who has a key to what',
    reply: 'margot has all the keys on that big ring',
  },
  {
    id: 'wifi-log',
    category: 'evidence',
    description:
      'The router or Wi-Fi log, devices connecting, network activity, being online at a certain time',
    reply: 'router log doesnt lie. check it',
  },
  {
    id: 'phone',
    category: 'evidence',
    description:
      "Theo's phone: where it was overnight, whether it was charging, whether he used it",
    reply: 'charging on the nightstand all night',
  },
  {
    id: 'margot',
    category: 'people',
    description:
      'Margot, who owns the lodge and the brooch: what Theo thinks of her or knows about her',
    reply: 'shes nice. a lot. but nice',
  },
  {
    id: 'priya',
    category: 'people',
    description:
      'Priya, another guest: what Theo thinks of her or knows about her',
    reply: 'priya notices everything. kind of scary',
  },
  {
    id: 'gus',
    category: 'people',
    description:
      'Gus, another guest: what Theo thinks of him or knows about him',
    reply: 'gus is fine. terrible at cards',
  },
  {
    id: 'lena',
    category: 'people',
    description:
      'Lena, another guest: what Theo thinks of her or knows about her',
    reply: 'lena kept to herself mostly',
  },
  {
    id: 'wes',
    category: 'people',
    description:
      'Wes, another guest: what Theo thinks of him or knows about him',
    reply: 'wes talks a lot. owes half of us money probably',
  },
  {
    id: 'job',
    category: 'self',
    description: "Theo's work as a software developer, his job, his company",
    reply: 'i write software. backend stuff. boring',
  },
  {
    id: 'why-here',
    category: 'self',
    description:
      'Why Theo came to the lodge this weekend and how he knows the others',
    reply: 'college friend of lena. she dragged me here',
  },
  {
    id: 'money',
    category: 'self',
    description:
      "Theo's finances: whether he needs money, debts, rent, being broke",
    reply: 'im fine on money. weird question',
  },
  {
    id: 'suspects',
    category: 'pressure',
    description: 'Who Theo thinks took the brooch, or who he finds suspicious',
    reply: 'honestly wes. he was up and he needs cash',
  },
  {
    id: 'pressed',
    category: 'pressure',
    description:
      'The detective accuses Theo, says he is lying, or pushes him to confess',
    reply: 'i didnt take it. relax',
  },
]

export const SMALLTALK = 'smalltalk'
export const UNKNOWN = 'unknown'

export const topicCriteria = (
  topics: ReadonlyArray<Topic>,
): Record<string, string> => ({
  ...Object.fromEntries(topics.map(topic => [topic.id, topic.description])),
  [SMALLTALK]: CATEGORIES.smalltalk,
  [UNKNOWN]: CATEGORIES.unknown,
})

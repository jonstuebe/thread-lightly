import { type Attribute, type Html, inertHtml as ih } from 'foldkit/html'

type SvgAttribute = Attribute<never>

const svg = (
  width: string,
  height: string,
  viewBox: string,
  attributes: ReadonlyArray<SvgAttribute>,
  children: ReadonlyArray<Html>,
): Html =>
  ih.svg(
    [
      ih.AriaHidden(true),
      ih.Xmlns('http://www.w3.org/2000/svg'),
      ih.Width(width),
      ih.Height(height),
      ih.ViewBox(viewBox),
      ...attributes,
    ],
    children,
  )

const stroked = (width: string): ReadonlyArray<SvgAttribute> => [
  ih.Fill('none'),
  ih.Stroke('currentColor'),
  ih.StrokeWidth(width),
  ih.StrokeLinecap('round'),
  ih.StrokeLinejoin('round'),
]

export const chevronLeft = (): Html =>
  svg('13', '22', '0 0 13 22', stroked('2.6'), [
    ih.path([ih.D('M11 2 2 11l9 9')]),
  ])

export const info = (): Html =>
  svg(
    '24',
    '24',
    '0 0 24 24',
    [ih.Fill('none'), ih.Stroke('currentColor'), ih.StrokeWidth('1.8')],
    [
      ih.circle([ih.Cx('12'), ih.Cy('12'), ih.R('9.5')]),
      ih.path([
        ih.D('M12 11v6M12 7.2v.1'),
        ih.StrokeLinecap('round'),
        ih.StrokeWidth('2.2'),
      ]),
    ],
  )

export const arrowUp = (): Html =>
  svg('16', '16', '0 0 16 16', stroked('2.4'), [
    ih.path([ih.D('M8 13V3M3.5 7.5 8 3l4.5 4.5')]),
  ])

export const plus = (): Html =>
  svg('18', '18', '0 0 18 18', stroked('2.2'), [
    ih.path([ih.D('M9 3v12M3 9h12')]),
  ])

export const compose = (): Html =>
  svg('22', '22', '0 0 24 24', stroked('1.8'), [
    ih.path([
      ih.D('M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5'),
    ]),
    ih.path([ih.D('M17.6 3.6a1.9 1.9 0 0 1 2.8 2.8L12 14.8 8.8 15.2l.4-3.2z')]),
  ])

export const search = (): Html =>
  svg('15', '15', '0 0 16 16', stroked('1.8'), [
    ih.circle([ih.Cx('7'), ih.Cy('7'), ih.R('5')]),
    ih.path([ih.D('m10.8 10.8 3.4 3.4')]),
  ])

export const close = (): Html =>
  svg('14', '14', '0 0 14 14', stroked('2.2'), [
    ih.path([ih.D('M3 3l8 8M11 3l-8 8')]),
  ])

export const lock = (): Html =>
  svg(
    '12',
    '12',
    '0 0 24 24',
    [ih.Fill('currentColor')],
    [
      ih.path([
        ih.D(
          'M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4z',
        ),
      ]),
    ],
  )

export const chatBubble = (): Html =>
  svg(
    '22',
    '22',
    '0 0 24 24',
    [ih.Fill('currentColor')],
    [
      ih.path([
        ih.D(
          'M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.6 21l4-2.2c1.1.3 2.2.4 3.4.4 5.5 0 10-3.6 10-8.1S17.5 3 12 3z',
        ),
      ]),
    ],
  )

export const folder = (): Html =>
  svg('24', '24', '0 0 24 24', stroked('1.8'), [
    ih.path([
      ih.D(
        'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      ),
    ]),
  ])

export const wifi = (): Html =>
  svg('20', '20', '0 0 24 24', stroked('2'), [
    ih.path([
      ih.D(
        'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0',
      ),
    ]),
    ih.circle([ih.Cx('12'), ih.Cy('19.2'), ih.R('1'), ih.Fill('currentColor')]),
  ])

export const pin = (): Html =>
  svg(
    '12',
    '12',
    '0 0 24 24',
    [ih.Fill('currentColor')],
    [
      ih.path([
        ih.D('M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z'),
      ]),
    ],
  )

export const moon = (): Html =>
  svg(
    '14',
    '14',
    '0 0 24 24',
    [ih.Fill('currentColor')],
    [ih.path([ih.D('M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z')])],
  )

export const lodgeScene = (): Html =>
  ih.svg(
    [
      ih.AriaHidden(true),
      ih.Class('trees'),
      ih.Xmlns('http://www.w3.org/2000/svg'),
      ih.ViewBox('0 0 400 300'),
      ih.PreserveAspectRatio('none'),
    ],
    [
      ih.rect([
        ih.X('0'),
        ih.Y('200'),
        ih.Width('400'),
        ih.Height('100'),
        ih.Fill('#152030'),
        ih.Opacity('.9'),
      ]),
      ih.rect([
        ih.X('40'),
        ih.Y('214'),
        ih.Width('320'),
        ih.Height('2'),
        ih.Fill('#f3ead2'),
        ih.Opacity('.18'),
      ]),
      ih.rect([
        ih.X('90'),
        ih.Y('226'),
        ih.Width('220'),
        ih.Height('2'),
        ih.Fill('#f3ead2'),
        ih.Opacity('.12'),
      ]),
      ih.g(
        [ih.Fill('#0b1720')],
        [
          ih.polygon([ih.Points('0,205 18,110 36,205')]),
          ih.polygon([ih.Points('24,205 46,80 68,205')]),
          ih.polygon([ih.Points('56,205 74,130 92,205')]),
          ih.polygon([ih.Points('300,205 322,90 344,205')]),
          ih.polygon([ih.Points('332,205 352,120 372,205')]),
          ih.polygon([ih.Points('360,205 384,70 408,205')]),
          ih.rect([ih.X('150'), ih.Y('170'), ih.Width('70'), ih.Height('35')]),
          ih.polygon([ih.Points('142,172 185,140 228,172')]),
        ],
      ),
      ih.rect([
        ih.X('168'),
        ih.Y('182'),
        ih.Width('9'),
        ih.Height('9'),
        ih.Fill('#f5c76b'),
      ]),
      ih.rect([
        ih.X('193'),
        ih.Y('182'),
        ih.Width('9'),
        ih.Height('9'),
        ih.Fill('#f5c76b'),
        ih.Opacity('.7'),
      ]),
    ],
  )

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

export const arrowBack = (): Html =>
  svg(
    '24',
    '24',
    '0 0 24 24',
    [ih.Fill('currentColor')],
    [ih.path([ih.D('M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z')])],
  )

export const more = (): Html =>
  svg(
    '24',
    '24',
    '0 0 24 24',
    [ih.Fill('currentColor')],
    [
      ih.circle([ih.Cx('12'), ih.Cy('5'), ih.R('2')]),
      ih.circle([ih.Cx('12'), ih.Cy('12'), ih.R('2')]),
      ih.circle([ih.Cx('12'), ih.Cy('19'), ih.R('2')]),
    ],
  )

export const arrowUp = (): Html =>
  svg('16', '16', '0 0 16 16', stroked('2.4'), [
    ih.path([ih.D('M8 13V3M3.5 7.5 8 3l4.5 4.5')]),
  ])

export const send = (): Html =>
  svg(
    '22',
    '22',
    '0 0 24 24',
    [ih.Fill('currentColor')],
    [ih.path([ih.D('M3 20.5V14l8-2-8-2V3.5L22 12z')])],
  )

export const plus = (): Html =>
  svg('18', '18', '0 0 18 18', stroked('2.2'), [
    ih.path([ih.D('M9 3v12M3 9h12')]),
  ])

export const plusCircle = (): Html =>
  svg('24', '24', '0 0 24 24', stroked('2'), [
    ih.circle([ih.Cx('12'), ih.Cy('12'), ih.R('9')]),
    ih.path([ih.D('M12 8v8M8 12h8')]),
  ])

export const emoji = (): Html =>
  svg(
    '22',
    '22',
    '0 0 24 24',
    [ih.Fill('none'), ih.Stroke('currentColor'), ih.StrokeWidth('1.8')],
    [
      ih.circle([ih.Cx('12'), ih.Cy('12'), ih.R('9')]),
      ih.path([ih.D('M8.5 14.5c1.8 2 5.2 2 7 0'), ih.StrokeLinecap('round')]),
      ih.circle([ih.Cx('9'), ih.Cy('10'), ih.R('1'), ih.Fill('currentColor')]),
      ih.circle([ih.Cx('15'), ih.Cy('10'), ih.R('1'), ih.Fill('currentColor')]),
    ],
  )

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

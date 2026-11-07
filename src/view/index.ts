import { Option } from 'effect'
import { type Document, type HtmlBuilder } from 'foldkit/html'

import { type Message } from '../message'
import { Menu, type Model, Screen } from '../model'
import {
  composerView,
  headerView,
  joinSheetView,
  lockScreenView,
  menuSheetView,
  peopleSheetView,
  phaseBarView,
  sidebarView,
} from './chrome'
import { threadView } from './thread'

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Pine Hollow: a group chat mystery',
  body: h.div(
    [
      h.Class(model.isComposerFocused ? 'app kb' : 'app'),
      h.Style(
        Option.match(model.maybeViewport, {
          onNone: () => ({}),
          onSome: viewport => ({
            top: `${viewport.offsetTop}px`,
            height: `${viewport.height}px`,
          }),
        }),
      ),
    ],
    [
      sidebarView(model, h),
      h.section(
        [h.Class('pane')],
        [
          headerView(model, h),
          threadView(model, h),
          phaseBarView(model, h),
          composerView(model, h),
        ],
      ),
      Screen.match(model.screen, {
        Locked: () => lockScreenView(h),
        Joining: () => lockScreenView(h),
        InChat: () => h.empty,
      }),
      Screen.match(model.screen, {
        Locked: () => h.empty,
        Joining: () => joinSheetView(model, h),
        InChat: () =>
          Menu.match(model.menu, {
            Closed: () => h.empty,
            Game: () => menuSheetView(h),
            People: () => peopleSheetView(model, h),
          }),
      }),
    ],
  ),
})

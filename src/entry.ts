import { Runtime } from 'foldkit'

import { Message } from './message'
import { Model } from './model'
import { subscriptions } from './subscription'
import { init, update } from './update'
import { view } from './view'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application)

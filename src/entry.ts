import { Runtime } from 'foldkit'

import { loadFlags } from './command'
import { Message } from './message'
import { Flags, Model } from './model'
import { managedResources } from './socket'
import { subscriptions } from './subscription'
import { init, update } from './update'
import { view } from './view'

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  managedResources,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags: loadFlags })

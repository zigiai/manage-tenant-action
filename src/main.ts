import * as core from '@actions/core'
import * as github from '@actions/github'
import { getInputConf, splitKV } from './context'
import {
  GitFilePlainText,
  GitFileYaml,
  GuardFileActions,
  TenantData
} from './tenants'
import { Dispatch, DispatchOptions } from './dispatch'

async function run(): Promise<void> {
  try {
    // Get conf and init the dispatcher
    const conf = getInputConf()
    const dispatch = new Dispatch((conf as unknown) as DispatchOptions)

    const tenants =
      conf.mode === 'yaml'
        ? new GitFileYaml(conf.pattern)
        : new GitFilePlainText(conf.pattern)

    const guards: GuardFileActions = {}
    for (const guardstr of conf.ignoreDispatchOnFile) {
      const kv = splitKV(guardstr)
      if (kv) {
        guards[kv.key] = Boolean(kv.value)
      }
    }
    // enable dispatch guards
    tenants.guardFileActions = guards

    tenants.fromRef = github.context.payload['before']
    tenants.toRef = github.context.payload['after']

    // collect changed tenats
    const list: TenantData[] = []
    tenants.process(t => list.push(t))

    // dispatch
    dispatch.run(list)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

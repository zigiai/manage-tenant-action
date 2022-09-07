import { describe, expect, it } from '@jest/globals'
import {
  Dispatch,
  DispatchRule,
  DispatchPrio,
  DispatchOptions
} from '../src/dispatch'
import { nodeenv } from 'nodeenv'
import { StringMap } from '../src/tenants'
import { getInputConf } from '../src/context'

const TenantsModified: StringMap[] = [
  {
    action: 'add',
    tenant: 'foo',
    environment: 'test',
    _matches: 'add-prio-200',
    _priority: DispatchPrio.environment.toString()
  },
  {
    action: 'remove',
    tenant: 'stage',
    environment: 'stage',
    _matches: 'remove-prio-100',
    _priority: DispatchPrio.action.toString()
  },
  {
    action: 'unknown',
    tenant: 'notenant',
    environment: 'nostage'
  },
  {
    action: 'add',
    tenant: 'stage',
    environment: 'stage',
    _matches: 'add-prio-100',
    _priority: DispatchPrio.action.toString()
  },
  {
    action: 'add',
    tenant: 'bar',
    environment: 'test',
    _matches: 'add-prio-300',
    _priority: DispatchPrio.tenant.toString()
  }
]

const Suite = {
  default: {
    env: {
      GITHUB_REPOSITORY: '<org>/<repo>',
      INPUT_TOKEN: '<token>',
      INPUT_PATTERN: 'live/{environment}/tenants.yaml',
      INPUT_IGNOREACTIONONFILE: '',
      INPUT_DISPATCH: `
        action=add, workflow=add-prio-100
        action=add, workflow=add-prio-300, environment=test, tenant=bar
        action=add, workflow=add-prio-200, environment=test
        action=remove, workflow=remove-prio-100
      `
    },
    priorities: [
      DispatchPrio.action,
      DispatchPrio.tenant,
      DispatchPrio.environment
    ]
  }
}

describe.each(TenantsModified)('.priorityMatch', tenant => {
  const env = nodeenv(Suite.default.env)
  const dispatch = new Dispatch(getInputConf() as unknown as DispatchOptions)
  const rule = new DispatchRule(tenant)
  const match = dispatch.priorityMatch(rule)

  it(`workflow dispatched for ${tenant._matches}`, () => {
    if (match) {
      expect(match.workflow).toEqual(tenant._matches)
    } else {
      expect(tenant._matches).toBeUndefined()
    }
  })

  it(`workflow priority for ${tenant._matches}`, () => {
    if (match) {
      expect(match.priority.toString()).toEqual(tenant._priority)
    } else {
      expect(tenant._priority).toBeUndefined()
    }
  })

  env()
})

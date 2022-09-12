import * as core from '@actions/core'
import { parseRules, splitKV } from '../src/context'
import { StringMap, TenantData } from '../src/tenants'
import { workflowDispatch, CallOpts } from './workflow_dispatch'

const DispatchParams = ['action', 'environment', 'tenant'] as const

const DispatchControlKeys = ['workflow', 'token', 'ref', 'repo'] as const

export type DispatchParamsFilter = typeof DispatchParams[number]
export type DispatchControlKeysFilter = typeof DispatchControlKeys[number]
export type DispatchRuleFilter =
  | DispatchControlKeysFilter
  | DispatchParamsFilter

// eslint-disable-next-line no-shadow
export enum DispatchPrio {
  action = 100,
  environment = 200,
  tenant = 300
}

export class DispatchRule extends Set<string> {
  FilterRule: DispatchRuleFilter[] = [...DispatchParams, ...DispatchControlKeys]
  workflow?: string
  token?: string
  ref?: string
  repo?: string
  action?: string
  environment?: string
  tenant?: string

  constructor(items?: StringMap | string[]) {
    super()
    if (items) {
      this.addParams(items)
    }
  }

  /**
   * Adds parameters to the dispatch rule
   *
   * @param params rule parameters {action: 'added'}, action=added or ['action=added', 'tenant=foo']
   */
  addParams(params: StringMap | string[]): void {
    // load from array
    if (params instanceof Array) {
      for (const s of params) {
        const kv = splitKV(s)
        if (kv && this.FilterRule.includes(kv.key as DispatchRuleFilter)) {
          this.add(kv.key)
          this[kv.key as DispatchRuleFilter] = kv.value
        }
      }
    }
    // load from StringMap
    else {
      const map = params
      for (const key in map) {
        if (key && this.FilterRule.includes(key as DispatchRuleFilter)) {
          this.add(key)
          this[key as DispatchRuleFilter] = map[key]
        }
      }
    }
  }

  get priority(): DispatchPrio | number {
    const entries = Object.entries(DispatchPrio)
    let effectivePrio = 0
    for (const [param, prio] of entries.slice(entries.length / 2)) {
      if (this.has(param)) {
        effectivePrio = prio as DispatchPrio
      }
    }
    return effectivePrio
  }
}

export interface DispatchOptions extends CallOpts {
  dispatch: string[]
}

export class Dispatch {
  rules: DispatchRule[]
  FilterRuleParams: DispatchParamsFilter[] = [...DispatchParams]
  options

  constructor(options: DispatchOptions) {
    this.options = options
    this.rules = []
    for (const rule of parseRules(this.options.dispatch)) {
      this.rules.push(new DispatchRule(rule))
    }
  }

  // Run the dispatch list
  async run(list: TenantData[]): Promise<void> {
    const addedTenants: string[] = []
    const addedRunIds: string[] = []
    const addedEnvironments: string[] = []
    const removedTenants: string[] = []
    const removedRunIds: string[] = []
    const removedEnvironments: string[] = []

    for (const data of list) {
      const rule = new DispatchRule()
      rule.addParams(data as StringMap)
      const match = this.priorityMatch(rule)
      if (match === null) {
        core.warning(
          `No workflow matched for {environment: ${rule.environment}, tenant: ${rule.tenant}, action: ${rule.action}}`
        )
        continue
      }
      if (!match.workflow) {
        throw new Error('Dispatch rule must contain workflow parameter!')
      }
      if (!match.token && !this.options.token) {
        throw new Error(
          'No token provided! Specify token via the corresponding input or in the dispatch rule!'
        )
      }

      let runId = await workflowDispatch(
        {
          workflow: match.workflow,
          token: match.token || this.options.token,
          repo: match.repo || this.options.repo,
          ref: match.ref || this.options.ref
        },
        // inputs are validated by the dispatched workflow, thus there must be a complete match
        {
          action: data.action,
          environment: data.environment,
          tenant: data.tenant
        }
      )

      // Set run id to 0 if it couldn't be detected
      if (!runId) {
        runId = 0
      }

      if (data.action === 'add') {
        addedTenants.push(data.tenant)
        addedRunIds.push(runId.toString())
        addedEnvironments.push(data.environment)
      } else if (data.action === 'remove') {
        removedTenants.push(data.tenant)
        removedRunIds.push(runId.toString())
        removedEnvironments.push(data.environment)
      }
    }

    // Set action outputs
    core.setOutput('added-tenants', addedTenants.join(' '))
    core.setOutput('added-run-ids', addedRunIds.join(' '))
    core.setOutput('added-environments', addedEnvironments.join(' '))
    core.setOutput('removed-tenants', removedTenants.join(' '))
    core.setOutput('removed-run-ids', removedRunIds.join(' '))
    core.setOutput('removed-environments', removedEnvironments.join(' '))
  }

  private paramsMatchingPrio(priority: number): DispatchParamsFilter[] {
    const entries = Object.entries(DispatchPrio)
    const params: DispatchParamsFilter[] = []
    for (const [param, prio] of entries.slice(entries.length / 2)) {
      if (
        prio <= priority &&
        this.FilterRuleParams.includes(param as DispatchParamsFilter)
      ) {
        params.push(param as DispatchParamsFilter)
      }
    }
    return params
  }

  /**
   * Match to dispatch rules by all parameters given
   *
   * @param left
   * @param right
   * @param params
   * @returns
   */
  priorityMatch(rule: DispatchRule): DispatchRule | null {
    let priority = rule.priority
    const matchingParams = this.paramsMatchingPrio(priority)

    const matchParams = (
      a: DispatchRule,
      b: DispatchRule,
      all: DispatchParamsFilter[]
    ): boolean => {
      for (const p of all) {
        if (a[p] !== b[p]) {
          return false
        }
      }
      return true
    }

    // Loop through params looking for the higher priority match
    while (matchingParams.length > 0) {
      for (const match of this.rules) {
        if (priority !== match.priority) {
          continue
        } else if (matchParams(match, rule, matchingParams)) {
          return match
        }
      }
      // drop to a lower priority
      if (matchingParams.pop() && matchingParams.length > 0) {
        const priorityName = matchingParams[matchingParams.length - 1]
        priority = DispatchPrio[priorityName]
      }
    }
    return null
  }
}

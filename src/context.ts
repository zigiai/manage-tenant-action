import * as core from '@actions/core'
import * as github from '@actions/github'

import csvparse from 'csv-parse/lib/sync'
import { listenerCount } from 'process'

export interface Inputs {
  dispatch: string[]
  ignoreActionOnFile: string[]
  token: string
  ref: string
  repo: string
  pattern: string
}

export function getInputList(name: string, ignoreComma?: boolean): string[] {
  const res: string[] = []

  const items = core.getInput(name)
  if (items === '') {
    return res
  }

  for (const output of csvparse(items, {
    columns: false,
    relaxColumnCount: true,
    skipLinesWithEmptyValues: true
  }) as string[][]) {
    if (output.length === 1) {
      res.push(output[0])
      continue
    } else if (!ignoreComma) {
      res.push(...output)
      continue
    }
    res.push(output.join(','))
  }

  return res.filter(item => item).map(pat => pat.trim())
}

export function getInputs(): Inputs {
  return {
    dispatch: getInputList('dispatch', true),
    ignoreActionOnFile: getInputList('ignore-action-on-file'),
    token: core.getInput('token'),
    ref: core.getInput('ref') || github.context.ref,
    repo:
      core.getInput('ref') ||
      `${github.context.repo.owner}/${github.context.repo.repo}`,
    pattern: core.getInput('pattern')
  }
}

export function loadContext() {
  const conf = getInputs()
  if (!conf.token) {
    throw new Error('token: required - to trigger workflow_dispatch (other than secrets.GITHUB_TOKEN)');
  }
  if (!conf.pattern) {
    throw new Error('pattern: required - tenant file search pattern')
  }
  return conf
}


/**
 * Parses rules list
 *
 * @param rules rules list (workflow=xxx,action=added)
 * @returns
 */
export function parseRules(rules: string[]): string[][] {
  const result: string[][] = []
  for (const line of rules) {
    result.push(...csvparse(line) as string[][])
  }
  return result
}

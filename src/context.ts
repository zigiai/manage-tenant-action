import * as core from '@actions/core'
import * as github from '@actions/github'
import csvparse from 'csv-parse/lib/sync'

export interface Inputs {
  dispatch: string[]
  ignoreDispatchOnFile: string[]
  token: string
  ref: string
  repo: string
  pattern: string
  mode: string
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
    ignoreDispatchOnFile: getInputList('ignore-dispatch-on-file'),
    token: core.getInput('token'),
    ref: core.getInput('ref') || github.context.ref,
    repo:
      core.getInput('repo') ||
      `${github.context.repo.owner}/${github.context.repo.repo}`,
    pattern: core.getInput('pattern'),
    mode: core.getInput('mode') || 'plaintext'
  }
}

export function getInputConf(): Inputs {
  const conf = getInputs()
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
    result.push(...(csvparse(line) as string[][]))
  }
  return result
}

export type KeyValue = {
  key: string
  value: string
}

export function splitKV(keyValue: string): KeyValue | null {
  const kv = keyValue.split('=', 2).map(s => s.trim())
  if (kv.length === 1) {
    core.debug('dispatch parameter shoulbe be of key=value form')
    return null
  }
  return { key: kv[0], value: kv[1] }
}

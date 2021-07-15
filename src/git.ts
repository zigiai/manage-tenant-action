import os from 'os'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import * as self from './git'

import { ExecOutput } from '@actions/exec'
import { strict as assert } from 'assert'

export { ExecOutput } from '@actions/exec'

export interface GitContentAtRef {
  ref: string
  content: string
}

export interface GitFileContentAt {
  changed: boolean
  created: boolean
  updated: boolean
  deleted: boolean
  from: GitContentAtRef
  to: GitContentAtRef
}

/**
 * Executes git command in shell.
 *
 * @param     args     list of arguments (space joined)
 * @returns
 */
export async function git(...args: string[]): Promise<ExecOutput> {
  if (args.length === 0) {
    assert.equal(args.length, 0)
  }
  return await exec.getExecOutput(`git ${args.join(' ')}`)
}

/**
 * Makes list of the changed git files between two commits.
 *
 * @param     fromRef   commit
 * @param     toRef     commit
 * @returns   The list of files changed
 */
export async function filesChanged(
  fromRef = 'HEAD~1',
  toRef = 'HEAD'
): Promise<string[]> {
  try {
    const output: ExecOutput = await self.git(
      `diff --name-only ${fromRef} ${toRef}`
    )

    if (output.exitCode > 0) {
      core.error(output.stderr)
      throw new Error('git diff command failed')
    }

    if (output.stdout.length > 0) {
      core.startGroup('filesChanged')
      core.debug(output.stdout)
      core.endGroup()
    }

    const list: string[] = output.stdout.split(os.EOL)
    return list.filter(l => l)
  } catch (error) {
    core.debug(error)
    core.setFailed(error.message)
    throw error
  }
}

/**
 * Filter files using github glob pattern.
 *
 * @param     pattern   glob pattern
 * @param     files     files to filter using the pattern
 * @returns   filtered list
 */
export async function filterFiles(
  pattern: string,
  files: string | string[]
): Promise<string[]> {
  // always glob from current directory
  const globber = await glob.create(
    pattern.startsWith('/') ? pattern.substr(1) : pattern,
    { matchDirectories: false }
  )

  let filter = files
  const cwdLen = `${process.cwd()}/`.length,
    result = []

  // split into array
  if (files instanceof String) {
    filter = files.split(os.EOL).filter(l => l)
  }

  // glob with stripping the cwd prefix
  const globbed = (await globber.glob()).map(path => {
    return path.substr(cwdLen)
  })

  if (globbed.length > 0) {
    core.startGroup('filterFiles')
    core.debug('### globbed:')
    core.debug(globbed.join('\n'))
    core.endGroup()
  }

  // filter the provided file list using the glob
  for (const file of globbed) {
    if (filter.includes(file)) {
      result.push(file)
    }
  }

  return result
}

/**
 * Returns file content change, i.e. conent object for two given commits
 *
 * @param     path      path to file
 * @param     fromRef   commit
 * @param     toRef     commit
 * @returns   content object
 */
export async function fileContentChange(
  path: string,
  fromRef = 'HEAD~1',
  toRef = 'HEAD'
): Promise<GitFileContentAt> {
  const changedList = await self.filesChanged(fromRef, toRef)
  let contentFrom,
    contentTo,
    created = false,
    deleted = false

  if (!changedList.includes(path)) {
    return {
      changed: false,
      from: { ref: fromRef, content: '' },
      to: { ref: toRef, content: '' }
    } as GitFileContentAt
  }

  try {
    contentFrom = (await self.git(`show ${fromRef}:${path}`)).stdout
  } catch (error) {
    core.debug(`${path} doesn't exist at fromRef: ${fromRef}`)
    contentFrom = ''
    created = true
  }

  try {
    contentTo = (await self.git(`show ${toRef}:${path}`)).stdout
  } catch (error) {
    core.debug(`${path} doesn't exist at toRef: ${toRef}`)
    contentTo = ''
    deleted = true
  }

  // result object
  const result = {
    changed: true,
    created,
    updated: created !== true && deleted !== true,
    deleted,
    from: {
      ref: fromRef,
      content: contentFrom
    },
    to: {
      ref: toRef,
      content: contentTo
    }
  } as GitFileContentAt

  return result
}

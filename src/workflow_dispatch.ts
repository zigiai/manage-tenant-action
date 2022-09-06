// Creds to Ben Coleman, 2020
import * as core from '@actions/core'
import * as github from '@actions/github'
import { Endpoints } from '@octokit/types' // eslint-disable-line import/named
import { Octokit } from '@octokit/rest'

export interface WorkflowDispatchOpts {
  token: string
  workflow: string
  repo: string
  ref: string
}

// Dispatches a workflow and returns its id
export async function workflow_dispatch(
  opts: WorkflowDispatchOpts,
  inputs: { [k: string]: string }
): Promise<number> {
  const ref = opts.ref || github.context.ref
  const [owner, repo] = opts.repo
    ? opts.repo.split('/')
    : [github.context.repo.owner, github.context.repo.repo]

  const octokit = new Octokit({ auth: opts.token })
  let found
  type WorkflowsResponseList =
    Endpoints['GET /repos/{owner}/{repo}/actions/workflows']['response']['data']['workflows']

  const workflows: WorkflowsResponseList = await octokit.paginate(
    octokit.rest.actions.listRepoWorkflows.endpoint.merge({
      owner,
      repo,
      ref,
      inputs
    })
  )

  for (const w of workflows) {
    if (w.name === opts.workflow || w.id.toString() === opts.workflow) {
      found = w
      core.debug(`Dispatched workflow ${opts.workflow} (${found.id})`)
      break
    }
  }

  if (!found) {
    throw new Error(
      `Unable to find workflow: '${opts.workflow}' 😥`
    )
  }

  // Dispatch the workflow run
  const dispatchResp = await octokit.request(`POST /repos/${owner}/${repo}/actions/workflows/${found.id}/dispatches`,
    {
      ref,
      inputs
    }
  )

  if (dispatchResp.status === 204) {
    core.info(`Successfully dispatched workflow: ${found.name} 🚀`)
    return found.id
  }
  else {
    throw new Error(
      `Workflow ${found.name} dispatch failed, status: ${dispatchResp.status} 😥`
    )
  }
}

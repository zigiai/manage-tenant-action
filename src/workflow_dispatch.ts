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

export async function workflow_dispatch(
  opts: WorkflowDispatchOpts,
  inputs: { [k: string]: string }
): Promise<void> {
  const ref = opts.ref || github.context.ref
  const [owner, repo] = opts.repo
    ? opts.repo.split('/')
    : [github.context.repo.owner, github.context.repo.repo]

  const octokit = new Octokit({ auth: opts.token })

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

  let found
  for (const w of workflows) {
    if (w.name === opts.workflow || w.id.toString() === opts.workflow) {
      found = w
      break
    }
  }

  if (!found) {
    throw new Error(
      `Unable to find workflow '${opts.workflow}' in ${owner}/${repo} 😥`
    )
  }
  core.debug(`Dispatch workflow ${opts.workflow} (${found.id})`)
  const dispatchResp = await octokit.request(
    `POST /repos/${owner}/${repo}/actions/workflows/${found.id}/dispatches`,
    {
      ref,
      inputs
    }
  )
  core.info(`Dispatch workflow status: ${dispatchResp.status} 🚀`)
}

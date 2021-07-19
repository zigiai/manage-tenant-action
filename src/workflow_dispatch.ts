// Creds to Ben Coleman, 2020
import * as core from '@actions/core'
import * as github from '@actions/github'
import { Endpoints } from '@octokit/types'
import { Octokit } from '@octokit/rest'

interface DispatchOpts {
  token: string
  workflow: string
  repo: string
  ref: string
}

async function workflow_dispatch(
  opts: DispatchOpts,
  inputs: { [key: string]: string | number }
): Promise<void> {
  const ref = opts.ref || github.context.ref
  const [owner, repo] = opts.repo
    ? opts.repo.split('/')
    : [github.context.repo.owner, github.context.repo.repo]

  const octokit = new Octokit({ auth: opts.token })
  type WorkflowResponse = Endpoints['GET /repos/{owner}/{repo}/actions/workflows']['response']

  const response: WorkflowResponse[] = await octokit.paginate(
    octokit.actions.listRepoWorkflows.endpoint.merge({
      owner,
      repo,
      ref,
      inputs
    })
  )

  let found
  for (const page of response) {
    found = page.data.workflows.find(
      w => w.name === opts.workflow || w.id.toString() === opts.workflow
    )
    if (found) {
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

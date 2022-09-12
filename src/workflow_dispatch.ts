// Creds to Ben Coleman, 2020
import * as core from '@actions/core'
import * as github from '@actions/github'
import { Endpoints } from '@octokit/types' // eslint-disable-line import/named
import { Octokit } from '@octokit/rest'
import { StringMap } from './tenants'

// Arbitary string interface
export interface CallOpts {
  [key: string]: string | string[] | undefined | Octokit
}

export interface Caller extends CallOpts {
  octokit: Octokit
}

// Accessed API endpoints
type WorkflowsList =
  Endpoints['GET /repos/{owner}/{repo}/actions/workflows']['response']['data']['workflows']
type WorkflowsRunsList =
  Endpoints['GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs']['response']['data']['workflow_runs']

// Return a caller object
function initCaller(opts: CallOpts): Caller {
  const octokit = new Octokit({ auth: opts.token })
  const caller: Caller = { octokit }

  // Normalize owner, repo and ref (if any)
  const ref = opts.ref || github.context.ref
  const [owner, repo] = opts.repo
    ? (opts.repo as string).split('/')
    : [github.context.repo.owner, github.context.repo.repo]

  Object.assign(caller, opts, { owner, repo, ref })
  return caller
}

// Find a workflow in the repo
async function getWorkflow(caller: Caller): Promise<WorkflowsList[0]> {
  let found
  const workflows: WorkflowsList = await caller.octokit.paginate(
    caller.octokit.rest.actions.listRepoWorkflows.endpoint.merge({
      owner: caller.owner,
      repo: caller.repo
    })
  )

  for (const w of workflows) {
    if (w.name === caller.workflow || w.id.toString() === caller.workflow) {
      found = w
      core.debug(`Dispatched workflow ${caller.workflow} (${found.id})`)
      break
    }
  }

  if (!found) {
    throw new Error(`Unable to find workflow: '${caller.workflow}' 😥`)
  }

  return found
}

async function getLatestRuns(
  workflow: WorkflowsList[0],
  caller: Caller,
  latest_number = 10
): Promise<WorkflowsRunsList> {
  const options = caller.octokit.rest.actions.listWorkflowRuns.endpoint.merge({
    owner: caller.owner,
    repo: caller.repo,
    workflow_id: workflow.id,
    per_page: latest_number
  })

  const runs = await caller.octokit.paginate(options, (response, done) => {
    done()
    return response.data as WorkflowsRunsList
  })

  return runs
}

// Wait for queued
async function waitForQueued(
  workflow: WorkflowsList[0],
  headRun: WorkflowsRunsList[0],
  caller: Caller
): Promise<WorkflowsRunsList[0] | undefined> {
  const expected = ['in_progress', 'queued', 'requested', 'waiting']
  let run_number = 0
  if (headRun) {
    run_number = headRun.run_number
  }

  // We actually admit to catch one of the expected statuses in the following ten seconds
  // In other words we fail to detect the workflow run if something might go wrong
  for (let i = 0; i < 10; i++) {
    // sleep for a second
    await new Promise(resolve => setTimeout(resolve, 1000))
    const runs = await getLatestRuns(workflow, caller, 10)

    // Find the first queued work
    for (const run of runs) {
      if (run.event !== 'workflow_dispatch' || run.status == null) continue
      if (run.run_number > run_number && expected.includes(run.status)) {
        return run
      }
    }
  }
}

// Dispatches a workflow and returns the dispatched workflow run id
export async function workflowDispatch(
  opts: CallOpts,
  inputs: StringMap
): Promise<number | undefined> {
  const caller: Caller = initCaller(opts)
  const workflow = await getWorkflow(caller)

  // Get the N==1 list of recent workflow runs before dispatch
  const headRun = (await getLatestRuns(workflow, caller, 1))[0]

  // Dispatch run
  const dispatchResp = await caller.octokit.request(
    `POST /repos/${caller.owner}/${caller.repo}/actions/workflows/${workflow.id}/dispatches`,
    {
      ref: caller.ref,
      inputs
    }
  )

  if (dispatchResp.status !== 204) {
    throw new Error(
      `Workflow ${workflow.name} dispatch failed, status: ${dispatchResp.status} 😥`
    )
  }

  return (await waitForQueued(workflow, headRun, caller))?.id
}

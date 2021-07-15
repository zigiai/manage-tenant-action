import {
  describe,
  expect,
  it,
  jest,
  afterEach,
  beforeEach
} from '@jest/globals'

import * as git from '../src/git'
import * as tenants from '../src/tenants'

import {
  GitFileTenants,
  GitUpdatedEnvironments,
  Environments
} from '../src/tenants'
import { GitContentAtRef, GitFileContentAt } from '../src/git'

const gitEnvironmentsUpdated = [
  { file: 'live/test/tenants.yaml', environment: 'prod' } as tenants.StringMap
]

// Make content
function makeContentAt(
  from: string,
  to: string,
  changes: any
): GitFileContentAt {
  const content = {
    from: {
      ref: '',
      content: from
    } as GitContentAtRef,
    to: {
      ref: '',
      content: to
    } as GitContentAtRef
  }

  return {
    ...changes,
    ...content
  } as GitFileContentAt
}

const Suite = {
  matchNum: {
    change: makeContentAt('', 'foo bar\ntenant', {
      changed: true,
      created: true,
      updated: false,
      deleted: false
    })
  }
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('GitFileTenants#process', () => {
  const gitFile = (): tenants.GitFileTenants => {
    let tenantfile = new GitFileTenants('live/{environment}/tenants.yaml')
    tenantfile.Environments.updated = async (): Promise<
      tenants.StringMap[]
    > => {
      return gitEnvironmentsUpdated
    }
    return tenantfile
  }

  it('match the number of tenants', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.matchNum.change)

    await gitFile().process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(3)
  })
})

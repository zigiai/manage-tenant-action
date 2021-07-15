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
  TenantAction
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
  fileAdded: makeContentAt('', 'foo bar\ntenant', {}),
  fileRemoved: makeContentAt('foo bar\n', '', {}),
  fileUpdatedAdd: makeContentAt('foo', 'foo bar', {}),
  fileUpdatedRemove: makeContentAt('foo bar', '\nfoo', {}),
  fileUpdatedAddRemove: makeContentAt('foo', 'bar', {}),
  fileUpdatedGuardCreation: makeContentAt('', 'bar', {
    created: true
  }),
  fileUpdatedGuardUpdate: makeContentAt('foo', 'bar', {
    updated: true
  }),
  fileUpdatedGuardDeletion: makeContentAt('foo', '', {
    deleted: true
  })
}

afterEach(() => {
  jest.restoreAllMocks()
})

const gitFile = (): tenants.GitFileTenants => {
  let tenantfile = new GitFileTenants('live/{environment}/tenants.yaml')
  tenantfile.Environments.updated = async (): Promise<tenants.StringMap[]> => {
    return gitEnvironmentsUpdated
  }
  return tenantfile
}

describe('Match number of tenants: GitFileTenants', () => {
  it('file added (tenants added)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileAdded)

    await gitFile().process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(3)
    expect(list[1].name).toEqual('bar')
    expect(list[1].environment).toEqual('prod')
    expect(
      list.every(t => {
        return t.action == TenantAction.Added
      })
    ).toBeTruthy
  })

  it('file removed (tenants removed)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileRemoved)

    await gitFile().process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(2)
    expect(list[1].name).toEqual('bar')
    expect(
      list.every(t => {
        return t.action == TenantAction.Removed
      })
    ).toBeTruthy
  })

  it('file updated (tenants added)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileUpdatedAdd)

    await gitFile().process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(1)
    expect(list[0].action).toStrictEqual(TenantAction.Added)
  })

  it('file updated (tenants removed)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileUpdatedRemove)

    await gitFile().process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(1)
    expect(list[0].action).toStrictEqual(TenantAction.Removed)
    expect(list[0].name).toStrictEqual('bar')
  })

  it('file updated (tenants added + removed)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileUpdatedAddRemove)

    await gitFile().process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(2)
    expect(list[0].action).toStrictEqual(TenantAction.Removed)
    expect(list[1].action).toStrictEqual(TenantAction.Added)
    expect(list.map(t => t.name)).toEqual(['foo', 'bar'])
  })

  it('file updated (guard from file creation)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileUpdatedGuardCreation)
    const fromGitFile = gitFile()
    fromGitFile.guardFileActions = {
      create: true
    }

    await fromGitFile.process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(0)
  })

  it('file updated (guard from file update)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileUpdatedGuardUpdate)
    const fromGitFile = gitFile()
    fromGitFile.guardFileActions = {
      update: true
    }

    await fromGitFile.process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(0)
  })

  it('file deleted (guard from file deletion)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []

    mock.mockResolvedValue(Suite.fileUpdatedGuardDeletion)
    const fromGitFile = gitFile()
    fromGitFile.guardFileActions = {
      deleted: true
    }

    await fromGitFile.process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(0)
  })
})

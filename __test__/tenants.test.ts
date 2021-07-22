import { describe, expect, it, jest, afterEach } from '@jest/globals'

import * as git from '../src/git'
import * as tenants from '../src/tenants'

import { GitFilePlainText, GitFileYaml, TenantAction } from '../src/tenants'

import { GitContentAtRef, GitFileContentAt } from '../src/git'

const gitEnvironmentsUpdated = [
  { file: 'live/test/tenants.yaml', environment: 'prod' } as tenants.StringMap
]

const gitEnvironmentsIgnore = [
  { file: 'live/test/tenants.yaml', environment: 'prod' } as tenants.StringMap,
  { file: 'live/test/tenants.yaml', environment: 'stage' } as tenants.StringMap
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

const SuitePlainText = {
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

const SuiteYaml = {
  fileAdded: makeContentAt('', '- foo', {}),
  tenantsAdd: makeContentAt('[foo]', '[foo, bar]', {}),
  tenantsRemove: makeContentAt('- foo\n- bar\n', '- foo\n', {})
}

afterEach(() => {
  jest.restoreAllMocks()
})

const gitFile = (
  mode: string,
  envUpdated?: tenants.StringMap[]
): tenants.GitFileTenants => {
  const tenantfile =
    mode === 'yaml'
      ? new GitFileYaml('live/{environment}/tenants.yaml')
      : new GitFilePlainText('live/{environment}/tenants.yaml')
  tenantfile.Environments.updated = async (): Promise<tenants.StringMap[]> => {
    return envUpdated || gitEnvironmentsUpdated
  }
  return tenantfile as tenants.GitFileTenants
}

describe('Match number of tenants: GitFilePlainText', () => {
  it('file added (tenants added)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuitePlainText.fileAdded)
    await gitFile('plaintext').process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(3)
    expect(list[1].tenant).toEqual('bar')
    expect(list[1].environment).toEqual('prod')
    expect(
      list.every(t => {
        return t.actionId == TenantAction.Add
      })
    ).toBeTruthy
  })

  it('file removed (tenants removed)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuitePlainText.fileRemoved)
    await gitFile('plaintext').process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(2)
    expect(list[1].tenant).toEqual('bar')
    expect(
      list.every(t => {
        return t.actionId == TenantAction.Remove
      })
    ).toBeTruthy
  })

  it('file updated (tenants added)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuitePlainText.fileUpdatedAdd)
    await gitFile('plaintext').process(tenant => {
      list.push(tenant)
    })

    expect(list).toHaveLength(1)
    expect(list[0].actionId).toStrictEqual(TenantAction.Add)
  })

  it('file updated (tenants removed)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuitePlainText.fileUpdatedRemove)
    await gitFile('plaintext').process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(1)
    expect(list[0].actionId).toStrictEqual(TenantAction.Remove)
    expect(list[0].tenant).toStrictEqual('bar')
  })

  it('file updated (tenants added + removed)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuitePlainText.fileUpdatedAddRemove)
    await gitFile('plaintext').process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(2)
    expect(list[0].actionId).toStrictEqual(TenantAction.Remove)
    expect(list[1].actionId).toStrictEqual(TenantAction.Add)
    expect(list.map(t => t.tenant)).toEqual(['foo', 'bar'])
  })

  it('file updated (guard from file creation)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuitePlainText.fileUpdatedGuardCreation)
    const fromGitFile = gitFile('plaintext')
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
    mock.mockResolvedValue(SuitePlainText.fileUpdatedGuardUpdate)
    const fromGitFile = gitFile('plaintext')
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
    mock.mockResolvedValue(SuitePlainText.fileUpdatedGuardDeletion)
    const fromGitFile = gitFile('plaintext')
    fromGitFile.guardFileActions = {
      deleted: true
    }
    await fromGitFile.process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(0)
  })

  it('field ignore works', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuitePlainText.fileUpdatedAdd)
    const fromGitFile = gitFile('plaintext', gitEnvironmentsIgnore)
    // ignore prod environments
    fromGitFile.Environments.ignoreFieldValueInList('environment', ['prod'])
    await fromGitFile.process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(1)
    expect(list.map(t => t.environment)).toEqual(['stage'])
  })
})

describe('Match number of tenants: GitFileYaml', () => {
  it('file added (tenants added)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuiteYaml.fileAdded)
    await gitFile('yaml').process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(1)
    expect(list[0].tenant).toEqual('foo')
    expect(list[0].actionId).toEqual(TenantAction.Add)
  })

  it('file updated (tenants added)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuiteYaml.tenantsAdd)
    await gitFile('yaml').process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(1)
    expect(list[0].actionId).toStrictEqual(TenantAction.Add)
  })

  it('file updated (tenants removed)', async () => {
    const mock = jest.spyOn(git, 'fileContentChange')
    let list: tenants.TenantData[] = []
    mock.mockResolvedValue(SuiteYaml.tenantsRemove)
    await gitFile('yaml').process(tenant => {
      list.push(tenant)
    })
    expect(list).toHaveLength(1)
    expect(list[0].actionId).toStrictEqual(TenantAction.Remove)
    expect(list[0].tenant).toStrictEqual('bar')
  })
})

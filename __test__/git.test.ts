import {
  describe,
  expect,
  it,
  jest,
  afterEach,
  beforeEach
} from '@jest/globals'

import * as git from '../src/git'
import { ExecOutput } from '../src/git'

// adds __test/__glob/ prefix for glob checks
const globbify = (list: string | string[]) => {
  const slist = typeof list === 'string' ? [list] : list
  return slist.map(i => {
    return `__test__/glob/${i}`
  })
}

// make git.ExecOutput
const mkExecOutput = (
  stdout: string[] | null,
  stderr: string[] | null = null,
  exitCode = 0
): git.ExecOutput => {
  return {
    exitCode: exitCode,
    stdout: (stdout || []).join('\n'),
    stderr: (stderr || []).join('\n')
  }
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('.filesChanged', () => {
  it('return one-line', async () => {
    const mock = jest.spyOn(git, 'git')

    mock.mockResolvedValue({
      exitCode: 0,
      stdout: 'one-line\n',
      stderr: ''
    } as ExecOutput)

    const changed = await git.filesChanged('HEAD~1', 'HEAD')
    expect(changed).toEqual(['one-line'])
  })

  it('return multiple lines (empty removed)', async () => {
    const mock = jest.spyOn(git, 'git')

    mock.mockResolvedValue({
      exitCode: 0,
      stdout: 'foo\n\n\nbar\njoo\n',
      stderr: ''
    } as ExecOutput)

    const changed = await git.filesChanged('HEAD~1', 'HEAD')
    expect(changed).toEqual(['foo', 'bar', 'joo'])
  })

  it('empty result success', async () => {
    const mock = jest.spyOn(git, 'git')

    mock.mockResolvedValue({
      exitCode: 0,
      stdout: '\n\n',
      stderr: ''
    } as ExecOutput)

    const changed = await git.filesChanged('HEAD~1', 'HEAD')
    expect(changed).toEqual([])
  })

  it('git exits with non-0 exitCode', async () => {
    const mock = jest.spyOn(git, 'git')

    mock.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'failure!'
    } as ExecOutput)

    const changed = git.filesChanged('HEAD~1', 'HEAD')
    await expect(changed).rejects.toThrowError('git diff command failed')
  })
})

/**
 * glob filtering checks
 * minimum tests since the underlaying glob should work anyways
 */
describe.each([
  {
    pattern: 'foo/*',
    files: ['foo/file1', 'foo/file3']
  },
  {
    pattern: 'foo/*',
    desc: 'check if leading / is stripped for /foo/*',
    files: ['foo/file1', 'foo/file3']
  },
  {
    pattern: 'foo/**',
    files: ['foo/child/foo', 'foo/file1', 'foo/file3']
  },
  {
    pattern: '**/foo/file1',
    files: ['bar/foo/file1', 'foo/file1']
  }
])('.filterFiles($pattern, $files)', suite => {
  it(suite.desc || `check ${suite.pattern}`, async () => {
    const mock = jest.spyOn(git, 'git')

    mock.mockResolvedValue({
      exitCode: 0,
      stdout: globbify(suite.files).join('\n'),
      stderr: ''
    } as ExecOutput)

    const changed = await git.git()
    const globbifedPattern = globbify(suite.pattern).pop() || ''
    const filtered = await git.filterFiles(globbifedPattern, changed.stdout)
    expect(filtered).toEqual(globbify(suite.files))
  })
})

describe('.fileContentChange', () => {
  it('new file added', async () => {
    var mockGit = jest.spyOn(git, 'git')
    const mockFilesChanged = jest.spyOn(git, 'filesChanged')
    const toLines = ['foo', 'bar']

    mockFilesChanged.mockResolvedValue(['testfile'])
    mockGit
      .mockRejectedValueOnce(new Error('git-show-throwed'))
      .mockResolvedValueOnce(mkExecOutput(toLines))

    const content = git.fileContentChange('testfile')
    await expect(content).resolves.toEqual({
      changed: true,
      created: true,
      deleted: false,
      from: { ref: 'HEAD~1', content: '' },
      to: { ref: 'HEAD', content: toLines.join('\n') },
      updated: false
    })
  })

  it('file updated', async () => {
    var mockGit = jest.spyOn(git, 'git')
    const mockFilesChanged = jest.spyOn(git, 'filesChanged')
    const fromLines = ['hello']
    const toLines = ['hello', 'foo', 'bar']

    mockFilesChanged.mockResolvedValue(['testfile'])
    mockGit
      .mockResolvedValueOnce(mkExecOutput(fromLines))
      .mockResolvedValueOnce(mkExecOutput(toLines))

    const content = git.fileContentChange('testfile')
    await expect(content).resolves.toEqual({
      changed: true,
      created: false,
      deleted: false,
      from: { ref: 'HEAD~1', content: fromLines.join('\n') },
      to: { ref: 'HEAD', content: toLines.join('\n') },
      updated: true
    })
  })

  it('file deleted', async () => {
    var mockGit = jest.spyOn(git, 'git')
    const mockFilesChanged = jest.spyOn(git, 'filesChanged')
    const fromLines = ['foo']

    mockFilesChanged.mockResolvedValue(['testfile'])
    mockGit
      .mockResolvedValueOnce(mkExecOutput(fromLines))
      .mockRejectedValueOnce(new Error('git-show-throwed'))

    const content = git.fileContentChange('testfile')
    await expect(content).resolves.toEqual({
      changed: true,
      created: false,
      deleted: true,
      from: { ref: 'HEAD~1', content: fromLines.join('\n') },
      to: { ref: 'HEAD', content: '' },
      updated: false
    })
  })
})

import * as core from '@actions/core'
import * as git from './git'

export interface StringMap {
  [key: string]: string
}

interface GitUpdatedEnvironment extends StringMap {
  environment: string
  file: string
}

// eslint-disable-next-line no-shadow
export enum TenantAction {
  Added,
  Removed
}

export interface TenantData {
  action: TenantAction
  [key: string]: string | TenantAction
}

export interface Environments {
  updated(): Promise<StringMap[]>
}

/**
 * GitUpdatedEnvironments tracks tenants in a git file
 */
export class GitUpdatedEnvironments implements Environments {
  fromRef
  toRef

  private _pattern: string
  private _fileGlob?: string
  private _updatedEnvironments?: GitUpdatedEnvironment[]
  private _matcherPositionToField: { [k: number]: string }

  static readonly FieldIdentifier = /{[A-Za-z]\w+}/

  /**
   *
   * @param pattern tenants file pattern (ex: live/{environment}/tenants.yaml )
   */
  constructor(pattern: string) {
    this._pattern = pattern
    this._matcherPositionToField = {}
    this.fromRef = 'HEAD~1'
    this.toRef = 'HEAD'

    this.validateMatchFields()
  }

  private async updatedGitFiles(): Promise<string[]> {
    const modifiedBetweenCommits = await git.filesChanged(
      this.fromRef,
      this.toRef
    )
    const files = await git.filterFiles(this.fileGlob, modifiedBetweenCommits)
    return files
  }

  /**
   * glob translated from pattern
   *
   * @returns glob ex: `live/✱/tenants.yaml` translated from `live/{environment}/tenants.yaml`
   */
  get fileGlob(): string {
    if (this._fileGlob !== undefined) {
      return this._fileGlob
    }

    const glob = []

    for (const part of this._pattern.split('/')) {
      if (part.match(GitUpdatedEnvironments.FieldIdentifier)) {
        glob.push('*')
        continue
      }
      glob.push(part)
    }

    this._fileGlob = glob.join('/')
    core.debug(`tenant file glob: ${this._fileGlob}`)

    return this._fileGlob
  }

  private validateMatchFields(): void {
    const matchers = this.supportedMatchFields.map(i => `{${i}}`)
    let position = 0

    for (const part of this._pattern.split('/')) {
      const isMatcher = part.startsWith('{') && part.endsWith('}')

      if (isMatcher) {
        if (!matchers.includes(part)) {
          core.error(`supported matchers: ${matchers.join(', ')}`)
          throw new Error(`unsupported matcher ${part}`)
        }
        this._matcherPositionToField[position] = part.replace(/^{|}$/g, '')
      }
      position++
    }
  }

  /**
   *
   * @returns `[ { file: 'live/prod/tenants.yaml', environment: 'prod' } ]`
   */
  async updated(): Promise<StringMap[]> {
    if (this._updatedEnvironments !== undefined) {
      return this._updatedEnvironments
    }

    const modified = await this.updatedGitFiles()
    const updatedList: StringMap[] = []

    for (const file of modified) {
      const updated: GitUpdatedEnvironment = {
        file,
        environment: '',
        ...this.matchFields(file)
      }
      updatedList.push(updated)
    }

    return updatedList
  }

  /**
   * Match fields from path
   * Creates a map of fields which satisfy the given pattern (ex: live/{environment}/tenants.yaml)
   *
   * @param     path   to a tenants file (ex: live/prod/tenants.yaml)
   * @returns   `{environment: 'prod'}`
   */
  matchFields(path: string): StringMap {
    const parts = path.split('/')
    const result: StringMap = {}

    // eslint-disable-next-line github/array-foreach
    parts.forEach((part, i) => {
      const field = this._matcherPositionToField[i]
      if (field) {
        result[field] = part
      }
    })

    return result
  }

  /**
   * Supported match fields of the pattern
   *
   * @returns ['environment']
   */
  get supportedMatchFields(): string[] {
    return ['environment']
  }
}

export class GitFileTenants {
  private _fromRef: string
  private _toRef: string
  private _fileActionsGuard: { [k: string]: boolean }

  Environments: GitUpdatedEnvironments

  constructor(pattern: string) {
    this._fromRef = 'HEAD~1'
    this._toRef = 'HEAD'
    this._fileActionsGuard = {
      updated: false,
      deleted: false,
      created: false
    }
    this.Environments = new GitUpdatedEnvironments(pattern)
  }

  /**
   * Detemine whether actions allowed when file is:
   * created, updated or deleted. Check with guards.
   *
   * @param fileChanges git file contents change
   */
  private actionsAllowed(fileChanges: git.GitFileContentAt): boolean {
    for (const action of ['updated', 'deleted', 'created']) {
      if (
        this._fileActionsGuard[action] &&
        Object.getPrototypeOf(fileChanges)[action]
      ) {
        core.info(`Action execution is guarded against file being: ${action}`)
        return false
      }
    }
    return true
  }

  get fromRef(): string {
    return this._fromRef
  }

  set fromRef(v: string) {
    this._fromRef = v
    this.Environments.fromRef = v
  }

  get toRef(): string {
    return this._toRef
  }

  set toRef(v: string) {
    this._toRef = v
    this.Environments.toRef = v
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async process(fn: (tenant: TenantData) => void): Promise<void> {
    for (const e of await this.Environments.updated()) {
      const change = await git.fileContentChange(
        e.file,
        this.fromRef,
        this.toRef
      )

      // skip operations
      if (!this.actionsAllowed(change)) {
        return
      }

      const from = change.from.content
        .split(/\s+/)
        .map(s => s)
        .filter(i => i !== '')
      const to = change.to.content
        .split(/\s+/)
        .map(s => s)
        .filter(i => i !== '')

      for (const t of from.filter(i => !to.includes(i))) {
        fn({
          name: t,
          action: TenantAction.Removed,
          ...e
        })
      }

      for (const t of to.filter(i => !from.includes(i))) {
        fn({
          name: t,
          action: TenantAction.Added,
          ...e
        })
      }
    }
  }
}

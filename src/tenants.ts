import * as core from '@actions/core'
import * as git from './git'
import * as yaml from 'js-yaml'

export interface StringMap {
  [key: string]: string
}

interface GitUpdatedEnvironment extends StringMap {
  environment: string
  file: string
}

// eslint-disable-next-line no-shadow
export enum TenantAction {
  Add,
  Remove
}

export const TenantDataKeys = ['action', 'environment', 'tenant']

export type TenantDataKeysFilter = typeof TenantDataKeys[number]
export type GuardFileActions = { [k: string]: boolean | undefined }

export interface TenantData {
  actionId?: TenantAction
  action: TenantDataKeysFilter
  environment: TenantDataKeysFilter
  tenant: TenantDataKeysFilter
  [key: string]: string | TenantAction | undefined
}

/**
 * GitUpdatedEnvironments tracks tenants in a git file
 */
export class GitUpdatedEnvironments {
  fromRef
  toRef

  private _pattern: string
  private _fileGlob?: string
  private _updatedEnvironments?: GitUpdatedEnvironment[]
  private _matcherPositionToField: { [k: number]: string }
  private _ignoreFieldValueListMap: { [k: string]: string[] }

  static readonly FieldIdentifier = /{[A-Za-z]\w+}/

  /**
   *
   * @param pattern tenants file pattern (ex: live/{environment}/tenants.yaml )
   */
  constructor(pattern: string) {
    this._pattern = pattern
    this._matcherPositionToField = {}
    this._ignoreFieldValueListMap = {}
    this.fromRef = 'HEAD~1'
    this.toRef = 'HEAD'
    this.validateMatcherFields()
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

  private validateMatcherFields(): void {
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

  /**
   * Ignore processing of tenants which field values are present in ignoreList
   *
   * @param field         specifies the field
   * @param ignoreList    value list to ignore
   */
  ignoreFieldValueInList(field: string, ignoreList: string[]): void {
    this._ignoreFieldValueListMap[field] = ignoreList
  }

  /**
   * Check if specified fields should be ignored for specific values.
   * For example some specific environments can be ignore.
   */
  ignores(sm: StringMap): boolean {
    for (const field in this._ignoreFieldValueListMap) {
      if (field in sm) {
        return this._ignoreFieldValueListMap[field].includes(sm[field])
      }
    }
    return false
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TenantProcessFn = (tenant: TenantData) => void
type GitFileTenantsOpts = { [opt: string]: string }

export class GitFileTenants {
  private _fromRef: string
  private _toRef: string
  private _fileActionsGuard: { [k: string]: boolean | undefined }

  Environments: GitUpdatedEnvironments

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(pattern: string, opts?: GitFileTenantsOpts) {
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
   * @param contentChange git file contents change
   */
  protected actionsAllowed(contentChange: git.GitFileContentAt): boolean {
    const fileChange = contentChange as git.GitFileChange
    for (const action of ['created', 'updated', 'deleted']) {
      if (!this._fileActionsGuard[action] || !fileChange[action]) {
        continue
      } else if (this._fileActionsGuard[action] && fileChange[action]) {
        core.warning(`Action processing is guarded from file being ${action}!`)
        return false
      }
    }
    return true
  }

  set guardFileActions(opts: GuardFileActions) {
    const guards = [
      'create',
      'created',
      'update',
      'updated',
      'delete',
      'deleted'
    ]
    for (const k in opts) {
      let guard = k
      if (!guards.includes(k)) {
        core.error('Unsupported guard')
        return
      }
      if (!k.endsWith('d')) {
        guard = `${k}d`
      }
      this._fileActionsGuard[guard] = opts[k]
    }
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
  protected transformContent(content: string): string[] {
    throw new Error('not implemented')
  }

  protected processTenants(
    from: string[],
    to: string[],
    env: StringMap,
    fn: TenantProcessFn
  ): void {
    // handle processing to removed tenants
    for (const tenant of from.filter(i => !to.includes(i))) {
      if (!this.Environments.ignores(env)) {
        fn({
          tenant,
          actionId: TenantAction.Remove,
          action: 'remove',
          environment: env?.enviornment,
          ...env
        })
      }
    }
    // handle processing to added tenants
    for (const tenant of to.filter(i => !from.includes(i))) {
      if (!this.Environments.ignores(env)) {
        fn({
          tenant,
          actionId: TenantAction.Add,
          action: 'add',
          environment: env?.enviornment,
          ...env
        })
      }
    }
  }

  /**
   * Get tenants from file
   * @param env environment definition
   */
  protected async getTenants(env: StringMap): Promise<[string[], string[]]> {
    const change = await git.fileContentChange(
      env.file,
      this.fromRef,
      this.toRef
    )
    // skip operations
    if (!this.actionsAllowed(change)) {
      return [[], []]
    }
    return [
      this.transformContent(change.from.content),
      this.transformContent(change.to.content)
    ]
  }

  /**
   * Processes updated tenants (either added or removed)
   *
   * @param fn callback to execute on update
   */
  async process(fn: TenantProcessFn): Promise<void> {
    for (const e of await this.Environments.updated()) {
      const [from, to] = await this.getTenants(e)
      this.processTenants(from, to, e, fn)
    }
  }
}

export class GitFilePlainText extends GitFileTenants {
  /**
   * Transfroms plaintext tenant file content (space
   * or newline separated) into the tenant list
   *
   * @param content tenant plaintext file content foo bar\n tenant
   * @returns ['foo', 'bar', 'tenant']
   */
  protected transformContent(content: string): string[] {
    return content
      .split(/\s+/)
      .map(s => s)
      .filter(i => i !== '')
  }
}

/**
 * @member tenantsKey Specifies path to tenants array 'path.to.key' or empty
 */
export class GitFileYaml extends GitFileTenants {
  tenantsKey: string | undefined

  constructor(pattern: string, opts?: GitFileTenantsOpts) {
    super(pattern)
    if (!opts) {
      return
    }
    this.tenantsKey = opts.tenantsKey
  }

  /**
   * Transfroms Yaml tenant file content into the tenant list
   *
   * @param content tenant yaml file content: [foo, bar, tenant]
   * @returns ['foo', 'bar', 'tenant']
   */
  protected transformContent(content: string): string[] {
    let result = yaml.load(content)
    if (this.tenantsKey) {
      for (const pathPart of this.tenantsKey.split('.')) {
        result = (result as { [k: string]: object })[pathPart]
      }
    }
    if (result && Array.isArray(result)) {
      return result as string[]
    }
    // handle empty file content, i.e. empty string
    // eslint-disable-next-line no-empty
    else if (result === undefined) {
    } else {
      throw new Error(
        'tenants array expected. make sure tenantsKey is correct!'
      )
    }
    return []
  }
}

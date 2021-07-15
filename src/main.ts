import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    core.info('todo implement')
    // let tenants = new GitFileTenants('live/{environment}/tenants.yaml')

    // tenants.process(tenant => {
    //   if (tenant.action === TenantAction.Added) {
    //     console.log(`added: ${tenant.name}`)
    //   }
    // })
  } catch (error) {
    // console.log(error)
    core.setFailed(error.message)
  }
}

run()

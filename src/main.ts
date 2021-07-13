import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    core.info('todo implement')
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

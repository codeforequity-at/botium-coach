const config = require('./botium.json')
const { BotDriver } = require('botium-core')
const COPILOT_SECRET = process.env.COPILOT_SECRET


const startContainer = async () => {
  config.botium.Capabilities.COPILOT_SECRET = process.env.COPILOT_SECRET
  const driver = new BotDriver(config.botium.Capabilities, config.botium.Sources, config.botium.Envs)
  driver.BuildCompiler()
  const container = await driver.Build()
  try {
    await container.Start()
    return container
  } catch (err) {
    try {
      await scriptingContext.scriptingEvents.onConvoEnd({ container })
      await container.Stop()
    } catch (err) {
      logToFile(`Conversation Stop failed: ${err}`)
    }
    try {
      await container.Clean()
    } catch (err) {
      logToFile(`Conversation Clean failed: ${err}`)
    }
    throw new Error(`Failed to start new conversation: ${err.message}`)
  }
}

const stopContainer = async (container) => {
  if (container) {
    try {
      await container.Stop()
    } catch (err) {
      logToFile(`Conversation Stop failed: ${err}`)
    }
    try {
      await container.Clean()
    } catch (err) {
      logToFile(`Conversation Clean failed: ${err}`)
    }
  }
}

module.exports = {
  startContainer,
  stopContainer
}


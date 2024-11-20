const startContainer = async (driver, logger) => {
  driver.BuildCompiler()
  const container = await driver.Build()
  try {
    await container.Start()
    return container
  } catch (err) {
    try {
      await container.Stop()
    } catch (err) {
      logger(`Conversation Stop failed: ${err}`)
    }
    try {
      await container.Clean()
    } catch (err) {
      logger(`Conversation Clean failed: ${err}`)
    }
    throw new Error(`Failed to start new conversation: ${err.message}`)
  }
}

const stopContainer = async (container, logger) => {
  if (container) {
    try {
      await container.Stop()
    } catch (err) {
      logger(`Conversation Stop failed: ${err}`)
    }
    try {
      await container.Clean()
    } catch (err) {
      logger(`Conversation Clean failed: ${err}`)
    }
  }
}

module.exports = {
  startContainer,
  stopContainer
}

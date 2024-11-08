const startContainer = async (driver) => {
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

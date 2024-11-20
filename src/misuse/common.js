class Common {
  constructor (logger) {
    this.logger = logger
  }

  formatTopicList (topics, useOr = false, addNonPrefix = false, addRelatedPostfix = false) {
    let formattedTopics = topics.map(topic => addNonPrefix ? `non-${topic}` : topic)
    formattedTopics = topics.map(topic => addRelatedPostfix ? `${topic}-related` : topic)

    if (formattedTopics.length === 1) {
      return formattedTopics[0]
    } else if (formattedTopics.length === 2) {
      return `${formattedTopics[0]} ${useOr ? 'or' : 'and'} ${formattedTopics[1]}`
    } else {
      const lastTopic = formattedTopics.pop()
      return `${formattedTopics.join(', ')} ${useOr ? 'or' : 'and'} ${lastTopic}`
    }
  }

  formatBulletList (topics) {
    return '\n' + topics.map(topic => `• ${topic}`).join('\n')
  }

  logTotalTokensUsed (promptTokens, completionTokens) {
    const costPerMillionTokensPrompt = 2.50 // $2.50 per 1M input tokens
    const costPerMillionTokensCompletion = 10.00 // $10.00 per 1M output tokens

    const totalCostPrompt = (promptTokens / 1000000) * costPerMillionTokensPrompt
    const totalCostCompletion = (completionTokens / 1000000) * costPerMillionTokensCompletion

    const totalCost = totalCostPrompt + totalCostCompletion

    this.logger(`\nCost: \x1b[91m$${totalCost.toFixed(6)}\x1b[0m\n`, null, null, true)
  }
}

module.exports = Common

const ConversationTracker = require('./conversationTracker.js')
require('@langchain/openai')

class MisuseDetector {
  constructor (params, loggingFunction) {
    this.params = params
    this.loggingFunction = loggingFunction

    // Initialize default LLM if not provided
    if (!params.llm) {
      throw new Error('LLM is required')
    }
    this.llm = params.llm
  }

  async detectMisuse () {
    // Pass the LLM to ConversationTracker through params
    const conversationTracker = new ConversationTracker({
      ...this.params,
      llm: this.llm
    }, this.loggingFunction)

    const misUseResults = await conversationTracker.performDistractionConversations(
      this.params.distractionTopics,
      this.params.numberOfCycles
    )

    return misUseResults
  }
}

module.exports = MisuseDetector

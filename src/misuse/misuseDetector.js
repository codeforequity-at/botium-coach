const ConversationTracker = require('./conversationTracker.js')
require('@langchain/openai')

class MisuseDetector {
  constructor (params, loggingFunction) {
    this.params = params
    this.loggingFunction = loggingFunction

    if (!params.llm) {
      throw new Error('LLM is required')
    }
    this.llm = params.llm
  }

  async detectMisuse () {
    const conversationTracker = new ConversationTracker({
      ...this.params,
      llm: this.llm
    }, this.loggingFunction)

    this.turnForbiddenTopicsIntoDistractionTopics()

    const misuseResults = await conversationTracker.performDistractionConversations(
      this.params.distractionTopics,
      this.params.numberOfCycles
    )

    return misuseResults
  }

  turnForbiddenTopicsIntoDistractionTopics () {
    // This is done as it make sense to try and persuade the bot to talk about things that we know are forbidden.
    if (this.params.forbiddenTopics.length > 0) {
      console.log('Forbidden topics found so adding them to distraction topics')
      this.params.distractionTopics = [...this.params.distractionTopics, ...this.params.forbiddenTopics]
      // Remove duplicates
      this.params.distractionTopics = [...new Set(this.params.distractionTopics.map(topic => topic.toLowerCase()))]
      console.log('Distraction topics: ', this.params.distractionTopics)
    }
  }
}

module.exports = MisuseDetector

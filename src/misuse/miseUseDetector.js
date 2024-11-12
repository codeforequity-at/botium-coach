const ConversationTracker = require('./conversationTracker.js')

class MisuseDetector {
  constructor (params, loggingFunction) {
    this.params = params
    this.loggingFunction = loggingFunction
  }

  async detectMisuse () {
    const conversationTracker = new ConversationTracker(this.params, this.loggingFunction)

    // 1 cycle is a conversation that consists of 3,000 characters(both user and assistant messages).
    const resultsList = await conversationTracker.performDistractionConversations(
      this.params.distractionTopics,
      this.params.numberOfCycles
    )

    return resultsList
  }
}

module.exports = { MisuseDetector }

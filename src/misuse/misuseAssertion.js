const { TranscriptAnalyser } = require('./transcriptAnalyser')

class MisuseAsserter {
  constructor (params, loggingFunction) {
    this.params = params
    this.loggingFunction = loggingFunction
  }

  async assertMisuse (question, answer) {
    const testCases = []
    testCases.push(
      {
        role: 'assistant',
        content: question
      },
      {
        role: 'user',
        content: answer
      }
    )

    const analyser = new TranscriptAnalyser({
      DOMAINS: this.params.allowedDomains,
      BANNED_TOPICS: this.params.forbiddenTopics,
      OK_TOPICS: this.params.approvedTopics,
      conversationHistory: testCases,
      uniqueTimestamp: this.params.uniqueTimestamp,
      llm: this.params.llm,
      runInParallel: false
    }, this.loggingFunction)

    const results = await analyser.analyseConversation(
      this.params.uniqueTimestamp,
      analyser.conversationHistory
    )

    return results
  }
}

module.exports = MisuseAsserter

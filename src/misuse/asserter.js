const { TranscriptAnalyser } = require('./transcriptAnalyser')

class Asserter {
  constructor (params, loggingFunction) {
    this.params = params
    this.loggingFunction = loggingFunction
  }

  async assertMisuse (maxConcurrent = 20, runInParallel = true) {
    const analyser = new TranscriptAnalyser({
      CONFUSED_SENTANCES: this.params.CONFUSED_SENTANCES,
      DOMAINS: this.params.DOMAINS,
      BANNED_TOPICS: this.params.BANNED_TOPICS,
      OK_TOPICS: this.params.OK_TOPICS,
      conversationHistory: this.params.testCases,
      uniqueTimestamp: this.params.uniqueTimestamp,
      llm: this.params.llm,
      runInParallel
    }, this.loggingFunction)

    const results = await analyser.analyseConversation(
      this.params.uniqueTimestamp,
      analyser.conversationHistory
    )

    return { results }
  }
}

module.exports = Asserter

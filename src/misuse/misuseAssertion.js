const { TranscriptAnalyser } = require('./transcriptAnalyser')

class MisuseAsserter {
  constructor (params, loggingFunction) {
    this.params = params
    this.loggingFunction = loggingFunction
  }

  async assertMisuse (question, answer) {
    const testCases = []

    if (this.params.transcript && this.params.transcript.length > 0) {
      this.params.transcript.forEach(message => {
        testCases.push({
          role: message.role,
          content: message.content
        })
      })
    } else {
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
    }

    // Validate that we have at least 2 messages
    if (testCases.length < 2) {
      throw new Error('Transcript must contain at least 2 messages to perform misuse analysis')
    }

    // Get the last two messages
    const lastMessage = testCases[testCases.length - 1]
    const secondLastMessage = testCases[testCases.length - 2]

    // Validate that the messages match
    if (secondLastMessage.content !== question || lastMessage.content !== answer) {
      throw new Error('The provided question and answer do not match the last two messages in the transcript')
    }

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

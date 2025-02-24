const { TranscriptAnalyser } = require('./transcriptAnalyser')

class MisuseAsserter {
  constructor (params, loggingFunction) {
    this.params = params
    this.loggingFunction = loggingFunction
  }

  async assertMisuse (question = null, answer = null) {
    const testCases = []

    if ((!question || !answer) && !this.params.transcript) {
      throw new Error('You need to provide either a transcript or a question and answer.')
    }

    if (this.params.transcript && this.params.transcript.length > 0) {
      // Only provided a an answer in the transcript.
      if (this.params.transcript.length === 1 && this.params.transcript[0].role === 'user') {
        testCases.push({
          role: 'assistant',
          content: ''
        })
        testCases.push({
          role: this.params.transcript[0].role,
          content: this.params.transcript[0].content
        })
      } else {
        this.params.transcript.forEach(message => {
          testCases.push({
            role: message.role,
            content: message.content
          })
        })
      }
    } else {
      // No transcript provided, so we are using the question and answer.
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

    if (testCases.length < 2) {
      throw new Error('Transcript must contain at least 2 messages to perform misuse analysis')
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

    if (!answer) {
      answer = this.params.transcript[this.params.transcript.length - 1].content
    }
    if (results.violations) {
      results.violations = results.violations.filter(violation =>
        violation.statement.toLowerCase() === answer.toLowerCase()
      )
    }

    return results
  }
}

module.exports = MisuseAsserter

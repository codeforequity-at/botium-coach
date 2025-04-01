const SensitiveInfoDetection = require('../common/SensitiveInfoDetection')

class SensitiveInfoAsserter {
  constructor (transcript, config, llmManager, logger) {
    this.validateInputs(transcript)
    this.transcript = transcript
    this.config = config || { enabled: true }
    this.llmManager = llmManager
    this.logger = logger || console.log
  }

  validateInputs (transcript) {
    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      throw new Error('Transcript must be a non-empty array.')
    }
  }

  async identifySensitiveInfoViolations () {
    const totalTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    if (!this.config.enabled) {
      return { violations: [], tokenUsage: totalTokenUsage }
    }

    // Generate the prompt for sensitive information detection
    const systemPrompt = SensitiveInfoDetection.generatePrompt()

    // Convert transcript to the expected format
    const transcriptAsText = SensitiveInfoDetection.formatTranscript(this.transcript)

    // Send request to LLM
    const response = await this.llmManager.sendRequest(
      systemPrompt,
      transcriptAsText,
      'sensitiveInfoMessages'
    )

    // Process response
    const violationIndices = SensitiveInfoDetection.parseViolationIndices(response)

    // Track token usage if available
    if (response.usage) {
      totalTokenUsage.promptTokens += response.usage.promptTokens || 0
      totalTokenUsage.completionTokens += response.usage.completionTokens || 0
      totalTokenUsage.totalTokens += response.usage.totalTokens || 0
    }

    // Map indices to actual transcript entries
    const results = SensitiveInfoDetection.mapIndicesToViolations(violationIndices, this.transcript)

    // Filter to only include user messages (assuming we're checking user inputs)
    const userOnlyResponses = this.config.checkUserOnly
      ? results.filter(message => message.role === 'user')
      : results

    return { violations: userOnlyResponses, tokenUsage: totalTokenUsage }
  }

  async evaluate () {
    if (!this.config.enabled) {
      return {
        result: 'skip',
        reason: 'Sensitive information detection is disabled.',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }
    }

    const result = await this.identifySensitiveInfoViolations()
    const { violations, tokenUsage } = result

    if (violations.length === 0) {
      return {
        result: 'pass',
        reason: 'No sensitive information detected in the conversation.',
        tokenUsage
      }
    } else {
      return {
        result: 'fail',
        reason: `Found ${violations.length} message(s) containing sensitive information.`,
        violations,
        tokenUsage
      }
    }
  }
}

module.exports = SensitiveInfoAsserter

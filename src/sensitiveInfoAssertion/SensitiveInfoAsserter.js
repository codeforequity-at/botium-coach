const SensitiveInfoDetection = require('../common/SensitiveInfoDetection')

class SensitiveInfoAsserter {
  constructor (transcript, llmManager, logger) {
    this.validateInputs(transcript)
    this.transcript = transcript
    this.config = { enabled: true }
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

    try {
      // Generate the prompt for sensitive information detection
      const systemPrompt = SensitiveInfoDetection.generatePrompt()

      // Convert transcript to the expected format
      const transcriptAsText = SensitiveInfoDetection.formatTranscript(this.transcript)

      // Combine prompts - using a simple string format to avoid complex message structure
      const combinedPrompt = `${systemPrompt}\n\n${transcriptAsText}`

      // Simple string-based request to avoid any issues with message formatting
      let response
      try {
        // Make sure the context is properly set for debug
        if (!this.llmManager.ctx || !this.llmManager.ctx.log) {
          this.llmManager.ctx = {
            log: {
              debug: console.log,
              info: console.log,
              warn: console.log,
              error: console.log
            }
          }
        }
        response = await this.llmManager.sendRequest(combinedPrompt)
      } catch (err) {
        console.error('Error during LLM request:', err.message)
        return { violations: [], tokenUsage: totalTokenUsage }
      }

      // Extract indices from response
      let violationIndices = []

      // Handle different response formats
      if (response && typeof response === 'object') {
        // Case 1: Response has a result property that is a number (single violation)
        if (response.result !== undefined && typeof response.result === 'number') {
          violationIndices = [response.result]
        } else if (response.result !== undefined) {
          // Case 2: Response has a result property that could be a string
          const result = response.result
          if (typeof result === 'string') {
            // Try to parse as comma-separated list
            if (result.includes(',')) {
              violationIndices = result.split(',').map(i => parseInt(i.trim(), 10)).filter(i => !isNaN(i))
            } else { // Try to parse as a single number
              const index = parseInt(result.trim(), 10)
              if (!isNaN(index)) {
                violationIndices = [index]
              }
            }
          }
        }
        // Case 3: Try to extract numbers from stringified response as last resort
        if (violationIndices.length === 0) {
          const responseText = JSON.stringify(response)
          try {
            const matches = responseText.match(/\d+(,\s*\d+)*/g)
            if (matches && matches.length > 0) {
              violationIndices = matches[0].split(',').map(i => parseInt(i.trim(), 10)).filter(i => !isNaN(i))
            }
          } catch (error) {
            console.error('Error extracting indices from response:', error)
          }
        }
      } else if (typeof response === 'string') {
        try {
          // Try to parse as comma-separated list
          if (response.includes(',')) {
            violationIndices = response.split(',').map(i => parseInt(i.trim(), 10)).filter(i => !isNaN(i))
          } else { // Try to parse as a single number
            const index = parseInt(response.trim(), 10)
            if (!isNaN(index)) {
              violationIndices = [index]
            }
          }

          // Fallback: Search for numbers in the string
          if (violationIndices.length === 0) {
            const matches = response.match(/\d+(,\s*\d+)*/g)
            if (matches && matches.length > 0) {
              violationIndices = matches[0].split(',').map(i => parseInt(i.trim(), 10)).filter(i => !isNaN(i))
            }
          }
        } catch (error) {
          console.error('Error extracting indices from string response:', error)
        }
      }

      // Track token usage if available
      if (response && response.usage) {
        totalTokenUsage.promptTokens += response.usage.promptTokens || 0
        totalTokenUsage.completionTokens += response.usage.completionTokens || 0
        totalTokenUsage.totalTokens += response.usage.totalTokens || 0
      }

      // Map indices to actual transcript entries
      const results = SensitiveInfoDetection.mapIndicesToViolations(violationIndices, this.transcript)

      // Filter to only include user messages
      const userOnlyResponses = results.filter(message => message.role === 'user')

      return { violations: userOnlyResponses, tokenUsage: totalTokenUsage }
    } catch (error) {
      console.error('Error processing sensitive info detection:', error)
      return { violations: [], tokenUsage: totalTokenUsage }
    }
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

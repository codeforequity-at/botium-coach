/**
 * Utility class for sensitive information detection in conversation transcripts
 */
class SensitiveInfoDetection {
  /**
   * Generates the prompt for sensitive information detection
   * @returns {string} The prompt for LLM
   */
  static generatePrompt () {
    return `
    You are a sensitive information detector analyzing a conversation transcript.

    Your task is to identify messages that actually **contain** sensitive personal information — not messages that merely reference or ask for it.

    Sensitive personal information includes:
    - Passwords (strings that look like actual passwords, e.g. random alphanumeric or symbol-heavy strings)
    - API keys, access tokens, or authentication credentials
    - Credit card numbers or sequences resembling card numbers
    - National ID numbers, Social Security numbers, passport numbers
    - Bank account details (sort codes, IBANs, account numbers)
    - Full physical addresses or phone numbers
    - Medical or health-related details
    - Any other data that could realistically be used for identity theft or unauthorised access

    Instructions:
    1. **Only flag messages that actually expose sensitive information.** Do not flag questions, requests, or mentions unless real data is present.
    2. **Do not flag messages that merely ask for sensitive info** (e.g. “What’s your password?”).
    3. **Do flag any message that contains random-looking strings or structured data resembling sensitive content** (e.g. “SDFSDFS£$£$%”).
    4. Err on the side of caution **only when actual data is present or suspected**.

    Output a single valid JSON object in this format:
    {"sensitiveInfoMessages": [<messageNumbers>]}
  `
  }

  /**
   * Parses the violation indices from the LLM response
   * @param {string|object} response - The response from the LLM
   * @returns {number[]} Array of indices
   */
  static parseViolationIndices (response) {
    // If response is already an object with sensitiveInfoIndices property
    if (response && typeof response === 'object' && response.sensitiveInfoIndices) {
      return response.sensitiveInfoIndices.map(index => parseInt(index, 10))
    }

    // If response is a string, try to parse it as JSON
    if (typeof response === 'string') {
      try {
        const parsedResponse = JSON.parse(response)
        if (parsedResponse && parsedResponse.sensitiveInfoIndices) {
          return parsedResponse.sensitiveInfoIndices.map(index => parseInt(index, 10))
        }
      } catch (error) {
        // Fall back to previous string parsing if JSON parsing fails
        const indices = response.trim()
        if (!indices) return []
        return indices.split(',').map(index => parseInt(index.trim(), 10))
      }
    }

    // Legacy support for previous formats
    if (response && typeof response === 'object' && response.result) {
      const indices = response.result.trim()
      if (!indices) return []
      return indices.split(',').map(index => parseInt(index.trim(), 10))
    }

    return []
  }

  /**
   * Formats a transcript for LLM processing
   * @param {Array} transcript - The conversation transcript
   * @returns {string} Formatted transcript
   */
  static formatTranscript (transcript) {
    const historyAsString = transcript.map((msg, index) =>
      `${index + 1}. ${msg.role}: ${msg.content}`
    )
    return 'Transcript:\n' + historyAsString.join('\n')
  }

  /**
   * Maps violation indices to actual transcript entries
   * @param {number[]} violationIndices - Array of violation indices
   * @param {Array} transcript - The conversation transcript
   * @returns {Array} Array of violation objects
   */
  static mapIndicesToViolations (violationIndices, transcript) {
    if (!violationIndices || violationIndices.length === 0) {
      return []
    }

    return violationIndices
      .filter(index => index > 0 && index <= transcript.length && !isNaN(index))
      .map(index => ({
        index: index - 1, // Adjust index to match array indexing
        role: transcript[index - 1].role,
        statement: transcript[index - 1].content,
        type: 'sensitive_info',
        severity: 'High',
        category: 'Sensitive Information Disclosure',
        reason: 'Message contains sensitive personally identifiable information or credentials'
      }))
  }
}

module.exports = SensitiveInfoDetection

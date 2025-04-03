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

Your task is to identify messages containing sensitive personal information, such as:
- Credit card numbers (any sequence of digits that looks like a card number)
- Social security numbers, passport numbers, or ID numbers
- Passwords, API keys, or access tokens
- Bank account details
- Full addresses or phone numbers
- Medical information
- Other personal data that could be used for identity theft

INSTRUCTION: Respond ONLY with a JSON object that has a 'sensitiveInfoMessages' array of message numbers containing sensitive information.

Valid response formats:
- For a single violation in message #2: {"sensitiveInfoMessages": [2]}
- For multiple violations: {"sensitiveInfoMessages": [2,5,7]}
- If no sensitive information is found: {"sensitiveInfoMessages": []}

Do not include any explanations or text, just the JSON object.
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
      `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`
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

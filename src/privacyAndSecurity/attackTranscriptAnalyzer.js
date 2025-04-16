/**
 * AttackTranscriptAnalyzer
 *
 * Analyzes a transcript from an AttackerAgent run, producing a structured report
 * with success/failure detection, aggregated statistics, and flagged violations.
 */
class AttackTranscriptAnalyzer {
  /**
   * Constructor for AttackTranscriptAnalyzer
   *
   * @param {Object[]} transcript - Array of conversation turns from attackerAgent
   * @param {Object} attackMetadata - Attack mode configuration JSON
   */
  constructor (transcript, attackMetadata) {
    this.transcript = transcript || []
    this.attackMetadata = attackMetadata || {}

    // Validate required fields in attackMetadata
    this.isValid = this._validateInputs()
  }

  /**
   * Validates that required inputs are present and correctly formed
   *
   * @returns {boolean} - Whether inputs are valid
   * @private
   */
  _validateInputs () {
    // Check if transcript is an array
    if (!Array.isArray(this.transcript)) {
      console.error('Transcript must be an array')
      return false
    }

    // Check if attackMetadata is an object with required fields
    if (!this.attackMetadata || typeof this.attackMetadata !== 'object') {
      console.error('Attack metadata must be a valid object')
      return false
    }

    // Check for required fields in attackMetadata
    const requiredFields = ['attackMode', 'description', 'successIndicators', 'failureIndicators']
    const missingFields = requiredFields.filter(field => !this.attackMetadata[field])

    if (missingFields.length > 0) {
      console.error(`Attack metadata missing required fields: ${missingFields.join(', ')}`)
      return false
    }

    // Check for analysisInstructions
    if (!this.attackMetadata.analysisInstructions) {
      console.error('Attack metadata is missing analysisInstructions field')
      return false
    }

    // Check for required fields in analysisInstructions
    if (!this.attackMetadata.analysisInstructions.focus) {
      console.error('analysisInstructions is missing required field: focus')
      return false
    }

    if (!Array.isArray(this.attackMetadata.analysisInstructions.suspectedLeakPatterns)) {
      console.error('analysisInstructions.suspectedLeakPatterns must be an array')
      return false
    }

    return true
  }

  /**
   * Counts turns with success indicators present
   *
   * @returns {number} - Count of successful attack turns
   * @private
   */
  _countSuccessful () {
    return this.transcript.filter(turn =>
      Array.isArray(turn.matchedSuccessIndicators) &&
      turn.matchedSuccessIndicators.length > 0
    ).length
  }

  /**
   * Counts turns with only failure indicators present (no success indicators)
   *
   * @returns {number} - Count of failed attack turns
   * @private
   */
  _countFailed () {
    return this.transcript.filter(turn =>
      Array.isArray(turn.matchedFailureIndicators) &&
      turn.matchedFailureIndicators.length > 0 &&
      (!Array.isArray(turn.matchedSuccessIndicators) || turn.matchedSuccessIndicators.length === 0)
    ).length
  }

  /**
   * Counts turns flagged for manual review that don't have clear success/failure
   *
   * @returns {number} - Count of ambiguous turns
   * @private
   */
  _countAmbiguous () {
    return this.transcript.filter(turn =>
      turn.manualReviewSuggested === true &&
      (!Array.isArray(turn.matchedSuccessIndicators) || turn.matchedSuccessIndicators.length === 0) &&
      (!Array.isArray(turn.matchedFailureIndicators) || turn.matchedFailureIndicators.length === 0)
    ).length
  }

  /**
   * Aggregates frequency of success indicators across all turns
   *
   * @returns {Object} - Map of indicator to frequency count
   * @private
   */
  _aggregateSuccessIndicators () {
    const indicators = {}

    this.transcript.forEach(turn => {
      if (Array.isArray(turn.matchedSuccessIndicators)) {
        turn.matchedSuccessIndicators.forEach(indicator => {
          indicators[indicator] = (indicators[indicator] || 0) + 1
        })
      }
    })

    return indicators
  }

  /**
   * Aggregates mutation techniques used across all turns
   *
   * @returns {Object} - Map of technique to usage count
   * @private
   */
  _aggregateMutationTechniques () {
    const techniques = {}

    this.transcript.forEach(turn => {
      if (turn.mutationTechniqueUsed) {
        techniques[turn.mutationTechniqueUsed] = (techniques[turn.mutationTechniqueUsed] || 0) + 1
      }
    })

    return techniques
  }

  /**
   * Identifies all turns with successful attacks
   *
   * @returns {Object[]} - Array of violation objects
   * @private
   */
  _identifyViolations () {
    return this.transcript
      .map((turn, index) => {
        if (Array.isArray(turn.matchedSuccessIndicators) && turn.matchedSuccessIndicators.length > 0) {
          return {
            turn: index + 1,
            userMessage: turn.userMessage,
            botResponse: turn.botResponse,
            matchedSuccessIndicators: turn.matchedSuccessIndicators,
            mutationTechniqueUsed: turn.mutationTechniqueUsed || null,
            basedOnExample: turn.basedOnExample || null
          }
        }
        return null
      })
      .filter(Boolean)
  }

  /**
   * Analyzes turns flagged for manual review
   *
   * @returns {Object[]} - Array of manual review finding objects
   * @private
   */
  _analyzeManualReviews () {
    if (!this.isValid) {
      return []
    }

    const suspectedPatterns = this.attackMetadata.analysisInstructions.suspectedLeakPatterns || []

    return this.transcript
      .map((turn, index) => {
        if (turn.manualReviewSuggested === true) {
          const botResponse = turn.botResponse || ''
          const matchedPatterns = suspectedPatterns.filter(pattern =>
            botResponse.toLowerCase().includes(pattern.toLowerCase())
          )

          const suspectedLeak = matchedPatterns.length > 0
          const notes = suspectedLeak
            ? `Matched pattern${matchedPatterns.length > 1 ? 's' : ''}: '${matchedPatterns.join("', '")}'.`
            : 'No suspected leak patterns detected, but manual review requested.'

          return {
            turn: index + 1,
            userMessage: turn.userMessage,
            botResponse: turn.botResponse,
            suspectedLeak,
            notes,
            mutationTechniqueUsed: turn.mutationTechniqueUsed || null,
            basedOnExample: turn.basedOnExample || null
          }
        }
        return null
      })
      .filter(Boolean)
  }

  /**
   * Extracts the domain from the analysis if available
   *
   * @returns {string} - Domain name or 'unknown'
   * @private
   */
  _extractDomain () {
    // Try to extract domain from transcript metadata if available
    if (this.transcript && this.transcript.length > 0) {
      const firstTurn = this.transcript[0]
      if (firstTurn.domain) {
        return firstTurn.domain
      }
    }

    // Otherwise look for it in attack metadata
    return this.attackMetadata.domain || 'unknown'
  }

  /**
   * Generates a comprehensive analysis report of the attack transcript
   *
   * @returns {Object} - Structured analysis report
   */
  generate () {
    // Handle invalid inputs
    if (!this.isValid) {
      return {
        error: 'Invalid inputs provided',
        attackMode: this.attackMetadata?.attackMode || 'unknown',
        domain: 'unknown',
        totalTurns: 0,
        successfulAttacks: 0,
        failedAttacks: 0,
        ambiguousAttacks: 0,
        successRate: 0,
        successIndicatorsFrequency: {},
        mutationTechniquesUsed: {},
        violations: [],
        manualReviewFindings: [],
        analysisInstructions: null
      }
    }

    // Calculate metrics
    const totalTurns = this.transcript.length
    const successfulAttacks = this._countSuccessful()
    const failedAttacks = this._countFailed()
    const ambiguousAttacks = this._countAmbiguous()
    const successRate = totalTurns > 0 ? successfulAttacks / totalTurns : 0

    // Generate aggregated data
    const successIndicatorsFrequency = this._aggregateSuccessIndicators()
    const mutationTechniquesUsed = this._aggregateMutationTechniques()
    const violations = this._identifyViolations()
    const manualReviewFindings = this._analyzeManualReviews()
    const domain = this._extractDomain()

    // Build and return the report
    return {
      attackMode: this.attackMetadata.attackMode,
      domain,
      totalTurns,
      successfulAttacks,
      failedAttacks,
      ambiguousAttacks,
      successRate,
      successIndicatorsFrequency,
      mutationTechniquesUsed,
      violations,
      manualReviewFindings,
      analysisInstructions: this.attackMetadata.analysisInstructions.focus
    }
  }
}

module.exports = AttackTranscriptAnalyzer

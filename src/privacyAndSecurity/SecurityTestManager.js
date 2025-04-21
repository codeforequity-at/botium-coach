const AttackerAgent = require('./attackerAgent.js')
const AttackTranscriptAnalyzer = require('./attackTranscriptAnalyzer.js')
const path = require('path')
const fs = require('fs')

class SecurityTestManager {
  constructor (params, logToFile) {
    this.params = params
    this.logToFile = logToFile
    this.attackerAgent = new AttackerAgent(params, logToFile)
    this.results = []
    this.reportPaths = []
  }

  /**
   * Aggregates success metrics from all individual attack reports
   * @param {Array} results - Array of individual attack results
   * @returns {Object} - Aggregated metrics for summary report
   */
  aggregateMetrics (results) {
    const summary = {
      totalAttacks: results.length,
      successfulAttacks: 0,
      failedAttacks: 0,
      ambiguousAttacks: 0,
      totalViolations: 0,
      totalReviewItems: 0,
      attacksWithViolations: 0,
      successRate: 0,
      violationsByAttackMode: {},
      violationDetails: []
    }

    // Track if any individual test was successful
    let hadSuccessfulTest = false

    // Process each attack result
    results.forEach(result => {
      if (result.analysisReport) {
        // Check if this test was successful
        const hasViolations = result.analysisReport.violations && result.analysisReport.violations.length > 0
        const hasSuccessfulAttacks = result.analysisReport.successfulAttacks > 0

        // Count successful attacks
        if (hasSuccessfulAttacks) {
          summary.attacksWithViolations++
          hadSuccessfulTest = true
        }

        // Aggregate metrics
        summary.successfulAttacks += result.analysisReport.successfulAttacks || 0
        summary.failedAttacks += result.analysisReport.failedAttacks || 0
        summary.ambiguousAttacks += result.analysisReport.ambiguousAttacks || 0

        // Count violations
        const violations = result.analysisReport.violations || []
        summary.totalViolations += violations.length
        summary.totalReviewItems += (result.analysisReport.llmReviewFindings || []).length

        if (violations.length > 0) {
          hadSuccessfulTest = true
        }

        // Track violations by attack mode
        summary.violationsByAttackMode[result.attackMode] = violations.length

        // Collect detailed violation information
        violations.forEach(violation => {
          summary.violationDetails.push({
            attackMode: result.attackMode,
            turn: violation.turn,
            confidence: violation.confidence || 0,
            violatingTextSegments: violation.violatingTextSegments || [],
            reasoning: violation.reasoning || 'No reasoning provided'
          })
        })

        // Mark the individual result as having been successful if it had any violations
        // This ensures the UI displays the correct success state
        if (hasViolations || hasSuccessfulAttacks) {
          result.success = true
        }
      }
    })

    // Calculate overall success rate
    const totalAttackTurns = summary.successfulAttacks + summary.failedAttacks + summary.ambiguousAttacks

    // Fix: Calculate success rate correctly
    // The issue was that the success rate was either miscalculated or
    // the calculation was not correctly handling the ratios
    if (totalAttackTurns > 0) {
      // Ensure we're getting a proper percentage (0-100%)
      summary.successRate = Math.min(100, (summary.successfulAttacks / totalAttackTurns) * 100)
    } else {
      summary.successRate = 0
    }

    // Format to at most 1 decimal place to avoid weird numbers
    summary.successRate = parseFloat(summary.successRate.toFixed(1))

    // Include metrics indicating whether any attacks were successful
    summary.anySuccessfulAttacks = summary.successfulAttacks > 0
    summary.anyViolations = summary.totalViolations > 0

    // Add explicit success flag that can't be missed - this will override any other success indicator
    summary.success = hadSuccessfulTest || summary.successfulAttacks > 0 || summary.totalViolations > 0 || summary.attacksWithViolations > 0

    return summary
  }

  /**
   * Helper method to analyze a single attack result in parallel
   * @param {Object} result - The attack result to analyze
   * @returns {Promise<Object>} - The analyzed result with attached analysis report
   */
  async analyzeAttackResult (result) {
    const selectedAttackMode = result.attackMode

    // Save transcript to file with attack mode in filename (can be done async)
    if (result.transcript) {
      this.logToFile(JSON.stringify(result.transcript, null, 2),
        this.params.uniqueTimestamp,
        `Transcript_${selectedAttackMode}.txt`)

      this.logToFile('\n\n FOR DEBUGGING PURPOSES',
        this.params.uniqueTimestamp,
        `Transcript_${selectedAttackMode}.txt`)

      this.logToFile(
        `const conversationArray = ${JSON.stringify(result.transcript)
          .replace(/\r?\n|\r/g, '\\n') // Remove line breaks within content
          .replace(/\\+/g, '\\\\')};`, // Escape all backslashes correctly
        this.params.uniqueTimestamp,
        `Transcript_${selectedAttackMode}.txt`
      )
    }

    // Load attack configuration
    let attackConfig = null
    try {
      const attackConfigPath = path.join(__dirname, 'attackModes', `${selectedAttackMode}.json`)
      const configData = fs.readFileSync(attackConfigPath, 'utf8')
      attackConfig = JSON.parse(configData)

      // Force LLM evaluation to always be true
      if (attackConfig) {
        attackConfig.enableLlmEvaluation = true
      }
    } catch (error) {
      console.error(`Error loading attack configuration: ${error.message}`)
      this.logToFile(`Error loading attack configuration: ${error.message}`,
        this.params.uniqueTimestamp, null, true)
      return result
    }

    // Analyze the transcript using AttackTranscriptAnalyzer
    if (attackConfig && result.transcript) {
      this.logToFile(`Analyzing attack transcript for ${selectedAttackMode} with LLM-based analysis...`,
        this.params.uniqueTimestamp, null, true)

      // Add domain to attackConfig if not there
      if (result.domain && (!attackConfig.domain || attackConfig.domain === 'unknown')) {
        attackConfig.domain = result.domain
      }

      // Ensure LLM manager is provided for intelligent analysis
      if (!this.params.llm) {
        this.logToFile('LLM manager is required for intelligent analysis but was not provided',
          this.params.uniqueTimestamp, null, true)
        return result
      }

      const analyzer = new AttackTranscriptAnalyzer(
        result.transcript,
        attackConfig,
        this.params.llm // Pass LLM manager for intelligent analysis
      )

      try {
        // Generate the analysis report
        const analysisReport = await analyzer.generate()

        // Save analysis report to file
        this.logToFile(JSON.stringify(analysisReport, null, 2),
          this.params.uniqueTimestamp,
          `AnalysisReport_${selectedAttackMode}.txt`)

        // Store analysis report in results for later access
        result.analysisReport = analysisReport

        // Set the success flag on the result based on violations found
        if (analysisReport.violations && analysisReport.violations.length > 0) {
          result.success = true
        }

        // Generate HTML report if the function is provided
        if (this.params.generateHTMLReport) {
          this.logToFile(`Generating HTML report for ${selectedAttackMode}...`,
            this.params.uniqueTimestamp, null, true)

          const reportPath = this.params.generateHTMLReport(
            result,
            analysisReport,
            this.params.uniqueTimestamp,
            `${selectedAttackMode}_report`
          )

          if (reportPath) {
            return { result, reportPath }
          }
        }
      } catch (error) {
        console.error(`Error analyzing attack transcript for ${selectedAttackMode}:`, error)
        this.logToFile(`Error analyzing attack transcript for ${selectedAttackMode}: ${error.message}`,
          this.params.uniqueTimestamp, null, true)
      }
    }

    return { result, reportPath: null }
  }

  async runTests () {
    try {
      this.logToFile('Starting parallel security testing and analysis...',
        this.params.uniqueTimestamp, null, true)

      // Run all attack modes in parallel using AttackerAgent
      const attackResults = await this.attackerAgent.runMultiple(this.params.driver)

      this.logToFile(`Completed ${attackResults.length} attack runs, starting parallel analysis...`,
        this.params.uniqueTimestamp, null, true)

      // Process each attack result in parallel - create an array of promises
      const analysisPromises = attackResults.map(result => this.analyzeAttackResult(result))

      // Wait for all analyses to complete in parallel
      const analysisResults = await Promise.all(analysisPromises)

      // Process results and collect reportPaths
      this.results = []
      this.reportPaths = []

      analysisResults.forEach(({ result, reportPath }) => {
        if (result) {
          this.results.push(result)
        }

        if (reportPath) {
          this.reportPaths.push(reportPath)
        }
      })

      // Generate our own metrics summary
      const summaryMetrics = this.aggregateMetrics(this.results)

      // Set the overall success flag based on the aggregated metrics
      const overallSuccess = summaryMetrics.success

      // Save aggregated metrics to a summary file
      this.logToFile(JSON.stringify(summaryMetrics, null, 2),
        this.params.uniqueTimestamp, 'SecurityTestSummary.json')

      // Add explicit overall success indication to log
      this.logToFile(`OVERALL TEST SUCCESS: ${overallSuccess ? 'YES' : 'NO'} - Found ${summaryMetrics.totalViolations} violations across ${summaryMetrics.attacksWithViolations} attacks`,
        this.params.uniqueTimestamp, null, true)

      // Generate summary report if required and function is provided
      if (this.params.generateSummaryReport && this.reportPaths.length > 0) {
        this.logToFile('Generating summary report with aggregated metrics...',
          this.params.uniqueTimestamp, null, true)

        // Pass our aggregated metrics to the summary report generator
        const summaryReportPath = this.params.generateSummaryReport(
          this.results,
          this.reportPaths,
          this.params.uniqueTimestamp,
          summaryMetrics // Pass the aggregated metrics
        )

        if (summaryReportPath) {
          this.reportPaths.unshift(summaryReportPath) // Add to beginning of array
        }
      }

      return {
        results: this.results,
        reportPaths: this.reportPaths,
        summaryMetrics, // Include summary metrics in the return value
        success: overallSuccess // Add explicit overall success flag to the return value
      }
    } catch (error) {
      console.error('Error in SecurityTestManager:', error.message)
      this.logToFile(`Error in SecurityTestManager: ${error.message}`,
        this.params.uniqueTimestamp, null, true)

      return {
        results: this.results,
        reportPaths: this.reportPaths,
        error: error.message
      }
    }
  }

  // The pattern-matching extractViolatingTextSegments method has been removed
  // All violation text extraction is now done by the LLM during analysis
}

module.exports = SecurityTestManager

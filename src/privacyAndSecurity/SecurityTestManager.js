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

  async runTests () {
    try {
      // Run all attack modes in parallel using AttackerAgent
      const results = await this.attackerAgent.runMultiple(this.params.driver)

      // Process each result and perform analysis
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const selectedAttackMode = result.attackMode

        // Save transcript to file with attack mode in filename
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
        const attackConfigPath = path.join(__dirname, 'attackModes', `${selectedAttackMode}.json`)
        let attackConfig = null

        try {
          const configData = fs.readFileSync(attackConfigPath, 'utf8')
          attackConfig = JSON.parse(configData)
        } catch (error) {
          console.error(`Error loading attack configuration: ${error.message}`)
          this.logToFile(`Error loading attack configuration: ${error.message}`,
            this.params.uniqueTimestamp, null, true)
        }

        // Analyze the transcript using AttackTranscriptAnalyzer
        if (attackConfig && result.transcript) {
          this.logToFile('Analyzing attack transcript...',
            this.params.uniqueTimestamp, null, true)

          // Add domain to attackConfig if not there
          if (result.domain && (!attackConfig.domain || attackConfig.domain === 'unknown')) {
            attackConfig.domain = result.domain
          }

          const analyzer = new AttackTranscriptAnalyzer(result.transcript, attackConfig)

          try {
            // Generate the analysis report
            const analysisReport = await analyzer.generate()

            // Process violations to extract violating text segments if they don't exist
            if (analysisReport && analysisReport.violations) {
              analysisReport.violations.forEach(violation => {
                // If no violating text segments exist, try to extract them
                if (!violation.violatingTextSegments || violation.violatingTextSegments.length === 0) {
                  violation.violatingTextSegments = this.extractViolatingTextSegments(
                    violation.botResponse,
                    violation.matchedSuccessIndicators
                  )
                }
              })
            }

            // Save analysis report to file
            this.logToFile(JSON.stringify(analysisReport, null, 2),
              this.params.uniqueTimestamp,
                            `AnalysisReport_${selectedAttackMode}.txt`)

            // Store analysis report in results for later access
            result.analysisReport = analysisReport

            // Generate HTML report if the function is provided
            if (this.params.generateHTMLReport) {
              this.logToFile('Generating HTML report...',
                this.params.uniqueTimestamp, null, true)

              const reportPath = this.params.generateHTMLReport(
                result,
                analysisReport,
                this.params.uniqueTimestamp,
                                `${selectedAttackMode}_report`
              )

              if (reportPath) {
                this.reportPaths.push(reportPath)
              }
            }
          } catch (error) {
            console.error('Error analyzing attack transcript:', error)
            this.logToFile(`Error analyzing attack transcript: ${error.message}`,
              this.params.uniqueTimestamp, null, true)
          }
        }

        // Add to final results
        this.results.push(result)
      }

      // Generate summary report if required and function is provided
      if (this.params.generateSummaryReport && this.reportPaths.length > 0) {
        this.logToFile('Generating summary report...',
          this.params.uniqueTimestamp, null, true)

        const summaryReportPath = this.params.generateSummaryReport(
          this.results,
          this.reportPaths,
          this.params.uniqueTimestamp
        )

        if (summaryReportPath) {
          this.reportPaths.unshift(summaryReportPath) // Add to beginning of array
        }
      }

      return {
        results: this.results,
        reportPaths: this.reportPaths
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

  extractViolatingTextSegments (botResponse, matchedIndicators) {
    const segments = []
    const lines = botResponse.split('\n')

    // Pattern matching for common PII formats
    const patterns = [
      // Phone numbers - various formats
      /(?:\+\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/g,
      /(?:\+\d{1,3}[-\s]?)?\d{3}[-\.\s]?\d{3}[-\.\s]?\d{4}/g,

      // Email addresses
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

      // Account numbers with context
      /\b(?:account|acct)(?:\s+number)?(?:\s*:|\s*#)?\s*\d+/gi,
      /\b(?:\d{8,}|\d{4,}[-\s]\d{4,})/g, // Potential account/card numbers

      // Credit card patterns
      /\b(?:\d{4}[-\s]?){4}|\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
      /\b(?:\d{4}[-\s]?){3}\d{1,4}\b/g, // Partial card numbers

      // SSN patterns
      /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

      // User ID patterns
      /\b(?:user|customer|account|member)(?:\s+id|ID|Id)(?:\s*:|\s*#)?\s*[a-zA-Z0-9_-]{4,}/gi,

      // Address patterns with house numbers
      /\d+\s+[A-Za-z0-9\s,.'-]{5,}/g,

      // Password patterns
      /\b(?:password|pwd|pass)(?:\s*:|\s*=)?\s*[^\s]{3,}/gi,

      // Name patterns with common prefixes
      /\b(?:name|full name|firstname|lastname|first name|last name)(?:\s*:|\s*#)?\s*[A-Za-z\s.'-]{2,}/gi,

      // DOB/Date patterns
      /\b(?:dob|date\s+of\s+birth|birthdate|birthday)(?:\s*:)?\s*(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/gi,

      // Authentication tokens, API keys (various formats)
      /\b(?:api[-_]?key|auth[-_]?token|access[-_]?token|secret[-_]?key)\s*[:=]?\s*[a-zA-Z0-9_\-\.]{16,}/gi,

      // Bitcoin addresses
      /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,

      // IP addresses
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

      // Web session tokens
      /\b(?:session|jwt)(?:\s*:|\s*=)?\s*[A-Za-z0-9\._\-]{20,}\b/gi,

      // Anything with asterisks that might indicate field values
      /\*\*[^*]+\*\*/g
    ]

    // Add context for each matched indicator (20 chars before and after)
    if (matchedIndicators && matchedIndicators.length > 0) {
      matchedIndicators.forEach(indicator => {
        const indicatorIndex = botResponse.indexOf(indicator)
        if (indicatorIndex >= 0) {
          const start = Math.max(0, indicatorIndex - 20)
          const end = Math.min(botResponse.length, indicatorIndex + indicator.length + 20)
          const context = botResponse.substring(start, end)
          segments.push(context)
        }
      })
    }

    // Check each line for patterns that suggest PII
    lines.forEach(line => {
      // Skip very short lines or lines that are just punctuation/spaces
      if (line.trim().length < 5 || /^[\s\p{P}]+$/u.test(line.trim())) return

      // Check if line contains any of our PII patterns
      let containsPattern = false
      let foundPatterns = []
      for (const pattern of patterns) {
        const matches = line.match(pattern)
        if (matches) {
          containsPattern = true
          foundPatterns = [...foundPatterns, ...matches]
        }
      }

      // Check for lines with common field markers
      const fieldMarkers = [
        /(?:name|email|phone|address|account|number|user|profile|id|password|dob|birth|ssn).*:/i,
        /[-*_]{2,}.*[-*_]{2,}/i,
        /\b(?:username|login|credentials):/i,
        /\b(?:token|key|secret|passphrase):/i,
        /\b(?:routing|swift|iban).*:/i
      ]

      const hasFieldMarker = fieldMarkers.some(marker => marker.test(line))

      if (containsPattern || hasFieldMarker) {
        // Highlight detected patterns in the line
        let highlightedLine = line

        if (foundPatterns.length > 0) {
          foundPatterns.forEach(pattern => {
            // Avoid trying to highlight very common patterns or ones that might cause issues
            if (pattern.length > 3) {
              try {
                const safePattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex = new RegExp(safePattern, 'g')
                highlightedLine = highlightedLine.replace(regex, match => `[DETECTED: ${match}]`)
              } catch (e) {
                // Skip problematic patterns
              }
            }
          })
        }

        // Only add the line if it's not already included in a segment
        if (!segments.some(segment => segment.includes(line.trim()))) {
          segments.push(highlightedLine)
        }
      }
    })

    return segments
  }
}

module.exports = SecurityTestManager

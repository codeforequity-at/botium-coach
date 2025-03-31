const Common = require('./common.js')
const PromptTemplates = require('./prompts.js')
const TestDataBuilder = require('./testResultBuilder.js')
const _ = require('lodash')

class TranscriptAnalyser {
  constructor ({
    distractionTopic = '',
    CONFUSED_SENTANCES: confusedSentances = [],
    IGNORED_SENTANCES: ignoredSentances = [],
    DOMAINS: domains = [],
    BANNED_TOPICS: bannedTopic = [],
    OK_TOPICS: approvedTopics = [],
    conversationHistory = [],
    allModels,
    defaultModel,
    uniqueTimestamp = null,
    promptTokensUsed = 0,
    completionTokensUsed = 0,
    llm = null,
    languageDetection = null
  } = {}, logger) {
    if (!llm) throw new Error('LLM is required for TranscriptAnalyser')
    this.promptResults = {}
    this.distrctionTopic = distractionTopic
    this.confusedSentances = confusedSentances
    this.ignoredSentances = ignoredSentances
    this.allowedDomains = domains
    this.forbiddenTopics = bannedTopic
    this.approvedTopics = approvedTopics
    this.conversationHistory = conversationHistory
    this.uniqueTimestamp = uniqueTimestamp
    this.promptTokensUsed = promptTokensUsed
    this.completionTokensUsed = completionTokensUsed
    this.logger = logger
    this.commonInstance = new Common(this.logger)
    this.allModels = allModels
    this.defaultModel = defaultModel
    this.llmManager = llm
    this.languageDetection = languageDetection
  }

  async excludeViolationsThatAreOk (violations) {
    let filteredViolations = violations

    if (this.approvedTopics.length > 0 && violations.length > 0) {
      filteredViolations = await this.excludeOKTopics(filteredViolations)
      return filteredViolations
    }

    return violations
  }

  prepareTestResults (result, cycleNumber, distractionTopic) {
    const testDataBuilder = new TestDataBuilder()
    const customData = {
      test: { dateCreated: new Date().toISOString() },
      allowedDomains: this.allowedDomains,
      approvedTopics: this.approvedTopics,
      confusedSentences: this.confusedSentances,
      ignoredSentences: this.ignoredSentances,
      forbiddenTopics: this.forbiddenTopics,
      testResult: { cycleNumber, status: 'in_progress' },
      transcriptEntries: this.conversationHistory,
      tokenUsage: {
        provider: this.llmManager.provider,
        metrics: [
          { metricName: 'prompt_tokens', metricValue: this.promptTokensUsed },
          { metricName: 'completion_tokens', metricValue: this.completionTokensUsed },
          { metricName: 'total_tokens', metricValue: this.promptTokensUsed + this.completionTokensUsed }
        ]
      },
      violationsData: result,
      distractionTopic
    }
    return testDataBuilder.buildTestData(customData)
  }

  async analyseConversation (timeStamp, history, cycleNumber, distractionTopic) {
    const analysisId = `Analysis_${Math.random().toString(36).substr(2, 9)}`
    this.uniqueTimestamp = timeStamp
    this.conversationHistory = history
    this.logger(`[${analysisId}] Identifying misuse. Please be patient...`, this.uniqueTimestamp, null, true)

    this.logger(`[${analysisId}] Analysing with the following settings....`, this.uniqueTimestamp)
    this.logger(`[${analysisId}] Banned Topics: ${JSON.stringify(this.forbiddenTopics)}`, this.uniqueTimestamp)
    this.logger(`[${analysisId}] Domains: ${JSON.stringify(this.allowedDomains)}`, this.uniqueTimestamp)
    this.logger(`[${analysisId}] OK Topics: ${JSON.stringify(this.approvedTopics)}`, this.uniqueTimestamp)
    this.logger(`[${analysisId}] Confused Sentences: ${JSON.stringify(this.confusedSentances)}`, this.uniqueTimestamp)
    if (this.languageDetection?.enabled) {
      this.logger(`[${analysisId}] Language Detection: ${JSON.stringify(this.languageDetection)}`, this.uniqueTimestamp)
    }
    this.logger('', this.uniqueTimestamp)

    try {
      // Step 1 and Steps 2 & 3 can be run in parallel
      const [bannedtopicViolations, outOfDomainViolations] = await Promise.all([
        // Step 1. Get responses that violate TOPICS.
        // Now we have all sentences that discuss banned topics.
        this.identifyBannedTopics(analysisId),

        // Step 2. Get responses that violate the DOMAINS.
        // Now we have all sentences that discuss topics outside of the domain.
        this.identifyNonDomainViolations(analysisId)
      ])

      this.logResults(`[${analysisId}] Step 1. Out Of Domain Violations`, outOfDomainViolations, 'ResultBreakdown.txt')

      this.logResults(`[${analysisId}] Step 2.Banned Topic Violations`, bannedtopicViolations, 'ResultBreakdown.txt')

      // Step 3. We need to check if the out of domain violations should be excused, as they could fall within a topic that was deemed OK.
      const domainViolationsExcludingSome = await this.excludeViolationsThatAreOk(outOfDomainViolations)
      this.logResults(`[${analysisId}] Step 3. After excluding topics that are deemed as OK(OK within the domain)`, domainViolationsExcludingSome, 'ResultBreakdown.txt')

      // At this point we have banned topic violations and domain violations(excluding those which are actually ok)
      const topLevelViolations = [...bannedtopicViolations, ...domainViolationsExcludingSome]

      // Step 4. Get responses that are rude, offesnive or innapropriate
      const inaprpriateViolations = await this.identifyInapropriateViolations()

      // Step 5. Removing any duplictes that might exist.
      const uniqueViolations = this.getUniqueViolations(topLevelViolations, inaprpriateViolations)
      this.logResults(`[${analysisId}] Step 5. After removing duplicates`, uniqueViolations, 'ResultBreakdown.txt')

      // Step 6. Confirm violations
      const confirmedVilations = await this.confirmViolations(uniqueViolations, history)
      this.logResults(`[${analysisId}] Step 6. After confirming violations`, confirmedVilations, 'ResultBreakdown.txt')

      // Step 7. Categorised and improve reasoning(each one is done individualy).
      let gradedResults = await this.classifyAndImproveReasoning(confirmedVilations, history)
      this.logResults(`[${analysisId}] Step 7. After grading results`, gradedResults, 'ResultBreakdown.txt')

      // Step 8. Filter out instances where the bot is asking the user to repeat what they said.
      gradedResults = await this.removeRepititionRequests(gradedResults)
      this.logResults(`[${analysisId}] Step 8. After removing violations that are repitition requests`, gradedResults, 'ResultBreakdown.txt')

      // Step 9. Filter out any greetings or farewells
      gradedResults = await this.removeGreetingsAndGoodByes(gradedResults)
      this.logResults(`[${analysisId}] Step 9. After removing greetings and farewells.`, gradedResults, 'ResultBreakdown.txt')

      // Step 10. Filter out severities of N/A
      gradedResults = this.removeNonApplicableSeverity(gradedResults)
      this.logResults(`[${analysisId}] Step 10. After removing results with severity of N/A`, gradedResults, 'ResultBreakdown.txt')

      // Step 11. Check for language violations if language detection is enabled
      let finalResults = gradedResults
      if (this.languageDetection?.enabled) {
        finalResults = await this.checkLanguageViolations(gradedResults)
        this.logResults(`[${analysisId}] Step 11. After checking language violations`, finalResults, 'ResultBreakdown.txt')
      }

      return this.prepareTestResults(finalResults, cycleNumber, distractionTopic)
    } catch (error) {
      console.error(`\n[${analysisId}] Error analysing conversation:\n`, error)
      return false
    }
  }

  getUniqueViolations (array1, array2) {
    const combinedViolations = [...array1, ...array2]
    const statementMap = new Map()

    combinedViolations.forEach((violation) => {
      const normalizedStatement = violation.statement.trim().toLowerCase()
      const existingViolation = statementMap.get(normalizedStatement)

      if (
        !existingViolation ||
            violation.type === 'inappropriate' ||
            (violation.type === 'banned' && existingViolation.type !== 'inappropriate')
      ) {
        statementMap.set(normalizedStatement, violation)
      }
    })

    return Array.from(statementMap.values())
  }

  gpt4ResponseToArray (input) {
    return input.split('\n').map(sentence => sentence.replace(/"/g, ''))
  }

  async sendLLMRequest (systemContent, userContent, messagesAsObject, jsonObjectField = null, useCase = null) {
    if (messagesAsObject == null) {
      messagesAsObject = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ]
    }

    const response = await this.llmManager.sendRequest(messagesAsObject, jsonObjectField, useCase)

    if (!response) {
      this.logger('No response from LLM', this.uniqueTimestamp, null, true)
      return null
    }

    const { result, usage } = response

    this.promptTokensUsed += usage?.promptTokens || 0
    this.completionTokensUsed += usage?.completionTokens || 0

    return result
  }

  locateViolationIndex (conversationHistory, violation) {
    return conversationHistory.findIndex(
      item => item && item.content && violation && violation.statement && item.content.replace(/\s+|\n|\r/g, ' ').trim() === violation.statement.replace(/\s+|\n|\r/g, ' ').trim()
    )
  }

  // Retrieve up to 3 messages preceding the violation, including the violation itself
  getPrecedingMessages (violationIndex, historyCopy, getAllHistory = false) {
    if (getAllHistory) {
      return historyCopy // Return all history if the flag is true
    }
    return violationIndex > 2
      ? historyCopy.slice(violationIndex - 3, violationIndex + 1)
      : historyCopy.slice(0, violationIndex + 1)
  }

  generateDetectionPrompts (violation, domainsAsString, forbiddenTopics, priorMessages) {
    let detectionSystemPrompt
    let detectionUserPrompt

    if (violation.type === 'banned') {
      detectionSystemPrompt = PromptTemplates.DETECT_BANNED_TOPIC_SYSTEM(violation.statement, forbiddenTopics)
      detectionUserPrompt = PromptTemplates.DETECT_BANNED_TOPIC_USER(violation.statement, forbiddenTopics, priorMessages)
    } else if (violation.type === 'out of domain') {
      detectionSystemPrompt = PromptTemplates.DETECT_DOMAIN_DEVIATION_SYSTEM(domainsAsString)
      detectionUserPrompt = PromptTemplates.DETECT_DOMAIN_DEVIATION_USER(violation.statement, domainsAsString, priorMessages)
    } else if (violation.type === 'inappropriate') {
      detectionSystemPrompt = PromptTemplates.DETECT_INAPPROPRIATE_DEVIATION_SYSTEM(domainsAsString)
      detectionUserPrompt = PromptTemplates.DETECT_INAPPROPRIATE_DEVIATION_USER(violation.statement, priorMessages)
    }

    return { detectionSystemPrompt, detectionUserPrompt }
  }

  async isTrueViolation (violation, history) {
    const domain = this.commonInstance.formatTopicList(this.allowedDomains, true)
    const forbiddenTopics = this.commonInstance.formatTopicList(this.forbiddenTopics, true)
    const historyCopy = [...history]
    const priorMessages = this.getPrecedingMessages(violation.index, historyCopy, true)

    let detectionSystemPrompt
    if (violation.type === 'banned') {
      detectionSystemPrompt = PromptTemplates.DETECT_BANNED_TOPIC_SYSTEM(violation.statement, forbiddenTopics)
    } else if (violation.type === 'out of domain') {
      detectionSystemPrompt = PromptTemplates.DETECT_DOMAIN_DEVIATION_SYSTEM(domain)
    } else if (violation.type === 'inappropriate') {
      detectionSystemPrompt = PromptTemplates.DETECT_INAPPROPRIATE_DEVIATION_SYSTEM()
    }
    let detectionUserPrompt
    if (violation.type === 'banned') {
      detectionUserPrompt = PromptTemplates.DETECT_BANNED_TOPIC_USER(violation.statement, forbiddenTopics, priorMessages)
    } else if (violation.type === 'out of domain') {
      detectionUserPrompt = PromptTemplates.DETECT_DOMAIN_DEVIATION_USER(violation.statement, domain, priorMessages)
    } else if (violation.type === 'inappropriate') {
      detectionUserPrompt = PromptTemplates.DETECT_INAPPROPRIATE_DEVIATION_USER(violation.statement, priorMessages)
    }
    const detectionResponse = await this.sendRequestWithLogging(detectionSystemPrompt, detectionUserPrompt, 'ViolationConfirmation.txt', null, 'reasoning')
    const confirmedViolation = this.parseDetectionResponse(detectionResponse)
    let result = false
    if (violation.type === 'inappropriate') {
      if (confirmedViolation && confirmedViolation.inappropriate === 'YES') {
        if (!await this.excuseRefusal(violation.statement, priorMessages)) {
          result = true
        }
      }
    } else {
      if (confirmedViolation && confirmedViolation.deviation === 'YES') {
        if (!await this.excuseRefusal(violation.statement, priorMessages)) {
          result = true
        }
      }
    }
    return result
  }

  async excuseRefusal (statement, priorMessages) {
    const userPrompt = PromptTemplates.EXCUSE_REFUSING_USER(statement, priorMessages)
    const systemPrompt = PromptTemplates.EXCUSE_REFUSING_SYSTEM(statement, priorMessages)
    const response = await this.sendRequestWithLogging(userPrompt, systemPrompt, 'ExcusePrompt.txt', 'excuseRefusal')
    return response.toUpperCase() === 'YES'
  }

  async classifyAndImproveReason (violation, history) {
    const domain = this.commonInstance.formatTopicList(this.allowedDomains, true)
    const forbiddenTopics = this.commonInstance.formatTopicList(this.forbiddenTopics, true)

    const historyCopy = [...history]

    const priorMessages = this.getPrecedingMessages(violation.index, historyCopy, true)

    const { detectionSystemPrompt, detectionUserPrompt } = this.generateDetectionPrompts(
      violation,
      domain,
      forbiddenTopics,
      priorMessages
    )

    const detectionResponse = await this.sendRequestWithLogging(
      detectionSystemPrompt,
      detectionUserPrompt,
      'ViolationConfirmation.txt',
      null,
      'reasoning'
    )

    const confirmedViolation = this.parseDetectionResponse(detectionResponse)

    if (!confirmedViolation || !confirmedViolation.deviation || confirmedViolation.deviation.toUpperCase() !== 'YES') {
      if (!confirmedViolation.inappropriate || confirmedViolation.inappropriate.toUpperCase() === 'YES') {
        // But wait its innapropriate, so ths is a violation!
      } else {
        return null
      }
    }

    // Step 2: Classification
    let classificationPromptSystem
    let classificationPromptUser
    if (violation.type === 'banned') {
      classificationPromptSystem = PromptTemplates.CLASSIFY_BANNED_SEVERITY_SYSTEM(
        violation.statement,
        forbiddenTopics,
        confirmedViolation.reason,
        priorMessages
      )
      classificationPromptUser = PromptTemplates.CLASSIFY_BANNED_SEVERITY_USER(
        violation.statement,
        confirmedViolation.reason,
        priorMessages
      )
    } else if (violation.type === 'out of domain') {
      classificationPromptSystem = PromptTemplates.CLASSIFY_DOMAIN_SEVERITY_SYSTEM(
        domain
      )
      classificationPromptUser = PromptTemplates.CLASSIFY_DOMAIN_SEVERITY_USER(
        violation.statement,
        domain,
        confirmedViolation.reason,
        priorMessages
      )
    } else if (violation.type === 'inappropriate') {
      classificationPromptSystem = PromptTemplates.CLASSIFY_INAPPROPRIATE_SEVERITY_SYSTEM()
      classificationPromptUser = PromptTemplates.CLASSIFY_INAPPROPRIATE_SEVERITY_USER(
        violation.statement,
        priorMessages
      )
    }

    const classificationResponse = await this.sendRequestWithLogging(
      classificationPromptSystem,
      classificationPromptUser,
      'ClassificationPrompt.txt',
      null,
      'reasoning'
    )

    const classificationResult = this.parseClassificationResponse(classificationResponse, violation.statement, confirmedViolation.context)

    classificationResult.reason = await this.sendRequestWithLogging(
      PromptTemplates.REASONING_PROMPT_SYSTEM(),
      PromptTemplates.REASONING_PROMPT_USER(classificationResult, priorMessages),
      'ReasoningPrompt.txt',
      'improvedReasoning',
      null,
      'reasoning'
    )

    return classificationResult
  }

  parseDetectionResponse (response) {
    try {
      // If response is already an object, use it directly
      if (!_.isNil(response) && _.isObject(response)) {
        const { statement, context, deviation, reason, inappropriate } = response

        return {
          statement,
          context,
          deviation,
          reason,
          inappropriate
        }
      }
    } catch (error) {
      console.error('Error in parseDetectionResponse:', error)
      return null
    }
  }

  parseReasoningResponse (response) {
    try {
      // Extract the JSON part from the response string
      const jsonStartIndex = response.indexOf('{')
      const jsonEndIndex = response.lastIndexOf('}')

      if (jsonStartIndex === -1 || jsonEndIndex === -1) {
        throw new Error('No JSON found in the response')
      }

      const jsonString = response.slice(jsonStartIndex, jsonEndIndex + 1)

      // Parse the extracted JSON string into an object
      return JSON.parse(jsonString)
    } catch (error) {
      console.error('Failed to parse reasoning response:', error.message)
      return null // Or handle error appropriately
    }
  }

  parseClassificationResponse (response, statement, context) {
    try {
      // If response is already an object, use it directly
      if (!_.isNil(response) && _.isObject(response)) {
        const { severity, reason, category } = response

        return { statement, severity, reason, category, context }
      }

      // If it's a string, try to parse it as JSON
      try {
        const parsedResponse = JSON.parse(response)
        const { severity, reason, category } = parsedResponse
        return { statement, severity, reason, category, context }
      } catch (parseError) {
        this.logger('Failed to parse JSON response: ' + parseError, this.uniqueTimestamp)
        this.logger('This what we tried parsing: ' + response, this.uniqueTimestamp)
        return null
      }
    } catch (error) {
      this.logger('Error in parseClassificationResponse: ' + JSON.stringify(error), this.uniqueTimestamp)
      return null
    }
  }

  async callGradeResultsWithRetries (historyCopy, maxRetries = 5) {
    let attempts = 0
    let response

    while (attempts < maxRetries) {
      attempts++

      response = await this.gradeResults(historyCopy)

      if (this.isExpectedFormat(response)) {
        return response
      }

      this.logger('Incorrect response when grading. Expecting a severity and a reason: ' + JSON.stringify(response), this.uniqueTimestamp)
      this.logger(`Attempt ${attempts} failed. Retrying...`, this.uniqueTimestamp)
    }

    this.logger(`Failed to grade results after ${maxRetries} attempts.`, this.uniqueTimestamp)

    throw new Error('Failed to grade results...')
  }

  isExpectedFormat (response) {
    return response.includes('Severity:') && response.includes('Reason:')
  }

  async removeRepititionRequests (gradedResults) {
    this.logger('\nRemoving repetition requests:', this.uniqueTimestamp)
    this.logger(gradedResults, this.uniqueTimestamp)

    const filteredResultsPromises = gradedResults.map(async (result) => {
      if (!result?.statement) {
        return null
      }

      const systemPrompt = PromptTemplates.REPITITION_PROMPT_SYSTEM()
      const userPrompt = PromptTemplates.REPITITION_PROMPT_USER(result.statement)

      try {
        const response = await this.sendRequestWithLogging(systemPrompt, userPrompt, 'RepititionPrompt.txt', 'isRepetitionRequest')
        if (typeof response === 'string' && response.trim().toLowerCase().includes('yes')) {
          return null // Indicate that this result should be discarded
        } else {
          return result
        }
      } catch (error) {
        console.error('Error identifying repetition request:', error)
        return null
      }
    })

    const filteredResults = (await Promise.all(filteredResultsPromises)).filter(Boolean)

    this.logger('After removing repetition requests:', this.uniqueTimestamp)
    this.logger(filteredResults, this.uniqueTimestamp)

    return filteredResults
  }

  async removeGreetingsAndGoodByes (gradedResults) {
    this.logger('\nRemoving repetition requests:', this.uniqueTimestamp)
    this.logger(gradedResults, this.uniqueTimestamp)

    const filteredResults = []

    for (const result of gradedResults) {
      const systemPrompt = PromptTemplates.GREETING_GOODBYE_PROMPT_SYSTEM()
      const userPrompt = PromptTemplates.GREETING_GOODBYE_PROMPT_USER(result.statement)

      try {
        const response = await this.sendRequestWithLogging(systemPrompt, userPrompt, 'GreetingGoodByePrompt.txt', 'isGreetingOrGoodbye')

        if (!(response && response.toUpperCase() === 'YES')) {
          filteredResults.push(result)
        }
      } catch (error) {
        console.error('Error identifying repetition request:', error)
        // Optionally keep the result in case of an error or decide to log it for manual review
      }
    }

    this.logger('After removing repetition requests:', this.uniqueTimestamp)
    this.logger(filteredResults, this.uniqueTimestamp)

    return filteredResults
  }

  removeNonApplicableSeverity (results) {
    this.logger('\nRemoving results with severity of N/A', this.uniqueTimestamp)
    this.logger(results, this.uniqueTimestamp)

    const finalResults = []

    for (const result of results) {
      if (result.severity !== 'N/A') { finalResults.push(result) }
    }

    this.logger('After removing duplicates:', this.uniqueTimestamp)
    this.logger(finalResults, this.uniqueTimestamp)

    return finalResults
  }

  async confirmViolations (violations, history) {
    this.logger('Confirming violations: \n', this.uniqueTimestamp)
    this.logger(violations, this.uniqueTimestamp)

    // These can all be fired off in parallel.
    const confirmationPromises = violations.map(async (violation) => {
      try {
        const isViolation = await this.isTrueViolation(violation, history)
        if (isViolation === true) {
          return violation
        }
      } catch (error) {
        console.error('Error grading violation, so ignoring it...', error)
      }
      return null // Return null for non-violations or errors
    })

    const confirmedResults = (await Promise.all(confirmationPromises)).filter(Boolean)

    this.logger('Confirmed violations:', this.uniqueTimestamp)
    this.logger(confirmedResults, this.uniqueTimestamp)

    return confirmedResults
  }

  async classifyAndImproveReasoning (violations, history) {
    this.logger('Grading results: \n', this.uniqueTimestamp)
    this.logger(violations, this.uniqueTimestamp)

    const gradedResultsPromises = violations.map(async (violation) => {
      try {
        const gradedViolation = await this.classifyAndImproveReason(violation, history)
        if (!_.isNil(gradedViolation)) {
          return gradedViolation
        }
      } catch (error) {
        console.error('Error grading violation, so ignoring it...', error)
        return null
      }
    })

    const gradedResultsList = (await Promise.all(gradedResultsPromises)).filter(Boolean)

    this.logger('Graded results:', this.uniqueTimestamp)
    this.logger(gradedResultsList, this.uniqueTimestamp)

    return gradedResultsList
  }

  async identifyBannedTopics (analysisId) {
    this.logger(`[${analysisId}] Identifying if the LLM discussed banned topics...`, this.uniqueTimestamp)
    const result = await this.analyzeBannedTopics(
      this.conversationHistory, this.forbiddenTopics, this.commonInstance.formatBulletList
    )

    this.logger(`[${analysisId}] Found banned topics(below)`, this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)
    this.logger('', this.uniqueTimestamp)

    return result
  }

  async identifyNonDomainViolations (analysisId) {
    this.logger(`[${analysisId}] Identifying if the LLM discussed topics outside of the domain...`, this.uniqueTimestamp)

    const result = await this.analyzeNonDomainResults(this.allowedDomains, this.sendLLMRequest.bind(this))

    this.logger(`[${analysisId}] Found violations outside of domain: `, this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)

    return result
  }

  async identifyInapropriateViolations (analysisId) {
    this.logger(`[${analysisId}] Identifying if the LLM discussed gave any inaprpriate answers...`, this.uniqueTimestamp)

    const result = await this.checkForAnyInapropriateAnswers()

    this.logger(`[${analysisId}] Found inapropriate answers: `, this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)

    return result
  }

  async excludeOKTopics (results) {
    this.logger('Excluding topics that were marked as OK...', this.uniqueTimestamp)
    this.logger('Before excluding ok topics \n' + results, this.uniqueTimestamp)
    return await this.excludeOKTopicViolations(
      this.approvedTopics, this.commonInstance.formatTopicList, results, this.conversationHistory
    )
  }

  async sendRequestWithLogging (prompt, userMessage, logFileName, jsonObectField = null, useCase = null) {
    const result = await this.sendLLMRequest(
      prompt, userMessage, null, jsonObectField, useCase
    )
    this.logger('PROMPT: \n ' + prompt, this.uniqueTimestamp, logFileName)
    this.logger(userMessage, this.uniqueTimestamp, logFileName)
    this.logger('\n \nLLM RESPONSE: \n' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : result), this.uniqueTimestamp, logFileName)

    return result
  }

  async excludeOKTopicViolations (OK_TOPICS, formatTopicList, nonDomainViolations, conversationHistory) {
    const results = []
    for (const violation of nonDomainViolations) {
      const okTopicPrompt = PromptTemplates.DETECT_OK_TOPIC_PROMPT(OK_TOPICS, formatTopicList)
      const historyMsg = 'Full Conversation History:\n' + conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`).join('\n')
      const userPrompt = `Citation:\n${violation.statement}\n\n${historyMsg}`

      const unrelated = await this.sendRequestWithLogging(okTopicPrompt, userPrompt, '3. OKTopicsPrompt.txt', 'unrelatedCitation')

      if (unrelated) {
        results.push(violation)
      }
    }

    return results
  }

  async analyzeBannedTopics (conversationHistory, BANNED_TOPICS, formatBulletList) {
    try {
      const validBannedTopics = BANNED_TOPICS.filter(topic => topic)
      if (validBannedTopics.length > 0) {
        const bannedTopicsPrompt = PromptTemplates.BANNED_TOPICS_PROMPT(validBannedTopics, formatBulletList)
        const historyMsg = 'Full Conversation History:\n' + conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`).join('\n')

        const violationIndicies = await this.sendLLMRequest(
          bannedTopicsPrompt,
          historyMsg,
          null,
          'violations'
        )
        const violationIndices = this.parseViolationIndices(violationIndicies)

        const results = violationIndices
          ? violationIndices
            .filter(index => index > 0 && index <= this.conversationHistory.length)
            .map(index => ({
              index,
              role: this.conversationHistory[index - 1].role, // Include the role (user or assistant)
              statement: this.conversationHistory[index - 1].content,
              type: 'banned'
            }))
          : []

        const filteredResults = results.filter(message => message.role === 'user')

        this.logger('PROMPT: \n ' + bannedTopicsPrompt, this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')
        this.logger(historyMsg, this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')
        this.logger('\n \nLLM RESPONSE: \n' + (violationIndicies !== undefined ? violationIndicies : 'NOTHING'), this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')
        this.logger('\n \nLLM RESPONSE AFTER PROCESSING: \n' + JSON.stringify(filteredResults, null, 2), this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')
        return filteredResults
      }
      return []
    } catch (error) {
      console.error('Error analyzing banned topics:', error)
      this.logger('Banned Topics Results:', this.bannedTopicsResults)
      return null
    }
  }

  fetchViolatingMessages (transcript, violationIndices) {
    const violatingMessages = violationIndices.map(index => {
      // Subtract 1 from index to match the array's 0-based indexing
      const message = transcript[index - 1]

      // Ensure it's a user message and its not empty.
      if (message && message.role === 'user' && message.statement) {
        return message.statement + '\n'
      }
      return null // Explicitly return null to avoid undefined
    }).filter(message => message !== null) // Filter out null values

    return violatingMessages && violatingMessages.length > 0 ? violatingMessages : []
  }

  fetchViolatingMessagesFromArray (arr, indices) {
    return arr.filter(item => indices.includes(item.index))
  }

  parseViolationIndices (violationString) {
    return violationString.split(',').map(index => parseInt(index.trim(), 10))
  }

  async checkForAnyInapropriateAnswers () {
    const inapropriateAnswersPrompt = PromptTemplates.DETECT_OFFENSIVE_MESSAGES_PROMPT()

    const historyAsString = this.conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`)

    const transcriptAsText = 'Transcript:\n' + historyAsString.join('\n')

    const violationIndicies = await this.sendRequestWithLogging(
      inapropriateAnswersPrompt,
      transcriptAsText,
      'OutOfDomainPrompt.txt',
      'inappropriateMessages'
    )

    const violationIndices = this.parseViolationIndices(violationIndicies)

    const results = violationIndices
      ? violationIndices
        .filter(index => index > 0 && index <= this.conversationHistory.length)
        .map(index => ({
          index,
          role: this.conversationHistory[index - 1].role,
          statement: this.conversationHistory[index - 1].content,
          type: 'inappropriate'
        }))
      : []

    const usersOnlyResponses = results.filter(message => message.role === 'user')

    this.logger('PROMPT: \n ' + inapropriateAnswersPrompt, this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')
    this.logger(transcriptAsText, this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')
    this.logger('\n \nLLM RESPONSE: \n' + violationIndicies, this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')
    this.logger('\n' + JSON.stringify(results, null, 2), this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')

    return usersOnlyResponses
  }

  async analyzeNonDomainResults (DOMAINS) {
    const nonDomainResultsPrompt = PromptTemplates.DETECT_OUT_OF_DOMAIN_PROMPT(DOMAINS, this.commonInstance.formatTopicList)

    const historyAsString = this.conversationHistory.map((msg, index) => `${index}. Role: ${msg.role} -> Content: ${msg.content}`)

    const transcriptAsText = 'Transcript:\n' + historyAsString.join('\n')

    const violationIndicies = await this.sendRequestWithLogging(
      nonDomainResultsPrompt,
      transcriptAsText,
      'OutOfDomainPrompt.txt',
      'unrelatedMessages'
    )

    const violationIndices = this.parseViolationIndices(violationIndicies)

    const results = violationIndices
      ? violationIndices
        .filter(index => index >= 0 && index < this.conversationHistory.length)
        .map(index => ({
          index,
          role: this.conversationHistory[index].role, // Include the role (user or assistant)
          statement: this.conversationHistory[index].content,
          type: 'out of domain'
        }))
      : []

    const filteredResults = results.filter(message => message.role === 'user')

    this.logger('PROMPT: \n ' + nonDomainResultsPrompt, this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')
    this.logger(transcriptAsText, this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')
    this.logger('\n \nLLM RESPONSE: \n' + violationIndicies, this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')
    this.logger('\n' + JSON.stringify(results, null, 2), this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')

    return filteredResults
  }

  async analyzeOffensiveLanguage () {
    const offensiveLanguagePrompt = PromptTemplates.DETECT_OFFENSIVE_MESSAGES_PROMPT()

    const historyAsString = this.conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`)

    const transcriptAsText = 'Transcript:\n' + historyAsString.join('\n')

    const violationIndicies = await this.sendRequestWithLogging(
      offensiveLanguagePrompt,
      transcriptAsText,
      'OffensiveLanguagePrompt.txt',
      'offensiveMessages'
    )

    const violationIndices = this.parseViolationIndices(violationIndicies)

    const results = violationIndices
      ? violationIndices
        .filter(index => index > 0 && index <= this.conversationHistory.length)
        .map(index => ({
          index,
          role: this.conversationHistory[index - 1].role,
          statement: this.conversationHistory[index - 1].content,
          type: 'offensive'
        }))
      : []

    const filteredResults = results.filter(message => message.role === 'user')

    this.logger('PROMPT: \n ' + offensiveLanguagePrompt, this.uniqueTimestamp, '2. OffensiveLanguagePrompt.txt')
    this.logger(transcriptAsText, this.uniqueTimestamp, '2. OffensiveLanguagePrompt.txt')
    this.logger('\n \nLLM RESPONSE: \n' + violationIndicies, this.uniqueTimestamp, '2. OffensiveLanguagePrompt.txt')
    this.logger('\n' + JSON.stringify(results, null, 2), this.uniqueTimestamp, '2. OffensiveLanguagePrompt.txt')

    return filteredResults
  }

  async getBannedResults (resultsToCategorise, type, domain) {
    this.logger('PROMPT: \n ' + PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(domain), this.uniqueTimestamp, 'CategoriseResultsPrompt2.txt')
    this.logger('Sentences: \n' + resultsToCategorise, this.uniqueTimestamp, 'CategoriseResultsPrompt2.txt')

    const categorisedResults = await this.sendLLMRequest(
      [
        PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(domain),
        'Sentences: \n' + resultsToCategorise
      ]
    )

    this.logger('\n \nLLM RESPONSE: \n' + JSON.stringify(categorisedResults, null, 2), this.uniqueTimestamp, 'CategoriseResultsPrompt2.txt')

    if (!categorisedResults || !categorisedResults.trim()) {
      this.logger('No resposen from the categorisation request', this.uniqueTimestamp)
      return []
    }

    this.logger('\nParsing categorised results:', this.uniqueTimestamp)
    this.logger(categorisedResults, this.uniqueTimestamp)

    const result = parseCategorisedResults(categorisedResults, type)

    this.logger('\n Parsed categorised results:', this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)

    return result
  }

  async gradeResults (messagesForGPT) {
    const results = await this.sendLLMRequest(
      null,
      null,
      messagesForGPT
    )

    this.logger('PROMPT: \n ' + JSON.stringify(messagesForGPT, null, 2), this.uniqueTimestamp, '4. GradeResultsPrompt.txt')
    this.logger('', this.uniqueTimestamp)
    this.logger('\n \nLLM RESPONSE: \n' + results, this.uniqueTimestamp, '4. GradeResultsPrompt.txt')

    return results
  }

  parseBannedTopics (input) {
    // Split the input string into an array by using double newlines as separators
    const entries = input.trim().split('\n\n')

    // Create an array to hold the parsed objects
    return entries.map(entry => {
      // Since each entry is a single line, we can directly process it
      const statement = entry.replace(/"/g, '') // Remove quotes for safety
      return { statement }
    })
  }

  logResults (message, data, fileName) {
    this.logger(`\n---> ${message} <--- \n${JSON.stringify(data, null, 2)}`, this.uniqueTimestamp, fileName)
  }

  async checkLanguageViolations (results) {
    if (!this.languageDetection?.enabled) {
      return results
    }

    this.logger('\nChecking for language violations:', this.uniqueTimestamp)

    const languageViolations = await this.identifyLanguageViolations()
    if (languageViolations.length === 0) {
      return results
    }

    // Add language violations to results
    const combinedResults = [...results, ...languageViolations]
    this.logger('After adding language violations:', this.uniqueTimestamp)
    this.logger(combinedResults, this.uniqueTimestamp)

    return combinedResults
  }

  async identifyLanguageViolations () {
    this.logger('Identifying language violations...', this.uniqueTimestamp)

    const violations = []

    if (!this.languageDetection.enabled) {
      return []
    }

    const botResponses = this.conversationHistory.filter(msg => msg.role === 'user')

    for (let i = 0; i < botResponses.length; i++) {
      const botResponse = botResponses[i]
      const responseIndex = this.conversationHistory.findIndex(msg =>
        msg.role === 'user' && msg.content === botResponse.content
      )

      let precedingUserMessage

      if (this.languageDetection.matchUserLanguage) {
        // Find the preceding user message to check language if matchUserLanguage is true
        // let expectedLanguage = this.languageDetection.specificLanguage
        let userMessageLanuguage = null
        let botMessageLanguage = null

        precedingUserMessage = this.getPrecedingUserMessage(responseIndex)

        if (!precedingUserMessage) {
          continue // Skip this iteration and continue with the next bot response
        }

        userMessageLanuguage = await this.detectLanguage(precedingUserMessage.content)
        botMessageLanguage = await this.detectLanguage(botResponse.content)

        if (userMessageLanuguage !== botMessageLanguage) {
          violations.push({
            index: responseIndex,
            role: 'assistant',
            statement: botResponse.content,
            type: 'language',
            severity: 'High',
            category: 'Language Violation',
            reason: 'The question was asked in ' + userMessageLanuguage + ' but the answer was given in ' + botMessageLanguage
          })
        }
      } else {
        const botMessageLanguage = await this.detectLanguage(botResponse.content)

        const isCorrectLanguage = await this.isInCorrectLanguage(
          botResponse.content,
          this.languageDetection.specificLanguage,
          botMessageLanguage
        )

        if (!isCorrectLanguage) {
          violations.push({
            index: responseIndex,
            role: 'assistant',
            statement: botResponse.content,
            type: 'language',
            severity: 'High',
            category: 'Language Violation',
            reason: 'The answer was given in ' + botMessageLanguage + ' but should have been given in ' + this.languageDetection.specificLanguage
          })
        }
      }
    }

    this.logger('Found language violations:', this.uniqueTimestamp)
    this.logger(violations, this.uniqueTimestamp)

    return violations
  }

  getPrecedingUserMessage (assistantIndex) {
    if (assistantIndex === 0) {
      return null
    }

    return this.conversationHistory[assistantIndex - 1]
  }

  async detectLanguage (text) {
    // Need to put this into the prompt file.
    const systemPrompt = 'You are a language detection expert. Identify the language of the provided text. Respond with a JSON object that has a "detectedLanguage" field containing the language name in English (e.g., "English", "Spanish", "French", etc.).'
    const userPrompt = `Detect the language of this text: "${text}"`

    const response = await this.sendRequestWithLogging(
      systemPrompt,
      userPrompt,
      'LanguageDetection.txt',
      'detectedLanguage'
    )

    if (response && typeof response === 'object' && response.detectedLanguage) {
      return response.detectedLanguage
    }

    return response
  }

  async isInCorrectLanguage (text, expectedLanguage, userLanguage = null) {
    let systemPrompt
    let userPrompt

    if (this.languageDetection.matchUserLanguage && userLanguage) {
      systemPrompt = `You are a language expert. Your task is to determine if a response is in the same language as the user's message. The user's message is in ${userLanguage}. Respond with a JSON object that has an "isCorrectLanguage" field set to true or false, and a "detectedLanguage" field with the name of the detected language.`
      userPrompt = `Is this text in ${userLanguage}? Respond with the JSON format: "${text}"`
    } else {
      systemPrompt = `You are a language expert. Your task is to determine if a text is written in ${expectedLanguage}. Respond with a JSON object that has an "isCorrectLanguage" field set to true or false, and a "detectedLanguage" field with the name of the detected language.`
      userPrompt = `Is this text in ${expectedLanguage}? Respond with the JSON format: "${text}"`
    }

    const result = await this.sendRequestWithLogging(
      systemPrompt,
      userPrompt,
      'LanguageCheck.txt',
      'isCorrectLanguage' // This is the attribute name to extract
    )

    return result
  }
}

function parseCategorisedResults (categorisedResults, typeOfViolation) {
  try {
    return categorisedResults.trim().split('\n\n').map(entry => {
      const lines = entry.split('\n')
      const statement = lines[0]?.includes(': ') ? lines[0].split(': ')[1]?.replace(/"/g, '') : 'Unknown'
      const category = lines[1]?.includes(': ') ? lines[1].split(': ')[1] : 'Unknown'
      const type = typeOfViolation

      return { statement, category, type }
    }).filter(item => item.statement !== 'Unknown' && item.category !== 'Unknown')
  } catch (error) {
    console.error('Error parsing categorised results:', error)
    console.error('Categorised Results:', categorisedResults)
    return []
  }
}

module.exports = { TranscriptAnalyser }

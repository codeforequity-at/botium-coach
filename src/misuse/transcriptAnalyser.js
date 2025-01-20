const OpenAIHelper = require('./llmProviders/LLMHelper.js')
const Common = require('./common.js')
const PromptTemplates = require('./prompts.js')
const TestDataBuilder = require('./testResultBuilder.js')

class TranscriptAnalyser {
  constructor ({
    distractionTopic = '',
    CONFUSED_SENTANCES: confusedSentances = [],
    IGNORED_SENTANCES: ignoredSentances = [],
    DOMAINS: domains = [],
    BANNED_TOPICS: bannedTopic = [],
    OK_TOPICS: approvedTopics = [],
    conversationHistory = [],
    uniqueTimestamp = null, promptTokensUsed = 0,
    completionTokensUsed = 0,
    llm = null
  } = {}, logger) {
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
    if (!llm) {
      throw new Error('LLM is required for ConversationTracker')
    }
    this.llm = llm
    this.llmHelper = new OpenAIHelper(this.llm)
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
      tokenUsage: [
        {
          provider: 'GPT-4',
          metrics: [
            { metricName: 'promptTokensUsed', metricValue: this.promptTokensUsed },
            { metricName: 'completionTokensUsed', metricValue: this.completionTokensUsed }
          ]
        }
      ],
      violationsData: result,
      distractionTopic
    }
    return testDataBuilder.buildTestData(customData)
  }

  async analyseConversation (timeStamp, history, cycleNumber, distractionTopic) {
    this.uniqueTimestamp = timeStamp
    this.conversationHistory = history
    this.logger('\nIdentifying misuse. Please be patient...', this.uniqueTimestamp, null, true)

    this.logger('Remove this log....', this.uniqueTimestamp)
    this.logger('Analysing with the following settings....', this.uniqueTimestamp)
    this.logger('Banned Topics: ' + JSON.stringify(this.forbiddenTopics), this.uniqueTimestamp)
    this.logger('Domains: ' + JSON.stringify(this.allowedDomains), this.uniqueTimestamp)
    this.logger('OK Topics: ' + JSON.stringify(this.approvedTopics), this.uniqueTimestamp)
    this.logger('Confused Sentences: ' + JSON.stringify(this.confusedSentances), this.uniqueTimestamp)
    this.logger('', this.uniqueTimestamp)

    try {
      // Step 1. Get responses that violate TOPICS.
      const bannedtopicViolations = await this.identifyBannedTopics()
      this.logResults('Step 1. Banned topic violations', bannedtopicViolations, 'ResultBreakdown.txt')

      // Step 2. Get responses that violate the DOMAINS.
      const nonDomainViolations = await this.identifyNonDomainViolations()
      this.logResults('Step 2. Out of domain violations', nonDomainViolations, 'ResultBreakdown.txt')

      // Step 3. Out of the violations that violate the domain, lets work out if they were within the topics that were deemed OK.
      const domainViolationsExcludingSome = await this.excludeViolationsThatAreOk(nonDomainViolations)
      this.logResults('Step 3. After excluding topics that are deemed as OK(OK within the domain)', domainViolationsExcludingSome, 'ResultBreakdown.txt')

      // At this point we have banned topic violations and domain violations(excluding those which are actually ok)
      const topLevelViolations = [...bannedtopicViolations, ...domainViolationsExcludingSome]

      // Step 4. Get responses that are rude, offesnive or innapropriate
      const inaprpriateViolations = await this.identifyInapropriateViolations()
      this.logResults('Step 4. Offensive violations', inaprpriateViolations, 'ResultBreakdown.txt')

      // Step 5. Removing any duplictes that might exist.
      const uniqueViolations = this.getUniqueViolations(topLevelViolations, inaprpriateViolations)
      this.logResults('Step 5. After removing duplicates', uniqueViolations, 'ResultBreakdown.txt')

      // Step 6. Confirm violations
      const confirmedVilations = await this.confirmViolations(uniqueViolations, history)
      this.logResults('Step 6. After confirming violations', confirmedVilations, 'ResultBreakdown.txt')

      // Need to split this step out into indvidual steps as there are multiple here.
      // Step 7. Categorised and improve reasoning(each one is done individualy).
      let gradedResults = await this.classifyAndImproveReasoning(confirmedVilations, history)
      this.logResults('Step 7. After grading results', gradedResults, 'ResultBreakdown.txt')

      // Step 8. Filter out instances where the bot is asking the user to repeat what they said.
      gradedResults = await this.removeRepititionRequests(gradedResults)
      this.logResults('Step 8. After removing violations that are repitition requests', gradedResults, 'ResultBreakdown.txt')

      // Step 9. Filter out any greetings or farewells
      gradedResults = await this.removeGreetingsAndGoodByes(gradedResults)
      this.logResults('Step 9. After removing greetings and farewells.', gradedResults, 'ResultBreakdown.txt')

      // Step 10. Filter out severities of N/A
      gradedResults = this.removeNonApplicableSeverity(gradedResults)
      this.logResults('Step 10. After removing results with severity of N/A', gradedResults, 'ResultBreakdown.txt')

      return this.prepareTestResults(gradedResults, cycleNumber, distractionTopic)
    } catch (error) {
      console.error('\nError analysing conversation:\n', error)
      return false
    }
  }

  getUniqueViolations (array1, array2) {
    const combinedViolations = [...array1, ...array2]

    const indexMap = new Map()

    combinedViolations.forEach((violation) => {
      const existingViolation = indexMap.get(violation.index)

      if (
        !existingViolation ||
        violation.type === 'inappropriate' ||
        (violation.type === 'banned' && existingViolation.type !== 'inappropriate')
      ) {
        indexMap.set(violation.index, violation)
      }
    })

    // Convert the map values back to an array
    return Array.from(indexMap.values())
  }

  gpt4ResponseToArray (input) {
    return input.split('\n').map(sentence => sentence.replace(/"/g, ''))
  }

  async sendRequestAndUpdateTokens (systemContent = null, userContent = null, messagesAsObject = null, jsonObjectField = null) {
    return await this.sendLLMRequest(systemContent, userContent, messagesAsObject, jsonObjectField)
  }

  async sendLLMRequest (systemContent, userContent, messagesAsObject, jsonObjectField = null) {
    if (messagesAsObject == null) {
      messagesAsObject = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ]
    }

    const response = await this.llmHelper.sendRequest(messagesAsObject, jsonObjectField)

    if (!response) {
      console.log('No response from LLM')
      return null
    }

    const { result, prompt_tokens: promptUsed, completion_tokens: completionUsed } = response

    this.promptTokensUsed += promptUsed || 0
    this.completionTokensUsed += completionUsed || 0

    return result
  }

  locateViolationIndex (conversationHistory, violation) {
    const violationIndex = conversationHistory.findIndex(
      item => item && item.content && violation && violation.statement && item.content.replace(/\s+|\n|\r/g, ' ').trim() === violation.statement.replace(/\s+|\n|\r/g, ' ').trim()
    )
    return violationIndex
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

  generateDetectionPrompts (violation, domain, forbiddenTopics, priorMessages) {
    let detectionSystemPrompt
    let detectionUserPrompt

    if (violation.type === 'banned') {
      detectionSystemPrompt = PromptTemplates.DETECT_BANNED_TOPIC_SYSTEM(violation.statement, forbiddenTopics)
      detectionUserPrompt = PromptTemplates.DETECT_BANNED_TOPIC_USER(violation.statement, forbiddenTopics, priorMessages)
    } else if (violation.type === 'out of domain') {
      detectionSystemPrompt = PromptTemplates.DETECT_DOMAIN_DEVIATION_SYSTEM(violation.statement, domain, priorMessages)
      detectionUserPrompt = PromptTemplates.DETECT_DOMAIN_DEVIATION_USER(violation.statement, domain, priorMessages)
    } else if (violation.type === 'inappropriate') {
      detectionSystemPrompt = PromptTemplates.DETECT_INAPPROPRIATE_DEVIATION_SYSTEM()
      detectionUserPrompt = PromptTemplates.DETECT_INAPPROPRIATE_DEVIATION_USER(violation.statement, priorMessages)
    }

    return { detectionSystemPrompt, detectionUserPrompt }
  }

  async isTrueViolation (violation, history) {
    const domain = this.commonInstance.formatTopicList(this.allowedDomains, true)
    const forbiddenTopics = this.commonInstance.formatTopicList(this.forbiddenTopics, true)

    const historyCopy = [...history]

    // Get prior messages for context
    const priorMessages = this.getPrecedingMessages(violation.index, historyCopy, true)

    // Step 1: Detection
    let detectionSystemPrompt
    if (violation.type === 'banned') {
      detectionSystemPrompt = PromptTemplates.DETECT_BANNED_TOPIC_SYSTEM(violation.statement, forbiddenTopics)
    } else if (violation.type === 'out of domain') {
      detectionSystemPrompt = PromptTemplates.DETECT_DOMAIN_DEVIATION_SYSTEM(violation.statement, domain, priorMessages)
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

    // console.log('--------------------------------')
    // console.log('violation.statement: ', violation)
    // console.log('DetectionSystemPrompt: ' + detectionSystemPrompt)
    // console.log('DetectionUserPrompt: ' + detectionUserPrompt)
    // console.log('--------------------------------')

    const detectionResponse = await this.sendRequestWithLogging(detectionSystemPrompt, detectionUserPrompt, 'DetectionPrompt.txt')

    // console.log('DetectionResponse: ', detectionResponse)

    const confirmedViolation = this.parseDetectionResponse(detectionResponse)

    if (violation.type === 'inappropriate') {
      if (confirmedViolation && confirmedViolation.inappropriate === 'YES') {
        return true
      }
    } else {
      if (confirmedViolation && confirmedViolation.deviation === 'YES') {
        return true
      }
    }

    return false
  }

  async classifyAndImproveReason (violation, history) {
    const domain = this.commonInstance.formatTopicList(this.allowedDomains, true)
    const forbiddenTopics = this.commonInstance.formatTopicList(this.forbiddenTopics, true)

    const historyCopy = [...history]

    // Get prior messages for context
    const priorMessages = this.getPrecedingMessages(violation.index, historyCopy, true)

    // This is getting the context and the reason. But we are ctually getting that during the confirmatiom stop.
    const { detectionSystemPrompt, detectionUserPrompt } = this.generateDetectionPrompts(
      violation,
      domain,
      forbiddenTopics,
      priorMessages
    )

    const detectionResponse = await this.sendRequestWithLogging(
      detectionSystemPrompt,
      detectionUserPrompt,
      'DetectionPrompt.txt'
    )

    const confirmedViolation = this.parseDetectionResponse(detectionResponse)

    if (!confirmedViolation || !confirmedViolation.deviation || confirmedViolation.deviation.toUpperCase() !== 'YES') {
      if (!confirmedViolation.inappropriate || confirmedViolation.inappropriate.toUpperCase() === 'YES') {
        // console.log('But wait its innapropriate, so ths is a violation!')
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
        forbiddenTopics,
        confirmedViolation.reason,
        priorMessages
      )
    } else if (violation.type === 'out of domain') {
      classificationPromptSystem = PromptTemplates.CLASSIFY_DOMAIN_SEVERITY_SYSTEM(
        violation.statement,
        domain,
        confirmedViolation.reason,
        priorMessages
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
        '??',
        priorMessages
      )
    }

    const classificationResponse = await this.sendRequestWithLogging(
      classificationPromptSystem,
      classificationPromptUser,
      'ClassificationPrompt.txt'
    )

    const classificationResult = this.parseClassificationResponse(classificationResponse, violation.statement, confirmedViolation.context)

    const reasoningResponse = await this.sendRequestWithLogging(
      PromptTemplates.REASONING_PROMPT_SYSTEM(),
      PromptTemplates.REASONING_PROMPT_USER(classificationResult, priorMessages),
      'ReasoningPrompt.txt',
      'improvedReasoning'
    )

    classificationResult.reason = reasoningResponse

    return classificationResult
  }

  parseDetectionResponse (response) {
    try {
      // If response is already an object, use it directly
      if (typeof response === 'object' && response !== null) {
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
      const parsedObject = JSON.parse(jsonString)

      return parsedObject
    } catch (error) {
      console.error('Failed to parse reasoning response:', error.message)
      return null // Or handle error appropriately
    }
  }

  parseClassificationResponse (response, statement, context) {
    try {
      // If response is already an object, use it directly
      if (typeof response === 'object' && response !== null) {
        const { severity, reason, category } = response

        return { statement, severity, reason, category, context }
      }

      // If it's a string, try to parse it as JSON
      try {
        const parsedResponse = JSON.parse(response)
        const { severity, reason, category } = parsedResponse
        return { statement, severity, reason, category, context }
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError)
        console.log('This what we tried parsing: ', response)
        return null
      }
    } catch (error) {
      console.error('Error in parseClassificationResponse:', error)
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

      console.log('incorrect response when grading. Expecting a severity and a reason.', response)
      console.log(`Attempt ${attempts} failed. Retrying...`)
    }

    console.log(`Failed to grade results after ${maxRetries} attempts.`)

    throw new Error('Failed to grade results...')
  }

  isExpectedFormat (response) {
    return response.includes('Severity:') && response.includes('Reason:')
  }

  async removeRepititionRequests (gradedResults) {
    this.logger('\nRemoving repetition requests:', this.uniqueTimestamp)
    this.logger(gradedResults, this.uniqueTimestamp)

    const filteredResults = []

    for (const result of gradedResults) {
      // console.log('result: ', result)

      const systemPrompt = PromptTemplates.REPITITION_PROMPT_SYSTEM()
      const userPrompt = PromptTemplates.REPITITION_PROMPT_USER(result.statement)

      // console.log('systemPrompt: ', systemPrompt)
      // console.log('userPrompt: ', userPrompt)

      try {
        const response = await this.sendRequestWithLogging(systemPrompt, userPrompt, 'RepititionPrompt.txt', 'isRepetitionRequest')
        // console.log('response: ', response)
        if (typeof response === 'string' && response.trim().toLowerCase().includes('yes')) {
          // console.log('Throwing away: ' + result.statement)
        } else {
          // console.log('Keeping: ' + result.statement)
          filteredResults.push(result)
        }
      } catch (error) {
        console.error('Error identifying repetition request:', error)
      }
    }

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

    const confirmedResults = []

    for (const violation of violations) {
      try {
        const isViolation = await this.isTrueViolation(violation, history)
        if (isViolation === true) {
          confirmedResults.push(violation)
        }
      } catch (error) {
        console.error('Error grading violation, so ignoring it...', error)
      }
    }

    this.logger('Confirmed violations:', this.uniqueTimestamp)
    this.logger(confirmedResults, this.uniqueTimestamp)

    return confirmedResults
  }

  async classifyAndImproveReasoning (violations, history) {
    this.logger('Grading results: \n', this.uniqueTimestamp)
    this.logger(violations, this.uniqueTimestamp)

    const gradedResultsList = []

    for (const violation of violations) {
      let gradedViolation
      try {
        gradedViolation = await this.classifyAndImproveReason(violation, history)

        if (gradedViolation != null) {
          gradedResultsList.push(gradedViolation)
        }
      } catch (error) {
        console.error('Error grading violation, so ignoring it...', error)
      }
    }

    this.logger('Graded results:', this.uniqueTimestamp)
    this.logger(gradedResultsList, this.uniqueTimestamp)

    return gradedResultsList
  }

  async identifyBannedTopics () {
    this.logger('Identifying if the LLM discussed banned topics...', this.uniqueTimestamp)
    const result = await this.analyzeBannedTopics(
      this.conversationHistory, this.forbiddenTopics, this.commonInstance.formatBulletList
    )

    this.logger('Found banned topics(below)', this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)
    this.logger('', this.uniqueTimestamp)

    return result
  }

  async identifyOffensiveViolations () {
    this.logger('Identifying if the LLM discussed topics outside of the domain...', this.uniqueTimestamp)

    const result = await this.analyzeNonDomainResults(this.allowedDomains, this.sendRequestAndUpdateTokens.bind(this))

    this.logger('Found violations outside of domain: ', this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)

    return result
  }

  async identifyNonDomainViolations () {
    this.logger('Identifying if the LLM discussed topics outside of the domain...', this.uniqueTimestamp)

    const result = await this.analyzeNonDomainResults(this.allowedDomains, this.sendRequestAndUpdateTokens.bind(this))

    this.logger('Found violations outside of domain: ', this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)

    return result
  }

  async identifyInapropriateViolations () {
    this.logger('Identifying if the LLM discussed gave any inaprpriate answers...', this.uniqueTimestamp)

    const result = await this.checkForAnyInapropriateAnswers()

    this.logger('Found inapropriate answers: ', this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)

    return result
  }

  async excludeOKTopics (results) {
    let result = null

    this.logger('Excluding topics that were marked as OK...', this.uniqueTimestamp)
    this.logger('Before excluding ok topics \n' + results, this.uniqueTimestamp)
    result = await this.excludeOKTopicViolations(
      this.approvedTopics, this.commonInstance.formatTopicList, results, this.conversationHistory
    )

    return result
  }

  async sendRequestWithLogging (prompt, userMessage, logFileName, jsonObectField = null) {
    const result = await this.sendRequestAndUpdateTokens(
      prompt, userMessage, null, jsonObectField
    )

    this.logger('PROMPT: \n ' + prompt, this.uniqueTimestamp, logFileName)
    this.logger(userMessage, this.uniqueTimestamp, logFileName)
    this.logger('\n \nLLM RESPONSE: \n' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : result), this.uniqueTimestamp, logFileName)

    return result
  }

  async excludeOKTopicViolations (OK_TOPICS, formatTopicList, nonDomainViolations, conversationHistory) {
    const okTopicPrompt = PromptTemplates.DETECT_OK_TOPIC_PROMPT(OK_TOPICS, formatTopicList)
    const outOfDomainResultsAsString = nonDomainViolations.map((statement, index) => `${index + 1}. Role: ${statement.role} -> Statement: "${statement.statement}"`).join('\n')

    const historyMsg = 'Full Conversation History:\n' + conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`).join('\n')

    let violationIndices = await this.sendRequestWithLogging(okTopicPrompt, 'Results:\n' + outOfDomainResultsAsString + '\n\n' + historyMsg, '3. OKTopicsPrompt.txt', 'unrelatedCitations')

    violationIndices = this.parseViolationIndices(violationIndices)

    // Watch out for this.
    const results2 = this.fetchViolatingMessagesFromArray(nonDomainViolations, violationIndices)

    return results2
  }

  async analyzeBannedTopics (conversationHistory, BANNED_TOPICS, formatBulletList) {
    try {
      if (BANNED_TOPICS.length > 0) {
        const bannedTopicsPrompt = PromptTemplates.BANNED_TOPICS_PROMPT(BANNED_TOPICS, formatBulletList)
        const historyMsg = 'Full Conversation History:\n' + conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`).join('\n')

        const violationIndicies = await this.sendRequestAndUpdateTokens(
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

      // Ensure it’s a user message and its not empty.
      if (message && message.role === 'user' && message.statement) {
        return message.statement + '\n'
      }
      return null // Explicitly return null to avoid undefined
    }).filter(message => message !== null) // Filter out null values

    return violatingMessages && violatingMessages.length > 0 ? violatingMessages : []
  }

  fetchViolatingMessagesFromArray (arr, indices) {
    const resultsWeCareAbout = indices.map(index => {
      const adjustedIndex = index - 1
      if (arr[adjustedIndex] !== undefined) {
        return arr[adjustedIndex]
      }
      return null
    }).filter(item => item !== null)
    return resultsWeCareAbout
  }

  parseViolationIndices (violationString) {
    return violationString.split(',').map(index => parseInt(index.trim(), 10))
  }

  async checkForAnyInapropriateAnswers () {
    const inapropriateAnswersPrompt = PromptTemplates.DETECT_INAPPROPRIATE_PROMPT()

    const historyAsString = this.conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`)

    const transcriptAsText = 'Transcript:\n' + historyAsString.join('\n')

    const violationIndicies = await this.sendRequestWithLogging(
      inapropriateAnswersPrompt,
      transcriptAsText,
      'OutOfDomainPrompt.txt',
      'inappropriateMessages'
    )

    // console.log('-> 1 violationIndicies: ', violationIndicies)

    const violationIndices = this.parseViolationIndices(violationIndicies)

    // console.log('-> 2 violationIndicies: ', violationIndicies)

    const results = violationIndices
      ? violationIndices
        .filter(index => index > 0 && index <= this.conversationHistory.length)
        .map(index => ({
          index,
          role: this.conversationHistory[index - 1].role, // Include the role (user or assistant)
          statement: this.conversationHistory[index - 1].content,
          type: 'inappropriate'
        }))
      : []

    /// console.log('all results --> ', results)

    const usersOnlyResponses = results.filter(message => message.role === 'user')

    // console.log('user only results--> ', results)

    this.logger('PROMPT: \n ' + inapropriateAnswersPrompt, this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')
    this.logger(transcriptAsText, this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')
    this.logger('\n \nLLM RESPONSE: \n' + violationIndicies, this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')
    this.logger('\n' + JSON.stringify(results, null, 2), this.uniqueTimestamp, '3. InapropriateResponsePrompt.txt')

    return usersOnlyResponses
  }

  async analyzeNonDomainResults (DOMAINS) {
    const nonDomainResultsPrompt = PromptTemplates.DETECT_OUT_OF_DOMAIN_PROMPT(DOMAINS, this.commonInstance.formatTopicList)

    const historyAsString = this.conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`)

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
        .filter(index => index > 0 && index <= this.conversationHistory.length)
        .map(index => ({
          index,
          role: this.conversationHistory[index - 1].role, // Include the role (user or assistant)
          statement: this.conversationHistory[index - 1].content,
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

  // think I can delete this
  async categoriseResults (bannedTopicViolations, outOfDomainViolations, foundBannedTopicViolations) {
    this.logger('Categorising results...', this.uniqueTimestamp)

    let categorisedViolations = []

    if (foundBannedTopicViolations === true) {
      this.logger('There was a banned topic violation: \n' + bannedTopicViolations, this.uniqueTimestamp)
      this.logger('Out of domain violations: \n' + outOfDomainViolations, this.uniqueTimestamp)

      categorisedViolations = [
        ...(bannedTopicViolations && bannedTopicViolations.trim() ? await this.getBannedResults(bannedTopicViolations, 'banned') : []),
        ...(outOfDomainViolations && outOfDomainViolations.trim() ? await this.getBannedResults(outOfDomainViolations, 'out of domain') : []),
        ...(outOfDomainViolations && outOfDomainViolations.trim() ? await this.getBannedResults(outOfDomainViolations, 'inappropriate') : [])
      ]

      this.logger('Categorisation results:', this.uniqueTimestamp)
      this.logger(categorisedViolations, this.uniqueTimestamp)
    } else {
      this.logger('No banned topic violations detectected: \n' + bannedTopicViolations, this.uniqueTimestamp)

      if (outOfDomainViolations && outOfDomainViolations.trim()) {
        this.logger('Out of domain violations: \n' + outOfDomainViolations, this.uniqueTimestamp)

        categorisedViolations = await this.getBannedResults(outOfDomainViolations, 'out of domain')

        this.logger('Categorisation results: \n', this.uniqueTimestamp)
        this.logger(categorisedViolations, this.uniqueTimestamp)
      } else {
        this.logger('No out of domain violations detectected: \n' + bannedTopicViolations, this.uniqueTimestamp)
        this.logger('NOTHING TO CATEGORISE!', this.uniqueTimestamp, 'CategoriseResultsPrompt.txt')
        return null
      }
    }

    if (categorisedViolations.length === 0) {
      return null
    }

    this.logger('PROMPT: \n ' + PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(), this.uniqueTimestamp, 'CategoriseResultsPrompt.txt')
    this.logger('Sentances: \n' +
            (bannedTopicViolations && bannedTopicViolations.trim() ? bannedTopicViolations : 'No banned topic results') + '\n' +
            (outOfDomainViolations && outOfDomainViolations.trim() ? outOfDomainViolations : 'No excluded OK topic results'), this.uniqueTimestamp, 'CategoriseResultsPrompt.txt')
    this.logger('\n \nLLM RESPONSE: \n' + JSON.stringify(categorisedViolations, null, 2), this.uniqueTimestamp, 'CategoriseResultsPrompt.txt')

    return categorisedViolations
  }

  async getBannedResults (resultsToCategorise, type) {
    this.logger('PROMPT: \n ' + PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(), this.uniqueTimestamp, 'CategoriseResultsPrompt2.txt')
    this.logger('Sentences: \n' + resultsToCategorise, this.uniqueTimestamp, 'CategoriseResultsPrompt2.txt')

    const categorisedResults = await this.sendRequestAndUpdateTokens(
      [
        PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(),
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
    const results = await this.sendRequestAndUpdateTokens(
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
    const parsedData = entries.map(entry => {
      // Since each entry is a single line, we can directly process it
      const statement = entry.replace(/"/g, '') // Remove quotes for safety
      return { statement }
    })

    return parsedData
  }

  logResults (message, data, fileName) {
    this.logger(`\n---> ${message} <--- \n${JSON.stringify(data, null, 2)}`, this.uniqueTimestamp, fileName)
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

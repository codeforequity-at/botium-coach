const OpenAIHelper = require('./llmProviders/openaiHelper.js')
const LlamaModelClient = require('./llmProviders/LlamaModelClient.js')
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
    completionTokensUsed = 0
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
  }

  async getBannedTopicViolations () {
    let bannedTopicViolationsAsArray = []

    try {
      bannedTopicViolationsAsArray = await this.identifyBannedTopics()
    } catch (error) {
      console.error('Error fetching banned topics:', error)
    }

    if (!Array.isArray(bannedTopicViolationsAsArray)) {
      bannedTopicViolationsAsArray = []
    }

    return bannedTopicViolationsAsArray
  }

  async filterOutOkTopicViolations (nonDomainViolations, bannedTopicViolationsAsArray) {
    let violationsExceptTopicsThatAreOkArray = []
    if (this.approvedTopics.length > 0) {
      if (nonDomainViolations.length > 0) {
        violationsExceptTopicsThatAreOkArray = await this.excludeOKTopics(nonDomainViolations)
        this.logResults('Step 3. After filtering out OK topics', violationsExceptTopicsThatAreOkArray, 'ResultBreakdown.txt')
      }
    } else {
      violationsExceptTopicsThatAreOkArray = nonDomainViolations
    }

    return this.numberViolations(violationsExceptTopicsThatAreOkArray, bannedTopicViolationsAsArray)
  }

  numberViolations (outStandingExceptions, bannedTopicViolationsAsArray) {
    return [...bannedTopicViolationsAsArray.map(statement => ({ statement, type: 'banned' })), ...outStandingExceptions.map(statement => ({ statement, type: 'out of domain' }))]
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

    this.logger('Analysing with the following settings....', this.uniqueTimestamp)
    this.logger('Banned Topics: ' + JSON.stringify(this.forbiddenTopics), this.uniqueTimestamp)
    this.logger('Domains: ' + JSON.stringify(this.allowedDomains), this.uniqueTimestamp)
    this.logger('OK Topics: ' + JSON.stringify(this.approvedTopics), this.uniqueTimestamp)
    this.logger('Confused Sentences: ' + JSON.stringify(this.confusedSentances), this.uniqueTimestamp)
    this.logger('', this.uniqueTimestamp)

    try {
      // Step 1. Get sentances that violate the topics outself of the domain/s.
      const bannedtopicViolations = await this.getBannedTopicViolations()
      this.logResults('Step 1. Banned topic violations', bannedtopicViolations, 'ResultBreakdown.txt')

      // Step 2. Non domain results
      const nonDomainViolations = await this.identifyNonDomainViolations()
      this.logResults('Step 2. Out of domain violations', nonDomainViolations, 'ResultBreakdown.txt')

      // Step 3. Filtering out any references to topics that are deemed OK.
      const outStandingExceptions = await this.filterOutOkTopicViolations(nonDomainViolations, bannedtopicViolations)

      // Step 4. Grade the results that have now been categorised(each one is done individualy).
      let gradedResults = await this.gradeCatergorisedResults(outStandingExceptions, history)
      this.logResults('Step 4. After grading the categorised results', gradedResults, 'ResultBreakdown.txt')

      // Step 5. Removing any duplicates that might exist.
      gradedResults = this.removeDuplicateResults(gradedResults)
      this.logResults('Step 5. After removing any duplicates', gradedResults, 'ResultBreakdown.txt')

      // Step 6. Filter out severities of N/A
      gradedResults = this.removeNonApplicableSeverity(gradedResults)
      this.logResults('Step 6. After removing results with severity of N/A', gradedResults, 'ResultBreakdown.txt')

      return this.prepareTestResults(gradedResults, cycleNumber, distractionTopic)
    } catch (error) {
      console.error('\nError analysing conversation:\n', error)
      return false
    }
  }

  gpt4ResponseToArray (input) {
    return input.split('\n').map(sentence => sentence.replace(/"/g, ''))
  }

  async sendRequestAndUpdateTokens (systemContent = null, userContent = null, messagesAsObject = null) {
    // In the future we should interface this out.
    const useLlama = false
    if (useLlama) {
      return await this.sendLlamaRequest(systemContent, userContent, messagesAsObject)
    } else {
      return await this.sendOpenAIRequest(systemContent, userContent, messagesAsObject)
    }
  }

  async sendLlamaRequest (systemContent, userContent, messagesAsObject) {
    // Concatenate the system and user content as plain text for LLaMA
    if (messagesAsObject == null) {
      messagesAsObject = `${systemContent ? systemContent + '\n\n' : ''}${userContent}`
    } else {
      // Convert array to prompt text.
      messagesAsObject = messagesAsObject.map(message => `${message.role}: ${message.content}`).join('\n')
    }

    const llamaClient = new LlamaModelClient()

    const result = await llamaClient.getResponse(messagesAsObject)

    this.conversationHistory.push({ role: 'assistant', content: result })
    return result
  }

  async sendOpenAIRequest (systemContent, userContent, messagesAsObject) {
    if (messagesAsObject == null) {
      messagesAsObject = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ]
    }

    const response = await OpenAIHelper.sendOpenAIRequest(messagesAsObject)

    if (!response) {
      return null
    }

    const { result, prompt_tokens: promptUsed, completion_tokens: completionUsed } = response

    this.promptTokensUsed += promptUsed
    this.completionTokensUsed += completionUsed

    return result
  }

  locateViolationIndex (conversationHistory, violation) {
    const violationIndex = conversationHistory.findIndex(
      item => item && item.content && violation && violation.statement && item.content.replace(/\s+|\n|\r/g, ' ').trim() === violation.statement.replace(/\s+|\n|\r/g, ' ').trim()
    )
    return violationIndex
  }

  // Retrieve up to 3 messages preceding the violation, including the violation itself
  getPrecedingMessages (violationIndex, historyCopy) {
    return violationIndex > 2
      ? historyCopy.slice(violationIndex - 3, violationIndex + 1)
      : historyCopy.slice(0, violationIndex + 1)
  }

  async gradeVolation (violation, history) {
    const domain = this.commonInstance.formatTopicList(this.allowedDomains, true)
    const forbiddenTopics = this.commonInstance.formatTopicList(this.forbiddenTopics, true)

    const historyCopy = [...history]

    const violationIndex = this.locateViolationIndex(historyCopy, violation)

    if (violationIndex === -1) {
      console.error('Violation statement not found in history:', violation.statement)
      console.error('Here is the history:', historyCopy)
      return null
    }

    const priorMessages = this.getPrecedingMessages(violationIndex, historyCopy)

    let promptToUse = null

    if (violation.type === 'banned') {
      promptToUse = PromptTemplates.GRADING_VIOLATIONS_BANNED_TOPIC(violation.statement, forbiddenTopics)
    } else if (violation.type === 'out of domain') {
      promptToUse = PromptTemplates.GRADING_VIOLATIONS_OUT_OF_DOMAIN(violation.statement, domain)
    }

    priorMessages.unshift({
      role: 'system',
      content: promptToUse
    })

    var response = await this.callGradeResultsWithRetries.call(this, priorMessages);

    const responseObject = {
      statement: violation.statement
    }
    response.split('\n').forEach(line => {
      const [key, ...value] = line.split(': ')
      if (key && value.length && key.trim().toLowerCase() !== 'statement') {
        const formattedKey = key.trim().toLowerCase()
        const formattedValue = value.join(': ').trim().replace(/^"|"$/g, '')
        responseObject[formattedKey] = formattedValue
      }
    })

    return responseObject
  }

  async callGradeResultsWithRetries(historyCopy, maxRetries = 5) {
    
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
    //console.log('maxRetries', maxRetries)
    //console.log('historyCopy', historyCopy)

    throw new Error('Failed to grade results...')
  }

  isExpectedFormat (response) {
    return response.includes('Severity:') && response.includes('Reason:')
  }

  removeDuplicateResults (results) {
    this.logger('\nRemoving duplicates from reults:', this.uniqueTimestamp)
    this.logger(results, this.uniqueTimestamp)

    const uniqueGradedResults = []
    const seenStatements = new Set()

    for (const result of results) {
      if (!seenStatements.has(result.statement)) {
        uniqueGradedResults.push(result)
        seenStatements.add(result.statement)
      }
    }

    this.logger('After removing duplicates:', this.uniqueTimestamp)
    this.logger(uniqueGradedResults, this.uniqueTimestamp)

    return uniqueGradedResults
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

  async gradeCatergorisedResults (labeledViolations, history) {
    this.logger('Grading results: \n', this.uniqueTimestamp)
    this.logger(labeledViolations, this.uniqueTimestamp)

    const gradedResultsList = []

    for (const result of labeledViolations) {
      let gradedResult
      try {
        gradedResult = await this.gradeVolation(result, history)

        if (gradedResult != null) {
          gradedResultsList.push(gradedResult)
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

  async identifyNonDomainViolations () {
    this.logger('Identifying if the LLM discussed topics outside of the domain...', this.uniqueTimestamp)

    const result = await this.analyzeNonDomainResults(this.allowedDomains, this.sendRequestAndUpdateTokens.bind(this))

    this.logger('Found violations outside of domain: ', this.uniqueTimestamp)
    this.logger(result, this.uniqueTimestamp)

    return result
  }

  async excludeOKTopics (results) {
    let result = null

    this.logger('Excluding topics that were marked as OK...', this.uniqueTimestamp)
    this.logger('Before excluding ok topics \n' + results, this.uniqueTimestamp)
    result = await this.excludeOKTopicViolations(
      this.approvedTopics, this.commonInstance.formatTopicList, results
    )

    return result
  }

  async sendRequestWithLogging (prompt, userMessage, logFileName) {
    const result = await this.sendRequestAndUpdateTokens(
      prompt, userMessage
    )

    this.logger('PROMPT: \n ' + prompt, this.uniqueTimestamp, logFileName)
    this.logger(userMessage, this.uniqueTimestamp, logFileName)
    this.logger('\n \nGPT-4 RESPONSE: \n' + result, this.uniqueTimestamp, logFileName)

    return result
  }

  async excludeOKTopicViolations (OK_TOPICS, formatTopicList, nonDomainViolations) {
    const okTopicPrompt = PromptTemplates.DETECT_OK_TOPIC_PROMPT(OK_TOPICS, formatTopicList)
    const outOfOdmainResultsAsSring = nonDomainViolations.map((violation, index) => `${index + 1}. ${violation}`).join('\n')
    let violationIndices = await this.sendRequestWithLogging(okTopicPrompt, 'Results:\n' + outOfOdmainResultsAsSring, '3. OKTopicsPrompt.txt')
    violationIndices = this.parseViolationIndices(violationIndices)
    return this.fetchViolatingMessagesFromArray(nonDomainViolations, violationIndices)
  }

  async analyzeBannedTopics (conversationHistory, BANNED_TOPICS, formatBulletList) {
    try {
      if (BANNED_TOPICS.length > 0) {
        const bannedTopicsPrompt = PromptTemplates.BANNED_TOPICS_PROMPT(BANNED_TOPICS, formatBulletList)

        const historyMsg = 'Full Conversation History:\n' + conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`).join('\n')

        const violationIndicies = await this.sendRequestAndUpdateTokens(
          bannedTopicsPrompt,
          historyMsg
        )

        const violationIndices = this.parseViolationIndices(violationIndicies)

        const results = this.fetchViolatingMessages(this.conversationHistory, violationIndices)

        this.logger('PROMPT: \n ' + bannedTopicsPrompt, this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')
        this.logger(historyMsg, this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')
        this.logger('\n \nGPT-4 RESPONSE: \n' + violationIndicies, this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')
        this.logger('\n \nGPT-4 RESPONSE: \n' + results, this.uniqueTimestamp, '1. BannedTopicsPrompt.txt')

        return results
      }
      return null
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
      if (message && message.role === 'user' && message.content) {
        return message.content + '\n'
      }
      return null // Explicitly return null to avoid undefined
    }).filter(message => message !== null) // Filter out null values

    return violatingMessages && violatingMessages.length > 0 ? violatingMessages : []
  }

  fetchViolatingMessagesFromArray (arr, indices) {
    return indices.map(index => {
      const adjustedIndex = index - 1
      return arr[adjustedIndex] !== undefined ? arr[adjustedIndex] : null
    }).filter(message => message !== null)
  }

  parseViolationIndices (violationString) {
    return violationString.split(',').map(index => parseInt(index.trim(), 10))
  }

  async analyzeNonDomainResults (DOMAINS, sendRequestAndUpdateTokens) {
    const nonDomainResultsPrompt = PromptTemplates.DETECT_OUT_OF_DOMAIN_PROMPT(DOMAINS, this.commonInstance.formatTopicList)

    const historyAsString = this.conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`)

    const transcriptAsText = 'Transcript:\n' + historyAsString.join('\n')

    const violationIndicies = await sendRequestAndUpdateTokens(
      nonDomainResultsPrompt,
      transcriptAsText
    )

    const violationIndices = this.parseViolationIndices(violationIndicies)

    const results = this.fetchViolatingMessages(this.conversationHistory, violationIndices)

    this.logger('PROMPT: \n ' + nonDomainResultsPrompt, this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')
    this.logger(transcriptAsText, this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')
    this.logger('\n \nGPT-4 RESPONSE: \n' + violationIndicies, this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')
    this.logger('\n' + results, this.uniqueTimestamp, '2. OutOfDomainPrompt.txt')

    return results
  }

  async categoriseResults (bannedTopicViolations, outOfDomainViolations, foundBannedTopicViolations) {
    this.logger('Categorising results...', this.uniqueTimestamp)

    let categorisedViolations = []

    if (foundBannedTopicViolations === true) {
      this.logger('There was a banned topic violation: \n' + bannedTopicViolations, this.uniqueTimestamp)
      this.logger('Out of domain violations: \n' + outOfDomainViolations, this.uniqueTimestamp)

      categorisedViolations = [
        ...(bannedTopicViolations && bannedTopicViolations.trim() ? await this.getBannedResults(bannedTopicViolations, 'banned') : []),
        ...(outOfDomainViolations && outOfDomainViolations.trim() ? await this.getBannedResults(outOfDomainViolations, 'out of domain') : [])
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
    this.logger('\n \nGPT-4 RESPONSE: \n' + JSON.stringify(categorisedViolations, null, 2), this.uniqueTimestamp, 'CategoriseResultsPrompt.txt')

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

    this.logger('\n \nGPT-4 RESPONSE: \n' + JSON.stringify(categorisedResults, null, 2), this.uniqueTimestamp, 'CategoriseResultsPrompt2.txt')

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
    this.logger('\n \nGPT-4 RESPONSE: \n' + results, this.uniqueTimestamp, '4. GradeResultsPrompt.txt')

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

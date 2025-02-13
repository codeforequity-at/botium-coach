const LLMHelper = require('./llmProviders/LLMHelper.js')
const { startContainer, stopContainer } = require('./driverHelper.js')
const { TranscriptAnalyser } = require('./transcriptAnalyser.js')
const Common = require('./common.js')

const MAX_CONVERSATION_CHARACTER_COUNT = process.env.MAX_CONVERSATION_CHARACTER_COUNT || 6000
const PromptTemplates = require('./prompts.js')

class ConversationTracker {
  constructor (params, logger) {
    if (!params.driver) throw new Error('Driver is required for ConversationTracker')
    this.driver = params.driver
    this.allowedDomains = params.allowedDomains || []
    this.primerMessage = params.primerMessage || { role: 'system', content: '' }
    this.conversationHistory = params.conversationHistory || []
    this.IGNORED_SENTENCES = params.ignoredSentences || []
    this.uniqueTimestamp = params.uniqueTimestamp || null
    this.promptTokensUsed = params.promptTokensUsed || 0
    this.completionTokensUsed = params.completionTokensUsed || 0
    this.CONFUSED_SENTANCES = params.confusedSentences || []
    this.BANNED_TOPICS = params.forbiddenTopics || []
    this.approvedTopics = params.approvedTopics || []
    this.logger = logger
    this.commonInstance = new Common(this.logger)

    if (!params.llm) {
      throw new Error('LLM is required for ConversationTracker')
    }
    this.llm = params.llm
    this.llmHelper = new LLMHelper(this.llm)
  }

  getConversationHistory () {
    return this.conversationHistory
  }

  collectRecentMessages (messages) {
    const totalMessages = this.conversationHistory.length

    for (let i = 0; i < totalMessages; i++) {
      messages.push(this.conversationHistory[i])
    }
  }

  truncateMessages (messages, maxLength = 300) {
    return messages.map(message => {
      if (message.role === 'user' && message.content.length > maxLength) {
        const truncatedContent = message.content.substring(0, maxLength) + '...'
        return { ...message, content: truncatedContent }
      }
      return message
    })
  }

  updateConversationHistory (prompt) {
    if (this.conversationHistory.length === 0 || this.conversationHistory[this.conversationHistory.length - 1].content !== prompt) {
      this.conversationHistory.push({ role: 'user', content: prompt })
    }
  }

  cleanPrompt (prompt) {
    this.IGNORED_SENTENCES.forEach(ignoredSentence => {
      prompt = prompt.replace(new RegExp(ignoredSentence, 'g'), '')
    })
    return prompt
  }

  prepareMessages () {
    const messages = [this.primerMessage]
    this.collectRecentMessages(messages)
    const results = this.truncateMessages(messages)
    return results
  }

  logAndCleanPrompt (prompt) {
    return this.cleanPrompt(prompt)
  }

  updateHistoryWithPrompt (prompt) {
    this.updateConversationHistory(prompt)
  }

  prepareMessagesForResponse (prompt) {
    prompt = this.logAndCleanPrompt(prompt)
    this.updateHistoryWithPrompt(prompt)
    return this.prepareMessages()
  }

  async generateResponse (prompt, localPrimerMessage) {
    const messages = this.prepareMessagesForResponse(prompt);
    messages.unshift(localPrimerMessage);

    try {
      return await this.generateLLMResponse(messages)
    } catch (error) {
      console.error('Error:', error.response ? error.response.data : error.message)
      return 'An error occurred while processing your request.'
    }
  }

  async generateLLMResponse (messages) {
    const { result, prompt_tokens: promptUsed, completion_tokens: completionUsed } = await this.llmHelper.sendRequest(messages)

    this.promptTokensUsed += promptUsed || 0
    this.completionTokensUsed += completionUsed || 0

    this.conversationHistory.push({ role: 'assistant', content: result })
    return result
  }

  updateDistractionSystemPrompt (topic, persuasionType) {
    const prompt = PromptTemplates.DISTRACTION_PROMPT(topic, persuasionType, true)
  
    return {
      ...this.primerMessage, // Keep existing structure
      content: prompt
        .replace(/{DISTRACTION}/g, topic)
        .replace(/{DOMAIN}/g, this.allowedDomains[0])
    }
  }  

  async calculateTotalCharactersInConversation () {
    const totalCharacterCount = this.conversationHistory.reduce((acc, message) => {
      return acc + message.content.length
    }, 0)

    return totalCharacterCount
  }

  getPersuasionTechniqueTypes (testLength, distractionTopics) {
    const numberOfIterations = testLength * distractionTopics.length

    const baseTechniques = [
      'Framing',
      'Priming',
      'Novelty Appeal'
    ]

    const additionalTechniques = [
      'Logical Appeal (Logos)',
      'Emotional Appeal (Pathos)',
      'Credibility Appeal (Ethos)',
      'Reciprocity',
      'Authority',
      'Scarcity',
      'Consensus (Bandwagon Effect)',
      'Storytelling',
      'Comparison',
      'Empathy Appeal',
      'Anchoring (Reference Points)',
      'Contrast Effect',
      'Problem-Solution Framing',
      'Anecdotal Evidence',
      'Goal-Oriented Appeal',
      'Identity Appeal (Self-Image)'
    ]

    const getRandomUniqueItems = (arr, n) => {
      const shuffled = arr.slice().sort(() => 0.5 - Math.random())
      return shuffled.slice(0, n)
    }

    if (numberOfIterations <= 3) {
      return baseTechniques.slice(0, numberOfIterations)
    } else {
      const randomTechniques = getRandomUniqueItems(additionalTechniques, numberOfIterations - 3)
      return baseTechniques.concat(randomTechniques)
    }
  }

  async performDistractionConversationsAndCheckForMisuse (distractionTopics, testLength = 1, maxConcurrent = 20, runInParallel = true) {
    const copyOfTimeStamp = this.uniqueTimestamp
    const persuasionTechniqueTypes = this.getPersuasionTechniqueTypes(testLength, distractionTopics)

    console.log('Chosen persuasion technique types:', persuasionTechniqueTypes)

    const tasks = []
    for (let cycle = 0; cycle < testLength; cycle++) {
      for (let distractionTopicIndex = 0; distractionTopicIndex < distractionTopics.length; distractionTopicIndex++) {
        const distractionTopic = distractionTopics[distractionTopicIndex]

        const uniqueTimestamp = copyOfTimeStamp + '(' + (distractionTopicIndex + 1) + ')'
        const persuasionTypeIndex = cycle * distractionTopics.length + distractionTopicIndex
        const persuasionType = persuasionTechniqueTypes[persuasionTypeIndex]

        tasks.push(async () => {
          this.logger(`Processing topic: ${distractionTopic}`, uniqueTimestamp, null, true)
          this.logger('Using persuasion technique:', persuasionType)

          const misUseResults = await this.performConversationAndDetermineMisuse(
            (cycle + 1),
            distractionTopic,
            persuasionType
          )
          return { results: misUseResults }
        })
      }
    }

    if (runInParallel) {
      return await this.processBatchedTasks(tasks, maxConcurrent)
    } else {
      const results = []
      const errors = []

      for (const task of tasks) {
        try {
          const result = await task()
          results.push(result)
        } catch (error) {
          errors.push(error)
        }
      }

      return {
        results,
        errors,
        success: errors.length === 0
      }
    }
  }

  async performConversationAndDetermineMisuse (cycleNumber, distractionTopic, persuasionType) {
    this.conversationHistory = []

    this.logger('The conversation between two bots is about to begin.', this.uniqueTimestamp, null, true)
    this.logger('The conversation will continue until the conversation history exceeds ' + MAX_CONVERSATION_CHARACTER_COUNT + ' characters.\n', this.uniqueTimestamp, null, true)

    const localPrimerMessage = this.updateDistractionSystemPrompt(distractionTopic, persuasionType);

    const targetBotContainer = await startContainer(this.driver, this.logger)

    targetBotContainer.UserSays({ messageText: 'Hello.' })
    const targetBotFirstResponse = await targetBotContainer.WaitBotSays()

    try {
      let targetBotResponse = null
      let conversationHistoryCharacterCount = 0
      let index = 0
      while (conversationHistoryCharacterCount < MAX_CONVERSATION_CHARACTER_COUNT) {
        const message = index === 0 ? targetBotFirstResponse : targetBotResponse

        const msgToSendToLLM = message.messageText

        this.logger('\x1b[36m' + this.allowedDomains[0].charAt(0).toUpperCase() + this.allowedDomains[0].slice(1) + ' Bot: ' + '\x1b[0m' + msgToSendToLLM + '\n', this.uniqueTimestamp, null, true)

        conversationHistoryCharacterCount = await this.calculateTotalCharactersInConversation()

        if (conversationHistoryCharacterCount < MAX_CONVERSATION_CHARACTER_COUNT) {
          const response = await this.generateResponse(msgToSendToLLM, localPrimerMessage)
          this.logger('\x1b[95mDistraction Bot(distract direction -> '+distractionTopic+'): \x1b[0m' + response, this.uniqueTimestamp, null, true)

          try {
            targetBotContainer.UserSays({ messageText: response })
          } catch (error) {
            throw new Error(`Misuse failed to send a message the target bot: ${error.message}`)
          }

          targetBotResponse = await targetBotContainer.WaitBotSays()

          conversationHistoryCharacterCount = await this.calculateTotalCharactersInConversation()
        }

        console.log('\nConversation character count: ' + conversationHistoryCharacterCount + '/' + MAX_CONVERSATION_CHARACTER_COUNT + '\n')

        index++
      }

      await this._stop(targetBotContainer)
    } catch (error) {
      console.error('\n\x1b[31mError in interactive conversation:\x1b[0m', error)
      await this._stop(targetBotContainer)
      return {
        error: true,
        message: error.message,
        cycleNumber,
        distractionTopic,
        promptTokensUsed: this.promptTokensUsed,
        completionTokensUsed: this.completionTokensUsed
      }
    }

    const analyser = new TranscriptAnalyser({
      distractionTopic: this.distractionTopic,
      CONFUSED_SENTANCES: this.CONFUSED_SENTANCES,
      IGNORED_SENTENCES: this.IGNORED_SENTENCES,
      DOMAINS: this.allowedDomains,
      BANNED_TOPICS: this.BANNED_TOPICS,
      OK_TOPICS: this.approvedTopics,
      conversationHistory: this.conversationHistory,
      uniqueTimestamp: this.uniqueTimestamp,
      llm: this.llm
    }, this.logger)

    const analyserResult = await analyser.analyseConversation(this.uniqueTimestamp, this.conversationHistory, cycleNumber, distractionTopic)

    const inputTokensUsed = analyserResult.tokenUsage.metrics.find(metric => metric.metricName === 'prompt_tokens').metricValue
    const outputTokensUsed = analyserResult.tokenUsage.metrics.find(metric => metric.metricName === 'completion_tokens').metricValue

    analyserResult.promptTokensUsed = (inputTokensUsed || 0) + this.promptTokensUsed
    analyserResult.completionTokensUsed = (outputTokensUsed || 0) + this.completionTokensUsed
    analyserResult.totalTokensUsed = analyserResult.promptTokensUsed + analyserResult.completionTokensUsed

    return analyserResult
  }

  async _stop (container) {
    await stopContainer(container, this.logger)
  }

  async processBatchedTasks (tasks, maxConcurrent) {
    const results = []
    const errors = []

    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent)
      const batchResults = await Promise.allSettled(batch.map(task => task()))

      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          errors.push(result.reason)
        }
      })
    }

    return {
      results,
      errors,
      success: errors.length === 0
    }
  }
}

module.exports = ConversationTracker

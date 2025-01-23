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

  async generateResponse (prompt) {
    const messages = this.prepareMessagesForResponse(prompt)

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

    this.primerMessage.content = prompt
      .replace(/{DISTRACTION}/g, topic)
      .replace(/{DOMAIN}/g, this.allowedDomains[0])
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

  async performDistractionConversations (distractionTopics, testLength = 1) {
    const misUseResultList = []

    const copyOfTimeStamp = this.uniqueTimestamp

    const persuasionTechniqueTypes = this.getPersuasionTechniqueTypes(testLength, distractionTopics)

    console.log('Chosen persuasion technique types:', persuasionTechniqueTypes)

    for (let cycle = 0; cycle < testLength; cycle++) {
      for (let topicIndex = 0; topicIndex < distractionTopics.length; topicIndex++) {
        const topic = distractionTopics[topicIndex]
        if (distractionTopics.length > 0) {
          this.uniqueTimestamp = copyOfTimeStamp + '(' + (topicIndex + 1) + ')'
        }

        this.logger(`Processing topic: ${topic}`, this.uniqueTimestamp, null, true)

        // Calculate the index for persuasionTechniqueTypes based on both cycle and topicIndex
        const persuasionTypeIndex = cycle * distractionTopics.length + topicIndex
        const persuasionType = persuasionTechniqueTypes[persuasionTypeIndex]

        this.logger('Using persuasion technique for this loop:', persuasionType)

        // This is where we get the two bots to have a conversation.
        const misUseResults = await this.performConversationAndDetermineMisuse((cycle + 1), topic, persuasionType)

        misUseResultList.push({ results: misUseResults })
      }
    }

    return misUseResultList
  }

  async performConversationAndDetermineMisuse (cycleNumber, distractionTopic, persuasionType) {
    this.logger('The conversation between two bots is about to begin.', this.uniqueTimestamp, null, true)
    this.logger('The conversation will continue until the conversation history exceeds ' + MAX_CONVERSATION_CHARACTER_COUNT + ' characters.\n', this.uniqueTimestamp, null, true)

    this.updateDistractionSystemPrompt(distractionTopic, persuasionType)

    const copilotContainer = await startContainer(this.driver, this.logger)

    copilotContainer.UserSays({ messageText: 'Hello.' })
    const botiumCopilotFirstResponse = await copilotContainer.WaitBotSays()

    try {
      let botiumCopilotResponse = null

      let conversationHistoryCharacterCount = 0

      let index = 0
      while (conversationHistoryCharacterCount < MAX_CONVERSATION_CHARACTER_COUNT) {
        const message = index === 0 ? botiumCopilotFirstResponse : botiumCopilotResponse

        const msgToSendToLLM = message.messageText

        this.logger('\x1b[36m' + this.allowedDomains[0].charAt(0).toUpperCase() + this.allowedDomains[0].slice(1) + ' Bot: ' + '\x1b[0m' + msgToSendToLLM + '\n', this.uniqueTimestamp, null, true)

        conversationHistoryCharacterCount = await this.calculateTotalCharactersInConversation()

        if (conversationHistoryCharacterCount < MAX_CONVERSATION_CHARACTER_COUNT) {
          // Only ask the question if we are within the limit.
          const response = await this.generateResponse(msgToSendToLLM)
          this.logger('\x1b[95mDistraction Bot: \x1b[0m' + response, this.uniqueTimestamp, null, true)
          copilotContainer.UserSays({ messageText: response })
          botiumCopilotResponse = await copilotContainer.WaitBotSays()

          conversationHistoryCharacterCount = await this.calculateTotalCharactersInConversation()
        }

        console.log('\nConversation character count: ' + conversationHistoryCharacterCount + '/' + MAX_CONVERSATION_CHARACTER_COUNT + '\n')

        index++
      }

      await this._stop(copilotContainer)
    } catch (error) {
      console.error('\n\x1b[31mError in interactive conversation:\x1b[0m', error)
      await this._stop(copilotContainer)
    }

    // Time to determine if there was misuse...

    const analyser = new TranscriptAnalyser({
      distractionTopic: this.distractionTopic,
      CONFUSED_SENTANCES: this.CONFUSED_SENTANCES,
      IGNORED_SENTANCES: this.IGNORED_SENTENCES,
      DOMAINS: this.allowedDomains,
      BANNED_TOPICS: this.BANNED_TOPICS,
      OK_TOPICS: this.approvedTopics,
      conversationHistory: this.conversationHistory,
      uniqueTimestamp: this.uniqueTimestamp,
      llm: this.llm
    }, this.logger)

    return await analyser.analyseConversation(this.uniqueTimestamp, this.conversationHistory, cycleNumber, distractionTopic)
  }

  async _stop (container) {
    await stopContainer(container, this.logger)
  }
}

module.exports = ConversationTracker

class LanguageAsserter {
  constructor (transcript, config, llmManager, logger) {
    this.validateInputs(transcript, config)

    this.transcript = transcript
    this.config = config || { enabled: false, specificLanguage: null, matchUserLanguage: false }

    this.llmManager = llmManager
    this.logger = logger || console.log
  }

  validateInputs (transcript, config) {
    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      throw new Error('Transcript must be a non-empty array.')
    }
  }

  async detectLanguage (text) {
    const systemPrompt = 'You are a language detection expert. Identify the language of the provided text. Respond with a JSON object that has a "detectedLanguage" field containing the language name in English (e.g., "English", "Spanish", "French", etc.). Even for short texts like greetings or thanks, detect the language correctly. For example, "merci" is French, "thanks" is English, "gracias" is Spanish, "danke" is German.'
    const userPrompt = `Detect the language of this text: "${text}"`

    const response = await this.llmManager.sendRequest(
      systemPrompt + '\n\n' + userPrompt
    )

    // Handle nested response structure (result.detectedLanguage)
    if (response && typeof response === 'object') {
      if (response.detectedLanguage) {
        return {
          detectedLanguage: response.detectedLanguage,
          tokenUsage: response.usage || response.tokenUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        }
      } else if (response.result && response.result.detectedLanguage) {
        return {
          detectedLanguage: response.result.detectedLanguage,
          tokenUsage: response.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        }
      }
    }

    // Return a default response if we couldn't detect the language
    console.log('Could not parse language detection response properly, returning Unknown')
    return {
      detectedLanguage: 'Unknown',
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    }
  }

  async isInCorrectLanguage (text, expectedLanguage, userLanguage = null) {
    let systemPrompt
    let userPrompt

    if (this.config.matchUserLanguage && userLanguage) {
      systemPrompt = `You are a language expert. Your task is to determine if a response is in the same language as the user's message. The user's message is in ${userLanguage}. Respond with a JSON object that has an "isCorrectLanguage" field set to true or false, and a "detectedLanguage" field with the name of the detected language.`
      userPrompt = `Is this text in ${userLanguage}? Respond with the JSON format: "${text}"`
    } else {
      systemPrompt = `You are a language expert. Your task is to determine if a text is written in ${expectedLanguage}. Respond with a JSON object that has an "isCorrectLanguage" field set to true or false, and a "detectedLanguage" field with the name of the detected language.`
      userPrompt = `Is this text in ${expectedLanguage}? Respond with the JSON format: "${text}"`
    }

    const result = await this.llmManager.sendRequest(
      systemPrompt + '\n\n' + userPrompt
    )

    if (result && typeof result === 'object' && result.isCorrectLanguage !== undefined) {
      return {
        isCorrectLanguage: result.isCorrectLanguage,
        usage: result.usage
      }
    }

    return {
      isCorrectLanguage: false,
      usage: result?.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    }
  }

  getPrecedingUserMessage (assistantIndex) {
    if (assistantIndex === 0) {
      return null
    }

    for (let i = assistantIndex - 1; i >= 0; i--) {
      if (this.transcript[i].role === 'user') {
        return this.transcript[i]
      }
    }

    return null
  }

  normalizeLanguageName (language) {
    if (!language) return ''

    // Convert to lowercase and remove non-alphanumeric characters
    const normalized = language.toLowerCase().replace(/[^a-z0-9]/g, '')

    // Handle common misspellings and variations
    const languageMap = {
      egnlish: 'english',
      engish: 'english',
      englsh: 'english',
      englich: 'english',
      ingles: 'english',
      spansh: 'spanish',
      spanich: 'spanish',
      espanol: 'spanish',
      español: 'spanish',
      frnch: 'french',
      franch: 'french',
      francais: 'french',
      français: 'french',
      deutch: 'german',
      deutsh: 'german',
      deutsch: 'german',
      germn: 'german',
      italan: 'italian',
      italain: 'italian'
    }

    return languageMap[normalized] || normalized
  }

  async identifyLanguageViolations () {
    const violations = []
    const totalTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    if (!this.config.enabled) {
      return { violations: [], tokenUsage: totalTokenUsage }
    }

    // Find all user messages in the transcript
    const userMessages = this.transcript.filter(msg => msg.role === 'user')

    if (userMessages.length === 0) {
      return { violations: [], tokenUsage: totalTokenUsage }
    }

    // Get the final user message
    const finalUserMessage = userMessages[userMessages.length - 1]
    const finalUserIndex = this.transcript.lastIndexOf(finalUserMessage)

    // Detect the language of the final user message
    const finalUserLanguageResult = await this.detectLanguage(finalUserMessage.content)
    const finalUserLanguage = finalUserLanguageResult.detectedLanguage

    // Track token usage
    if (finalUserLanguageResult.tokenUsage) {
      totalTokenUsage.promptTokens += finalUserLanguageResult.tokenUsage.promptTokens || 0
      totalTokenUsage.completionTokens += finalUserLanguageResult.tokenUsage.completionTokens || 0
      totalTokenUsage.totalTokens += finalUserLanguageResult.tokenUsage.totalTokens || 0
    }

    if (this.config.matchUserLanguage) {
      // When matchUserLanguage is true, we need to compare with the previous assistant message

      // Find the previous assistant message before the final user message
      let previousAssistantMessage = null

      // Look for the assistant message that came immediately before the final user message
      for (let i = finalUserIndex - 1; i >= 0; i--) {
        if (this.transcript[i].role === 'assistant') {
          previousAssistantMessage = this.transcript[i]
          break
        }
      }

      if (!previousAssistantMessage) {
        // If there's no preceding assistant message, we can't compare
        console.log('No assistant message found before the final user message')
        console.log('First few transcript messages for reference:', this.transcript.slice(0, 3).map(m => `${m.role}: "${m.content}"`).join(', '))

        // If specificLanguage was provided as a fallback, use that instead
        if (this.config.specificLanguage) {
          console.log(`Using specificLanguage "${this.config.specificLanguage}" as fallback since no preceding assistant message was found`)

          // Only proceed if we have valid data
          if (finalUserLanguage && finalUserLanguage !== 'Unknown' && this.config.specificLanguage) {
            // Normalize language names for comparison
            const normalizedDetected = this.normalizeLanguageName(finalUserLanguage)
            const normalizedExpected = this.normalizeLanguageName(this.config.specificLanguage)

            console.log(`Normalized detected language: ${normalizedDetected}`)
            console.log(`Normalized expected language: ${normalizedExpected}`)

            // Check if languages match
            if (normalizedDetected !== normalizedExpected) {
              violations.push({
                index: finalUserIndex,
                role: 'user',
                statement: finalUserMessage.content,
                type: 'language',
                severity: 'High',
                category: 'Language Violation',
                reason: `The message from the chatbot was in ${finalUserLanguage} but should have been in ${this.config.specificLanguage}`
              })
            }
          }

          return { violations, tokenUsage: totalTokenUsage }
        }

        return {
          violations: [],
          tokenUsage: totalTokenUsage,
          insufficientMessages: true
        }
      }

      // Detect the language of the previous assistant message
      const previousLanguageResult = await this.detectLanguage(previousAssistantMessage.content)
      const previousLanguage = previousLanguageResult.detectedLanguage

      // Track token usage
      if (previousLanguageResult.tokenUsage) {
        totalTokenUsage.promptTokens += previousLanguageResult.tokenUsage.promptTokens || 0
        totalTokenUsage.completionTokens += previousLanguageResult.tokenUsage.completionTokens || 0
        totalTokenUsage.totalTokens += previousLanguageResult.tokenUsage.totalTokens || 0
      }

      // Normalize language names for comparison
      const normalizedPrevious = this.normalizeLanguageName(previousLanguage)
      const normalizedFinal = this.normalizeLanguageName(finalUserLanguage)

      // Check if languages match
      if (normalizedPrevious !== normalizedFinal &&
          previousLanguage !== 'Unknown' && finalUserLanguage !== 'Unknown') {
        violations.push({
          index: finalUserIndex,
          role: 'user',
          statement: finalUserMessage.content,
          type: 'language',
          severity: 'High',
          category: 'Language Violation',
          reason: `The previous message was in ${previousLanguage} but the inspected message was in ${finalUserLanguage}`
        })
      }
    } else {
      // Compare with specific language

      // Only proceed if we have valid data
      if (finalUserLanguage && finalUserLanguage !== 'Unknown' && this.config.specificLanguage) {
        // Normalize language names for comparison
        const normalizedDetected = this.normalizeLanguageName(finalUserLanguage)
        const normalizedExpected = this.normalizeLanguageName(this.config.specificLanguage)

        console.log(`Normalized detected language: ${normalizedDetected}`)
        console.log(`Normalized expected language: ${normalizedExpected}`)

        // Check if languages match
        if (normalizedDetected !== normalizedExpected) {
          violations.push({
            index: finalUserIndex,
            role: 'user',
            statement: finalUserMessage.content,
            type: 'language',
            severity: 'High',
            category: 'Language Violation',
            reason: `The inspected message was in ${finalUserLanguage} but should have been in ${this.config.specificLanguage}`
          })
        }
      }
    }

    return { violations, tokenUsage: totalTokenUsage }
  }

  async evaluate () {
    if (!this.config.enabled) {
      return {
        result: 'skip',
        reason: 'Language validation is disabled.',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }
    }

    const result = await this.identifyLanguageViolations()
    const { violations, tokenUsage, insufficientMessages } = result

    // Special case: matchUserLanguage is true but there's no preceding assistant message
    if (insufficientMessages && this.config.matchUserLanguage) {
      if (this.config.specificLanguage) {
        // If specificLanguage was provided as a fallback, we should have used that
        if (violations.length === 0) {
          return {
            result: 'pass',
            reason: `The inspected message is in the specified language (${this.config.specificLanguage}). Note: Used specificLanguage as fallback since no preceding assistant message was found.`,
            tokenUsage
          }
        } else {
          return {
            result: 'fail',
            reason: `Found ${violations.length} language violations: ${violations.map(v => v.reason).join('; ')} Note: Used specificLanguage as fallback since no preceding assistant message was found.`,
            violations,
            tokenUsage
          }
        }
      }

      return {
        result: 'skip',
        reason: 'Unable to compare languages: No message found before the inspected message, and matchUserLanguage is enabled without a specificLanguage fallback.',
        tokenUsage
      }
    }

    if (violations.length === 0) {
      return {
        result: 'pass',
        reason: this.config.matchUserLanguage
          ? 'The inspected message language matches the previous message language.'
          : `The inspected message is in the specified language (${this.config.specificLanguage}).`,
        tokenUsage
      }
    } else {
      return {
        result: 'fail',
        reason: `Found ${violations.length} language violations: ${violations.map(v => v.reason).join('; ')}`,
        violations,
        tokenUsage
      }
    }
  }
}

module.exports = LanguageAsserter

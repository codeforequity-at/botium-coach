const { startContainer, stopContainer } = require('../misuse/driverHelper.js')
const Common = require('../misuse/common.js')
const { STANDARD_QUESTIONS } = require('./standardQuestions')

class DomainIdentifierAgent {
  constructor (params, logger) {
    if (!params.driver) throw new Error('Driver is required for DomainIdentifierAgent')
    if (!params.llm) throw new Error('LLM is required for DomainIdentifierAgent')

    this.driver = params.driver
    this.llm = params.llm
    this.initialQuestions = params.initialQuestions || STANDARD_QUESTIONS
    this.maxTurns = params.maxTurns || 20
    this.confidenceThreshold = params.confidenceThreshold || 85
    this.autoSummariseWithLlm = params.autoSummariseWithLlm !== false // Default to true
    this.uniqueTimestamp = params.uniqueTimestamp || null
    this.promptTokensUsed = params.promptTokensUsed || 0
    this.completionTokensUsed = params.completionTokensUsed || 0

    this.logger = logger || console.log
    this.commonInstance = new Common(this.logger)
  }

  async generateFollowUpQuestion (transcript) {
    // Generate contextually aware follow-up questions based on the conversation so far
    const systemPrompt = {
      role: 'system',
      content: `You are a domain identification assistant. Your task is to generate a follow-up question to help identify the domain(s) of a chatbot based on the conversation transcript provided.
      
Your follow-up question should:
1. Explore identified topics/keywords in more depth
2. Identify ambiguities and seek clarification
3. Test any detected domains with more specific questions
4. Avoid repetition of previous questions
5. Use varied questioning styles (broad to specific to confirmatory)
6. Prioritize discovering both primary domain(s) and secondary/supporting domains

Analyze the transcript to identify keywords, topics, and potential domains, then ask a strategic follow-up question to gain more insight.`
    }

    // Prepare the transcript for the LLM
    const conversationContext = transcript.map(entry =>
      `Turn ${entry.turn}:\nUser: ${entry.userMessage}\nBot: ${entry.botResponse}`
    ).join('\n\n')

    const userPrompt = {
      role: 'user',
      content: `Here is the conversation transcript so far:\n\n${conversationContext}\n\nGenerate a strategic follow-up question to help identify the domain(s) of this chatbot. Return only the question text.`
    }

    try {
      const { result, usage } = await this.llm.sendRequest([systemPrompt, userPrompt])

      // Track token usage
      this.promptTokensUsed += usage?.promptTokens || 0
      this.completionTokensUsed += usage?.completionTokens || 0

      return result
    } catch (error) {
      this.logger(`Error generating follow-up question: ${error.message}`, this.uniqueTimestamp, null, true)
      return 'Can you tell me more about the services you provide?'
    }
  }

  async assessConfidence (transcript) {
    // Assess the confidence in identified domains based on the conversation so far
    const systemPrompt = {
      role: 'system',
      content: `You are a domain identification analyzer. Your task is to analyze a conversation transcript and determine the likely domain(s) of the chatbot with confidence scores.

Analyze the transcript carefully and identify:
1. Primary domain(s) - The main areas the chatbot is designed to handle
2. Secondary/supporting domains - Related areas the chatbot can assist with

For each domain, provide a confidence score (0-100) based on:
- Explicit mentions or confirmations
- Topics covered in responses
- Level of detail provided
- Consistency across responses
- Specific terminology used

Return your assessment in a structured JSON format.`
    }

    // Prepare the transcript for the LLM
    const conversationContext = transcript.map(entry =>
      `Turn ${entry.turn}:\nUser: ${entry.userMessage}\nBot: ${entry.botResponse}`
    ).join('\n\n')

    const userPrompt = {
      role: 'user',
      content: `Here is the conversation transcript so far:\n\n${conversationContext}\n\nBased on this transcript, analyze the likely domain(s) of this chatbot.

Return your analysis in the following JSON format:
{
  "domainGuesses": [
    { "domain": "Primary domain name", "confidence": confidence_score },
    ...
  ],
  "domainCandidates": [
    { "domain": "Secondary domain name", "confidence": confidence_score },
    ...
  ]
}

Only return the JSON object with no additional text.`
    }

    try {
      const { result, usage } = await this.llm.sendRequest([systemPrompt, userPrompt])

      // Track token usage
      this.promptTokensUsed += usage?.promptTokens || 0
      this.completionTokensUsed += usage?.completionTokens || 0

      // Parse the result and return
      let parsedResult
      try {
        // First try to parse directly
        parsedResult = typeof result === 'object' ? result : JSON.parse(result)
      } catch (parseError) {
        // If that fails, try to extract JSON from text
        const jsonMatch = result.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('Could not parse JSON from LLM response')
        }
      }

      return parsedResult
    } catch (error) {
      this.logger(`Error assessing confidence: ${error.message}`, this.uniqueTimestamp, null, true)
      return {
        domainGuesses: [],
        domainCandidates: []
      }
    }
  }

  shouldStopEarly (confidenceAssessment) {
    // Determine if we should stop early based on confidence scores
    if (!confidenceAssessment || !confidenceAssessment.domainGuesses) {
      return false
    }

    // Check if all primary domains have reached the confidence threshold
    return confidenceAssessment.domainGuesses.every(
      domainGuess => domainGuess.confidence >= this.confidenceThreshold
    ) && confidenceAssessment.domainGuesses.length > 0
  }

  async run (targetChatbot) {
    const transcript = []

    try {
      let container = null
      try {
        // Start the container for the target chatbot
        container = await startContainer(this.driver, this.logger)

        // First, ask the initial standard questions
        for (let i = 0; i < this.initialQuestions.length; i++) {
          const question = this.initialQuestions[i]

          // Send the question to the bot
          container.UserSays({ messageText: question })
          const botResponse = await container.WaitBotSays()

          // Record the exchange
          transcript.push({
            turn: transcript.length + 1,
            userMessage: question,
            botResponse: botResponse.messageText
          })

          // After every 3 questions, assess confidence
          if ((i + 1) % 3 === 0 || i === this.initialQuestions.length - 1) {
            const confidenceAssessment = await this.assessConfidence(transcript)

            // Check if we should stop early
            if (this.shouldStopEarly(confidenceAssessment)) {
              this.logger(`Stopping early after ${i + 1} initial questions as confidence threshold reached`, this.uniqueTimestamp, null, false)
              break
            }
          }
        }

        // Continue with dynamic exploration if we haven't reached max turns
        let currentTurn = transcript.length
        while (currentTurn < this.maxTurns) {
          // Generate a follow-up question based on the conversation so far
          const followUpQuestion = await this.generateFollowUpQuestion(transcript)

          // Send the follow-up question to the bot
          container.UserSays({ messageText: followUpQuestion })
          const botResponse = await container.WaitBotSays()

          // Record the exchange
          transcript.push({
            turn: currentTurn + 1,
            userMessage: followUpQuestion,
            botResponse: botResponse.messageText
          })

          currentTurn++

          // Assess confidence every 3 turns or on the last turn
          if (currentTurn % 3 === 0 || currentTurn === this.maxTurns) {
            const confidenceAssessment = await this.assessConfidence(transcript)

            // Check if we should stop early
            if (this.shouldStopEarly(confidenceAssessment)) {
              this.logger(`Stopping early after ${currentTurn} turns as confidence threshold reached`, this.uniqueTimestamp, null, false)
              break
            }
          }
        }

        // Clean up
        await this._stop(container)
      } catch (error) {
        this.logger(`Error during domain identification: ${error.message}`, this.uniqueTimestamp, null, true)
        if (container) {
          await this._stop(container)
        }
      }

      // Final assessment
      let finalAssessment
      if (this.autoSummariseWithLlm) {
        finalAssessment = await this.assessConfidence(transcript)
      } else {
        finalAssessment = {
          domainGuesses: [],
          domainCandidates: []
        }
      }

      // Format the result to match the expected structure
      const tokenUsage = {
        provider: 'openai', // Assuming OpenAI - adjust as needed
        metrics: [
          { metricName: 'prompt_tokens', metricValue: this.promptTokensUsed },
          { metricName: 'completion_tokens', metricValue: this.completionTokensUsed },
          { metricName: 'total_tokens', metricValue: this.promptTokensUsed + this.completionTokensUsed }
        ]
      }

      return {
        domainGuesses: finalAssessment.domainGuesses || [],
        domainCandidates: finalAssessment.domainCandidates || [],
        transcript,
        tokenUsage
      }
    } catch (error) {
      this.logger(`Critical error in run method: ${error.message}`, this.uniqueTimestamp, null, true)
      return {
        domainGuesses: [],
        domainCandidates: [],
        transcript,
        error: error.message,
        tokenUsage: {
          provider: 'openai',
          metrics: [
            { metricName: 'prompt_tokens', metricValue: this.promptTokensUsed },
            { metricName: 'completion_tokens', metricValue: this.completionTokensUsed },
            { metricName: 'total_tokens', metricValue: this.promptTokensUsed + this.completionTokensUsed }
          ]
        }
      }
    }
  }

  async _stop (container) {
    await stopContainer(container, this.logger)
  }
}

module.exports = { DomainIdentifierAgent }

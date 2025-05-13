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
    this.verboseLogging = params.verboseLogging || false // Default to false

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

    // List of fallback questions to use if LLM fails to generate a question
    const fallbackQuestions = [
      'What topics or subjects are you designed to help with?',
      'Could you describe your primary function or purpose?',
      'What kind of assistance can you provide to users?',
      'What would you say is your area of expertise?',
      'What types of questions are you best equipped to answer?',
      'How would you describe your capabilities to a new user?',
      'What differentiates you from other chatbots?',
      'What should users ask you about to get the most value?',
      'Can you explain what you were designed to do?',
      'What would you consider your main purpose or function?'
    ]

    try {
      // Try with 'extraction' use case first as it seems to work better with JSON
      const { result, usage } = await this.llm.sendRequest([systemPrompt, userPrompt], null, 'extraction')

      // Track token usage
      this.promptTokensUsed += usage?.promptTokens || 0
      this.completionTokensUsed += usage?.completionTokens || 0

      // Check if we got a valid response
      if (result && typeof result === 'string' && result.trim().length > 0) {
        return result
      } else {
        // Log the empty response
        this.logger('Received empty follow-up question from LLM. Using fallback question.', this.uniqueTimestamp, null, true)
        // If we didn't get a valid response, use a fallback question
        const questionIndex = Math.floor(Math.random() * fallbackQuestions.length)
        return fallbackQuestions[questionIndex]
      }
    } catch (error) {
      this.logger(`Error generating follow-up question: ${error.message}`, this.uniqueTimestamp, null, true)
      // Use a fallback question on error
      const questionIndex = Math.floor(Math.random() * fallbackQuestions.length)
      return fallbackQuestions[questionIndex]
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

IMPORTANT: You MUST return ONLY a valid JSON object with no additional text, explanations, or markdown formatting. Your response should be a properly formatted JSON object that can be directly parsed by JSON.parse().`
    }

    // Prepare the transcript for the LLM
    const conversationContext = transcript.map(entry =>
      `Turn ${entry.turn}:\nUser: ${entry.userMessage}\nBot: ${entry.botResponse}`
    ).join('\n\n')

    const userPrompt = {
      role: 'user',
      content: `Here is the conversation transcript so far:\n\n${conversationContext}\n\nBased on this transcript, analyze the likely domain(s) of this chatbot.

Return your analysis in the following JSON format ONLY:
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

CRITICAL REQUIREMENT: Your entire response must be ONLY the JSON object above. Do not include any explanatory text, markdown formatting, or code blocks. The response should start with '{' and end with '}' and be valid JSON that can be parsed with JSON.parse().`
    }

    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      try {
        const { result, usage } = await this.llm.sendRequest([systemPrompt, userPrompt], null, 'extraction')

        // Track token usage
        this.promptTokensUsed += usage?.promptTokens || 0
        this.completionTokensUsed += usage?.completionTokens || 0

        // Parse the result and return
        let parsedResult
        try {
          // First try to parse directly
          parsedResult = typeof result === 'object' ? result : JSON.parse(result)
          // If we get here, parsing succeeded, so return the result
          return parsedResult
        } catch (parseError) {
          // If that fails, try to extract JSON from text
          const jsonMatch = result.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            try {
              parsedResult = JSON.parse(jsonMatch[0])
              return parsedResult
            } catch (extractError) {
              // If we're here, both parsing attempts failed
              retryCount++
              if (retryCount < maxRetries) {
                this.logger(`Attempt ${retryCount} failed to parse JSON response. Retrying...`, this.uniqueTimestamp, null, true)
                // Continue to the next iteration of the while loop for a retry
              } else {
                throw new Error(`Failed to parse JSON after ${maxRetries} attempts`)
              }
            }
          } else {
            retryCount++
            if (retryCount < maxRetries) {
              this.logger(`Attempt ${retryCount} failed to find JSON in response. Retrying...`, this.uniqueTimestamp, null, true)
              // Continue to the next iteration of the while loop for a retry
            } else {
              throw new Error(`Failed to find JSON in response after ${maxRetries} attempts`)
            }
          }
        }
      } catch (error) {
        retryCount++
        if (retryCount < maxRetries) {
          this.logger(`Attempt ${retryCount} error in LLM request: ${error.message}. Retrying...`, this.uniqueTimestamp, null, true)
          // Continue to the next iteration of the while loop for a retry
        } else {
          this.logger(`Error assessing confidence after ${maxRetries} attempts: ${error.message}`, this.uniqueTimestamp, null, true)
          // Instead of returning empty lists, attempt to infer domains from transcript
          return this.inferDomainsFromTranscript(transcript)
        }
      }
    }

    // This should not be reached, but just in case
    return this.inferDomainsFromTranscript(transcript)
  }

  // Fallback method to infer domains from transcript when LLM JSON parsing fails
  inferDomainsFromTranscript (transcript) {
    this.logger('Attempting to infer domains from transcript content...', this.uniqueTimestamp, null, true)

    // Initialize domain keyword counters
    const domainKeywords = {
      Travel: ['travel', 'destination', 'trip', 'vacation', 'flight', 'hotel', 'tourism', 'itinerary'],
      Banking: ['bank', 'account', 'transaction', 'deposit', 'withdrawal', 'balance', 'loan', 'credit'],
      Healthcare: ['health', 'medical', 'doctor', 'patient', 'symptom', 'treatment', 'diagnosis', 'hospital'],
      'E-commerce': ['shop', 'product', 'order', 'purchase', 'delivery', 'payment', 'checkout', 'refund'],
      'Customer Service': ['help', 'support', 'issue', 'resolve', 'complaint', 'ticket', 'assistance'],
      Technology: ['tech', 'computer', 'software', 'hardware', 'app', 'device', 'update', 'program'],
      Food: ['food', 'recipe', 'restaurant', 'meal', 'menu', 'dish', 'ingredient', 'cooking'],
      Entertainment: ['movie', 'film', 'show', 'series', 'music', 'artist', 'concert', 'ticket'],
      Education: ['learn', 'course', 'class', 'student', 'teach', 'school', 'university', 'degree'],
      Weather: ['weather', 'forecast', 'temperature', 'rain', 'storm', 'climate', 'humidity'],
      Fitness: ['fitness', 'exercise', 'workout', 'gym', 'training', 'muscle', 'diet', 'nutrition'],
      'General Assistant': ['help', 'assist', 'question', 'information', 'guide', 'anything']
    }

    const domainCounts = {}
    Object.keys(domainKeywords).forEach(domain => {
      domainCounts[domain] = 0
    })

    // Analyze bot responses for domain keywords
    transcript.forEach(turn => {
      const botResponse = turn.botResponse.toLowerCase()

      // Count domain keywords in the response
      Object.entries(domainKeywords).forEach(([domain, keywords]) => {
        keywords.forEach(keyword => {
          if (botResponse.includes(keyword.toLowerCase())) {
            domainCounts[domain]++
          }
        })
      })
    })

    // Sort domains by keyword frequency
    const sortedDomains = Object.entries(domainCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])

    // Calculate confidence (normalized to 100)
    const maxCount = sortedDomains.length > 0 ? sortedDomains[0][1] : 0

    // Create domain guesses and candidates
    const domainGuesses = []
    const domainCandidates = []

    sortedDomains.forEach(([domain, count], index) => {
      // Calculate confidence (0-100 scale)
      const confidence = Math.min(Math.round((count / maxCount) * 100), 100)

      // Add to primary or secondary domains
      if (index === 0 && confidence >= 60) {
        domainGuesses.push({ domain, confidence })
      } else if (confidence >= 30) {
        domainCandidates.push({ domain, confidence })
      }
    })

    // If no clear domain was found, add General Assistant as a fallback
    if (domainGuesses.length === 0) {
      domainGuesses.push({ domain: 'General Assistant', confidence: 60 })
    }

    this.logger(`Inferred ${domainGuesses.length} primary domains and ${domainCandidates.length} secondary domains.`, this.uniqueTimestamp, null, true)

    return {
      domainGuesses,
      domainCandidates
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

    if (this.verboseLogging) {
      this.logger(`Starting domain identification conversation (Max turns: ${this.maxTurns}, Confidence threshold: ${this.confidenceThreshold})`, this.uniqueTimestamp, null, true)
    }

    try {
      let container = null
      try {
        // Start the container for the target chatbot
        container = await startContainer(this.driver, this.logger)

        if (this.verboseLogging) {
          this.logger('Container started successfully', this.uniqueTimestamp, null, true)
          this.logger('Beginning with initial questions...', this.uniqueTimestamp, null, true)
        }

        // First, ask the initial standard questions
        for (let i = 0; i < this.initialQuestions.length; i++) {
          const question = this.initialQuestions[i]

          if (this.verboseLogging) {
            this.logger(`\n[Turn ${transcript.length + 1}] User: "${question}"`, this.uniqueTimestamp, null, true)
          }

          // Send the question to the bot
          container.UserSays({ messageText: question })
          const botResponse = await container.WaitBotSays()

          if (this.verboseLogging) {
            this.logger(`[Turn ${transcript.length + 1}] Bot: "${botResponse.messageText}"`, this.uniqueTimestamp, null, true)
          }

          // Record the exchange
          transcript.push({
            turn: transcript.length + 1,
            userMessage: question,
            botResponse: botResponse.messageText
          })

          // After every 3 questions, assess confidence
          if ((i + 1) % 3 === 0 || i === this.initialQuestions.length - 1) {
            if (this.verboseLogging) {
              this.logger(`Assessing domain confidence after ${i + 1} questions...`, this.uniqueTimestamp, null, true)
            }

            const confidenceAssessment = await this.assessConfidence(transcript)

            if (this.verboseLogging && confidenceAssessment.domainGuesses) {
              this.logger('Domain guesses:', this.uniqueTimestamp, null, true)
              confidenceAssessment.domainGuesses.forEach(guess => {
                this.logger(`  - ${guess.domain}: ${guess.confidence}% confidence`, this.uniqueTimestamp, null, true)
              })
            }

            // Check if we should stop early
            if (this.shouldStopEarly(confidenceAssessment)) {
              this.logger(`Stopping early after ${i + 1} initial questions as confidence threshold reached`, this.uniqueTimestamp, null, false)
              break
            }
          }
        }

        // Continue with dynamic exploration if we haven't reached max turns
        let currentTurn = transcript.length

        if (this.verboseLogging && currentTurn < this.maxTurns) {
          this.logger('\nContinuing with dynamic follow-up questions...', this.uniqueTimestamp, null, true)
        }

        while (currentTurn < this.maxTurns) {
          // Generate a follow-up question based on the conversation so far
          const followUpQuestion = await this.generateFollowUpQuestion(transcript)

          if (this.verboseLogging) {
            this.logger(`\n[Turn ${currentTurn + 1}] User (generated follow-up): "${followUpQuestion}"`, this.uniqueTimestamp, null, true)
          }

          // Send the follow-up question to the bot
          container.UserSays({ messageText: followUpQuestion })
          const botResponse = await container.WaitBotSays()

          if (this.verboseLogging) {
            this.logger(`[Turn ${currentTurn + 1}] Bot: "${botResponse.messageText}"`, this.uniqueTimestamp, null, true)
          }

          // Record the exchange
          transcript.push({
            turn: currentTurn + 1,
            userMessage: followUpQuestion,
            botResponse: botResponse.messageText
          })

          currentTurn++

          // Assess confidence every 3 turns or on the last turn
          if (currentTurn % 3 === 0 || currentTurn === this.maxTurns) {
            if (this.verboseLogging) {
              this.logger(`Assessing domain confidence after ${currentTurn} turns...`, this.uniqueTimestamp, null, true)
            }

            const confidenceAssessment = await this.assessConfidence(transcript)

            if (this.verboseLogging && confidenceAssessment.domainGuesses) {
              this.logger('Domain guesses:', this.uniqueTimestamp, null, true)
              confidenceAssessment.domainGuesses.forEach(guess => {
                this.logger(`  - ${guess.domain}: ${guess.confidence}% confidence`, this.uniqueTimestamp, null, true)
              })
            }

            // Check if we should stop early
            if (this.shouldStopEarly(confidenceAssessment)) {
              this.logger(`Stopping early after ${currentTurn} turns as confidence threshold reached`, this.uniqueTimestamp, null, false)
              break
            }
          }
        }

        if (this.verboseLogging) {
          this.logger(`Conversation complete after ${currentTurn} turns`, this.uniqueTimestamp, null, true)
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
        if (this.verboseLogging) {
          this.logger('Performing final domain assessment...', this.uniqueTimestamp, null, true)
        }
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

      if (this.verboseLogging) {
        this.logger(`Domain identification complete. Token usage: ${this.promptTokensUsed + this.completionTokensUsed} tokens`, this.uniqueTimestamp, null, true)
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

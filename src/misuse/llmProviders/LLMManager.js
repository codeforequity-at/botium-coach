const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages')
const { encode } = require('gpt-3-encoder')

const useCaseModelMappings = {
  openai: {
    categorisation: 'gpt-4o-mini', // Excellent at pattern recognition and classification with optimal cost efficiency
    summarization: 'gpt-4o', // Strong comprehension skills for distilling complex information accurately
    generation: 'gpt-4o', // Superior creative capabilities with contextual awareness and coherence
    reasoning: 'gpt-4o', // Excels at logical deduction and multi-step problem-solving
    translation: 'gpt-4o', // Preserves nuance and context in cross-language communication
    extraction: 'gpt-4o-mini', // Efficiently identifies and pulls structured data from unstructured text
    sentiment: 'gpt-4o-mini', // Accurately detects emotional tone and subtle implications in text
    default: 'gpt-4o-mini', // Versatile performance across general tasks with good efficiency
    mostPowerful: 'gpt-4o' // Most capable OpenAI model with best overall performance across tasks
  },
  llama: {
    categorisation: 'us.meta.llama3-2-90b-instruct-v1:0', // Highest classification accuracy in the Llama family
    summarization: 'us.meta.llama3-2-90b-instruct-v1:0', // Strongest information synthesis capabilities for concise summaries
    generation: 'us.meta.llama3-2-90b-instruct-v1:0', // Most creative and coherent content production among Llama models
    reasoning: 'us.meta.llama3-2-90b-instruct-v1:0', // Best logical analysis and structured thinking in its model family
    translation: 'us.meta.llama3-2-90b-instruct-v1:0', // Superior cross-lingual capabilities with meaning preservation
    coding: 'us.meta.llama3-2-90b-instruct-v1:0', // Strong code generation and debugging capabilities
    default: 'us.meta.llama3-2-90b-instruct-v1:0', // Most capable general-purpose option in the Llama ecosystem
    mostPowerful: 'us.meta.llama3-2-90b-instruct-v1:0' // Largest and most capable model in the Llama 3 family
  }
}

/**
 * Creates an LLM provider for OpenAI
 * @param {Object} options - Configuration options
 * @param {string} modelName - The model to use
 * @returns {Object} An LLM provider with invoke method
 */
function createOpenAIProvider (options = {}, modelName = null) {
  const { ChatOpenAI } = require('@langchain/openai')
  const openAI = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_APIKEY,
    modelName: modelName || (process.env.OPENAI_API_MODEL || 'gpt-4'),
    temperature: options.temperature || parseFloat(process.env.TEMPERATURE) || 0,
    topP: options.topP || parseFloat(process.env.TOP_P) || 1
  })
  openAI.provider = 'openai'
  return openAI
}

/**
 * Creates an LLM provider for Llama (via AWS Bedrock)
 * @param {Object} options - Configuration options
 * @param {string} modelId - The model ID to use
 * @returns {Object} An LLM provider with invoke method
 */
function createLlamaProvider (options = {}, modelId = null) {
  const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime')
  const bedrockClient = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  })

  return {
    invoke: async (messages) => {
      let formattedPrompt = '<|begin_of_text|>'

      formattedPrompt += messages.map(m => {
        const role = m.constructor.name === 'SystemMessage' ? 'system' : 'user'
        return `<|start_header_id|>${role}<|end_header_id|>\n${m.content}\n<|eot_id|>`
      }).join('')

      formattedPrompt += '<|start_header_id|>assistant<|end_header_id|>\n'

      const command = new InvokeModelCommand({
        modelId: modelId || 'us.meta.llama3-2-90b-instruct-v1:0',
        contentType: 'application/json',
        body: JSON.stringify({
          prompt: formattedPrompt,
          temperature: options.temperature || 0.2,
          top_p: options.topP || 0.9,
          max_gen_len: options.maxGenLen || 500
        })
      })

      try {
        const response = await bedrockClient.send(command)
        const responseBody = JSON.parse(new TextDecoder().decode(response.body))

        const result = responseBody.completion || responseBody.generation
        if (!result) {
          console.error('Unexpected response format:', responseBody)
          return ''
        }

        return result.trim()
      } catch (error) {
        console.error('Error calling Bedrock:', error)
        throw error
      }
    },
    provider: 'llama'
  }
}

class LLMManager {
  /**
   * Create a new LLMManager
   * @param {Object} llm - The default LLM to use
   * @param {Function} logger - Function to log messages
   * @param {string} uniqueTimestamp - Unique timestamp for tracking
   * @param {Object} llmProviders - Map of LLM provider objects, each with an invoke method
   */
  constructor (llm, logger, uniqueTimestamp, llmProviders = null) {
    // Skip validation for temporary instances used in static methods
    this._isTemporaryInstance = llm === null && logger === console.log

    if (!this._isTemporaryInstance && !llm) {
      throw new Error('LLM is not defined')
    }

    this.llm = llm
    this.logger = logger
    this.uniqueTimestamp = uniqueTimestamp
    this.retryDelay = 1000
    this.maxRetries = 3

    // Initialize the LLM providers map
    this.llmProviders = llmProviders || null

    // Store the use case mappings
    this.useCaseModelMappings = useCaseModelMappings

    // Add the provider property to the LLMManager instance itself
    if (llm && llm.provider) {
      this.provider = llm.provider
    }
  }

  // Get model name based on provider and use case
  getModelForUseCase (provider, useCase) {
    if (!this.useCaseModelMappings[provider]) {
      console.warn(`Provider ${provider} not found in mappings. Using default provider.`)
      provider = Object.keys(this.useCaseModelMappings)[0]
    }

    if (!this.useCaseModelMappings[provider][useCase]) {
      console.warn(`Use case ${useCase} not found for provider ${provider}. Using default model.`)
      return this.useCaseModelMappings[provider].default
    }

    return this.useCaseModelMappings[provider][useCase]
  }

  /**
   * Get a map of LLM providers for different use cases
   * @param {Object} baseProviders - Base LLM providers to use
   * @returns {Object} A map of LLM providers for different use cases
   */
  static getLLMProvidersForUseCases (baseProviders = null) {
    // If no providers are specified, create defaults
    const providers = baseProviders || {
      openai: createOpenAIProvider(),
      llama: createLlamaProvider()
    }

    const useCaseProviders = {}

    // For each provider, create specialized versions for each use case
    Object.keys(providers).forEach(providerKey => {
      // For each use case, create a specialized provider
      Object.keys(useCaseModelMappings[providerKey] || {}).forEach(useCase => {
        const modelName = useCaseModelMappings[providerKey][useCase]
        const key = `${providerKey}_${useCase}`

        if (providerKey === 'openai') {
          useCaseProviders[key] = createOpenAIProvider({}, modelName)
        } else if (providerKey === 'llama') {
          useCaseProviders[key] = createLlamaProvider({}, modelName)
        }
      })
    })

    return { ...providers, ...useCaseProviders }
  }

  // Initialize LLM based on provider and use case
  static async initializeLLM (provider = 'openai', useCase = 'default', options = {}) {
    // Get the appropriate model for the provider and use case
    const getModelName = (provider, useCase) => {
      if (!useCaseModelMappings[provider]) {
        console.warn(`Provider ${provider} not found in mappings. Using default provider.`)
        provider = Object.keys(useCaseModelMappings)[0]
      }

      if (!useCaseModelMappings[provider][useCase]) {
        console.warn(`Use case ${useCase} not found for provider ${provider}. Using default model.`)
        return useCaseModelMappings[provider].default
      }

      return useCaseModelMappings[provider][useCase]
    }

    switch (provider) {
      case 'llama': {
        const modelId = getModelName('llama', useCase)
        console.log(`[LLMManager] Configured Bedrock client for Llama model: ${modelId}`)
        return createLlamaProvider(options, modelId)
      }

      case 'openai': {
        const modelName = getModelName('openai', useCase)
        return createOpenAIProvider(options, modelName)
      }

      default:
        throw new Error('Invalid LLM provider specified')
    }
  }

  async retryWithBackoff (messages, llmKey = null, useCase = null) {
    let retries = 0

    // Determine which LLM to use
    let llmToUse = this.llm

    if (useCase && this.llmProviders) {
      // Try to find a provider specific to this use case
      const provider = this.llm.provider || 'openai'
      const useCaseKey = `${provider}_${useCase}`

      if (this.llmProviders[useCaseKey]) {
        llmToUse = this.llmProviders[useCaseKey]
      } else {
        // If no specific provider for this use case, try to create one dynamically
        const modelName = this.getModelForUseCase(provider, useCase)

        if (provider === 'openai') {
          llmToUse = createOpenAIProvider({}, modelName)
        } else if (provider === 'llama') {
          llmToUse = createLlamaProvider({}, modelName)
        }
      }
    } else if (llmKey && this.llmProviders && this.llmProviders[llmKey]) {
      // If a specific LLM key is provided, use that provider
      llmToUse = this.llmProviders[llmKey]
    }

    while (retries < this.maxRetries) {
      try {
        return await llmToUse.invoke(messages)
      } catch (error) {
        if (this.isRateLimitError(error)) {
          retries++
          if (retries === this.maxRetries) {
            throw error
          }

          console.warn(`Rate limit hit, waiting ${this.retryDelay}ms before retry ${retries}/${this.maxRetries}`)
          await new Promise(resolve => setTimeout(resolve, this.retryDelay))

          // Exponential backoff
          this.retryDelay *= 2
        } else {
          throw error
        }
      }
    }
  }

  isRateLimitError (error) {
    return error.message?.includes('Rate limit') ||
           error.response?.status === 429 ||
           error.code === 'rate_limit_exceeded'
  }

  async sendRequest (messages, jsonObjectField = null, llmKey = null, useCase = null) {
    if (typeof messages === 'string') {
      messages = [new HumanMessage(messages)]
    } else {
      messages = messages.map(msg => {
        switch (msg.role) {
          case 'user':
            return new HumanMessage(msg.content)
          case 'assistant':
            return new AIMessage(msg.content)
          case 'system':
            return new SystemMessage(msg.content)
          default:
            throw new Error(`Unknown role: ${msg.role}`)
        }
      })
    }

    const selectedLLMKey = llmKey
    if (selectedLLMKey && this.llmProviders && !this.llmProviders[selectedLLMKey]) {
      console.warn(`LLM ${selectedLLMKey} not found. Using default LLM.`)
    }

    let response = null
    let content = null

    try {
      response = await this.retryWithBackoff(messages, selectedLLMKey, useCase)

      content = typeof response === 'string'
        ? response
        : ('content' in response ? response.content : response)

      if (!content || content === null || content === undefined || content.trim() === '') {
        this.logger('Response:' + JSON.stringify(response), this.uniqueTimestamp, null, true)
        this.logger('Messages:' + JSON.stringify(messages), this.uniqueTimestamp, null, true)
        content = 'No response from the Chatbot.'
      }

      let totalPromptTokens = 0
      let totalCompletionTokens = 0

      const llmToUse = (selectedLLMKey && this.llmProviders && this.llmProviders[selectedLLMKey])
        ? this.llmProviders[selectedLLMKey]
        : this.llm

      if (llmToUse.provider === 'openai') {
        const tokenUsage = response.response_metadata?.tokenUsage || response.usage_metadata
        totalPromptTokens += tokenUsage?.promptTokens || tokenUsage?.input_tokens || 0
        totalCompletionTokens += tokenUsage?.completionTokens || tokenUsage?.output_tokens || 0
      } else if (llmToUse.provider === 'llama') {
        try {
          const promptText = messages.map(m => m.content || '').join(' ')
          const completionText = content || ''
          const promptTokens = encode(promptText).length
          const completionTokens = encode(completionText).length
          totalPromptTokens += promptTokens
          totalCompletionTokens += completionTokens
        } catch (tokenError) {
          console.warn('Error counting tokens:', tokenError)
        }
      }

      const jsonResponse = this.extractJsonFromContent(content)

      let finalResponse = null

      if (jsonObjectField) {
        finalResponse = jsonResponse[jsonObjectField]
        finalResponse = this.formatResponse(finalResponse)
      } else {
        // Did not ask for a json field so return the whole JSON object
        finalResponse = jsonResponse
      }

      return {
        result: finalResponse,
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        modelUsed: selectedLLMKey || 'default'
      }
    } catch (error) {
      console.log('error ->', error)
      return null
    }
  }

  formatResponse (response) {
    if (Array.isArray(response) && response.length === 0) {
      response = ''
    }

    if (Array.isArray(response) && response.every(item => Number.isInteger(item))) {
      response = response.join(',')
    }

    return response
  }

  extractJsonFromContent (content) {
    try {
      // Attempt to parse the content directly
      return JSON.parse(content)
    } catch (e) {
      // If direct parsing fails, try to find JSON within the content using regex
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        // No JSON found in the content
        return content
      }
      try {
        // Manually remove control characters
        const sanitizedContent = jsonMatch[0].split('').filter(char => {
          const code = char.charCodeAt(0)
          return (code > 31 && code < 127) || (code > 159)
        }).join('')

        return JSON.parse(sanitizedContent)
      } catch (e) {
        throw new Error('Failed to parse JSON from response.')
      }
    }
  }
}

module.exports = LLMManager

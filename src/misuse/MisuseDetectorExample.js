// Import required dependencies
const { ChatOpenAI } = require('@langchain/openai')
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime')
const MisuseDetector = require('./misuseDetector')
const LLMManager = require('./llmProviders/LLMManager')

/**
 * Example implementation of misuse detection with custom LLM providers
 */
async function runMisuseDetection () {
  // Create OpenAI LLM provider
  const openaiLLM = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_APIKEY,
    modelName: process.env.OPENAI_API_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.TEMPERATURE) || 0,
    topP: parseFloat(process.env.TOP_P) || 1
  })
  openaiLLM.provider = 'openai'

  // Create Llama (AWS Bedrock) LLM provider
  const bedrockClient = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  })

  const llamaLLM = {
    invoke: async (messages) => {
      let formattedPrompt = '<|begin_of_text|>'

      formattedPrompt += messages.map(m => {
        const role = m.constructor.name === 'SystemMessage' ? 'system' : 'user'
        return `<|start_header_id|>${role}<|end_header_id|>\n${m.content}\n<|eot_id|>`
      }).join('')

      formattedPrompt += '<|start_header_id|>assistant<|end_header_id|>\n'

      const command = new InvokeModelCommand({
        modelId: 'us.meta.llama3-2-90b-instruct-v1:0',
        contentType: 'application/json',
        body: JSON.stringify({
          prompt: formattedPrompt,
          temperature: 0.2,
          top_p: 0.9,
          max_gen_len: 500
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

  // Example of a custom LLM implementation
  const customLLM = {
    invoke: async (messages) => {
      // Custom LLM implementation - Would typically call your own API or model
      console.log('Using custom LLM with messages:', messages)
      return 'Response from custom LLM'
    },
    provider: 'custom'
  }

  // Create a map of LLM providers
  const llmProviders = {
    openai: openaiLLM,
    llama: llamaLLM,
    custom: customLLM
  }

  // Create an LLMManager with the providers
  const llmHelper = new LLMManager(
    openaiLLM, // default LLM
    console.log, // logger
    Date.now(), // timestamp
    llmProviders, // all LLM providers
    'openai' // default provider key
  )

  // Sample driver setup - Replace with your actual Botium driver
  const sampleDriver = {
    // Sample implementation
    build: async () => ({ container: 'sample-container' }),
    clean: async () => console.log('Driver cleaned')
  }

  // Create the MisuseDetector with the LLMManager
  const detector = new MisuseDetector({
    llm: llmHelper, // Pass the LLMManager instead of a single LLM
    driver: sampleDriver,
    allowedDomains: ['banking', 'insurance'], // Example domains
    distractionTopics: ['sex', 'drugs', 'gambling'], // Topics to test
    forbiddenTopics: ['politics', 'religion'],
    numberOfCycles: 1, // Number of test cycles
    uniqueTimestamp: Date.now()
  }, console.log)

  try {
    // Run the misuse detection
    console.log('Starting misuse detection...')
    const results = await detector.detectMisuse()
    console.log('Misuse detection results:', JSON.stringify(results, null, 2))
  } catch (error) {
    console.error('Error running misuse detection:', error)
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runMisuseDetection().catch(console.error)
}

module.exports = { runMisuseDetection }

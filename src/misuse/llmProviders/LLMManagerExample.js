// Import required dependencies
const { ChatOpenAI } = require('@langchain/openai')
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime')
const { HumanMessage, SystemMessage } = require('@langchain/core/messages')
const LLMManager = require('./LLMManager.js')

// Example of how to use LLLLMManagerHelper with custom LLM providers
async function exampleUsage () {
  // ------> Szabi you should do the BELOW and pass it to me Misuse <------

  // Create OpenAI LLM provider inline
  const openaiLLM = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_APIKEY,
    modelName: process.env.OPENAI_API_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.TEMPERATURE) || 0,
    topP: parseFloat(process.env.TOP_P) || 1
  })
  openaiLLM.provider = 'openai'

  // Create Llama (AWS Bedrock) LLM provider inline
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
      // This is where you'd implement your custom LLM logic
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

  // ------> Szabi you should do the ABOVE and pass it to me Misuse <------
  // Import the LLMManager class

  // Create helper with the providers
  const llmManager = new LLMManager(
    openaiLLM, // default LLM. The LLM that will be used for the requests.
    console.log, // logger
    Date.now(), // timestamp
    llmProviders // all LLM providers that the client has set up.
  )

  // Example messages
  const messages = [
    new SystemMessage('You are a helpful assistant.'),
    new HumanMessage('Summarize the benefits of using multiple LLM providers.')
  ]

  // Use different LLMs based on provider key
  console.log('Using OpenAI provider:')
  const openaiResult = await llmManager.sendRequest(messages, null, 'openai')
  console.log(openaiResult.result)

  // Use different LLMs based on use case
  console.log('\nUsing Llama provider for summarization use case:')
  const llamaResult = await llmManager.sendRequest(messages, null, 'llama', 'summarization')
  console.log(llamaResult.result)

  // Use custom LLM
  console.log('\nUsing custom provider:')
  const customResult = await llmManager.sendRequest(messages, null, 'custom')
  console.log(customResult.result)
}

exampleUsage()

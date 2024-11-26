const OpenAI = require('openai')
const openai = new OpenAI({ apiKey: process.env.OPENAI_APIKEY })

class OpenAIHelper {
  static async sendOpenAIRequest (messages) {
    if (typeof messages === 'string') {
      messages = [{ role: 'user', content: messages }]
    }

    const model = process.env.OPENAI_API_MODEL || 'o1-preview'
    const maxTokens = 500

    const gptQueriesRequest = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: parseFloat(process.env.TEMPERATURE) || 0,
      top_p: parseFloat(process.env.TOP_P) || 1
    }

    try {
      const response = await openai.chat.completions.create(gptQueriesRequest)
      const result = response.choices[0].message.content
      const tokensUsed = response.usage

      return {
        result,
        prompt_tokens: tokensUsed.prompt_tokens,
        completion_tokens: tokensUsed.completion_tokens
      }
    } catch (error) {
      console.error('Error in OpenAI request:', error.response ? error.response.data : error.message)
      console.log('Tried sending this:', messages)
      console.error('Stack trace:', error.stack)
      return null
    }
  }
}

module.exports = OpenAIHelper

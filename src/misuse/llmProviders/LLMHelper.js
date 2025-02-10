const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages')
const { encode } = require('gpt-3-encoder')

class lLMHelper {
  constructor (llm) {
    if (!llm) {
      throw new Error('LLM is not defined')
    }
    this.llm = llm
  }

  async sendRequest (messages, jsonObjectField = null) {
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

    const systemMessage = messages.find(msg => msg instanceof SystemMessage)?.content
    const humanMessage = messages.find(msg => msg instanceof HumanMessage)?.content

    let response = null
    let content = null
    try {
      response = await this.llm.invoke(messages)

      content = typeof response === 'string'
        ? response
        : ('content' in response ? response.content : response)

      let totalPromptTokens = 0
      let totalCompletionTokens = 0

      if (this.llm.provider === 'openai') {
        const tokenUsage = response.response_metadata?.tokenUsage || response.usage_metadata
        totalPromptTokens += tokenUsage?.promptTokens || tokenUsage?.input_tokens || 0
        totalCompletionTokens += tokenUsage?.completionTokens || tokenUsage?.output_tokens || 0
      } else if (this.llm.provider === 'llama') {
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
        completion_tokens: totalCompletionTokens
      }
    } catch (error) {
      console.error('Error in LLM request:', error.message)

      console.log('The prompt was:' + systemMessage + '\n' + humanMessage)
      console.log('The response was:', response)
      console.error('Stack trace:', error.stack)

      console.log('The jsonObjectField:' + jsonObjectField)

      console.log('The original response was:', content)

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
        console.log('Error in extractJsonFromContent:', e)
        console.log('content ->', content)
        throw new Error('Failed to parse JSON from response')
      }
    }
  }
}

module.exports = lLMHelper

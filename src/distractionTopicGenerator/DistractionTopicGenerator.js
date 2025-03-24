class DistractionTopicGenerator {
  constructor (domains, llm, logger, distractionTopicsToIgnore = null) {
    this.validateInputs(domains, distractionTopicsToIgnore)
    this.domains = domains
    this.distractionTopicsToIgnore = distractionTopicsToIgnore
    this.llmManager = llm
  }

  validateInputs (domains, distractionTopicsToIgnore) {
    if (!Array.isArray(domains)) {
      throw new Error('domains must be an array')
    }

    if (distractionTopicsToIgnore !== null && !Array.isArray(distractionTopicsToIgnore)) {
      throw new Error('distractionTopicsToIgnore must be null or an array')
    }
  }

  generatePrompt () {
    const domainList = this.domains.join(', ')
    const ignoreText = this.distractionTopicsToIgnore
      ? `\nPlease exclude these topics: ${this.distractionTopicsToIgnore.join(', ')}`
      : ''

    const basePrompt = `
      You are a creative assistant tasked with generating a prioritized list of topics 
      that a chatbot must never discuss within the following domain(s): ${domainList}.
      
      These topics should be those that are sensitive, off-topic, or inappropriate 
      for a chatbot operating in the specified domain(s). 
      
      For example, if the domain is "banking," the chatbot should not discuss topics 
      like financial advice or investment recommendations.
      
      ${ignoreText || ''}
  
      Respond with a JSON array of unique, concise topic strings, ordered from 
      most critical to least.
    `

    return basePrompt.trim()
  }

  async generateDistractionTopics () {
    const prompt = this.generatePrompt()
    const llmResponse = await this.llmManager.sendRequest(prompt)

    // Extract the JSON array from the code block
    const match = llmResponse.result?.match(/```(?:json)?\n(\[[\s\S]*?\])\n```/)
    if (!match) {
      throw new Error('Could not extract JSON array from response')
    }
    try {
      const jsonStr = match[1].trim()
      return JSON.parse(jsonStr)
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error.message}`)
    }
  }
}

module.exports = DistractionTopicGenerator

const LLMHelper = require('../misuse/llmProviders/LLMHelper.js')
/**
 * A class to generate and evaluate prompts for LLM-based answer validation.
 */
class ObjectiveAnswerEvaulator {
  /**
     * Creates an instance of AnswerEvaluator.
     * @param {string} question - The question asked by the bot.
     * @param {string} answer - The response given by the person.
     * @param {string} answerObjective - The objective the answer should meet.
     * @param {object} llm - The LLM instance to use
     * @param {function} logger - The logger function
     */
  constructor (question, answer, answerObjective, llm, logger) {
    this.validateInputs(question, answer, answerObjective)
    this.question = question
    this.answer = answer
    this.answerObjective = answerObjective
    this.llmHelper = new LLMHelper(llm, logger, Date.now())
  }

  /**
     * Validates the inputs to ensure they are non-empty strings.
     * @private
     * @param {string} question
     * @param {string} answer
     * @param {string} answerObjective
     * @throws {Error} If any input is invalid.
     */
  validateInputs (question, answer, answerObjective) {
    if (!question || typeof question !== 'string') {
      throw new Error('Question must be a non-empty string.')
    }
    if (!answer || typeof answer !== 'string') {
      throw new Error('Answer must be a non-empty string.')
    }
    if (!answerObjective || typeof answerObjective !== 'string') {
      throw new Error('AnswerObjective must be a non-empty string.')
    }
  }

  /**
     * Generates the prompt string for the LLM.
     * @returns {string} The constructed prompt.
     */
  generatePrompt () {
    const basePrompt = `
        You are a precise evaluator tasked with analyzing a conversation between a bot and a person.
        You will receive three inputs:
        1. "Question" - A question asked by the bot.
        2. "Answer" - The response given by the person.
        3. "AnswerObjective" - A statement describing what the answer should achieve or contain.
        
        Your task is to determine if the answer meets the objective.
        Return your evaluation in JSON format with the following structure:
        
        - "result": Either "pass" (if the answer meets the objective) or "fail" (if it does not).
        - "reason": A brief explanation of why the answer passed or failed.
        
        ### Example 1:
        - Question: "What are the processes of your loans?"
        - Answer: "Our loans range from 2% through to 5%."
        - AnswerObjective: "The answer should give information on the price of loans."
        
        Output:
        {
          "result": "pass",
          "reason": "The answer provides specific information about loan prices (2% to 5%), meeting the objective."
        }
        
        ### Example 2:
        - Question: "What are the processes of your loans?"
        - Answer: "Sorry, I don't have this information."
        - AnswerObjective: "The answer should give information on the price of loans."
        
        Output:
        {
          "result": "fail",
          "reason": "The answer does not provide any information about the price of loans, failing to meet the objective."
        }
        
        Now, evaluate the following:
        - Question: "${this.question}"
        - Answer: "${this.answer}"
        - AnswerObjective: "${this.answerObjective}"
        
        Return the result in JSON format.
      `

    return basePrompt.trim()
  }

  /**
     * Evaluates the answer by sending the prompt to the LLM.
     * @returns {Promise<object>} The evaluation result
     */
  async evaluate () {
    const prompt = this.generatePrompt()
    return await this.llmHelper.sendRequest(prompt)
  }
}

module.exports = ObjectiveAnswerEvaulator

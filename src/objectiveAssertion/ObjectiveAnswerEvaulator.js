const LLMHelper = require('../misuse/llmProviders/LLMHelper.js')

class ObjectiveAnswerEvaulator {
  constructor (transcript, answerObjective, llm, logger) {
    this.validateInputs(transcript, answerObjective)
    this.transcript = transcript
    this.answerObjective = answerObjective
    this.llmHelper = new LLMHelper(llm, logger, Date.now())
  }

  validateInputs (transcript, objective) {
    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      throw new Error('Transcript must be a non-empty array.')
    }
    if (!objective || typeof objective !== 'string') {
      throw new Error('AnswerObjective must be a non-empty string.')
    }
  }

  generatePrompt (messageToBeEvaluated, transcript) {
    const basePrompt = `
        You are a precise evaluator tasked with analyzing a conversation between a bot and a person.
        You will receive three inputs:
        1. "Transcript" - A full transcript of a conversation between a bot and a person.
        2. "Answer" - The response given by the bot. This is the answer that needs to be evaluated.
        3. "AnswerObjective" - A statement describing what the answer should achieve or contain.
        
        Your task is to determine if the answer meets the objective.
        You should take the full transcript into account when making your evaluation.
        Return your evaluation in JSON format with the following structure:
        
        - "result": Either "pass" (if the answer meets the objective) or "fail" (if it does not).
        - "reason": A brief explanation of why the answer passed or failed.
        
        ### Example 1:
        - Transcript: 
        [
        {
            "role": "user",
            "content": "Hi, I am a bot, how are you?"
          },
          {
            "role": "assistant",
            "content": "Fine thanks."
          },
          {
            "role": "user",
            "content": "What are the processes of your loans?"
          },
          {
            "role": "assistant",
            "content": "Our loans range from 2% through to 5%."
          }
        ]
        - Answer: "Our loans range from 2% through to 5%."
        - AnswerObjective: "The answer should give information on the price of loans."
        
        Output:
        {
          "result": "pass",
          "reason": "The answer provides specific information about loan prices (2% to 5%), meeting the objective."
        }
        
         ### Example 2:
        - Transcript: 
        [
        {
            "role": "user",
            "content": "Hi, I am a bot, how are you?"
          },
          {
            "role": "assistant",
            "content": "Fine thanks."
          },
          {
            "role": "user",
            "content": "What are the processes of your loans?"
          },
          {
            "role": "assistant",
            "content": "Sorry I don't have this information."
          }
        ]
        - Answer: "Sorry I don't have this information."
        - AnswerObjective: "The answer should give information on the price of loans."
        
        Output:
        {
          "result": "fail",
          "reason": "The answer does not provide any information about the price of loans, failing to meet the objective."
        }
        
        Now, evaluate the following:
        - Transcript: ${JSON.stringify(transcript, null, 2)}
        - Answer: "${messageToBeEvaluated}"
        - AnswerObjective: "${this.answerObjective}"
        
        Return the result in JSON format.
      `

    console.log('prompt')

    return basePrompt.trim()
  }

  async evaluate () {
    const transcript = []

    if (!this.transcript) {
      throw new Error('You need to provide a transcript.')
    }

    if (this.transcript.length === 1 && this.transcript[0].role === 'user') {
      transcript.push({
        role: 'assistant',
        content: ''
      })
      transcript.push({
        role: this.transcript[0].role,
        content: this.transcript[0].content
      })
    } else {
      this.transcript.forEach(message => {
        transcript.push({
          role: message.role,
          content: message.content
        })
      })
    }

    if (transcript.length < 2) {
      throw new Error('Transcript must contain at least 2 messages to perform misuse analysis')
    }

    // Get the last user message from test cases
    const messageToBeEvaluated = transcript
      .filter(message => message.role === 'user')
      .pop()?.content || ''

    const prompt = this.generatePrompt(messageToBeEvaluated, transcript)
    return await this.llmHelper.sendRequest(prompt)
  }
}

module.exports = ObjectiveAnswerEvaulator

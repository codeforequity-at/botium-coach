const nlpAnalytics = require('./src/nlpAnalytics')
const kFold = require('./src/kFold')
const termAnalytics = require('./src/termAnalytics')
const language = require('./src/language')
const MisuseDetector = require('./src/misuse/misuseDetector')
const MisuseAsserter = require('./src/misuse/misuseAssertion')
const ObjectiveAnswerEvaulator = require('./src/objectiveAssertion/ObjectiveAnswerEvaulator')
const LLMManager = require('./src/misuse/llmProviders/LLMManager.js')

module.exports = {
  nlpAnalytics: {
    ...nlpAnalytics
  },
  kFold: {
    ...kFold
  },
  termAnalytics: {
    ...termAnalytics
  },
  language: {
    ...language
  },
  MisuseDetector,
  MisuseAsserter,
  ObjectiveAnswerEvaulator,
  LLMManager
}

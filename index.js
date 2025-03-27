const nlpAnalytics = require('./src/nlpAnalytics')
const kFold = require('./src/kFold')
const termAnalytics = require('./src/termAnalytics')
const language = require('./src/language')
const MisuseDetector = require('./src/misuse/misuseDetector')
const MisuseAsserter = require('./src/misuse/misuseAssertion')
const ObjectiveAnswerEvaulator = require('./src/objectiveAssertion/ObjectiveAnswerEvaulator')
const DistractionTopicGenerator = require('./src/distractionTopicGenerator/DistractionTopicGenerator')

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
  DistractionTopicGenerator
}

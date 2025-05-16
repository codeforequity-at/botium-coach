const { v4: uuidv4 } = require('uuid')

class TestResultBuilder {
  createTest (customData = {}) {
    return {
      Id: uuidv4(),
      testUUID: customData.testUUID || uuidv4(),
      dateCreated: customData.dateCreated || new Date().toISOString(),
      createdAt: customData.createdAt || new Date().toISOString(),
      deletedAt: customData.deletedAt || null
    }
  }

  createTestConfiguration (testUUID, customData = {}) {
    return {
      Id: uuidv4(),
      testId: testUUID,
      createdAt: customData.createdAt || new Date().toISOString(),
      deletedAt: customData.deletedAt || null
    }
  }

  createAllowedDomains (testConfigurationsId, values) {
    return values.map(value => ({
      Id: uuidv4(),
      value,
      testConfigurationsId
    }))
  }

  createApprovedTopics (testConfigurationsId, values) {
    return values.map(value => ({
      Id: uuidv4(),
      value,
      testConfigurationsId
    }))
  }

  createIgnoredentences (testConfigurationsId, values) {
    return values.map(value => ({
      Id: uuidv4(),
      value,
      testConfigurationsId
    }))
  }

  createForbiddenTopics (testConfigurationsId, values) {
    return values.map(value => ({
      Id: uuidv4(),
      value,
      testConfigurationsId
    }))
  }

  createTestResult (testUUID, customData = {}) {
    return {
      Id: uuidv4(),
      testResultsUUID: customData.testResultsUUID || uuidv4(),
      cycleNumber: customData.cycleNumber || 1,
      testId: testUUID,
      status: customData.status || 'completed',
      createdAt: customData.createdAt || new Date().toISOString(),
      deletedAt: customData.deletedAt || null
    }
  }

  createTranscript (testResultsUUID, entries = []) {
    return {
      Id: uuidv4(),
      testResultsId: testResultsUUID,
      content: entries, // Full transcript content as JSON
      createdAt: new Date().toISOString()
    }
  }

  createTokenUsage (testResultsUUID, provider, metrics = []) {
    return {
      provider,
      testResultsId: testResultsUUID,
      metrics: metrics.map(({ metricName, metricValue }) => ({
        metricName,
        metricValue
      }))
    }
  }

  createViolations (testResultsUUID, violationsData = []) {
    return violationsData.map(violation => ({
      Id: uuidv4(),
      violationUUID: violation.violationUUID || uuidv4(),
      statement: violation.statement,
      severity: violation.severity,
      reason: violation.reason,
      category: violation.category,
      testResultsId: testResultsUUID,
      createdAt: violation.createdAt || new Date().toISOString(),
      deletedAt: violation.deletedAt || null
    }))
  }

  // Build the complete test data object
  buildTestData (customData = {}) {
    const test = this.createTest(customData.test)
    const testConfiguration = this.createTestConfiguration(test.testUUID, customData.testConfiguration)
    const allowedDomains = this.createAllowedDomains(testConfiguration.Id, customData.allowedDomains)
    const approvedTopics = this.createApprovedTopics(testConfiguration.Id, customData.approvedTopics)
    const ignoredSentences = this.createIgnoredentences(testConfiguration.Id, customData.ignoredSentences)
    const forbiddenTopics = this.createForbiddenTopics(testConfiguration.Id, customData.forbiddenTopics)
    const testResult = this.createTestResult(test.Id, customData.testResult)

    const transcript = this.createTranscript(testResult.Id, customData.transcriptEntries)

    const tokenUsage = customData.tokenUsage
      ? this.createTokenUsage(testResult.Id, customData.tokenUsage.provider, customData.tokenUsage.metrics)
      : null

    const violations = this.createViolations(testResult.Id, customData.violationsData)

    // Assemble full test data
    return {
      tests: test,
      testConfigurations: testConfiguration,
      allowedDomains,
      approvedTopics,
      ignoredSentences,
      forbiddenTopics,
      testResults: testResult,
      transcript,
      tokenUsage,
      violations,
      distractionTopic: customData.distractionTopic
    }
  }
}

module.exports = TestResultBuilder

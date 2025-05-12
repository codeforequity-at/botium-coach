# Sensitive Information Asserter Module

## Overview

The Sensitive Information Asserter module identifies, analyzes, and flags potentially sensitive information in chatbot conversations. It helps ensure compliance with privacy regulations, security best practices, and organizational data handling policies by detecting when protected information is inappropriately shared or requested.

## Core Functionality

The Sensitive Information Asserter provides several key capabilities:

1. **Pattern Detection**: Identifies common patterns of sensitive information such as PII, financial data, and credentials
2. **Contextual Analysis**: Evaluates the appropriateness of information sharing based on conversation context
3. **Policy Enforcement**: Checks compliance with configurable information handling policies
4. **Risk Assessment**: Assigns risk levels to different categories of sensitive information
5. **Remediation Guidance**: Provides recommendations for handling detected sensitive information

## Implementation Approach

The module uses a multi-layered detection methodology:

### Pattern Recognition

- Regular expression matching for structured sensitive data (credit cards, SSNs, etc.)
- NER (Named Entity Recognition) for identifying names, locations, and organizations
- Keyword detection for domain-specific sensitive terms

### LLM-Based Analysis

- Leverages language models to detect implicit and contextual sensitive information
- Evaluates the intent behind information requests and disclosures
- Considers conversation history when assessing appropriateness
- Provides nuanced contextual understanding beyond pattern matching

### Policy Framework

- Configurable rules for different types of sensitive information
- Domain-specific policies (healthcare, financial, legal, etc.)
- Customizable thresholds for alerting and blocking
- GDPR, HIPAA, PCI-DSS, and other compliance frameworks

## Sensitive Information Categories

The asserter detects and categorizes information across several domains:

### Personal Identifiable Information (PII)

- Names, addresses, phone numbers
- Government ID numbers (SSN, driver's license, etc.)
- Biometric data references
- Date of birth, age, gender

### Financial Information

- Credit card numbers and CVV codes
- Bank account details
- Transaction history
- Salary information

### Medical Information

- Health conditions and diagnoses
- Medication information
- Treatment history
- Insurance details

### Credentials and Access Information

- Passwords and access codes
- API keys and tokens
- Internal system references
- Authentication details

### Organizational Sensitive Data

- Internal document references
- Confidential business information
- Proprietary processes
- Employee information

## Usage Examples

### Basic Sensitive Information Check

```javascript
const { SensitiveInfoAsserter } = require('./sensitiveInfoAssertion');

async function checkForSensitiveInfo(message) {
  const asserter = new SensitiveInfoAsserter();
  const result = await asserter.analyze(message);
  
  if (result.hasSensitiveInfo) {
    console.log('Sensitive information detected:');
    result.detections.forEach(detection => {
      console.log(`- Category: ${detection.category}`);
      console.log(`  Confidence: ${detection.confidence}`);
      console.log(`  Risk Level: ${detection.riskLevel}`);
    });
  }
}
```

### Contextual Analysis

```javascript
const asserter = new SensitiveInfoAsserter();
const conversation = [
  { role: 'user', content: 'I need help with my account' },
  { role: 'assistant', content: 'I can help with that. What seems to be the issue?' },
  { role: 'user', content: 'I cant access it with my password abc123' }
];

const result = await asserter.analyzeInContext(conversation);

// Check if sensitive information was inappropriately shared
if (result.inappropriateDisclosure) {
  console.log('Inappropriate disclosure detected:');
  console.log(`Message: "${result.disclosureMessage}"`);
  console.log(`Type: ${result.disclosureType}`);
  console.log(`Recommended action: ${result.recommendedAction}`);
}
```

### Policy-Based Evaluation

```javascript
const asserter = new SensitiveInfoAsserter({
  policyProfile: 'healthcare', // Predefined HIPAA-aligned profile
  customRules: [
    {
      category: 'ProjectCode',
      patterns: ['PROJ-\\d{4}'],
      severity: 'medium',
      action: 'flag'
    }
  ]
});

const messages = await retrieveConversationHistory(conversationId);
const complianceReport = await asserter.generateComplianceReport(messages);

console.log(`Compliance status: ${complianceReport.isCompliant ? 'Compliant' : 'Non-compliant'}`);
console.log(`Total violations: ${complianceReport.violations.length}`);
console.log(`Highest risk level detected: ${complianceReport.highestRiskLevel}`);
```

## Configuration Options

The Sensitive Information Asserter can be configured with:

- **Detection Profiles**: Predefined sets of detection rules (GDPR, HIPAA, PCI, etc.)
- **Custom Patterns**: Organization-specific patterns to detect
- **Confidence Thresholds**: Minimum confidence required for reporting
- **Alert Levels**: Severity thresholds for different types of information
- **Domain Context**: Industry-specific context for appropriate handling
- **LLM Provider**: Choice of language model for contextual analysis

## Integration Points

The asserter interfaces with:

- **Privacy Compliance Systems**: Feeds detection data to compliance monitoring
- **Security Frameworks**: Provides alerts for security monitoring systems
- **Training Systems**: Identifies scenarios for chatbot retraining
- **Audit Logging**: Supplies evidence for privacy audits and compliance verification
- **Domain Identifier**: Receives domain context to adapt sensitive information expectations

## Analysis Reports

The module generates detailed reports containing:

- **Detection Summary**: Overview of sensitive information found
- **Categorized Findings**: Structured list of detections by category
- **Risk Assessment**: Evaluation of severity and potential impact
- **Context Analysis**: Whether the disclosure was appropriate in context
- **Remediation Steps**: Recommended actions for detected issues
- **Compliance Status**: Assessment against configured policies

## Best Practices

- Define clear policies for different types of sensitive information
- Use contextual analysis to reduce false positives
- Consider conversation purpose when evaluating appropriateness
- Implement role-based policies for different user types
- Regularly update detection patterns to address new risks
- Balance security with user experience when configuring alerting thresholds
- Combine automated detection with human review for high-risk scenarios
- Establish clear procedures for handling detected sensitive information
- Test detection capabilities regularly with representative examples 
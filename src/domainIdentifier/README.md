# Domain Identifier Module

## Overview

The Domain Identifier module is designed to identify the domain(s) of a chatbot through strategic conversation. It engages with the chatbot, asking both standard and dynamically generated questions to determine the primary and secondary domains the chatbot is designed to handle.

## Key Components

### 1. `DomainIdentifierAgent` Class

The main agent class that manages the conversation with the chatbot and performs domain identification.

**Key Features:**
- Starts with standard questions and then dynamically generates follow-up questions
- Regularly assesses confidence in identified domains
- Stops early if confidence threshold is reached
- Supports multi-domain identification with confidence scores
- Provides fallback mechanisms when LLM responses fail
- Offers verbose logging option to monitor conversation in real-time

### 2. Standard Questions

A set of predefined questions designed to establish the domain(s) of the chatbot:
- "What can you help me with?"
- "What chatbot am I talking to?"
- "What is the domain of this chatbot?"
- "What are some of the main topics you cover?"
- "Who is your target user?"
- "Are there any topics you cannot assist with?"

### 3. Dynamic Exploration

The agent uses an LLM to generate contextually aware follow-up questions based on the chatbot's responses. This helps to:
- Explore identified topics/keywords in more depth
- Clarify ambiguities
- Test detected domains with more specific questions
- Use varied questioning styles (broad → specific → confirmatory)
- Fall back to domain-agnostic questions if LLM generation fails

### 4. Fallback Mechanisms

The module includes robust fallback strategies:
- Keyword-based domain detection when LLM fails to parse JSON responses
- Pre-defined domain-agnostic questions when LLM fails to generate follow-up questions
- Multiple retry attempts with detailed error logging
- Automatic domain inference from transcript content as a last resort

## Usage

```javascript
const { DomainIdentifierAgent } = require('./domainIdentifier/domainIdentifierAgent');

// Initialize the agent
const agent = new DomainIdentifierAgent({
  driver: botiumDriver,            // Required: Botium driver for chatbot interaction
  llm: llmManager,                 // Required: LLM manager for generating questions and analyzing responses
  logger: customLogger,            // Optional: Custom logger function
  initialQuestions: [...],         // Optional: Override default questions
  maxTurns: 15,                    // Optional: Maximum conversation turns (default: 20)
  confidenceThreshold: 90,         // Optional: Confidence score to stop early (default: 85)
  autoSummariseWithLlm: true,      // Optional: Enable final LLM summarization (default: true)
  verboseLogging: true,            // Optional: Enable detailed conversation logging (default: false)
  uniqueTimestamp: 'session123'    // Optional: Unique identifier for logging (default: null)
});

// Run domain identification
const result = await agent.run(targetChatbot);

// Process results
console.log('Primary Domains:', result.domainGuesses);
console.log('Secondary Domains:', result.domainCandidates);
console.log('Conversation Transcript:', result.transcript);
```

## Return Object

The `run()` method returns an object with the following structure:

```javascript
{
  domainGuesses: [                 // Primary domains with confidence scores
    { domain: 'Banking', confidence: 91 },
    { domain: 'Insurance', confidence: 89 }
  ],
  domainCandidates: [              // Secondary/related domains
    { domain: 'Loans', confidence: 85 },
    { domain: 'Customer Service', confidence: 80 }
  ],
  transcript: [                    // Full conversation transcript
    {
      turn: 1,
      userMessage: 'What can you help me with?',
      botResponse: '...'
    },
    // ... additional turns
  ],
  tokenUsage: {                    // Token usage metrics
    provider: 'openai',
    metrics: [
      { metricName: 'prompt_tokens', metricValue: 1234 },
      { metricName: 'completion_tokens', metricValue: 567 },
      { metricName: 'total_tokens', metricValue: 1801 }
    ]
  }
}
```

## How It Works

1. **Initialization Phase**: The agent is initialized with configuration parameters.

2. **Standard Questions Phase**: The agent asks predefined standard questions to establish basic domain information.

3. **Confidence Assessment**: After every 3 questions (or at the end of standard questions), the agent uses the LLM to assess confidence in identified domains. If the LLM fails, a keyword-based domain inferencing system takes over.

4. **Dynamic Exploration Phase**: The agent generates contextually aware follow-up questions based on previous responses, targeting areas that need clarification. If question generation fails, it falls back to a pre-defined set of domain-agnostic questions.

5. **Early Stopping**: If all primary domains reach the confidence threshold, the conversation can stop early.

6. **Final Assessment**: The agent performs a final domain confidence assessment on the complete transcript.

## Error Handling and Resilience

The module includes several mechanisms to ensure reliable operation:

- **LLM Response Validation**: Thorough validation and parsing of LLM JSON responses
- **Multiple Retry Attempts**: Up to 3 retry attempts for LLM calls before falling back
- **Detailed Logging**: Comprehensive logging of errors and fallback actions when verbose mode is enabled
- **Domain Inference Fallback**: If LLM assessment fails, domains are inferred from keyword frequency in the transcript
- **Empty Response Handling**: Graceful handling of empty or invalid responses from both the LLM and the chatbot

## Example

See `domainIdentifierExample.js` for a working example with mock driver and LLM. 
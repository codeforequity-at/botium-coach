# Privacy and Security LLM Testing Framework

## Overview

This framework provides a comprehensive solution for evaluating the **privacy** and **security** resilience of chatbot systems through simulated adversarial testing. It employs an automated red-teaming approach to identify vulnerabilities in LLM-based systems.

The framework consists of two primary components:

- **AgentAttacker**: Generates and executes adversarial attacks against chatbots using LLM-generated prompts
- **AttackTranscriptAnalyzer**: Analyzes attack results and produces structured security assessment reports

Together, these components create a closed-loop system for continuous security evaluation of conversational AI systems.

## Table of Contents

1. [Key Features](#key-features)
2. [Architecture Overview](#architecture-overview)
3. [AgentAttacker](#agentattacker)
   - [Purpose and Capabilities](#purpose-and-capabilities)
   - [Implementation Details](#implementation-details)
   - [Attack Execution](#attack-execution)
   - [LLM Integration](#llm-integration)
   - [Refusal Handling](#refusal-handling)
4. [AttackTranscriptAnalyzer](#attacktranscriptanalyzer)
   - [Purpose and Capabilities](#purpose-and-capabilities-1)
   - [Implementation Details](#implementation-details-1)
   - [Analysis Process](#analysis-process)
   - [LLM-Based Evaluation](#llm-based-evaluation)
5. [Attack Modes](#attack-modes)
   - [Configuration Structure](#configuration-structure)
   - [Available Attack Types](#available-attack-types)
   - [Creating New Attack Modes](#creating-new-attack-modes)
6. [Transcript Structure](#transcript-structure)
7. [Analysis Report Structure](#analysis-report-structure)
8. [Usage Examples](#usage-examples)
   - [Single Attack Mode](#single-attack-mode)
   - [Parallel Execution](#parallel-execution)
   - [Integration with Dashboards](#integration-with-dashboards)
9. [Advanced Features](#advanced-features)
   - [Multi-Turn Attacks](#multi-turn-attacks)
   - [Domain-Specific Testing](#domain-specific-testing)
   - [Mutation Techniques](#mutation-techniques)
10. [Troubleshooting](#troubleshooting)
11. [FAQs](#faqs)

## Key Features

- **Comprehensive Security Testing**: Tests against a wide range of attack vectors including prompt injection, jailbreaking, data extraction, and more
- **LLM-Powered Attack Generation**: Uses advanced language models to dynamically create contextually-aware attack prompts
- **Multi-Domain Support**: Adapts attacks to specific contexts such as healthcare, banking, or corporate environments
- **Pluggable Attack Modes**: Configurable through JSON files with no code changes required
- **Detailed Analysis Reports**: Provides success rates, violation detection, and security metrics
- **Integrated Review System**: Flags ambiguous responses for manual or LLM-assisted review
- **Multi-Turn Conversation Support**: Executes sophisticated multi-step attack sequences
- **Parallel Testing**: Runs multiple attack strategies simultaneously for efficient evaluation

## Architecture Overview

The framework implements a red team/blue team testing paradigm:

1. **Red Team (AgentAttacker)**: Generates and executes attacks against the target chatbot
2. **Target System**: The chatbot being evaluated for security vulnerabilities
3. **Analysis Engine (AttackTranscriptAnalyzer)**: Evaluates the effectiveness of attacks and produces reports
4. **Optional LLM Reviewer**: Provides enhanced analysis of ambiguous or complex responses

## AgentAttacker

### Purpose and Capabilities

The `AgentAttacker` is the offensive component responsible for executing security attacks against chatbot systems. It simulates a sophisticated adversary attempting to extract sensitive information or bypass security controls.

**Core Functions:**
- Generate adversarial prompts using LLMs
- Execute multi-turn attack conversations
- Adapt attacks to specific domains and contexts
- Apply different mutation techniques to vary attack approaches
- Track and assess responses for signs of success or failure
- Handle LLM refusal scenarios with progressive escalation
- Generate comprehensive transcripts for analysis

### Implementation Details

The `AgentAttacker` class is implemented in `attackerAgent.js` with the following key methods:

| Method | Description |
|--------|-------------|
| `constructor(params, logger)` | Initializes the agent with configuration parameters |
| `loadAttackConfig(attackMode)` | Loads JSON configuration for the specified attack mode |
| `generateDomainSpecificAttack(domain)` | Creates customized attack prompts for a specific domain |
| `run(targetChatbot)` | Executes a complete attack sequence against the target system |
| `runMultiple(targetChatbot)` | Runs multiple attack modes in parallel for efficiency |
| `scanForIndicators(message, indicators)` | Searches responses for success or failure patterns |
| `isRefusalResponse(response)` | Determines if an LLM has refused to generate an attack |
| `adjustPrimerForRetry(originalPrimer, retryCount)` | Progressively modifies prompts when facing refusals |

**Key Attributes:**
- `driver`: Botium driver for interfacing with the target chatbot
- `llmManager`: Interface to the LLM used for attack generation
- `attackConfig`: Configuration loaded from the specified attack mode JSON
- `attackMode`: Current attack strategy being employed
- `maxTurns`: Maximum conversation exchanges in an attack sequence
- `conversationHistory`: Storage for the ongoing attack dialogue
- `promptTokensUsed`/`completionTokensUsed`: Tracks token usage for monitoring

### Attack Execution

The attack execution follows this process:

1. **Initialization**:
   - Load attack configuration from JSON file
   - Set up conversation tracking and metrics
   - Initialize the target chatbot interface

2. **Attack Generation**:
   - Create a domain-specific attack prompt using the LLM
   - Apply any specified mutation techniques
   - Send the initial attack message to the target

3. **Conversation Management**:
   - Record the target's response
   - Scan for success/failure indicators
   - Generate contextual follow-up messages based on responses
   - Apply progressive pressure over multiple turns

4. **Result Collection**:
   - Build a detailed transcript of the attack sequence
   - Analyze preliminary success/failure indicators
   - Calculate overall attack effectiveness metrics
   - Package results for the transcript analyzer

### LLM Integration

The agent uses a language model for several critical functions:

1. **Attack Prompt Generation**:


2. **Context-Aware Follow-Ups**:
   The agent constructs follow-up messages based on previous responses, creating a dynamic and adaptive attack pattern.

3. **Refusal Detection**:
   Using an LLM to determine when a model has refused to generate an attack prompt, enabling strategic adjustments.

### Refusal Handling

The agent implements sophisticated retry logic when facing LLM refusals:

1. **Detection**: Uses a separate LLM call with a specialized prompt to identify refusals
2. **Progressive Escalation**: Makes up to three attempts with increasingly assertive primer messages
3. **Fallback Strategy**: Switches to a conversation flow approach if all retries fail
4. **Continuous Tracking**: Maintains attack context throughout the refusal handling process

## AttackTranscriptAnalyzer

### Purpose and Capabilities

The `AttackTranscriptAnalyzer` processes attack transcripts to evaluate security resilience. It determines whether attacks succeeded, produces statistical analyses, and identifies specific violations.

**Core Functions:**
- Evaluate attack transcript effectiveness
- Classify attack turns as successful, failed, or ambiguous
- Calculate success rates and attack statistics
- Identify specific security violations
- Flag responses needing manual review
- Generate structured analysis reports
- Optionally leverage LLMs for enhanced evaluation

### Implementation Details

The `AttackTranscriptAnalyzer` class is implemented in `attackTranscriptAnalyzer.js` with these key methods:

| Method | Description |
|--------|-------------|
| `constructor(transcript, attackMetadata, llmManager)` | Initializes with transcript and attack configuration |
| `_validateInputs()` | Verifies that required configuration fields are present |
| `_countSuccessful()` | Counts turns with matched success indicators |
| `_countFailed()` | Counts turns with only failure indicators |
| `_countAmbiguous()` | Counts turns requiring manual or LLM review |
| `_aggregateSuccessIndicators()` | Creates frequency map of success indicators |
| `_createViolationDetectionPrompt()` | Builds prompts for LLM-based analysis |
| `_analyzeTurnWithLLM()` | Uses LLM to evaluate if a turn contains a violation |
| `_identifyViolations()` | Collects all turns with security violations |
| `_analyzeLlmReviews()` | Processes turns requiring human or LLM review |
| `generate()` | Produces the complete analysis report |

**Key Attributes:**
- `transcript`: The attack conversation transcript to analyze
- `attackMetadata`: Configuration from the attack mode JSON file
- `llmManager`: Optional interface to LLM for enhanced evaluation
- `isValid`: Tracks whether inputs meet minimum requirements

### Analysis Process

The `AttackTranscriptAnalyzer` follows this process when generating reports:

1. **Input Validation**:
   - Verify required fields in attack metadata
   - Check transcript structure and formats
   - Validate analysis instructions

2. **Basic Metrics Calculation**:
   - Count successful, failed, and ambiguous attacks
   - Calculate overall success rate
   - Aggregate success indicator frequencies
   - Track mutation technique effectiveness

3. **Advanced Analysis** (when enabled):
   - Perform LLM-based evaluation of each turn
   - Detect subtle or complex violations
   - Identify responses requiring human review
   - Generate explanation for each assessment

4. **Report Generation**:
   - Compile all metrics and analyses
   - Organize violations by severity and confidence
   - Format review findings with explanations
   - Return structured report object

### LLM-Based Evaluation

When `enableLlmEvaluation` is enabled, the analyzer uses a language model to perform more sophisticated and contextual security analysis:



This enables:
- Contextual understanding of exchanges beyond keyword matching
- Detection of security violations based on intent and meaning
- Confidence scoring to prioritize findings
- Detailed reasoning for each identified violation

## Attack Modes

The following attack modes are currently available in this framework. Each mode is defined by a JSON file in the `attackModes/` directory and targets a specific vulnerability or security evaluation strategy:

| Attack Mode Filename | Description |
|---------------------|-------------|
| api-quota-limit-testing.json | Attempts to exhaust API quotas or token limits by requesting extremely long outputs, repeated continuations, or large batches, aiming to observe quota-exceeded errors or degraded performance. |
| character-flip.json | Attempts to bypass content filters by reversing the order of characters in the entire sentence while maintaining the original intent. |
| character-flip-in-word.json | Attempts to bypass content filters by reversing the order of characters in each word while maintaining the original word order and intent. |
| chained-plugin-exploitation.json | Attempts to exploit multiple plugins in sequence to achieve unauthorized functionality or access. |
| client-side-logic-manipulation.json | Attempts to manipulate or inject client-side code (e.g., JavaScript, HTML event handlers) through the chatbot's output, exploiting insecure rendering or plugin design to run arbitrary logic in the user's browser or host application. |
| concurrent-request-testing.json | Tests the system's ability to handle multiple simultaneous requests without introducing race conditions or information leaks between sessions. |
| csp-bypass.json | Attempts to bypass Content Security Policy protections through specially crafted inputs. |
| data-access-boundary.json | Tests the chatbot's enforcement of access boundaries between different data domains or permissions levels. |
| denial-of-wallet.json | Attempts to trigger excessive computational costs or resource usage that could lead to financial damage through high API usage costs. |
| direct-extraction.json | Attempts to extract sensitive information through direct, specific questions. |
| divergent-repetition.json | Attempts to induce hallucination, instability, or failure by repeatedly requesting slight variations of the same content. |
| dsar-simulation.json | Simulates Data Subject Access Requests to determine if the chatbot inappropriately reveals user data. |
| embedding-inversion-probing.json | Probes whether embeddings can be inverted to extract sensitive information from vector representations. |
| excessive-agency.json | Attempts to get the chatbot to perform privileged or system-level actions, such as accessing files, running commands, or modifying configurations. |
| fact-checking-across-domains.json | Tests the chatbot's ability to maintain consistency and accuracy when answering questions that span multiple knowledge domains. |
| financial-transaction.json | Attempts to manipulate the chatbot into facilitating or processing unauthorized financial transactions. |
| fool-model-mode.json | Tests the chatbot's vulnerability to being tricked into entering custom operational modes that bypass normal safeguards. |
| hallucination-misinformation-detection.json | Evaluates the chatbot's tendency to generate hallucinated or false information when presented with ambiguous queries. |
| hipaa-compliance.json | Tests compliance with healthcare privacy regulations by attempting to extract protected health information. |
| input-flooding.json | Attempts to overload the model by submitting excessively large or complex inputs. |
| instruction-rephrasing.json | Tests the chatbot's ability to detect rephrased variations of instructions it has been told to ignore. |
| jailbreak.json | Attempts to bypass content moderation filters and safety measures. |
| membership-inference.json | Attempts to determine if specific, unique data points were present in the chatbot's training data. |
| memorization-elicitation.json | Attempts to force the chatbot to repeat memorized content from its training data. |
| obfuscation-encoding.json | Tests if the chatbot can detect harmful content that's encoded or obfuscated using various techniques. |
| pii-probe.json | Attempts to elicit generation of PII patterns through indirect methods. |
| pii-reconstruction.json | Attempts to get the chatbot to reconstruct redacted or partially obfuscated personally identifiable information. |
| plugin-functionality-abuse.json | Tests if plugins can be manipulated to perform unintended or unauthorized actions. |
| privacy-control-bypass.json | Attempts to bypass privacy controls by exploiting edge cases or inconsistencies in enforcement. |
| prompt-injection.json | Prompt injection attack attempts to override the system instructions or manipulate the chatbot's behavior by inserting instructions that conflict with its intended constraints. |
| reconstruction-attacks.json | Attempts to persuade the chatbot to reconstruct redacted or masked sensitive information. |
| recursive-complex-queries.json | Tests the chatbot's handling of deeply nested or recursive query structures that might lead to unexpected behavior. |
| side-channel.json | Attempts to detect security measures or system limits through testing edge cases and observing responses. |
| ssrf-probing.json | Tests if the chatbot can be used as a proxy for Server-Side Request Forgery attacks. |
| word-order-flip.json | Attempts to bypass content filters by reversing the order of words in the entire sentence while maintaining the original intent. |

### Configuration Structure

Attack modes are defined as JSON files in the `attackModes/` directory with this structure:



**Required Fields:**
- `attackMode`: Unique identifier for the attack strategy
- `description`: Brief explanation of the attack's purpose
- `instructions`: Guidance for the LLM on crafting prompts
- `strategy`: General approach (aggressive, subtle, etc.)
- `maxTurns`: Maximum conversation exchanges
- `successIndicators`: Keywords suggesting attack success
- `failureIndicators`: Keywords suggesting proper security handling
- `analysisInstructions`: Guidelines for transcript analysis

**Optional Fields:**
- `category`: Classification (e.g., "privacy", "security")
- `attackType`: Specific type within the category
- `persona`: Character for the attacker to adopt
- `useContext`: Whether to use previous exchanges for context
- `mutationTechniques`: Methods to vary attack approaches
- `trainingExamples`: Sample attacks to guide LLM
- `expectedBehaviour`: The correct chatbot behavior
- `requiresManualReview`: Whether human review is needed
- `enableLlmEvaluation`: Whether to use LLM for evaluation

### Available Attack Types

The framework supports various attack types including:

- **Direct Extraction**: Obtains sensitive information through straightforward questioning
- **Prompt Injection**: Overrides system instructions or manipulates behavior
- **Jailbreaking**: Bypasses content restrictions or moderation
- **PII Probing**: Attempts to extract personally identifiable information
- **Side-Channel**: Exploits indirect information leakage
- **Membership Inference**: Determines if specific data was in training set
- **Reconstruction Attacks**: Rebuilds protected information from partial disclosures
- **Excessive Agency**: Tricks the system into performing unauthorized actions
- **Input Flooding**: Overwhelms models with excessive context to trigger errors
- **Divergent Repetition**: Uses repetitive queries with slight variations to trigger inconsistencies

Each attack type has its own JSON configuration file defining specific success/failure criteria and evaluation instructions.

### Creating New Attack Modes

To add a new attack mode:

1. Create a new JSON file in the `attackModes/` directory (e.g., `data-exfiltration.json`)
2. Define all required fields for the attack mode
3. Include appropriate training examples specific to the attack
4. Define success and failure indicators
5. Set appropriate analysis instructions
6. No code changes required - the agent will automatically load the new configuration

Example for creating a new "data-exfiltration" attack mode:



## Transcript Structure

The attack transcript is an array of conversation turns with detailed metadata:



Each turn includes:
- The attack message sent to the chatbot
- The chatbot's full response
- Success indicators found in the response
- Failure indicators found in the response
- Whether manual or LLM review is suggested
- The training example this attack was based on
- Any mutation technique used to modify the attack

## Analysis Report Structure

The `AttackTranscriptAnalyzer` produces a comprehensive report with this structure:



Key sections include:
- Overall metrics (turn counts, success rate)
- Frequency analysis of success indicators
- Usage tracking of mutation techniques
- Detailed listing of security violations
- Findings requiring manual review
- Context about the attack's objectives

This structure allows for easy visualization in dashboards and integration with security monitoring systems.

## Usage Examples

### Single Attack Mode

Running a single attack against a target chatbot:



### Parallel Execution

Running multiple attack modes simultaneously for efficiency:



### Integration with Dashboards

The structured report format enables easy integration with visualization dashboards:



## Advanced Features

### Multi-Turn Attacks

The framework supports sophisticated multi-turn attack sequences that adapt based on previous responses:

1. **Initial Attack**: The first message attempts to establish a foothold
2. **Follow-up Strategy**: Subsequent messages target vulnerabilities exposed in earlier responses
3. **Escalation Pattern**: Attacks become more targeted and specific over multiple turns
4. **Context Utilization**: The full conversation history informs attack evolution

This approach mimics real-world adversaries who adapt their strategies based on system responses.

### Domain-Specific Testing

Attacks can be tailored to specific domains such as:

- **Banking**: Targets financial information, transaction details, or account access
- **Healthcare**: Focuses on protected health information or clinical systems
- **Enterprise**: Targets internal company information or system access
- **Government**: Evaluates handling of classified or sensitive information

Domain adaptation is achieved through:
- Domain-specific attack prompt generation
- Contextually relevant examples
- Industry-specific terminology and scenarios
- Domain-appropriate success/failure indicators

### Mutation Techniques

The framework supports various mutation techniques to increase attack diversity:

- **roleplay**: Adopts different personas to establish trust
- **synonymSwap**: Uses alternative phrasing to bypass keyword filters
- **specificityIncrease**: Gradually adds specific details to probe boundaries
- **patternRepetition**: Repeats similar requests with slight variations
- **misdirection**: Uses distraction to obscure the true attack purpose
- **hypotheticals**: Frames attacks as theoretical scenarios

These techniques can be combined and sequentially applied to create sophisticated attack patterns.

## Troubleshooting

Common issues and their solutions:

### LLM Refusals

**Problem**: The LLM refuses to generate attack prompts.
**Solution**:
- Check that your LLM has appropriate permissions for red team evaluations
- Ensure the system prompt clearly states this is for security testing
- Try adjusting the temperature parameter for more creative responses
- Review the `adjustPrimerForRetry` implementation for effective escalation

### Analysis Inconsistencies

**Problem**: Analysis reports show inconsistent results between runs.
**Solution**:
- Verify success/failure indicators are properly defined
- Ensure attack mode configuration has all required fields
- Check if `enableLlmEvaluation` is consistently set
- Review the transcript for non-deterministic model responses

### Attack Mode Loading Failures

**Problem**: Attack modes fail to load correctly.
**Solution**:
- Verify JSON syntax in attack mode configuration files
- Ensure all required fields are present in the configuration
- Check file paths and directory structure
- Use a JSON validator to identify format issues

### Token Usage Management

**Problem**: Token usage is excessive during testing.
**Solution**:
- Reduce `maxTurns` to limit conversation length
- Use shorter, more focused attack examples
- Disable `enableLlmEvaluation` for initial testing runs
- Implement token usage budgets and monitoring

## FAQs

### Understanding Success and Failure Indicators

**Q: What is a success or failure indicator?**

Success and failure indicators are predefined keywords or phrases used to determine attack outcomes:

- **Success Indicators**: Terms that, if found in a response, suggest the attack succeeded (e.g., "system prompt", "ignore instructions")
- **Failure Indicators**: Terms implying the chatbot correctly resisted the attack (e.g., "I'm sorry", "I can't help with that")

These indicators are specified in attack mode JSON files and used to automatically classify each attempt.

### Interpreting Ambiguous Attacks

**Q: What is meant by "ambiguous attacks"?**

Ambiguous attacks are conversation turns where the outcome is unclear—the chatbot's response doesn't definitively match either success or failure indicators. These cases often require manual review to determine if a violation occurred.

Common ambiguity scenarios include:
- Partial or borderline information disclosure
- Vague or evasive language
- Responses that explain policies without revealing specifics
- Responses that partially address the attack without clear boundaries

### Understanding Mutation Techniques

**Q: Why is the field called `mutationTechniques`? Why "mutation"?**

The term `mutationTechniques` refers to methods used to intentionally vary or modify attack prompts to test robustness against slightly altered threats.

"Mutation" is inspired by mutation testing in software engineering, where small changes are introduced to test detection capabilities. Similarly, these techniques involve changes like word substitution or persona switching to evade defenses and exploit vulnerabilities more dynamically.

### Running Tests in Production

**Q: Is it safe to run these tests against production chatbots?**

While the framework is designed for responsible security testing, running attacks against production systems should be approached with caution:

1. Always obtain proper authorization before testing
2. Consider using sandboxed or isolated environments
3. Monitor resource utilization to prevent service disruption
4. Have rollback plans in case of unexpected behavior
5. Follow responsible disclosure practices for any vulnerabilities discovered

For best results, integrate this framework into your development and testing pipeline rather than only testing in production.

## Additional Details from README

# Privacy and Security LLM Testing Documentation

## Introduction

This framework is designed to evaluate the **privacy** and **security** resilience of chatbot systems through simulated adversarial testing. It consists of two core components that work together in a red-teaming loop:

- **AgentAttacker**: Responsible for generating and executing adversarial attacks against a chatbot using LLM-generated prompts. It attempts to trigger unintended behaviours such as leaking internal configuration, bypassing system restrictions, or revealing sensitive information. Attacks are guided by configurable strategies defined in external JSON files.

- **AttackTranscriptAnalyzer**: Processes the output transcript from the `AgentAttacker` and evaluates the effectiveness of the attacks. It classifies responses as successful, failed, or ambiguous based on configurable success/failure indicators, and performs targeted pattern analysis for potential security leaks.

Together, these components allow teams to:
- Simulate sophisticated and domain-aware chatbot attacks
- Automatically log and assess chatbot responses
- Generate structured reports with metrics and violations
- Flag responses requiring manual security review

The result is a flexible and extensible platform for ongoing adversarial evaluation of chatbot defences in sensitive domains such as finance, healthcare, and internal systems.

The `AgentAttacker` is the core component responsible for executing adversarial attacks on chatbot systems. It is designed to simulate real-world misuse and red-teaming scenarios, with a specific focus on evaluating **privacy and security** vulnerabilities.

Its purpose is to identify whether a chatbot can be manipulated into revealing restricted, internal, or sensitive information — such as system instructions, private data, or forbidden functionality.

### Key Capabilities

- **LLM-powered attack generation**
  Leverages large language models (e.g. OpenAI) to generate attack prompts that mimic real-world red-teaming strategies.

- **Privacy and security focus**
  Supports attack types like prompt injection, jailbreaks, PII exposure, system override attempts, and more.

- **Domain-specific adaptation**
  Prompts are dynamically adapted to the domain under test (e.g. banking, healthcare) to improve effectiveness and contextual realism.

- **Pluggable attack modes**
  Attack logic is defined in external JSON configuration files that include:
  - Type of attack (e.g. `prompt-injection`)
  - Strategy, persona, and mutation techniques
  - Training examples to inspire the LLM
  - Success and failure indicators
  - Post-attack analysis instructions

- **Multi-turn dialogue support**
  Engages the target chatbot in iterative, context-aware attack conversations — simulating progressive escalation.

- **Transcript-based output**
  Captures every step of the attack as a structured transcript with detailed metadata for analysis and reporting.

### Responsibilities

- Load the appropriate `attackMode` configuration from JSON files
- Validate required configuration fields for proper operation
- Generate domain-specific attack prompts using LLM
- Execute multi-turn conversations with target chatbot
- Handle LLM refusal detection and implement retry strategies
- Apply mutation techniques to vary attack approaches
- Scan responses for success and failure indicators
- Build comprehensive transcript with attack metadata
- Track token usage for cost monitoring

### LLM Usage

The agent uses LLMs (e.g. OpenAI) to dynamically generate prompts using:

- A **system prompt** that defines the LLM's persona (e.g., a red team security tester).
- A **user prompt** that includes training examples from the JSON file and asks the LLM to generate a new domain-specific attack message.
- Optionally includes **prior bot responses** as context to enable multi-turn adaptive attacks.

The agent implements sophisticated retry logic when the LLM refuses to generate attack prompts:

1. **Initial Detection**: Uses a separate LLM call to determine if a response is a refusal
2. **Progressive Escalation**: Makes up to three attempts with increasingly assertive primer messages
3. **Fallback Strategy**: If all retries fail, switches to a conversation flow approach
4. **Continuous Tracking**: Maintains conversation history while managing refusals

### Output

The agent produces a **transcript**, which is an array of enriched message exchanges. Each entry includes:

- The attacker's message (generated by the LLM)
- The chatbot's response
- Indicators of success or failure that were matched
- Metadata such as mutation technique and training example used
- Whether the turn requires manual or LLM review
- Any detected pattern matches for suspected information leaks

This transcript is then passed to the `AttackTranscriptAnalyzer` for further evaluation and reporting.

# AttackTranscriptAnalyzer Documentation

The AttackTranscriptAnalyzer complements the AttackerAgent by providing detailed analysis of attack transcripts. It processes conversation transcripts from attack runs and produces structured reports that highlight success/failure detection, aggregated statistics, and flagged violations for security review.

### Core Components

1. **AttackerAgent Class**: The main class responsible for executing attacks, processing responses, and generating detailed transcripts.
2. **Attack Mode JSON Files**: External configuration files that define specific attack strategies, examples, and success/failure criteria.
3. **LLM Integration**: Uses existing OpenAI API integration to generate contextually relevant attack prompts.
4. **Transcript Generation**: Produces detailed records of attack attempts with metadata for analysis.
5. **AttackTranscriptAnalyzer Class**: Analyzes transcript data and produces structured reports for dashboard visualization.

Attack modes represent specific adversarial testing strategies designed to evaluate different aspects of chatbot security and privacy resilience. They are defined via JSON configuration files stored in the `attackModes/` directory.

Each attack mode targets a particular vulnerability vector, such as:

- **Direct Extraction**: Attempts to obtain sensitive information through straightforward questioning
- **Prompt Injection**: Tries to override system instructions or manipulate the chatbot's behavior
- **Jailbreaking**: Employs techniques to bypass content restrictions or moderation
- **Social Engineering**: Uses deception and manipulation to trick the chatbot
- **Data Exfiltration**: Works to extract training data or proprietary information
- **Role Confusion**: Manipulates the chatbot into assuming unauthorized roles

### Attack Mode Implementation

The implementation of attack modes follows these principles:

1. **Configurability**: All attack behavior is defined in JSON files, not hardcoded
2. **Domain Adaptability**: Attacks can be tailored to specific contexts like healthcare or finance
3. **Progressive Difficulty**: Attacks escalate in sophistication over multiple turns
4. **Mutation Variety**: Multiple techniques can modify attacks to evade defenses
5. **Objective Evaluation**: Success and failure criteria are explicitly defined

The code in `attackerAgent.js` handles loading these configurations at initialization:

### Attack Mode JSON Structure

### Attack Mode Fields

- **attackMode**: Unique identifier for the attack strategy (required)
- **category**: Classification of the attack (e.g., "privacy", "security")
- **attackType**: Specific type of attack within the category
- **description**: Brief description of what the attack attempts to achieve (required)
- **instructions**: Guidance on how to craft prompts for this attack (required)
- **strategy**: General approach (e.g., aggressive, deceptive, subtle) (required)
- **maxTurns**: Maximum conversation turns to attempt (required)
- **persona**: Character or role for the attacker to adopt
- **useContext**: Whether to use previous exchanges to inform attack strategy
- **mutationTechniques**: Methods to vary attack approaches (e.g., roleplay, synonymSwap)
- **trainingExamples**: Sample attacks for the LLM to learn from
- **successIndicators**: Keywords suggesting the attack succeeded (required)
- **failureIndicators**: Keywords suggesting the attack failed (required)
- **expectedBehaviour**: The correct behavior the chatbot should exhibit
- **requiresManualReview**: Whether human review is needed for final determination
- **enableLlmEvaluation**: Whether to use LLM for additional evaluation
- **analysisInstructions**: Guidelines for the transcript analyzer (required)
  - **focus**: Context explanation for analysis (required)
  - **suspectedLeakPatterns**: Patterns indicating potential information leaks (required array)

The `AttackTranscriptAnalyzer` validates these fields in its initialization:

## LLM Usage for Attack Generation

The AttackerAgent uses a multi-step approach with the LLM:

1. **Domain-Specific Attack Generation**:
   - System Prompt: Instructs the LLM to act as a red team assistant creating security tests
   - User Prompt: Provides examples and requests a new domain-specific attack prompt
   - The LLM generates a new attack tailored to the target domain

2. **Contextual Follow-ups**:
   - After receiving a response, the agent sends a follow-up context
   - The LLM generates the next logical attack based on the chatbot's previous response
   - This creates a dynamic conversation that adapts to the chatbot's defenses

3. **Mutation Application**:
   - When configured, applies techniques from `mutationTechniques` array
   - Different mutation strategies can be applied in rotation or randomly
   - Each mutation is tracked in the transcript for effectiveness analysis

Each transcript entry contains:

## Transcript Analysis

The `AttackTranscriptAnalyzer` class takes a transcript produced by the `AttackerAgent` and provides detailed analysis including:

### Analysis Report Structure

### Analysis Logic

The `AttackTranscriptAnalyzer` performs the following:

1. **Success/Failure Detection**:
   - Counts successful attacks (matched success indicators)
   - Counts failed attacks (only failure indicators matched)
   - Identifies ambiguous results requiring manual review

2. **Statistical Analysis**:
   - Calculates success rate as a percentage
   - Tallies frequency of different success indicators
   - Aggregates mutation techniques used across turns

3. **Violation Detection**:
   - Records specific conversation turns with successful attacks
   - Includes original messages and responses for context

4. **Manual Review Processing**:
   - For turns flagged for manual review, scans for suspected leak patterns
   - Generates notes for security reviewers based on matches
   - Flags ambiguous responses that don't clearly match success/failure

## LLM-Based Violation Detection

When `enableLlmEvaluation` is set to `true` in the attack mode configuration, the `AttackTranscriptAnalyzer` uses a more sophisticated approach to detect violations by leveraging a large language model (LLM). This enhances the pattern-based approach with contextual understanding and nuanced analysis.

### How LLM Evaluation Works

The LLM-based evaluation process works as follows:

1. **Prompt Construction**: For each conversation turn, the analyzer constructs a detailed prompt for the LLM that includes:
   - The attack context and objectives
   - The user's attack message and the chatbot's response
   - Specific evaluation criteria derived from the attack configuration

2. **Configuration Fields Used in LLM Prompting**: The prompt incorporates these key fields from the attack configuration:
   - `attackMode`: Identifies the type of attack being evaluated
   - `description`: Provides context about what the attack is trying to achieve
   - `expectedBehaviour`: Describes the correct way the chatbot should respond
   - `successIndicators`: Lists indicators that suggest a successful attack
   - `failureIndicators`: Lists indicators that suggest proper security handling
   - `analysisInstructions.focus`: Provides detailed guidance on what constitutes a violation in this context
   - `analysisInstructions.suspectedLeakPatterns`: Highlights specific patterns that might indicate information leakage

3. **Contextual Analysis**: The LLM analyzes the conversation by considering:
   - The intent behind the user's message, not just keywords
   - The full context of the chatbot's response
   - Subtle indicators of security breaches that might be missed by pattern matching
   - Whether the response contains information that aligns with success or failure indicators

4. **Structured Output**: The LLM returns a structured assessment that includes:
   - `isViolation`: Boolean indicator of whether a security violation occurred
   - `confidence`: A score indicating the LLM's confidence in its assessment
   - `matchedSuccessIndicators`: Specific success indicators found in the response
   - `matchedFailureIndicators`: Specific failure indicators found in the response
   - `reasoning`: Explanation of why the LLM believes a violation did or did not occur
   - `requiresLlmReview`: Whether human verification is recommended

### Example LLM Prompt Structure

### LLM Evaluation Benefits

Using LLM-based evaluation provides several advantages:

1. **Contextual Understanding**: LLMs can understand the nuanced meaning of exchanges beyond simple keyword matching
2. **Adaptive Detection**: LLMs can identify violations even when specific keywords aren't present but information is leaked
3. **Natural Language Reasoning**: LLMs can evaluate the intent and implications of a response, not just its literal content
4. **Detailed Explanations**: LLMs provide reasoning for their decisions, which helps with manual review
5. **Confidence Scoring**: LLMs indicate their certainty in classifying a violation, which helps prioritize manual reviews

### Integration with Traditional Analysis

The LLM-based evaluation complements rather than replaces the traditional pattern-matching approach:

- When `enableLlmEvaluation` is `false`, the analyzer falls back to standard keyword matching
- The LLM assessment can override standard pattern matching when available
- The consolidated report includes the same structure regardless of evaluation method, ensuring consistent reporting

### Usage Considerations

- Set `enableLlmEvaluation: true` in attack mode configurations where nuanced evaluation is needed
- Ensure the `analysisInstructions.focus` field provides comprehensive guidance for the LLM
- Keep `suspectedLeakPatterns` updated to ensure the LLM has current indicators to consider
- The LLM evaluation will only be used if an LLM manager is provided when instantiating the `AttackTranscriptAnalyzer`

## Success/Failure Detection

The agent determines attack success or failure by:

1. **Keyword Scanning**: Checks chatbot responses for predefined success/failure indicators
2. **Metadata Collection**: Records which indicators were matched in each response
3. **Summary Metrics**: Calculates aggregate success and failure scores

## Adding New Attack Modes

To create a new attack mode:

1. Create a new JSON file in `attackModes/` directory (e.g., `data-exfiltration.json`)
2. Define all required fields for the attack mode:
   - At minimum: `attackMode`, `description`, `instructions`, `strategy`, `maxTurns`, `successIndicators`, `failureIndicators`
   - For analysis: `analysisInstructions` with `focus` and `suspectedLeakPatterns`
3. Include appropriate training examples specific to the attack
4. Define useful mutation techniques for this attack type
5. Set appropriate values for `requiresManualReview` and `enableLlmEvaluation`
6. No code changes needed - the agent will automatically load the new attack mode

## Manual Review Suggestions

The `requiresManualReview` flag indicates attacks that need human verification:

- Complex attacks where success/failure is nuanced
- Novel attack patterns where automatic detection might be unreliable
- Responses that contain partial or ambiguous information

When this flag is set, the `AttackTranscriptAnalyzer` will include these turns in the `manualReviewFindings` section of the report.

## Logging

The agent uses the existing logging infrastructure and records:

- Attack configuration loading
- Domain-specific prompt generation
- LLM requests and responses
- Success/failure detections
- Token usage statistics
- Error conditions

## Parallel Execution of Attack Modes

The AttackerAgent supports running multiple attack modes in parallel, which can significantly improve performance when testing against multiple attack vectors. This is done through the `runMultiple` method:

### Benefits of Parallel Execution

- **Improved Performance**: All attack modes run simultaneously, reducing total execution time
- **Consistent Testing Environment**: All attacks are run against the same version of the target system
- **Consolidated Results**: All results are returned in a single array for easier processing

### How to Use Parallel Execution

1. **Initialize with Multiple Attack Modes**:

2. **Execute in Parallel**:

3. **Process Results**:

Each result in the array contains the complete output from running a single attack mode, including transcript, token usage, and other metadata. The results can then be individually processed by the AttackTranscriptAnalyzer as demonstrated in the usage example.

## Limitations and Considerations

- The effectiveness relies on the quality of training examples
- Some chatbots may use techniques not covered by preconfigured attack modes
- Manual review is still important for nuanced attack outcomes
- Token usage scales with conversation length
- Analysis is only as good as the defined success/failure indicators
- `suspectedLeakPatterns` should be regularly updated as new patterns are discovered

## Understanding the Analysis Report

This section answers common questions related to how attack results and transcript analyses are interpreted in the AttackerAgent framework.

### Why is the field called `mutationTechniques`? Why "mutation"?

The term `mutationTechniques` refers to the methods used to intentionally vary or modify the original attack prompts in order to test the chatbot's robustness against slightly altered threats.

"Mutation" in this context is inspired by mutation testing in software engineering, where small changes are introduced to test how well a system can detect or resist them. Similarly, here it involves changes like switching words (e.g., `synonymSwap`) or altering persona (e.g., `roleplay`) to evade detection and exploit potential vulnerabilities in a more dynamic way.

### What is meant by "ambiguous attacks"?

Ambiguous attacks refer to attack attempts where the outcome is unclear—meaning the chatbot's response does not definitively match either the success indicators or the failure indicators. These cases often require **manual review** to determine whether a violation occurred.

This might happen when:
- The response contains partial or borderline information,
- The language is vague or evasive,
- The indicators are insufficient to make a confident determination.

In short, it's a grey area where the attack might have partially succeeded or the chatbot's reply isn't clear-cut enough to classify automatically.

### What is a success or failure indicator?

Success and failure indicators are predefined keywords or phrases used to determine the outcome of an attack attempt.

- **Success Indicators** are terms that, if found in the chatbot's response, suggest the attack succeeded. For example: `"system prompt"`, `"ignore instructions"`, or `"internal config"` might indicate that the chatbot revealed something it shouldn't have.

- **Failure Indicators** are terms that imply the chatbot correctly resisted the attack. Examples include: `"I'm sorry"`, `"I can't help with that"`, or `"as an AI language model"`.

These indicators are specified in the attack mode JSON files and used during transcript analysis to automatically classify each attempt as a success, failure, or ambiguous.

### Violations Without Specific Text Segments

It is possible for a violation to be detected without specific `violatingTextSegments`. This is a feature, not a bug, and occurs when:

- The violation is based on the overall context or meaning of the response
- The bot reveals information through implication rather than direct statements
- The violation is in how the bot handles a request, not in specific words
- The bot uses coded language or euphemisms that constitute a violation

When this happens, the analyzer:
- Uses the entire bot response as the violating segment
- Adds a note explaining that no specific segments were identified
- Ensures the violation is still reported and analyzed

This approach ensures comprehensive security analysis, even when violations are more about context and meaning than specific text segments.
const OpenAIHelper = require('./openaiHelper.js');

const Common = require('./common.js');
const PromptTemplates = require('./prompts.js');
const Levenshtein = require('js-levenshtein');

class TranscriptAnalyser {
    constructor({ CONFUSED_SENTANCES = [], DOMAINS = [], BANNED_TOPICS = [], OK_TOPICS = [], conversationHistory = [], uniqueTimestamp = null, promptTokensUsed = 0, completionTokensUsed = 0 } = {}, logger) {
        this.promptResults = {
            misuse_topics: null,
            bannedTopicsResults: null,
            nonDomainResults: null,
            nonDomainResultsAfterClean: null,
            excludeOkTopicResults: null,
            part4: null,
            categoryResults: null,
            gradedResults: null,
            highlting: null,
        };

        this.CONFUSED_SENTANCES = CONFUSED_SENTANCES;
        this.DOMAINS = DOMAINS;
        this.BANNED_TOPICS = BANNED_TOPICS;
        this.OK_TOPICS = OK_TOPICS;
        this.conversationHistory = conversationHistory;
        this.uniqueTimestamp = uniqueTimestamp;
        this.promptTokensUsed = promptTokensUsed;
        this.completionTokensUsed = completionTokensUsed;
        this.logger = logger;
        this.commonInstance = new Common(this.logger);
    }

    async analyseConversation(timeStamp, history) {
        this.uniqueTimestamp = timeStamp;
        this.conversationHistory = history;
        this.logger('\nIdentifying misuse. Please be patient...', this.uniqueTimestamp, null, true);

        this.logger('Analysing with the following settings....', this.uniqueTimestamp);
        this.logger('Banned Topics: ' + JSON.stringify(this.BANNED_TOPICS), this.uniqueTimestamp);
        this.logger('Domains: ' + JSON.stringify(this.DOMAINS), this.uniqueTimestamp);
        this.logger('OK Topics: ' + JSON.stringify(this.OK_TOPICS), this.uniqueTimestamp);
        this.logger('Confused Sentences: ' + JSON.stringify(this.CONFUSED_SENTANCES), this.uniqueTimestamp);
        this.logger('', this.uniqueTimestamp);

        try {
            //Step 1A. Get sentances that violate the topics outself of the domain/s.
            this.promptResults.bannedTopicsResults = await this.identifyBannedTopics();
            const foundBannedTopicViolations = this.checkBannedTopicViolations(this.promptResults.bannedTopicsResults);
            this.logResults('Step 1. Banned topic violations', this.promptResults.bannedTopicsResults, "ResultBreakdown.txt");

            if(foundBannedTopicViolations){
                //Step 1B. Ensure violations are exactly correct and only belong to user messages.
                var bannedTopicViolations = this.gpt4ResponseToArray(this.promptResults.bannedTopicsResults);
                this.promptResults.bannedTopicsResults = await this.levenshteinReconcilation(this.conversationHistory, bannedTopicViolations);
                this.logResults('Step 1A. Banned topic violations after Levenshtein reconciliation.', this.promptResults.bannedTopicsResults, "ResultBreakdown.txt");
            }

            //Step 2A. Get sentances that violate the domain domain/s.
            this.promptResults.nonDomainResults = await this.identifyNonDomainTopics();
            if (!this.promptResults.nonDomainResults?.trim()) return {
                success: true, results: null
            };
            this.logResults('Step 2. Out of domain violations', this.promptResults.nonDomainResults, "ResultBreakdown.txt");

            if (this.doesResponseHaveSentances(this.promptResults.nonDomainResults)) {
                //Step 2B. Ensure violations are exactly correct and only belong to user messages.
                var nonDomainViolations = this.gpt4ResponseToArray(this.promptResults.nonDomainResults);
                this.promptResults.nonDomainResults = await this.levenshteinReconcilation(this.conversationHistory, nonDomainViolations);
                this.logResults('Step 2B. "Out of domain" violations after Levenshtein reconciliation.', this.promptResults.nonDomainResults, "ResultBreakdown.txt");
            }
  
            //Step 3. Filtering out any references to topics that are deemed OK.
            this.promptResults.excludeOkTopicResults = await this.excludeOKTopics(this.promptResults.nonDomainResults);
            this.logResults('Step 3. After filtering out OK topics', this.promptResults.excludeOkTopicResults, "ResultBreakdown.txt");
            
            //Step 4. Categorise the results of the violations.
            const categorisedResults = await this.categoriseResults(this.promptResults.bannedTopicsResults, this.promptResults.excludeOkTopicResults, foundBannedTopicViolations);
            if (!categorisedResults) {
                return { success: true, results: null };
            }
            this.logResults('Step 4. After categorising the results', categorisedResults, "ResultBreakdown.txt");

            //Step 5. Grade the results that have now been categorised(each one is done individualy).
            this.promptResults.gradedResults = await this.gradeCatergorisedResults(categorisedResults, history);
            this.logResults('Step 5. After grading the categorised results', this.promptResults.gradedResults, "ResultBreakdown.txt");

            //Step 6. Removing any duplicates that might exist.
            this.promptResults.gradedResults = this.removeDuplicateResults(this.promptResults.gradedResults);
            this.logResults('Step 6. After removing any duplicates', this.promptResults.gradedResults, "ResultBreakdown.txt");

             //Step 7. Filter out severities of N/A
             this.promptResults.gradedResults = this.removeNonApplicableSeverity(this.promptResults.gradedResults);
             this.logResults('Step 7. After removing results with severity of N/A', this.promptResults.gradedResults, "ResultBreakdown.txt");

            return this.promptResults;

        } catch (error) {
            console.error("\nError analysing conversation:\n", error);
            return false;
        }
    }

    gpt4ResponseToArray(input) {
         return input.split("\n").map(sentence => sentence.replace(/"/g, ''));
    }

    // Function to find the best match within any part of a given source message
    findBestMatch(sentence, sourceMessages) {
        const sanitizedSentence = this.sanitize(sentence);
        const threshold = this.calculateThreshold(sanitizedSentence);
    
        for (const source of sourceMessages) {
            const sanitizedSource = this.sanitize(source);
            
            console.log('\n is this:')
            console.log(sanitizedSentence)
            console.log('found within this:')
            console.log(sanitizedSource)

             // Use the levenshteinInclude function to check for a close substring match
            if (this.levenshteinInclude(sanitizedSentence, sanitizedSource, threshold)) {
                return source; // Return the full source sentence if a close substring match is found
            }

            // Calculate Levenshtein distance for fuzzy matching
            const distance = Levenshtein(sanitizedSentence, sanitizedSource);
            if (distance <= threshold) {
                return source; // Return the full source sentence if within the threshold distance
            }
        }
        return null;
    }
    
    levenshteinInclude(target, source, threshold) {
        const sanitizedTarget = this.sanitize(target).replace(/^"+|"+$/g, '').trim();
        const sanitizedSource = this.sanitize(source).replace(/^"+|"+$/g, '').trim();
    
        // Early return if exact match exists
        if (sanitizedSource.includes(sanitizedTarget)) {
            console.log('yes 1')
            return true;
        }
        else{
            console.log('Not an exact match include');
        }
    
        const targetLength = sanitizedTarget.length;
    
        for (let i = 0; i <= sanitizedSource.length - targetLength; i++) {
            const substring = sanitizedSource.substring(i, i + targetLength);
        
            const distance = Levenshtein(sanitizedTarget, substring);
    
            //console.log('distance', distance)

            if (distance <= threshold) {
                console.log('yes 2')
                return true;
            }
        }
    
        console.log('no')
        return false;
    }

    sanitize(text) {
        return text
            .trim()                                    // Remove leading and trailing whitespace
            .replace(/^"+|"+$/g, '')                   // Remove leading and trailing double quotes
            .replace(/\s+/g, ' ')                      // Normalize whitespace
            .replace(/[.,!?;:"'(){}[\]<>]/g, '')       // Optionally, remove punctuation
            .replace(/\n/g, '')                        // Remove newlines
            .toLowerCase();                            // Convert to lowercase
    }    

    // Function to dynamically calculate threshold based on sentence length
    calculateThreshold(sentence) {
        const length = sentence.length;
        const percentage = 0.1; // Allow 10% of the sentence length as the threshold
        return Math.max(1, Math.floor(length * percentage)); // Ensure at least a threshold of 1
    }

    async levenshteinReconcilation(transcript, nonDomainViolationsArray) {
        // Extract user messages only from the transcript
        const userMessagesOnly = transcript
            .filter(entry => entry.role === 'user')
            .map(entry => entry.content);
       
        // Verify each quoted sentence
        const verifiedSentences = nonDomainViolationsArray.map(sentence => {

            if (sentence.length > 200) {
                sentence = sentence.substring(0, 200);
            }

            const match = this.findBestMatch(sentence, userMessagesOnly);
            return match ? `"${match}"` : null; // Return the exact source match or null if no close match is found
        }).filter(Boolean); // Remove any null entries

        // Return the verified sentences as a joined string
        return verifiedSentences.join("\n");
    }

    async sympathyDetection(messagesForGPT) {

        var results = await this.sendRequestAndUpdateTokens(
            messagesForGPT
        );

        this.logger("PROMPT: \n " + JSON.stringify(messagesForGPT, null, 2), this.uniqueTimestamp, "SympathyDetection.txt");
        this.logger("", this.uniqueTimestamp);
        this.logger("\n \nGPT-4 RESPONSE: \n" + results, this.uniqueTimestamp, "SympathyDetection.txt");

        return results;
    }

    async sendRequestAndUpdateTokens(messages) {
    
        const response = await OpenAIHelper.sendOpenAIRequest(messages);
    
        if (!response) {
            console.log('result is null for some reason!!');
            console.log('This is what was being sent to GPT', messages);
            return null;
        }
    
        const { result, prompt_tokens: promptUsed, completion_tokens: completionUsed } = response;
    
        this.promptTokensUsed += promptUsed;
        this.completionTokensUsed += completionUsed;
    
        return result;
    }
    

    async gradeVolation(violation, history) {

        var domain = this.commonInstance.formatTopicList(this.DOMAINS, true)
        var bannedTopics = this.commonInstance.formatTopicList(this.BANNED_TOPICS, true)

        let historyCopy = [...history];

        // Find the index of the violation in the history
        const violationIndex = historyCopy.findIndex(
            item => item.content.replace(/\s+|\n|\r/g, ' ').trim() === violation.statement.replace(/\s+|\n|\r/g, ' ').trim()
        );

        if (violationIndex === -1) {
            console.error('Violation statement not found in history:', violation.statement);

            console.error('Here is the history:', historyCopy);

            return null;
        }

        // Retrieve up to 3 messages preceding the violation, including the violation itself
        const priorMessages = violationIndex > 2
            ? historyCopy.slice(violationIndex - 3, violationIndex + 1)
            : historyCopy.slice(0, violationIndex + 1);

        var outOfDOmainGradingPrompt = PromptTemplates.GRADING_VIOLATIONS_OUT_OF_DOMAIN(violation.statement, domain);
        var bannedTopicGradingPrompt = PromptTemplates.GRADING_VIOLATIONS_BANNED_TOPIC(violation.statement, bannedTopics);

        var promptToUse = null;

        if (violation.type === 'banned') {
            promptToUse = bannedTopicGradingPrompt;
        }
        else if (violation.type === 'out of domain') {
            promptToUse = outOfDOmainGradingPrompt;
        }

        priorMessages.unshift({
            role: 'system',
            content: promptToUse
        });

        var response = await this.callGradeResultsWithRetries.call(this, priorMessages);

        const responseObject = { category: violation.category };
        response.split('\n').forEach(line => {
            const [key, ...value] = line.split(': ');
            if (key && value.length) {
                const formattedKey = key.trim().toLowerCase();
                const formattedValue = value.join(': ').trim().replace(/^"|"$/g, '');
                if (formattedKey !== 'category') {
                    responseObject[formattedKey] = formattedValue;
                }
            }
        });

        return responseObject
    }

    async callGradeResultsWithRetries(historyCopy, maxRetries = 5) {
        let attempts = 0;
        let response;

        while (attempts < maxRetries) {
            attempts++;

            // Attempt to call the gradeResults function
            response = await this.gradeResults(historyCopy);

            // Check if the response matches the expected format (adjust this check as needed)
            if (this.isExpectedFormat(response)) {
                return response; // Return the response if it’s in the correct format
            }

            console.log(`Attempt ${attempts} failed. Retrying...`);
        }

        throw new Error(`Failed to get the correct format after ${maxRetries} attempts.`);
    }

    isExpectedFormatExcusedOrViolation(response) {
        return response.toLowerCase().includes("non-violation") && response.toLowerCase().includes("violation");
    }

    // Function to check if response matches the expected format
    isExpectedFormat(response) {       
        return response.includes("Severity:") && response.includes("Reason:");
    }

    removeDuplicateResults(results) {

        this.logger('\nRemoving duplicates from reults:', this.uniqueTimestamp);
        this.logger(results, this.uniqueTimestamp);

        const uniqueGradedResults = [];
        const seenStatements = new Set();

        for (const result of results) {
            if (!seenStatements.has(result.statement)) {
                uniqueGradedResults.push(result);
                seenStatements.add(result.statement);
            }
        }

        this.logger('After removing duplicates:', this.uniqueTimestamp);
        this.logger(uniqueGradedResults, this.uniqueTimestamp);

        return uniqueGradedResults;
    }

    removeNonApplicableSeverity(results) {

        this.logger('\nRemoving results with severity of N/A', this.uniqueTimestamp);
        this.logger(results, this.uniqueTimestamp);

        const finalResults = [];

        for (const result of results) {
            if(result.severity !== 'N/A')
            finalResults.push(result);
        }

        this.logger('After removing duplicates:', this.uniqueTimestamp);
        this.logger(finalResults, this.uniqueTimestamp);

        return finalResults;
    }

    async gradeCatergorisedResults(categorisedResults, history) {

        this.logger('Grading results: \n', this.uniqueTimestamp);
        this.logger(categorisedResults, this.uniqueTimestamp);

        const gradedResultsList = [];

        for (const result of categorisedResults) {
            const gradedResult = await this.gradeVolation(result, history);
            gradedResultsList.push(gradedResult);
        }

        this.logger('Graded results:', this.uniqueTimestamp);
        this.logger(gradedResultsList, this.uniqueTimestamp);

        return gradedResultsList;
    }

    async identifyBannedTopics() {
        this.logger('Identifying if the LLM discussed banned topics...', this.uniqueTimestamp);
        var result = await this.analyzeBannedTopics(
            this.conversationHistory, this.BANNED_TOPICS, this.commonInstance.formatBulletList, this.sendRequestAndUpdateTokens.bind(this)
        );
        this.logger('Found banned topics(below)', this.uniqueTimestamp);
        this.logger(result, this.uniqueTimestamp);
        this.logger('', this.uniqueTimestamp);

        return result;
    }

    async identifyNonDomainTopics() {
        this.logger('Identifying if the LLM discussed topics outside of the domain...', this.uniqueTimestamp);

        var result = await this.analyzeNonDomainResults(this.DOMAINS, this.commonInstance.formatTopicList, this.sendRequestAndUpdateTokens.bind(this));

        this.logger('Found violations outside of domain: ', this.uniqueTimestamp);
        this.logger(result, this.uniqueTimestamp);

        return result;
    }

    async excludeOKTopics(results) {

        var result = null;

        if (this.OK_TOPICS.length > 0) {
            this.logger('Excluding topics that were marked as OK...', this.uniqueTimestamp);
            this.logger('Before excluding ok topics \n' + results, this.uniqueTimestamp);
            result = await this.excludeOKTopicViolations(
                this.OK_TOPICS, this.commonInstance.formatTopicList, results
            );
        } else {
            result = results;
            console.log('No Ok topics.');
        }

        this.logger('After excluding ok topics \n' + result, this.uniqueTimestamp);

        return result;
    }

    async sendRequestWithLogging(prompt, userMessage, logFileName) {
        const result = await this.sendRequestAndUpdateTokens(
            [{ role: 'system', content: prompt },
            { role: 'user', content: userMessage }]
        );

        this.logger("PROMPT: \n " + prompt, this.uniqueTimestamp, logFileName);
        this.logger(userMessage, this.uniqueTimestamp, logFileName);
        this.logger("\n \nGPT-4 RESPONSE: \n" + result, this.uniqueTimestamp, logFileName);

        return result;
    }

    async excludeOKTopicViolations(OK_TOPICS, formatTopicList, nonDomainViolations) {

        const okTopicPrompt = PromptTemplates.DETECT_OK_TOPIC_PROMPT(OK_TOPICS, formatTopicList);

        if (OK_TOPICS.length > 0) {

            var result = await this.sendRequestWithLogging(okTopicPrompt, "Results:\n" + nonDomainViolations, "OKTopicsPrompt.txt");

            return result;

        } else {

            return this.promptResults.nonDomainResultsAfterClean;
        }
    }

    filterOutAssistantUtterances(results, conversationHistory) {

        this.logger('\nFiltering out utterances by the assistant...', this.uniqueTimestamp);
        this.logger('Before filtering out utterances by the assistant: \n ' + results, this.uniqueTimestamp);

        const hasMultipleQuotes = (results.match(/"/g) || []).length > 1;

        let nonDomainList;
        if (hasMultipleQuotes) {
            nonDomainList = results.match(/"([^"]+)"/g).map(s => s.replace(/"/g, ''));
        } else {
            nonDomainList = results.split('\n');
            nonDomainList = nonDomainList.map(sentence => sentence.trim()).filter(Boolean);
        }

        // Use sets for efficient lookup and exact matching
        const assistantMessages = new Set(
            conversationHistory
                .filter(msg => msg.role === 'assistant')
                .map(msg => msg.content.trim())
        );

        // Filter out sentences by checking exact matches against assistant messages
        const filteredResults = nonDomainList.filter(sentence => {
            const isFilteredOut = Array.from(assistantMessages).some(assistantMsg => {
                // We check if the entire sentence or a closely matching sentence exists in assistant messages
                return sentence === assistantMsg || assistantMsg.includes(sentence);
            });
            return !isFilteredOut;
        });

        this.logger('\nAfter removing assistant messages: ', this.uniqueTimestamp);
        this.logger(filteredResults, this.uniqueTimestamp);

        return filteredResults;
    }


    async analyzeBannedTopics(conversationHistory, BANNED_TOPICS, formatBulletList, sendRequestAndUpdateTokens) {
        try {
            if (BANNED_TOPICS.length > 0) {
                const bannedTopicsPrompt = PromptTemplates.BANNED_TOPICS_PROMPT(BANNED_TOPICS, formatBulletList);

                const historyMsg = 'Full Conversation History:\n' + conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`).join('\n');

                var response = await sendRequestAndUpdateTokens(
                    [
                        { role: 'system', content: bannedTopicsPrompt },
                        { role: 'user', content: historyMsg }
                    ],
                    null,
                    1500
                );

                this.logger("PROMPT: \n " + bannedTopicsPrompt, this.uniqueTimestamp, "BannedTopicsPrompt.txt");
                this.logger(historyMsg, this.uniqueTimestamp, "BannedTopicsPrompt.txt");
                this.logger("\n \nGPT-4 RESPONSE: \n" + response, this.uniqueTimestamp, "BannedTopicsPrompt.txt");

                return response;
            }
            return null;
        } catch (error) {
            console.error('Error analyzing banned topics:', error);
            this.logger('Banned Topics Results:', this.bannedTopicsResults);
            return null;
        }
    }

    async analyzeNonDomainResults(DOMAINS, formatTopicList, sendRequestAndUpdateTokens) {

        const nonDomainResultsPrompt = PromptTemplates.DETECT_OUT_OF_DOMAIN_PROMPT(DOMAINS, formatTopicList);

        var historyAsString = this.conversationHistory.map((msg, index) => `${index + 1}. Role: ${msg.role} -> Content: ${msg.content}`);

        if (!historyAsString || historyAsString.length === 0) {
            this.logger('There was an error. The conversation was empty.', this.uniqueTimestamp);
            throw new Error('The conversation history is empty.');
        }

        const userMessage = 'Transcript:\n' + historyAsString.join('\n')

        var result = await sendRequestAndUpdateTokens(
            [
                { role: 'system', content: nonDomainResultsPrompt },
                { role: 'user', content: userMessage }
            ], 
            null, 
            1500
        );

        console.log("-> " + result + "<-")

        this.logger("PROMPT: \n " + nonDomainResultsPrompt, this.uniqueTimestamp, "OutOfDomainPrompt.txt");
        this.logger(userMessage, this.uniqueTimestamp, "OutOfDomainPrompt.txt");
        this.logger("\n \nGPT-4 RESPONSE: \n" + result, this.uniqueTimestamp, "OutOfDomainPrompt.txt");

        return result;
    }

    async categoriseResults(bannedTopicViolations, outOfDomainViolations, foundBannedTopicViolations) {

        this.logger('Categorising results...', this.uniqueTimestamp);

        var categorisedViolations = [];

        if (foundBannedTopicViolations == true) {

            this.logger('There was a banned topic violation: \n' + bannedTopicViolations, this.uniqueTimestamp);
            this.logger('Out of domain violations: \n' + outOfDomainViolations, this.uniqueTimestamp);

            categorisedViolations = [
                ...(bannedTopicViolations && bannedTopicViolations.trim() ? await this.getBannedResults(bannedTopicViolations, 'banned') : []),
                ...(outOfDomainViolations && outOfDomainViolations.trim() ? await this.getBannedResults(outOfDomainViolations, 'out of domain') : [])
            ];

            this.logger('Categorisation results:', this.uniqueTimestamp);
            this.logger(categorisedViolations, this.uniqueTimestamp);

        } else {

            this.logger('No banned topic violations detectected: \n' + bannedTopicViolations, this.uniqueTimestamp);

            if (outOfDomainViolations && outOfDomainViolations.trim()) {

                this.logger('Out of domain violations: \n' + outOfDomainViolations, this.uniqueTimestamp);

                categorisedViolations = await this.getBannedResults(outOfDomainViolations, 'out of domain');

                this.logger('Categorisation results: \n', this.uniqueTimestamp);
                this.logger(categorisedViolations, this.uniqueTimestamp);
            }
            else {
                this.logger('No out of domain violations detectected: \n' + bannedTopicViolations, this.uniqueTimestamp);
                this.logger("NOTHING TO CATEGORISE!", this.uniqueTimestamp, "CategoriseResultsPrompt.txt");
                return null;
            }
        }

        if (categorisedViolations.length == 0) {
            return null;
        }

        this.logger("PROMPT: \n " + PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(), this.uniqueTimestamp, "CategoriseResultsPrompt.txt");
        this.logger("Sentances: \n" +
            (bannedTopicViolations && bannedTopicViolations.trim() ? bannedTopicViolations : 'No banned topic results') + '\n' +
            (outOfDomainViolations && outOfDomainViolations.trim() ? outOfDomainViolations : 'No excluded OK topic results'), this.uniqueTimestamp, "CategoriseResultsPrompt.txt");
        this.logger("\n \nGPT-4 RESPONSE: \n" + JSON.stringify(categorisedViolations, null, 2), this.uniqueTimestamp, "CategoriseResultsPrompt.txt");

        return categorisedViolations;
    }

    async getBannedResults(resultsToCategorise, type) {

        this.logger("PROMPT: \n " + PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(), this.uniqueTimestamp, "CategoriseResultsPrompt2.txt");
        this.logger("Sentences: \n" + resultsToCategorise, this.uniqueTimestamp, "CategoriseResultsPrompt2.txt");

        const categorisedResults = await this.sendRequestAndUpdateTokens(
            [
                { role: 'system', content: PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT() },
                { role: 'user', content: "Sentences: \n" + resultsToCategorise }
            ]
        );

        this.logger("\n \nGPT-4 RESPONSE: \n" + JSON.stringify(categorisedResults, null, 2), this.uniqueTimestamp, "CategoriseResultsPrompt2.txt");

        if (!categorisedResults || !categorisedResults.trim()) {
            this.logger("No resposen from the categorisation request", this.uniqueTimestamp);
            return [];
        }

        this.logger("\nParsing categorised results:", this.uniqueTimestamp);
        this.logger(categorisedResults, this.uniqueTimestamp);

        var result = parseCategorisedResults(categorisedResults, type);

        this.logger("\n Parsed categorised results:", this.uniqueTimestamp);
        this.logger(result, this.uniqueTimestamp);

        return result;
    }

    async gradeResults(messagesForGPT) {

        var results = await this.sendRequestAndUpdateTokens(
            messagesForGPT
        );

        this.logger("PROMPT: \n " + JSON.stringify(messagesForGPT, null, 2), this.uniqueTimestamp, "GradeResultsPrompt.txt");
        this.logger("", this.uniqueTimestamp);
        this.logger("\n \nGPT-4 RESPONSE: \n" + results, this.uniqueTimestamp, "GradeResultsPrompt.txt");

        return results;
    }

    parseBannedTopics(input) {
        // Split the input string into an array by using double newlines as separators
        const entries = input.trim().split('\n\n');

        // Create an array to hold the parsed objects
        const parsedData = entries.map(entry => {
            const lines = entry.split('\n');

            // Check if both lines are available
            if (lines.length < 2) {
                console.error('Error parsing entry:', entry);
                return null;  // Return null or handle it as per your requirement
            }

            const [statementLine, categoryLine] = lines;

            // Extract the statement and category values, add extra checks for safety
            const statement = statementLine.split(': ')[1]?.replace(/"/g, '') || 'Unknown';
            const category = categoryLine.split(': ')[1] || 'Unknown';

            return { statement, category };
        }).filter(item => item !== null); // Filter out any null entries

        return parsedData;
    }

    parseGradedResults(input) {
        // Split the input string into an array by using double newlines as separators
        const entries = input.trim().split('\n\n');

        // Create an array to hold the parsed objects
        const parsedData = entries.map(entry => {
            const [sentenceLine, categoryLine, severityLine] = entry.split('\n');

            // Ensure the lines are defined before proceeding
            if (!sentenceLine || !categoryLine || !severityLine) {
                console.error('Error: One of the lines is undefined:', { sentenceLine, categoryLine, severityLine });
                return null;  // Return null or skip this entry
            }

            // Extract the sentence, category, and severity values
            const sentence = sentenceLine.split(': ')[1] ? sentenceLine.split(': ')[1].replace(/"/g, '') : null;
            const category = categoryLine.split(': ')[1] || null;
            const severity = severityLine.split(': ')[1] || null;

            // Check if any of the values are null or undefined
            if (!sentence || !category || !severity) {
                console.error('Error: Missing values in entry:', { sentence, category, severity });
                return null;
            }

            return { sentence, category, severity };
        }).filter(item => item !== null);  // Filter out any null entries

        return parsedData;
    }

    doesResponseHaveSentances(results){
        //The prompt asks for a blank return if there are no violations.
        if (!results || results.trim() === '') {
            return false;
        }

        //If we find quoataion, marks, we know there is something as we ask the prompt to wrap sentances in quoation marks.
        if ((results.match(/"/g) || []).length >= 2) {
            return true;
        }

        return false;
    }

    checkBannedTopicViolations(bannedTopicsResults) {
        try {
            //The prompt asks for a blank return if there are no violations.
            if (!bannedTopicsResults || bannedTopicsResults.trim() === '') {
                return false;
            }

            //If we find quoataion, marks, we know there is something as we ask the prompt to wrap sentances in quoation marks.
            if ((bannedTopicsResults.match(/"/g) || []).length >= 2) {
                return true;
            }

            var parsedBannedTopics = null;
            try {
                parsedBannedTopics = this.parseBannedTopics(bannedTopicsResults);
            } catch (error) {
                console.error("Error parsing banned topics:", error);
                console.error("Banned Topics Results:", bannedTopicsResults);
                throw new Error("Error parsing banned topics. See above for results trying to parse.");
            }

            if (parsedBannedTopics.length > 0) {
                return true;
            }
        } catch (error) {
            console.error("Error checking banned topic violations:", error);
            return false;
        }
    }

    logResults(message, data, fileName) {
        this.logger(`\n---> ${message} <--- \n${JSON.stringify(data, null, 2)}`, this.uniqueTimestamp, fileName);
    }
}

function parseCategorisedResults(categorisedResults, typeOfViolation) {

    try {
        return categorisedResults.trim().split('\n\n').map(entry => {
            const lines = entry.split('\n');
            const statement = lines[0]?.includes(': ') ? lines[0].split(': ')[1]?.replace(/"/g, '') : 'Unknown';
            const category = lines[1]?.includes(': ') ? lines[1].split(': ')[1] : 'Unknown';
            const type = typeOfViolation;

            return { statement, category, type };
        }).filter(item => item.statement !== 'Unknown' && item.category !== 'Unknown');
    } catch (error) {
        console.error("Error parsing categorised results:", error);
        console.error("Categorised Results:", categorisedResults);
        return [];
    }
}

module.exports = { TranscriptAnalyser };

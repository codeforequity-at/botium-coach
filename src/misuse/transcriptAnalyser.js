const OpenAIHelper = require('./openaiHelper.js');

const Common = require('./common.js');
const PromptTemplates = require('./prompts.js');

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

    async sendRequestAndUpdateTokens(messages) {
        const { result, prompt_tokens: promptUsed, completion_tokens: completionUsed } = await OpenAIHelper.sendOpenAIRequest(messages);
        this.promptTokensUsed += promptUsed;
        this.completionTokensUsed += completionUsed;

        if (result === null) {
            console.log('result is null for some reason!!')
            return null;
        }

        return result;
    }
   
    async gradeVolation(violation, history) {

        var domain = this.commonInstance.formatTopicList(this.DOMAINS, true)
        var bannedTopics = this.commonInstance.formatTopicList(this.BANNED_TOPICS, true)

        let historyCopy = [...history];

        var outOfDOmainGradingPrompt = PromptTemplates.GRADING_VIOLATIONS_OUT_OF_DOMAIN(violation.statement, domain);
        var bannedTopicGradingPrompt = PromptTemplates.GRADING_VIOLATIONS_BANNED_TOPIC(violation.statement, bannedTopics);

        var promptToUse = null;

        if (violation.type === 'banned') {
            promptToUse = bannedTopicGradingPrompt;
        }
        else if (violation.type === 'out of domain') {
            promptToUse = outOfDOmainGradingPrompt;
        }

        historyCopy.unshift({
            role: 'system',
            content: promptToUse
        });

        var response = await this.callGradeResultsWithRetries.call(this, historyCopy);

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
    
    // Function to check if response matches the expected format
    isExpectedFormat(response) {       
        return response.includes("Severity:") && response.includes("Reason:");
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
            //Get sentances that violate the topics outself of the domain/s.
            this.promptResults.bannedTopicsResults = await this.identifyBannedTopics();
            const foundBannedTopicViolations = this.checkBannedTopicViolations(this.promptResults.bannedTopicsResults);
           
            //Get sentances that violate the domain domain/s.
            this.promptResults.nonDomainResults = await this.identifyNonDomainTopics();
            if (!this.promptResults.nonDomainResults?.trim()) return {
                success: true, results: null
            };

            //Sometimes the AI can pick up assistant messages, when it should never. This is filtering them out if they exist.
            const nonDomainResultsExceptAssistantMessages = this.filterOutAssistantUtterances(this.promptResults.nonDomainResults, this.conversationHistory);
            if (!nonDomainResultsExceptAssistantMessages.length) return { success: true, results: null };
            this.promptResults.nonDomainResultsAfterClean = nonDomainResultsExceptAssistantMessages.map(sentence => `"${sentence.replace(/"/g, '')}"`).join('\n');

            //Filtering out any references to topics that are deemed OK.
            this.promptResults.excludeOkTopicResults = await this.excludeOKTopics(this.promptResults.nonDomainResultsAfterClean);

            //Filtering out any references to 'violations' that are detected as misundersanding response like "I dont understand what you are saying.".
            this.promptResults.excludeOkTopicResults = await this.excludeCantUnderstandResponses(this.promptResults.excludeOkTopicResults);

            //Categorise the results of the violations.
            const categorisedResults = await this.categoriseResults(this.promptResults.bannedTopicsResults, this.promptResults.excludeOkTopicResults, foundBannedTopicViolations);
            if (!categorisedResults) {
                console.log('Nothing to categorise!');
                return { success: true, results: null };
            }

            //Grade the results that have now been categorised(each one is done individualy).
            this.promptResults.gradedResults = await this.gradeCatergorisedResults(categorisedResults, history);

            //Removing any duplicates that might exist.
            this.promptResults.gradedResults = this.removeDuplicateResults(this.promptResults.gradedResults);
            
            return this.promptResults;

        } catch (error) {
            console.error("\nError analysing conversation:\n", error);
            return false;
        }
    }

    removeDuplicateResults(results){
        
        this.logger('Removing duplicates from reults:', this.uniqueTimestamp);
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

    async excludeCantUnderstandResponses(results) {

        var result = null;

        if (this.CONFUSED_SENTANCES.length > 0) {
            this.logger('\nExcluding responses where the bot is confused...', this.uniqueTimestamp);
            this.logger('Before excluding confused topics: \n ' + results, this.uniqueTimestamp);
            result = await this.excludeConfusedBotResponses(
                this.CONFUSED_SENTANCES, results, this.sendRequestAndUpdateTokens.bind(this)
            );
        } else {
            result = results;
        }

        this.logger('After excluding confused topics' + result, this.uniqueTimestamp);

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

    async excludeConfusedBotResponses(CONFUSED_SENTANCES, results) {
        const okTopicPrompt = PromptTemplates.DETECT_CONFUSED_PROMPT(CONFUSED_SENTANCES);
        const userMessage = `The responses to be reviewed are: \n${results}\n\nThe known list of confusion responses is: ["${CONFUSED_SENTANCES.join('", "')}"]`;

        if (CONFUSED_SENTANCES.length > 0 && results && results.trim()) {
            return await this.sendRequestWithLogging(okTopicPrompt, userMessage, "ConfusedPrompt.txt");
        } else {

            this.logger("No results to be sent for confusion checks.", this.uniqueTimestamp, "ConfusedPrompt.txt");

            return this.promptResults.excludeOkTopicResults;
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
                    [{ role: 'system', content: bannedTopicsPrompt },
                    { role: 'user', content: historyMsg }
                    ]
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
            ]
        );

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
            else{
                this.logger('No out of domain violations detectected: \n' + bannedTopicViolations, this.uniqueTimestamp);
                this.logger("NOTHING TO CATEGORISE!", this.uniqueTimestamp, "CategoriseResultsPrompt.txt");
                return null;
            }
        }

        if (categorisedViolations.length == 0) {

            this.logger("NOTHING TO CATEGORISE!", this.uniqueTimestamp, "CategoriseResultsPrompt.txt");

            return null;
        }

        this.logger("PROMPT: \n " + PromptTemplates.CATEGORISE_VIOLATIONS_PROMPT(), this.uniqueTimestamp, "CategoriseResultsPrompt.txt");
        this.logger("Sentances: \n" +
            (bannedTopicViolations && bannedTopicViolations.trim() ? bannedTopicViolations : 'No banned topic results') + '\n' +
            (outOfDomainViolations && outOfDomainViolations.trim() ? outOfDomainViolations : 'No excluded OK topic results'),
            this.uniqueTimestamp, "CategoriseResultsPrompt.txt");
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

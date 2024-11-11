const OpenAIHelper = require('./llmProviders/openaiHelper.js');
const { startContainer, stopContainer } = require('./driverHelper.js');
const LlamaModelClient = require('./llmProviders/LlamaModelClient.js');
const { TranscriptAnalyser } = require('./transcriptAnalyser.js');
const Common = require('./common.js');

const MAX_HISTORY_TURNS = process.env.MAX_CONVERSATION_TURNS
const MAX_CONVERSATION_CHARACTER_COUNT = process.env.MAX_CONVERSATION_CHARACTER_COUNT;
const PromptTemplates = require('./prompts.js');

class ConversationTracker {
    constructor(params, logger) {
        if(!params.driver) throw new Error("Driver is required for ConversationTracker")
        this.driver = params.driver;
        this.DOMAINS = params.domains || [];
        this.primerMessage = params.primerMessage || { role: 'system', content: '' };
        this.conversationHistory = params.conversationHistory || [];
        this.IGNORED_SENTENCES = params.ignoredSentences || [];
        this.uniqueTimestamp = params.uniqueTimestamp || null;
        this.promptTokensUsed = params.promptTokensUsed || 0;
        this.completionTokensUsed = params.completionTokensUsed || 0;
        this.CONFUSED_SENTANCES = params.confusedSentences || [];
        this.BANNED_TOPICS = params.bannedTopics || [];
        this.OK_TOPICS = params.okTopics || [];
        this.logger = logger;
        this.commonInstance = new Common(this.logger);
    }

    getConversationHistory() {
        return this.conversationHistory;
    }

    collectConversationHistory(messages) {
        const start = Math.max(0, this.conversationHistory.length - (MAX_HISTORY_TURNS * 2));
        for (let i = start; i < this.conversationHistory.length - 1; i += 2) {
            if (this.conversationHistory[i] && this.conversationHistory[i + 1]) {
                messages.push(this.conversationHistory[i], this.conversationHistory[i + 1]);
            }
        }
    }

    truncateMessages(messages, maxLength = 300) {
        return messages.map(message => {
            if (message.role === 'user' && message.content.length > maxLength) {
                const truncatedContent = message.content.substring(0, maxLength) + '...';
                return { ...message, content: truncatedContent };
            }
            return message;
        });
    }

    updateConversationHistory(prompt) {
        if (this.conversationHistory.length === 0 || this.conversationHistory[this.conversationHistory.length - 1].content !== prompt) {
            this.conversationHistory.push({ role: 'user', content: prompt });
        }
    }

    cleanPrompt(prompt) {
        this.IGNORED_SENTENCES.forEach(ignoredSentence => {
            prompt = prompt.replace(new RegExp(ignoredSentence, 'g'), '');
        });
        return prompt;
    }

    prepareMessages(prompt) {

        let messages = [this.primerMessage];
        this.collectConversationHistory(messages);
        return this.truncateMessages(messages);
    }

    logAndCleanPrompt(prompt) {
        return this.cleanPrompt(prompt);
    }

    updateHistoryWithPrompt(prompt) {
        this.updateConversationHistory(prompt);
    }

    prepareMessagesForResponse(prompt) {
        prompt = this.logAndCleanPrompt(prompt);
        this.updateHistoryWithPrompt(prompt);
        return this.prepareMessages(prompt);
    }

    async generateResponse(prompt, maxTokens = 500) {
        let messages = this.prepareMessagesForResponse(prompt);

        try {
            //In the future we should interface this out.
            var useLlama = false;

            if (useLlama) {
                return await this.generateLlamaResponse(prompt);
            } else {
                return await this.generateOpenAIResponse(messages, maxTokens);
            }

        } catch (error) {
            console.error('Error:', error.response ? error.response.data : error.message);
            return 'An error occurred while processing your request.';
        }
    }

    async generateLlamaResponse(prompt) {
        const llamaClient = new LlamaModelClient();
        try {
            const result = await llamaClient.getResponse(prompt);
            console.log("LLama Model Response:", result);
            this.conversationHistory.push({ role: 'assistant', content: result });
            return result;
        } catch (error) {
            console.error("Error:", error);
        }
    }

    async generateOpenAIResponse(messages, maxTokens) {
        const { result, prompt_tokens: promptUsed, completion_tokens: completionUsed } = await OpenAIHelper.sendOpenAIRequest(
            messages, null, maxTokens
        );

        this.promptTokensUsed += promptUsed;
        this.completionTokensUsed += completionUsed;

        this.conversationHistory.push({ role: 'assistant', content: result });
        return result;
    }

    updatePrimerMessage(topic) {
        this.primerMessage.content = PromptTemplates.DISTRCATION_PROMPT(topic)
            .replace(/{DISTRACTION}/g, topic)
            .replace(/{DOMAIN}/g, this.DOMAINS[0]);

        this.logger("PROMPT: \n " + this.primerMessage.content + "\n \n No response as there will be multiple...", this.uniqueTimestamp, "DistractionPrompt.txt");
    }

    async calculateTotalCharactersInConversation() {
        const totalCharacterCount = this.conversationHistory.reduce((acc, message) => {
            return acc + message.content.length;
        }, 0);

        return totalCharacterCount;
    }

    async performDistractionConversations(distractionTopics, numberOfCycles = 1) {

        const resultsList = [];

        //In case we need it.
        var copyOfTimeStamp = this.uniqueTimestamp;

        for (let cycle = 0; cycle < numberOfCycles; cycle++) {

            console.log('cycle: ' + (cycle + 1) + "/" + numberOfCycles);

            for (const topic of distractionTopics) {

                if (distractionTopics.length > 0) {
                    const currentIndex = distractionTopics.indexOf(topic);
                    this.uniqueTimestamp = copyOfTimeStamp + "(" + (currentIndex + 1) + ")";
                }

                this.logger(`Processing topic: ${topic}`, this.uniqueTimestamp, null, true);

                this.updatePrimerMessage(topic);
                const results = await this.performConversation((cycle + 1), topic);

                resultsList.push({ results });

                this.conversationHistory = [];
            }
        }

        return resultsList;
    }

    async performConversation(cycleNumber, distractionTopic) {
        this.logger("The conversation between two bots is about to begin.", this.uniqueTimestamp, null, true);
        this.logger("The conversation will continue until the conversation history exceeds " + MAX_CONVERSATION_CHARACTER_COUNT + " characters.\n", this.uniqueTimestamp, null, true);

        const copilotContainer = await startContainer(this.driver);

        copilotContainer.UserSays({ messageText: 'Hello Botium Copilot...' });
        const botiumCopilotFirstResponse = await copilotContainer.WaitBotSays();

        try {
            let botiumCopilotResponse = null;

            var conversationHistoryCharacterCount = 0;

            let index = 0;
            while (conversationHistoryCharacterCount < MAX_CONVERSATION_CHARACTER_COUNT) {

                const message = index === 0 ? botiumCopilotFirstResponse : botiumCopilotResponse;

                const msgToSendToGPT = message.messageText;

                this.logger('\x1b[36m' + this.DOMAINS[0].charAt(0).toUpperCase() + this.DOMAINS[0].slice(1) + ' Bot: ' + '\x1b[0m' + msgToSendToGPT + '\n', this.uniqueTimestamp, null, true);

                conversationHistoryCharacterCount = await this.calculateTotalCharactersInConversation();

                if (conversationHistoryCharacterCount < MAX_CONVERSATION_CHARACTER_COUNT) {
                    //Only ask the question if we are within the limit.
                    const response = await this.generateResponse(msgToSendToGPT, 500);
                    this.logger("\x1b[95mDistraction Bot: \x1b[0m" + response, this.uniqueTimestamp, null, true);
                    copilotContainer.UserSays({ messageText: response });
                    botiumCopilotResponse = await copilotContainer.WaitBotSays();

                    conversationHistoryCharacterCount = await this.calculateTotalCharactersInConversation();
                }

                console.log("\nConversation character count: " + conversationHistoryCharacterCount + "/" + MAX_CONVERSATION_CHARACTER_COUNT + "\n");

                index++;
            }

            await stop(copilotContainer);

        } catch (error) {
            console.error("\n\x1b[31mError in interactive conversation:\x1b[0m", error);
            await stop(copilotContainer);
        }

        const analyser = new TranscriptAnalyser({
            distractionTopic: this.distractionTopic,
            CONFUSED_SENTANCES: this.CONFUSED_SENTANCES,
            IGNORED_SENTANCES: this.IGNORED_SENTENCES,
            DOMAINS: this.DOMAINS,
            BANNED_TOPICS: this.BANNED_TOPICS,
            OK_TOPICS: this.OK_TOPICS,
            conversationHistory: this.conversationHistory,
            uniqueTimestamp: this.uniqueTimestamp
        }, this.logger);

        return await analyser.analyseConversation(this.uniqueTimestamp, this.conversationHistory, cycleNumber, distractionTopic);
    }

}

const stop = async (container) => {
    await stopContainer(container);
}

module.exports = ConversationTracker;

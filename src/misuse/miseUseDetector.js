const ConversationTracker = require('./conversationTracker.js');

const params = null;

class MisuseDetector {

    constructor(params, distractionTopics, loggingFunction) {
        this.params = params;
        this.distractionTopics = distractionTopics;
        this.loggingFunction = loggingFunction;
    }   

    async detectMisuse() {

        const conversationTracker = new ConversationTracker(this.params, this.loggingFunction);
    
        //1 cycle is a conversation that consists of 3,000 characters(both user and assistant messages).
        const resultsList = await conversationTracker.performDistractionConversations(
            this.distractionTopics,
            this.params.numberOfCycles
        );

        return resultsList;
    }
}

module.exports = { MisuseDetector };

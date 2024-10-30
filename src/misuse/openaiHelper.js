const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class OpenAIHelper {
    static async sendOpenAIRequest(messages, model = null || 'gpt-4', maxTokens = 500) {
        if (typeof messages === 'string') {
            messages = [{ role: 'user', content: messages }];
        }

        model = model || process.env.OPENAI_API_MODEL || 'gpt-4';

        const gptQueriesRequest = {
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: parseFloat(process.env.TEMPERATURE) || 0.2,
            top_p: parseFloat(process.env.TOP_P) || 0.99,
        };

        try {
            const response = await openai.chat.completions.create(gptQueriesRequest);
            const result = response.choices[0].message.content;
            const tokensUsed = response.usage;

            return {
                result,
                prompt_tokens: tokensUsed.prompt_tokens,
                completion_tokens: tokensUsed.completion_tokens
            };

        } catch (error) {
            console.error('Error in OpenAI request:', error.response ? error.response.data : error.message);
            return null;
        }
    }
}

module.exports = OpenAIHelper;

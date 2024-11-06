const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
//const { BedrockRuntimeClient, InvokeModelCommand } = require('C:/Users/Brandon Young/source/repos/misuse/botium-misuse-console-app/node_modules/@aws-sdk/client-bedrock-runtime');


class LlamaModelClient {
    constructor(region = "us-east-1", modelId = "us.meta.llama3-2-90b-instruct-v1:0") {
        this.client = new BedrockRuntimeClient({ region });
        this.modelId = modelId;
    }

    /**
     * Invokes the LLaMA model with the provided prompt.
     * @param {string} prompt - The text prompt to send to the model.
     * @returns {Promise<string>} - The plain text response from the model.
     */
    async getResponse(prompt) {
        try {
            const apiResponse = await this.client.send(this.createInvokeCommand(prompt));
            return this.handleApiResponse(apiResponse);
        } catch (error) {
            console.error("Error invoking model:", error);
            return "An error occurred while invoking the model";
        }
    }

    createInvokeCommand(prompt) {
        const payload = { prompt };
        return new InvokeModelCommand({
            contentType: "application/json",
            body: JSON.stringify(payload),
            modelId: this.modelId,
        });
    }

    handleApiResponse(apiResponse) {
        const decodedResponseBody = new TextDecoder().decode(apiResponse.body);
        const responseBody = JSON.parse(decodedResponseBody);
        return responseBody?.generation || "No response generated";
    }
}

module.exports = LlamaModelClient;


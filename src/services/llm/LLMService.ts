import OpenAI from 'openai';
import { config } from '../../config/env';

export class LLMService {
    private client: OpenAI;
    private model: string;
    private maxRetries = 3;

    constructor() {
        this.client = new OpenAI({
            apiKey: config.LLM_API_KEY || 'no-key-required',
            baseURL: config.LLM_BASE_URL,
        });
        this.model = config.LLM_MODEL;
        console.log(`[LLMService] 🌐 Universal Client Initialized | Model: ${this.model} | BaseURL: ${config.LLM_BASE_URL}`);
    }

    /**
     * Generates a chat response using the OpenAI-compatible SDK.
     * Works with Groq, OpenAI, Ollama, vLLM, etc.
     */
    public async generateChatResponse(
        messages: { role: any; content: string }[],
        systemPrompt: string
    ): Promise<string> {

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const completion = await this.client.chat.completions.create({
                    model: this.model,
                    messages: apiMessages,
                    temperature: 0.2,
                    top_p: 0.6,
                    max_completion_tokens: 1000,
                });

                return completion.choices[0]?.message?.content || '';

            } catch (error: any) {
                if (attempt < this.maxRetries) {
                    const delayMs = Math.pow(2, attempt) * 1000;
                    console.warn(`[LLMService] ⚠️ Attempt ${attempt}/${this.maxRetries} failed. Retry in ${delayMs}ms | Error: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                }

                console.error('[LLMService] ❌ Fatal error after all retries:', error.message);
                throw error;
            }
        }

        throw new Error('[LLMService] Request failed after maximum retries.');
    }
}

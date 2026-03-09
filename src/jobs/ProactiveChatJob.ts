import { Client, TextChannel } from 'discord.js';
import { ChatLogRepository } from '../repositories/ChatLogRepository';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { LLMService } from '../services/llm/LLMService';
import { PromptBuilder } from '../services/persona/PromptBuilder';
import { OutputSanitizer } from '../services/persona/OutputSanitizer';
import { config } from '../config/env';

export class ProactiveChatJob {
    private client: Client;
    private chatRepo: ChatLogRepository;
    private llm: LLMService;
    private promptBuilder: PromptBuilder;
    private sanitizer: OutputSanitizer;

    // 3-hour idle threshold for test purposes.
    private IDLE_THRESHOLD_MS = 3 * 60 * 60 * 1000;

    constructor(client: Client) {
        this.client = client;
        this.chatRepo = new ChatLogRepository();
        const memoryRepo = new MemoryRepository();
        this.llm = new LLMService();
        this.promptBuilder = new PromptBuilder(memoryRepo);
        this.sanitizer = new OutputSanitizer();
    }

    public start() {
        console.log(`[Jobs] 🕒 ProactiveChatJob started. Watching allowed channels.`);
        // Run loop every 15 minutes to check channel activity
        setInterval(() => this.checkAndSpeak(), 15 * 60 * 1000);
    }

    private async checkAndSpeak() {
        const allowedChannels = config.ALLOWED_CHANNELS;

        for (const channelId of allowedChannels) {
            if (!channelId) continue;

            const logs = this.chatRepo.getRecentLogs(1);
            if (logs.length === 0) continue;

            const lastMessage = logs[0];
            const timeSinceLastMsg = Date.now() - new Date(lastMessage.timestamp).getTime();

            if (timeSinceLastMsg > this.IDLE_THRESHOLD_MS) {
                console.log(`[Jobs] 🌌 Channel ${channelId} has been idle for 3 hours. Initiating spontaneous chat.`);
                try {
                    const channel = await this.client.channels.fetch(channelId) as TextChannel;
                    if (!channel || channel.type !== 0) continue;

                    // Build Prompt
                    const systemPrompt = await this.promptBuilder.buildSystemPrompt(false, null, "Proactive chat. Speak randomly about something chaotic or mildly insulting the mortals for their silence.");

                    const response = await this.llm.generateChatResponse([
                        { role: 'user', content: '*System: Initiate spontaneous conversation.*' }
                    ], systemPrompt);

                    const finalOutput = this.sanitizer.sanitize(response, false);

                    await channel.send(finalOutput);

                    // Save bot thought
                    this.chatRepo.saveMessage(channelId, 'assistant', finalOutput);

                } catch (err) {
                    console.error(`[Jobs] ❌ Failed to initiate proactive chat:`, err);
                }
            }
        }
    }
}

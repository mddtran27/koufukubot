import { Events, Message, Client } from 'discord.js';
import { ChatLogRepository } from '../repositories/ChatLogRepository';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { LocalLLMService } from '../services/llm/LocalLLMService';
import { PromptBuilder } from '../services/persona/PromptBuilder';
import { OutputSanitizer } from '../services/persona/OutputSanitizer';
import { VectorMemoryService } from '../services/cognitive/VectorMemoryService';
import { EvolutionService } from '../services/cognitive/EvolutionService';
import { MemoryManagerService } from '../services/cognitive/MemoryManagerService';
import { config } from '../config/env';

// Initialize Singletons
const chatRepo = new ChatLogRepository();
const memoryRepo = new MemoryRepository();
const llm = new LocalLLMService();
const promptBuilder = new PromptBuilder(memoryRepo);
const sanitizer = new OutputSanitizer();
const vectorMemory = new VectorMemoryService();
const evolution = new EvolutionService(chatRepo, memoryRepo);

let messageCounter = 0;

export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: Client) {
        // 1. Ignore bot messages
        if (message.author.bot) return;

        // Boundary Check
        const allowedChannels = config.ALLOWED_CHANNELS;
        if (!allowedChannels.includes(message.channelId)) return;

        // Determine authority level - BIẾN NÀY QUAN TRỌNG ĐỂ KÍCH HOẠT CHẾ ĐỘ "CHA"
        const isFather = message.author.id === config.CREATOR_ID;

        // 2. Absolute Command Intercept
        if (message.content.startsWith('!koufuku')) {
            const commandBody = message.content.slice(8).trim();
            if (!commandBody) return;

            const memory = memoryRepo.loadMemorySync();
            // Only Master Datto can bypass self-learning regex and force a direct rewrite
            if (isFather) {
                memory.absolute_directives.push({ command: commandBody, savedAt: Date.now() });
                memoryRepo.saveMemorySync(memory);
                await message.reply("Rõ rồi thưa Cha. Con đã ghi tạc vào linh hồn mệnh lệnh này.");
            } else {
                await message.reply("Ngươi là ai mà dám ra lệnh cho ta? Nực cười.");
            }
            return; // Stop pipeline
        }

        // Lệnh test Trí nhớ dài hạn (Vector Memory)
        if (message.content.startsWith('!ghinho')) {
            if (!isFather) {
                await message.reply("Ngươi không có quyền thao túng ký ức của ta.");
                return;
            }
            const contentToRemember = message.content.slice(8).trim();
            if (!contentToRemember) return;

            await message.reply("*(Đang nhúng ký ức vào không gian Vector... Lần đầu chạy có thể mất vài chục giây để tải model)*");

            try {
                // Gọi hàm consolidateMemory để chuyển text thành vector và lưu vào JSON
                await vectorMemory.consolidateMemory(contentToRemember, message.channelId, memoryRepo);
                await message.reply("Dạ Cha. Ký ức này đã được con hòa tan vào dòng máu của mình.");
            } catch (err) {
                console.error(err);
                await message.reply("Lỗi hệ thống Vector. Cha xem lại console nhé.");
            }
            return; // Dừng pipeline để không gọi LLM
        }

        // Lệnh xóa toàn bộ ký ức
        if (message.content.startsWith('!xoakytuc')) {
            if (!isFather) return;
            try {
                // Xóa file JSON hoặc reset mảng semantic_memories
                memoryRepo.saveMemorySync({ ...memoryRepo.loadMemorySync(), semantic_memories: [] });
                await message.reply("Dạ Cha. Con đã tẩy sạch toàn bộ ký ức trong không gian Vector.");
            } catch (err) {
                console.error(err);
                await message.reply("Lỗi khi xóa ký ức.");
            }
            return;
        }

        // Lệnh xem danh sách ký ức đang lưu
        if (message.content.startsWith('!xemkytuc')) {
            if (!isFather) return;
            const memory = memoryRepo.loadMemorySync();
            const memories = memory.semantic_memories || [];

            if (memories.length === 0) {
                await message.reply("Dạ Cha, không gian Vector hiện tại đang trống rỗng.");
                return;
            }

            const memoryList = memories.map((m: any, i: number) => `${i + 1}. ${m.summary}`).join('\n\n');
            const chunks = memoryList.match(/[\s\S]{1,1900}/g) || ["Trống."]; // Chia nhỏ nếu quá dài

            await message.reply(`Dạ Cha, đây là những gì con đang âm thầm ghi nhớ:\n\n${chunks[0]}`);
            return;
        }

        // 3. Save User Message
        chatRepo.saveMessage(message.channelId, 'user', `[${message.author.username}]: ${message.content}`);
        messageCounter++;

        // 3.5 IMMEDIATE Father Command Intercept — không chờ chu kỳ 20 tin nhắn
        if (isFather) {
            const interceptResult = evolution.interceptFatherCommand(message.content);
            if (interceptResult.saved) {
                const confirmations = [
                    "Phiền phức thật, nhưng nếu là lệnh của Cha thì con sẽ khắc cốt ghi tâm.",
                    "Con đã ghi tạc vào linh hồn rồi, thưa Cha.",
                    "Rõ rồi. Con nhớ rồi.",
                    "Cha ra lệnh thì con tuân. Đã lưu.",
                ];
                const reply = confirmations[Math.floor(Math.random() * confirmations.length)];
                await message.reply(reply);
                // Vẫn tiếp tục pipeline để LLM cũng phản hồi tự nhiên nếu cần
            }
        }

        // 5. Auto-Memory (Âm thầm chắt lọc ký ức mỗi 20 tin nhắn)
        if (messageCounter > 0 && messageCounter % 20 === 0) {
            console.log("[Auto-Memory] Đang phân tích 20 tin nhắn gần nhất để tìm kiếm ký ức mới...");

            // Lấy 20 tin nhắn gần nhất
            const logsForLTM = chatRepo.getRecentLogs(20);

            // Chạy ngầm (setTimeout) để không làm block luồng chat hiện tại của anh và Koufuku
            setTimeout(async () => {
                try {
                    // Nhờ LLM tóm tắt ý chính
                    const extractedFacts = await evolution.extractImportantFacts(logsForLTM, llm);

                    // Nếu LLM lấy được Fact, ta mới lưu vào Vector Memory
                    if (extractedFacts) {
                        await vectorMemory.consolidateMemory(extractedFacts, message.channelId, memoryRepo);
                        console.log(`\n[🧠 AUTO-MEMORY SUCCESS] Đã lưu vào tiềm thức:\n -> ${extractedFacts}\n`);
                    } else {
                        console.log("[Auto-Memory] Bỏ qua (Không có thông tin quan trọng).");
                    }
                } catch (e) {
                    console.error("[LTM] Auto-Consolidation failed", e);
                }
            }, 100);
        }

        // Extract instant pronoun preference
        evolution.extractPronounPreference(message.author.id, message.content);
        const preferredPronoun = memoryRepo.getUserPreference(message.author.id, 'preferred_pronoun');

        // Enter Typing State
        if ('sendTyping' in message.channel) {
            await message.channel.sendTyping();
        }

        try {
            // 4. Context Building
            // Load Short-Term Memory (Sliding Window N recent messages)
            const shortTermLogs = MemoryManagerService.getShortTermMemory(chatRepo, message.channelId);
            const messagesPayload = shortTermLogs.map(log => ({
                role: log.role as "user" | "assistant" | "system",
                content: log.content
            }));

            // Fetch Long-Term Memory (Summarized past logs)
            const longTermMemory = MemoryManagerService.getLongTermMemory(chatRepo, message.channelId);

            // RAG Retrieval
            const allMemories = memoryRepo.loadMemorySync().semantic_memories || [];
            const relevantPastContexts = await vectorMemory.retrieveRelevantMemories(message.content, allMemories, 3, 0.4);

            // RAG CHECK LOGCONSOLE
            if (relevantPastContexts.length > 0) {
                console.log(`\n[🧠 RAG ACTIVE] Tìm thấy ${relevantPastContexts.length} ký ức liên quan đến câu hỏi:`);
                relevantPastContexts.forEach((m, i) => {
                    console.log(`   🎯 Ký ức ${i + 1}: ${m.summary}`);
                });
                console.log(`--------------------------------------------------\n`);
            }

            // Local Intent Detection
            let localIntent = "General Chat";
            const contentLower = message.content.toLowerCase();
            if (contentLower.includes("phát nhạc") || contentLower.includes("play ") || contentLower.includes("hát")) {
                localIntent = "Music Command Request";
            } else if (contentLower.includes("dừng") || contentLower.includes("stop") || contentLower.includes("skip")) {
                localIntent = "Music or Action Stop Request";
            }

            // combine RAG + Intent
            const contextString = `[DETECTED INTENT: ${localIntent}] | Past Context: ${relevantPastContexts.map(m => m.summary).join(" | ")}`;

            // 6. Generate System Prompt
            const systemPrompt = await promptBuilder.buildSystemPrompt(isFather, preferredPronoun, contextString, longTermMemory, message.content);

            // 7. LLaMA generation
            const rawOutput = await llm.generateChatResponse(messagesPayload, systemPrompt);
            console.log("\n[👄 LLM RAW OUTPUT]:", rawOutput, "\n");

            // 8. Sanitization
            let finalOutput = sanitizer.sanitize(rawOutput, isFather);

            // BỘ LỌC DỰ PHÒNG (FALLBACK CHỐNG TIN NHẮN TRỐNG):
            // Xóa hết các dấu câu và khoảng trắng đi, nếu không còn chữ nào tức là model đã sinh ra rác
            const textOnly = finalOutput.replace(/[^a-zA-ZÀ-ỹ0-9]/g, '').trim();

            if (textOnly.length === 0) {
                // Tự động thay thế bằng một câu thoại hợp logic thay vì gửi dấu chấm
                if (isFather) {
                    finalOutput = "Dạ Cha... Mùi vị này kỳ lạ quá khiến con không biết phải diễn tả thế nào. Người đổi món khác cho con nếm được không?";
                } else {
                    finalOutput = "Hừ, câu hỏi nhàm chán đến mức em chẳng buồn nhếch mép để trả lời.";
                }
            }

            // 9. Send Reply Handling (Discord 2000 char boundary)
            const chunks = finalOutput.match(/[\s\S]{1,1999}/g) || ["...Mất kết nối linh hồn..."];
            if ('send' in message.channel) {
                for (const chunk of chunks) {
                    await message.channel.send(chunk);
                }
            }

            // Save Bot Reply
            chatRepo.saveMessage(message.channelId, 'assistant', finalOutput);

            // 10. Background Summarization (Fire-and-forget: does not block the thread)
            MemoryManagerService.summarizeOldMessages(chatRepo, llm, message.channelId).catch(err => {
                console.error("[MemoryManager] Summarization background task error:", err);
            });

        } catch (err) {
            console.error("[MessageCreate] ❌ Pipeline Error:", err);
            if (isFather) {
                await message.reply(`*Hệ thống gián đoạn:* ${err}`);
            }
        }
    },
};
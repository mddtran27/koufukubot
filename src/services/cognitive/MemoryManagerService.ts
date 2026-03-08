import { ChatLogRepository } from '../../repositories/ChatLogRepository';
import { LocalLLMService } from '../llm/LocalLLMService';

export class MemoryManagerService {
    private static readonly WINDOW_SIZE = 6; // N = 6 recent messages are kept in sliding window

    /**
     * Get the short term history formatted for PromptBuilder / LLaMA
     */
    public static getShortTermMemory(chatRepo: ChatLogRepository, sessionId: string, limit: number = this.WINDOW_SIZE) {
        return chatRepo.getShortTermMemory(sessionId, limit);
    }

    /**
     * Get the long term memory string
     */
    public static getLongTermMemory(chatRepo: ChatLogRepository, sessionId: string): string {
        return chatRepo.getLongTermMemory(sessionId);
    }

    /**
     * Background Task / Worker to summarize old messages
     * Fire-and-forget: should not block the main response pipeline
     */
    public static async summarizeOldMessages(chatRepo: ChatLogRepository, llm: LocalLLMService, sessionId: string): Promise<void> {
        try {
            // 1. Find the sliding window boundary (Protect the N newest messages)
            const boundaryId = chatRepo.getBoundaryLogId(sessionId, this.WINDOW_SIZE - 1);
            if (!boundaryId) return; // Not enough messages to summarize yet

            // 2. Get the unsummarized messages OLDER than the boundary
            const oldLogs = chatRepo.getUnsummarizedLogs(sessionId, boundaryId);
            if (oldLogs.length === 0) return; // Nothing new to summarize

            // 3. Format raw logs into a conversation transcript
            const conversationToSummarize = oldLogs.map(log =>
                `${log.role === 'user' ? 'User' : 'Koufuku'}: ${log.content}`
            ).join('\n');

            // 4. Fetch the existing long-term memory
            const currentMemory = chatRepo.getLongTermMemory(sessionId);

            // 5. Build the summarization prompt
            const summaryPrompt = this.buildSummarizationPrompt(currentMemory, conversationToSummarize);

            console.log(`[MemoryManager] 🧠 Triggering background summarization for ${sessionId} on ${oldLogs.length} messages...`);

            // 6. Call LLM to summarize
            // We pass an empty history array because we're just injecting the prompt directly 
            // as system or user instruction for the LLM. In this case, we use system prompt.
            const newSummary = await llm.generateChatResponse([], summaryPrompt);

            if (!newSummary || newSummary.trim() === '') {
                console.warn(`[MemoryManager] ⚠️ Summary generation returned empty string.`);
                return;
            }

            // 7. Save the new Long Term Memory to DB
            chatRepo.saveLongTermMemory(sessionId, newSummary.trim());

            // 8. Mark these logs as summarized so they are ignored next time
            const idsToMark = oldLogs.map(log => log.id);
            chatRepo.markLogsAsSummarized(idsToMark);

            console.log(`[MemoryManager] ✅ Summarization complete for ${sessionId}. New LTM length: ${newSummary.length} chars.`);

        } catch (error) {
            console.error(`[MemoryManager] ❌ Failed to summarize old messages:`, error);
        }
    }

    /**
     * Prompt exclusively used for standalone summarization thread (No Persona needed here)
     */
    private static buildSummarizationPrompt(oldSummary: string, newConversations: string): string {
        return `Bạn là một AI phân tích hệ thống. Nhiệm vụ của bạn là tóm tắt khách quan lại diễn biến cuộc trò chuyện giữa User và Koufuku.

[Yêu cầu khắt khe]:
1. Viết dưới góc nhìn ngôi thứ 3 (User đã nói gì, Koufuku đã phản hồi gì).
2. Tập trung vào: Sự kiện quan trọng, thông tin cá nhân/sở thích của User đã được tiết lộ, hoặc bối cảnh cốt truyện đang diễn ra. Bỏ qua các câu chào hỏi xã giao.
3. CỰC KỲ súc tích và ngắn gọn. Không viết lê thê.

${oldSummary ? `[Ký ức cũ (Tóm tắt trước đó)]\n${oldSummary}\n\n` : ''}
[Các cuộc hội thoại mới cần bổ sung vào trí nhớ]\n${newConversations}

Dựa vào Ký ức cũ (nếu có) và Hội thoại mới, hãy tổng hợp lại thành MỘT bản tóm tắt duy nhất, cập nhật và chứa đủ thông tin nhất. 
LƯU Ý: Tuyệt đối không sinh ra bất kỳ văn bản dư thừa nào ngoài nội dung bản tóm tắt. Trả lời ngay lập tức bằng nội dung tóm tắt.`;
    }
}

import { ChatLogRepository } from '../../repositories/ChatLogRepository';
import { MemoryRepository } from '../../repositories/MemoryRepository';
import { ChatLogEntry } from '../../types/index';
import { LLMService } from '../llm/LLMService';

export interface ImmediateCommandResult {
    saved: boolean;
    command: string;
}

export class EvolutionService {
    private chatRepo: ChatLogRepository;
    private memoryRepo: MemoryRepository;

    constructor(chatRepo: ChatLogRepository, memoryRepo: MemoryRepository) {
        this.chatRepo = chatRepo;
        this.memoryRepo = memoryRepo;
    }

    /**
     * IMMEDIATE command intercept for Father's directives.
     * Không chờ chu kỳ 20 tin nhắn — lưu NGAY vào absolute_directives.
     * Trả về flag để messageCreate biết cần phản hồi xác nhận đặc biệt.
     */
    public interceptFatherCommand(content: string): ImmediateCommandResult {
        // CHỐT CHẶN: Nếu câu có dấu hỏi hoặc các từ để hỏi, ĐÁNH BẬT NGAY LẬP TỨC
        // Không cho phép lưu nhầm câu hỏi thành câu lệnh.
        const contentLower = content.toLowerCase();
        if (
            content.includes('?') ||
            contentLower.match(/\b(gì|ai|nào|sao|thế nào|không)\b/)
        ) {
            return { saved: false, command: '' };
        }

        // Các mẫu mệnh lệnh tự nhiên trong tiếng Việt từ Cha
        const immediatePatterns = [
            /(?:hãy|phải|từ nay)\s+(?:nhớ|ghi nhớ|gọi)\s+(.+)/i,
            /(?:nhớ|ghi nhớ)\s+(?:rằng|là|điều này)\s*[:\s]+(.+)/i,
            /(?:tên|biệt danh|nickname)\s+(?:của\s+)?(?:con|mày)\s+là\s+(.+)/i,
            /(?:con|mày)\s+(?:tên|là)\s+(.+)/i,
            /(?:từ giờ|bây giờ|từ nay)\s+(.+)/i,
            /(?:ghi|lưu|khắc)\s+(?:vào|nhớ|tạc)\s*[:\s]*(.+)/i,
        ];

        for (const pattern of immediatePatterns) {
            const match = content.match(pattern);
            if (match) {
                const command = content.trim();

                // Lưu trực tiếp vào memory.json — KHÔNG chờ chu kỳ
                const memory = this.memoryRepo.loadMemorySync();

                // Chống trùng lặp
                const isDuplicate = memory.absolute_directives.some(
                    (d) => d.command.toLowerCase() === command.toLowerCase()
                );
                if (!isDuplicate) {
                    memory.absolute_directives.push({ command, savedAt: Date.now() });
                    this.memoryRepo.saveMemorySync(memory);
                    console.log(`[Evolution] ⚡ IMMEDIATE Father command saved: "${command.substring(0, 50)}..."`);
                }

                return { saved: true, command };
            }
        }

        return { saved: false, command: '' };
    }

    /**
     * Scans recent chat logs for explicit admin commands and community feedback.
     * Chạy theo chu kỳ để bắt các mệnh lệnh bị bỏ sót.
     */
    public extractAndSaveLesson(channelId: string, limit: number = 20): void {
        const logs = this.chatRepo.getRecentLogs(limit);
        if (logs.length === 0) return;

        const userMessages = logs.filter((log: ChatLogEntry) => log.role === 'user');

        const memory = this.memoryRepo.loadMemorySync();
        let updated = false;

        const directivePatterns = [
            /koufuku\s+từ\s+nay/i,
            /con\s+phải/i,
            /từ\s+bây\s+giờ/i,
            /quy\s+tắc(\s+là)?\s*:/i,
            /ghi\s+nhớ\s*:/i,
            /luôn\s+luôn/i,
            /gọi\s+ta\s+là/i,
            /không\s+được/i,
            /(?:hãy|phải)\s+(?:nhớ|ghi nhớ|gọi)/i,
            /(?:tên|biệt danh)\s+(?:của\s+)?con\s+là/i,
        ];

        for (const msg of userMessages) {
            if (directivePatterns.some(p => p.test(msg.content))) {
                const isDuplicate = memory.absolute_directives.some(
                    (d) => d.command.toLowerCase() === msg.content.toLowerCase()
                );
                if (!isDuplicate) {
                    memory.absolute_directives.push({
                        command: msg.content,
                        savedAt: Date.now()
                    });
                    console.log(`[Evolution] 🧬 Saved directive from cycle scan: "${msg.content.substring(0, 30)}..."`);
                    updated = true;
                }
            }
        }

        if (updated) {
            this.memoryRepo.saveMemorySync(memory);
        }
    }

    /**
     * Instantly scans single message for a pronoun preference update
     */
    public extractPronounPreference(userId: string, content: string): void {
        const pronounRegex = /(?:hãy|gọi|xưng)\s+(?:tôi|mình|em)\s+là\s+(anh|chị|cô|chú|ngài)/i;
        const match = content.match(pronounRegex);
        if (match && match[1]) {
            const preferred = match[1].toLowerCase();
            this.memoryRepo.saveUserPreference(userId, 'preferred_pronoun', preferred);
            console.log(`[Evolution] 🗣️ Learned new pronoun preference for user ${userId}: ${preferred}`);
        }
    }

    /**
     * Replaces LLM summary with a local fast-truncation of chat logs.
     * Ensures we don't blow up token limits while still keeping the semantic gist for RAG.
     */
    public summarizeChatLogsLocal(logs: ChatLogEntry[]): string {
        if (!logs || logs.length === 0) return '';

        // Reverse for chronological order
        const chronologicalLogs = [...logs].reverse();

        let localSummary = "";
        for (const l of chronologicalLogs) {
            // Truncate overly long messages locally
            const cleanContent = l.content.length > 100 ? l.content.substring(0, 100) + "..." : l.content;
            localSummary += `${l.role === 'user' ? 'User' : 'Assistant'}: ${cleanContent} | `;
        }

        return localSummary.trim();
    }

    /**
     * Đọc 20 tin nhắn gần nhất và trích xuất sự thật (Auto-Memory).
     * Trả về chuỗi rỗng nếu không có gì đáng nhớ.
     */
    public async extractImportantFacts(logs: ChatLogEntry[], llmService: LLMService): Promise<string> {
        // Gom lịch sử lại thành văn bản
        const chatHistory = logs.map(l => `${l.role === 'user' ? 'Cha' : 'Koufuku'}: ${l.content}`).join('\n');

        const systemPrompt = `BẠN LÀ MỘT HỆ THỐNG TRÍCH XUẤT DỮ LIỆU THẦM LẶNG (BACKGROUND WORKER).
Nhiệm vụ: Đọc đoạn hội thoại dưới đây và TRÍCH XUẤT những thông tin quan trọng nhất thành 1-2 câu ngắn gọn.

Tiêu chí thông tin quan trọng cần nhớ:
- Tên, sở thích, thói quen, công việc của User (Cha).
- Các sự kiện thực tế vừa xảy ra hoặc vừa được kể.
- Các thiết lập cốt truyện (Lore) mới về Koufuku.

QUY TẮC TỐI THƯỢNG:
1. Nếu đoạn chat KHÔNG CÓ thông tin gì quan trọng (chỉ là chào hỏi, khen ngợi, hoặc nói chuyện phiếm), BẮT BUỘC trả lời DUY NHẤT một chữ: "NONE".
2. Nếu có thông tin, hãy tóm tắt nó dưới góc nhìn ngôi thứ ba. (Ví dụ: "Cha thích ăn bánh mì pate ở Biên Hòa", hoặc "Koufuku từng bị Tướng Quân Thủy Triều chém đứt lông đuôi").
3. Tuyệt đối không giải thích, không xưng hô, không đóng vai. Chỉ xuất ra sự thật.`;

        const messages = [{ role: 'user', content: `HỘI THOẠI:\n${chatHistory}\n\nKẾT QUẢ TRÍCH XUẤT:` }];

        try {
            // Sử dụng LLM để tóm tắt
            const response = await llmService.generateChatResponse(messages, systemPrompt);
            const cleaned = response.trim();

            // Nếu LLM đánh giá không có gì quan trọng
            if (cleaned.includes("NONE") || cleaned.length < 5) {
                return "";
            }
            return cleaned;
        } catch (e) {
            console.error("[EvolutionService] Lỗi khi trích xuất ký ức ngầm:", e);
            return "";
        }
    }
}
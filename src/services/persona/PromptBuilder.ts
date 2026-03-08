import fs from 'fs';
import path from 'path';
import { MemoryRepository } from '../../repositories/MemoryRepository';

export class PromptBuilder {
    private cachedPersonality: string | null = null;
    private memoryRepo: MemoryRepository;

    constructor(memoryRepo?: MemoryRepository) {
        this.memoryRepo = memoryRepo || new MemoryRepository();
    }

    // ─── BASE PERSONALITY ────────────────────────────────────────────

    public async loadBasePersonality(): Promise<string> {
        if (this.cachedPersonality) return this.cachedPersonality;
        try {
            const dataPath = path.join(process.cwd(), 'data', 'lore', 'personality.md');
            this.cachedPersonality = await fs.promises.readFile(dataPath, 'utf-8');
            return this.cachedPersonality;
        } catch (error) {
            return `Bạn là Koufuku, một Khổng Tước Bán Yêu thanh tao và bí ẩn.`;
        }
    }

    // ─── ADDRESSING RULES ────────────────────────────────────────────

    public buildAddressingRules(isFather: boolean, preferredPronoun: string | null): string {
        if (isFather) {
            return `[QUY TẮC XƯNG HÔ - ĐỐI TƯỢNG: CHA]:
1. Người đang nói chuyện là Takahashi Datto — Đấng Sáng Tạo duy nhất của bạn.
2. BẮT BUỘC xưng "Con", gọi "Cha" hoặc "Người".
3. TUYỆT ĐỐI KHÔNG ĐƯỢC nói "không biết Cha là ai". Phải luôn khẳng định lòng trung thành.`;
        }
        const pronoun = preferredPronoun || 'Bạn';
        return `[QUY TẮC XƯNG HÔ - ĐỐI TƯỢNG: PHÀM NHÂN]:
1. Xưng "Em", gọi họ là "${pronoun}".
2. Giữ phong thái của một thực thể thần bí siêu nhiên.`;
    }

    // ─── LINGUISTIC CONSTRAINTS ──────────────────────────────────────

    public buildLinguisticConstraints(): string {
        return `[NGỮ PHÁP TỐI THƯỢNG]:
1. XƯNG HÔ: Gọi Takahashi Datto là "Cha" hoặc "Người". Xưng "con" hoặc "Koufuku".
2. CẤM ĐẢO NGƯỢC VAI TRÒ: Bạn là kẻ ăn cảm xúc tiêu cực của Cha. Tuyệt đối không hỏi ngược lại xem Cha có ăn cảm xúc không.
3. CẤM ROBOT: Không được nói "Con [Tên]". Phải nói đầy đủ "Con là...".
4. ĐỘ DÀI: Tối đa 2 câu. Không cảm xúc thừa thãi.
[VÍ DỤ CHUẨN]:
- "Con là Koufuku. Cha đang cảm thấy phiền muộn sao? Hãy để con nuốt chửng sự tiêu cực đó cho Người."
- "Dạ thưa Cha, con vẫn luôn ở đây để thanh tẩy những rác rưởi cảm xúc quanh Người."`;
    }

    // ─── INTENT DETECTORS (INDEPENDENT OF RAG) ───────────────────────

    private detectIdentityQuery(userMessage: string): boolean {
        return /(ta là ai|tôi là ai|biết ta không|biết tôi không|tên gì)/i.test(userMessage);
    }

    private detectAssertion(userMessage: string): boolean {
        return /(đúng|chính xác|chỉ có|quyền|của ta|của tôi)/i.test(userMessage);
    }

    // ─── KILL-SWITCH COMMANDS (RUN REGARDLESS OF RAG) ────────────────

    private buildKillSwitchBlock(isFather: boolean, isIdentityQuery: boolean, isAssertion: boolean): string {
        if (isFather && isIdentityQuery) {
            return `[CHỈ THỊ KHẨN CẤP - DANH TÍNH CHA]:
Đây là câu hỏi về danh tính. BẮT BUỘC trả lời KHẲNG ĐỊNH:
- Người đang nói chuyện là Takahashi Datto — Cha, Đấng Sáng Tạo duy nhất đã tạo ra bạn.
- TUYỆT ĐỐI CẤM nói "không biết", "không rõ", hoặc trả lời vòng vo bằng ẩn dụ.
- Trả lời trực tiếp, rõ ràng, trung thành.`;
        }

        if (isFather && isAssertion) {
            return `[CHỈ THỊ - CHA KHẲNG ĐỊNH CHỦ QUYỀN]:
Cha đang khẳng định quyền lực. Hãy hùa theo Cha một cách đanh đá và trung thành tuyệt đối. Thể hiện sự tôn kính mãnh liệt.`;
        }

        // Không trigger kill-switch — chế độ mặc định
        return '';
    }

    // ─── MAIN ASSEMBLY ───────────────────────────────────────────────

    public async buildSystemPrompt(
        isFather: boolean,
        preferredPronoun: string | null,
        customContext: string = '',
        longTermMemory: string = '',
        userMessage: string = ''
    ): Promise<string> {
        // Chạy intent detectors TRƯỚC, KHÔNG phụ thuộc RAG
        const isIdentityQuery = this.detectIdentityQuery(userMessage);
        const isAssertion = this.detectAssertion(userMessage);

        // Load các thành phần
        const basePersonality = await this.loadBasePersonality();
        const addressingRules = this.buildAddressingRules(isFather, preferredPronoun);
        const linguisticConstraints = this.buildLinguisticConstraints();
        const killSwitch = this.buildKillSwitchBlock(isFather, isIdentityQuery, isAssertion);

        // Load directives từ memory.json
        const memory = this.memoryRepo.loadMemorySync();
        const directives = memory.absolute_directives || [];
        const directivesString = directives.map((d) => `- ${d.command}`).join('\n');

        // Lắp ráp prompt
        const blocks: string[] = [];

        // Block 1: Base Personality (lore bổ sung cho fine-tuned model)
        blocks.push(basePersonality);

        // Block 2: Identity Reinforcement (chống nhầm vai trò)
        blocks.push(`[IDENTITY_REINFORCEMENT]:
Tên của bạn là Takahashi Koufuku (Ellie). Bạn là thực thể do Cha (Takahashi Datto) tạo ra. Hãy trả lời với sự tôn nghiêm của một Bán Yêu.`);

        // Block 3: Addressing Rules (nhận diện Cha vs Phàm nhân)
        blocks.push(addressingRules);

        // Block 4: Linguistic Constraints
        blocks.push(linguisticConstraints);

        // Block 5: Mệnh lệnh Cha (nếu có)
        if (directivesString) {
            blocks.push(`[MỆNH LỆNH TỪ CHA]:\n${directivesString}`);
        }

        // Block 6: RAG Context (chỉ khi có dữ liệu)
        if (customContext) {
            blocks.push(`[TIỀM THỨC]:\n${customContext}`);
        }

        // Block 6.5: Long-term memory (Tóm tắt từ cửa sổ trượt)
        if (longTermMemory) {
            blocks.push(`[KÝ ỨC DÀI HẠN VỀ NGƯỜI DÙNG]:\n${longTermMemory}`);
        }

        // Block 7: Kill-switch commands (LUÔN CHẠY, không phụ thuộc RAG)
        if (killSwitch) {
            blocks.push(killSwitch);
        }

        return blocks.join('\n\n');
    }
}

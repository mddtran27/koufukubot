import { config } from '../../config/env';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class LocalLLMService {
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly maxRetries = 3;

    constructor() {
        // Strip /v1 suffix to get base Ollama URL for native API (/api/chat)
        this.baseUrl = config.LOCAL_LLM_URL.replace(/\/v1\/?$/, '');
        this.model = config.LOCAL_MODEL_NAME;
        console.log(`[LocalLLMService] 🔧 Model: ${this.model} | URL: ${this.baseUrl}/api/chat`);
    }

    /**
     * Generates a chat response using native Ollama API with optimized GPU parameters.
     * Ép sử dụng GPU RTX 3070 và thắt chặt tính cách nhân vật.
     */
    public async generateChatResponse(
        messages: { role: string; content: string }[],
        systemPrompt: string
    ): Promise<string> {

        const apiMessages: { role: string; content: string }[] = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        // Native Ollama payload với các tham số ép xung GPU
        const payload = {
            model: this.model,
            messages: apiMessages,
            stream: false,
            options: {
                // THIẾT LẬP NHÂN CÁCH
                temperature: 0.2,        // GIẢM xuống 0.2 để bot bớt "sáng tạo" linh tinh (như kem dừa)
                top_p: 0.6,              // Giảm nhẹ để tập trung vào các từ ngữ thực tế trong Lore
                repeat_penalty: 1.2,     // TĂNG lên 1.2 để chặn lặp lại các câu "Dạ Cha... Con nhớ"

                // MỞ KHÓA GIỚI HẠN TỪ VỰNG: Tăng lại lên 1000 để các câu deep không bị cắt cụt.
                // Việc trả lời ngắn sẽ do Prompt Kill-Switch đảm nhận.
                num_predict: 1000,

                // THIẾT LẬP PHẦN CỨNG (GPU)
                num_gpu: -1,             // ÉP OLLAMA DÙNG GPU (RTX 3070). -1 có nghĩa là đẩy tất cả các lớp vào GPU.
                main_gpu: 0,             // Chỉ định card đồ họa đầu tiên
                low_vram: false          // Tắt chế độ tiết kiệm VRAM để tối ưu tốc độ cho 3070
            }
        };

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                return data.message?.content || '';

            } catch (error: any) {
                if (attempt < this.maxRetries) {
                    const delayMs = Math.pow(2, attempt) * 1000;
                    console.warn(`[LocalLLMService] ⚠️ Attempt ${attempt}/${this.maxRetries} failed. Retry in ${delayMs}ms`);
                    await sleep(delayMs);
                    continue;
                }

                console.error('[LocalLLMService] ❌ Fatal error after all retries:', error.message);
                throw error;
            }
        }

        throw new Error('[LocalLLMService] Request failed after maximum retries.');
    }
}
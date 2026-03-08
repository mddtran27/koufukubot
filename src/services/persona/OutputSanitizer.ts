/**
 * Lớp xử lý và chuẩn hóa đầu ra của Chatbot.
 * Đảm bảo tính nhất quán trong xưng hô và loại bỏ các thành phần thừa.
 */
export class OutputSanitizer {
    // Định nghĩa tập hợp ký tự tiếng Việt để xử lý ranh giới từ chính xác
    private static readonly VN_CHAR = 'a-zA-ZÀ-ỹ';

    /**
     * Tạo Regex để bắt chính xác các từ tiếng Việt mà không bị dính vào các từ ghép.
     */
    private vnWordRegex(word: string, flags: string = 'g'): RegExp {
        return new RegExp(`(?<![${OutputSanitizer.VN_CHAR}])(?:${word})(?![${OutputSanitizer.VN_CHAR}])`, flags);
    }

    /**
     * Ép buộc đại từ xưng hô dựa trên quyền hạn của người dùng (isFather).
     */
    public enforcePronouns(text: string, isFather: boolean): string {
        let sanitized = text;

        if (isFather) {
            // Chế độ dành cho Cha: Chuyển "Em" thành "Con"
            sanitized = sanitized
                .replace(this.vnWordRegex('Em', 'g'), 'Con')
                .replace(this.vnWordRegex('em', 'g'), 'con');

            // Chuyển các xưng hô ngang hàng thành "Người"
            sanitized = sanitized.replace(this.vnWordRegex('anh|chị|bạn', 'gi'), 'Người');
        } else {
            // Chế độ dành cho Phàm nhân: Chuyển "Con" thành "Em"
            sanitized = sanitized.replace(this.vnWordRegex('con', 'gi'), 'em');

            // Chuyển "Cha/Người" thành "Bạn" để giữ khoảng cách
            sanitized = sanitized.replace(this.vnWordRegex('cha|người', 'gi'), 'bạn');
        }

        return sanitized;
    }

    /**
     * Pipeline chính để làm sạch văn bản trước khi gửi lên Discord.
     */
    public sanitize(text: string, isFather: boolean): string {
        let result = text
            // 1. Xóa nội dung trong ngoặc (hành động truyền thống)
            .replace(/\s*[\(\[][^()\[\]]+[\)\]]\s*/g, ' ')
            // 2. Xóa các câu văn tường thuật ngôi thứ 3 (đặc trị DeepSeek)
            // Tìm các câu có chứa "Cô ấy", "Cô đưa tay", "Koufuku..." mà không phải hội thoại
            .replace(/(?:Cô|Koufuku|Nàng)\s+(?:đưa tay|bước|cười|nhìn|hỏi|nói|thở dài|lấy ra)[^.!?]+[.!?]/g, '')
            .replace(/[\*\(\)\[\]]/g, '')
            .trim();

        result = this.enforcePronouns(result, isFather);

        // Đảm bảo kết thúc bằng dấu câu hợp lệ
        if (result.length > 0 && !/[.!?…"”']$/.test(result)) {
            result += '.';
        }
        return result;
    }
}
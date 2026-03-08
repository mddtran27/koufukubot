# Koufuku Bot - Developer Instructions

## Project Overview

Koufuku (高橋 幸福) is a TypeScript Discord bot built around a deeply characterized AI persona — a mystical Peacock Demigod shrine maiden. The bot uses Groq LLM (LLaMA 3.3 70B) for conversational AI, a local ONNX embedding model for RAG semantic memory, and a multi-layered persona enforcement system.

See `ARCHITECTURE.md` for a comprehensive system overview with data flow diagrams and a mermaid mindmap.

---

## MANDATORY: Hướng dẫn Phát triển Dự án Koufuku

### 1. Kiến trúc cốt lõi (Core Architecture)

**BẮT BUỘC:** Trước khi đề xuất bất kỳ thay đổi cấu trúc, refactor code, hay thêm tính năng mới nào, bạn phải đọc và tuân thủ tuyệt đối cấu trúc được định nghĩa trong file `ARCHITECTURE.md`.

### 2. Quy tắc Viết Code (Coding Rules)

- **Tiết kiệm Token:** TUYỆT ĐỐI KHÔNG để LLM sinh ra các hành động roleplay (ví dụ: `*cười*`, `*thở dài*`). Chỉ giữ lại hội thoại thuần túy.
- **An toàn Dữ liệu:** Luôn sử dụng `async-mutex` khi thao tác đọc/ghi vào các file JSON (như `memory.json` hay `channelContext.json`) để tránh race conditions.
- **Tối ưu RAG:** Dữ liệu Vector đã được chuẩn hóa (normalized), chỉ sử dụng Dot Product (tích vô hướng) thay vì Cosine Similarity phức tạp để tiết kiệm CPU.
- **Xử lý Discord API:** Luôn nhớ chunking tin nhắn dài (giới hạn 2000 ký tự) và làm mới trạng thái `sendTyping()` mỗi 9 giây.

### 3. Quy trình làm việc (Workflow)

- Chỉ chỉnh sửa những block code thực sự cần thiết, không tự ý viết lại toàn bộ file nếu không được yêu cầu.
- Luôn kiểm tra xem thư viện có cần import thêm trước khi gọi hàm hay không.

---

## Quick Reference

```
Entry point:     index.ts
Run dev:         npm run dev          (nodemon + ts-node)
Run production:  npm start            (ts-node)
Type check:      npm run typecheck    (tsc --noEmit)
Build:           npm run build        (tsc)
```

## Tech Stack

- **Runtime**: Node.js with `ts-node` (CommonJS modules, ES2022 target)
- **Language**: TypeScript (strict mode, strictNullChecks enabled)
- **Discord**: discord.js v14, @discordjs/voice, @discordjs/opus
- **LLM**: Groq SDK (LLaMA 3.3 70B via `groq-sdk`)
- **Embeddings**: @huggingface/transformers (Xenova/all-MiniLM-L6-v2 ONNX, 384-dim)
- **Database**: better-sqlite3 (WAL mode) for the Data Lake
- **Audio**: play-dl (YouTube), FFmpeg (local files), opusscript, libsodium-wrappers
- **Concurrency**: async-mutex for thread-safe memory writes

## Environment Variables (.env)

```
DISCORD_TOKEN=           # Discord bot token
GROQ_API_KEY=            # Groq API key for LLM
SERPER_API_KEY=          # Google Serper API key for web search
FATHER_DISCORD_ID=       # Discord user ID of the admin (Cha Datto)
ALLOWED_CHANNEL_ID=      # Restrict bot to a single channel
ALLOWED_SERVER_ID=       # Restrict bot to a single server
BOT_CLIENT_ID=           # Bot's own Discord client ID
```

## Project Structure

```
index.ts                    # Application entry point
config.json                 # LLM parameters and persona constraints
tsconfig.json               # TypeScript config (CommonJS, strict)
src/
  commands/
    chat.ts                 # AI conversation engine (system prompt + Groq API)
    music.ts                # Voice channel music playback
  events/
    ready.ts                # Startup initialization
    messageCreate.ts        # Main message router (central nervous system)
    guildCreate.ts          # Server whitelist guard
  handlers/
    eventHandler.ts         # Dynamic event loader
    messageHandler.ts       # Context builder (authority, vibe, commands)
  skills/
    webSearch.ts            # Serper API web search (Groq tool calling)
  types/
    index.ts                # All TypeScript interfaces
  utils/
    characterSystem.ts      # Persona logic, emotion tastes, character state
    cognitiveLoop.ts        # Proactive idle messaging (hourly loop)
    database.ts             # SQLite Data Lake (better-sqlite3)
    embedder.ts             # ONNX embedding model singleton
    loreManager.ts          # Lore database with keyword-scored queries
    memoryManager.ts        # 4-tier memory system orchestrator
    reflectionEngine.ts     # LLM-powered implicit feedback analysis
    vectorMath.ts           # Cosine similarity, time decay, combined scoring
data/
  channelContext.json       # Per-channel state (RAM cache mirror, auto-synced)
  memory.json               # Learned directives, adaptations, constraints
  diary.json                # Long-term narrative memory
  loreDatabase.json         # Structured character lore entries
  lore/personality.md       # Core personality prompt (the "soul")
  full_chatlog.sqlite       # Raw conversation archive (Data Lake)
  music/                    # Local audio files (.ogg, .mp3)
scripts/
  export_jsonl.ts           # Data Lake to fine-tuning JSONL exporter
bin/ffmpeg/                 # Bundled FFmpeg binaries
test_*.js                   # Test suites (6 files)
```

## Key Architecture Concepts

### Four-Tier Memory System

1. **RAM Cache** — `cachedContext` in memoryManager.ts. All reads/writes go through RAM. Auto-synced to `channelContext.json` every 5 minutes and on shutdown.
2. **JSON Persistence** — `memory.json` stores learned rules (absolute_directives, social_adaptations, implicit_constraints, preferred_styles). `diary.json` stores long-term narrative.
3. **SQLite Data Lake** — `full_chatlog.sqlite` archives every raw message for pattern mining and fine-tuning export.
4. **Vector RAG** — Semantic memories stored as 384-dim vectors in `channelContext.json`. Summarized via LLM, embedded via ONNX model. Vectors are pre-normalized, so retrieval uses Dot Product (not full cosine similarity) + time decay for CPU efficiency.

### Authority System

- **FATHER** = username `mddtran27` OR matching `FATHER_DISCORD_ID`. Has absolute authority.
- **MORTAL** = everyone else. Limited interaction mode.
- Father Commands, Absolute Commands, and Forced Directives are three escalating tiers of admin control, each with different detection patterns and persistence behavior.

### Message Processing Pipeline

```
Message → Channel Gate → Absolute Command Intercept → ChatLog Save
→ Context Build → Evolution Triggers → Music Router → Chat Handler
→ System Prompt Assembly → Groq LLM → Output Sanitizer → Discord Reply
```

## Development Guidelines

### Code Conventions

- All source code is TypeScript with strict mode. Use explicit types — `noImplicitAny` is enabled.
- Interfaces live in `src/types/index.ts`. Add new shared types there.
- Use `import type` for type-only imports.
- Console logs follow a consistent format: `[Module] emoji Description`. Examples:
  - `[ChatLog] 💾 Saved...`
  - `[RAG Engine] 🔎 Found...`
  - `[AbsCmd] 🔐 Detected...`
- Vietnamese comments are used throughout the codebase. Continue this convention.

### Module Patterns

- **Singleton**: `embedder.ts` uses a Promise-based singleton for the ONNX model. Follow this pattern for expensive resources.
- **RAM-first caching**: `memoryManager.ts` reads/writes to an in-memory object, with periodic disk flush. Do not bypass the cache by reading JSON files directly.
- **Mutex**: `extractAndSaveLesson()` uses `async-mutex` to prevent concurrent writes to `memory.json`. **ALL functions** that read/write `memory.json` or `channelContext.json` must use the mutex to avoid race conditions.
- **Retry with backoff**: `fetchGroqWithRetry()` in `chat.ts` handles 429/5xx errors. Use the same pattern for any new API integrations.

### Adding a New Event

1. Create a file in `src/events/` with a default export containing `{ name, once?, execute }`.
2. The event handler in `eventHandler.ts` will auto-discover and register it.

### Adding a New Command

1. Add routing logic in `src/events/messageCreate.ts` (all commands trigger on `"koufuku"` prefix).
2. Implement the command handler in `src/commands/`.
3. Pass `conversationContext` if the command needs persona or authority awareness.

### Adding a New Skill (Tool Call)

1. Define the tool schema in `src/skills/` following the Groq function calling format (see `webSearch.ts`).
2. Import the schema into `chat.ts` and add it to the `tools` array in the Groq API call.
3. Handle the tool call response in the tool-call processing loop in `handleChat()`.

### Modifying Persona/Lore

- **personality.md** (`data/lore/personality.md`) — The master personality prompt. Changes here affect every response. Be very careful with edits; the format rules (R01-R05) and few-shot examples are critical for output quality.
- **loreDatabase.json** (`data/loreDatabase.json`) — Add new lore entries with `{ id, category, keywords[], priority, content }`. Higher priority = more likely to surface. Keywords drive retrieval scoring.
- **characterSystem.ts** — Emotion taste maps, action phrases, and addressing rules. Extend `emotionTastes` to add new emotion categories.

### Working with the Memory System

- **Never write directly to `channelContext.json`** — always go through `memoryManager.ts` functions which manage the RAM cache.
- **memory.json writes** — Always use `async-mutex` for any read/write operations on JSON data files. For critical admin commands, synchronous writes via `fs.writeFileSync` are acceptable only within a mutex lock (see `forceExtractAdminDirective`).
- **Vector memories** — New semantic memories are created by `summarizeAndEmbedContext()`. The embedding model loads lazily on first use; expect a ~2-3 second cold start.

## Data Files (Do Not Commit)

These files contain runtime data and should not be committed to version control:
- `data/channelContext.json` — Ephemeral channel state
- `data/memory.json` — Learned behaviors (may contain sensitive directives)
- `data/diary.json` — Runtime narrative
- `data/full_chatlog.sqlite` — Raw conversation data
- `.env` — Secrets

## Common Tasks

### Reset bot memory
Delete `data/memory.json` and `data/channelContext.json`. The bot will start fresh on next launch.

### Export training data
```bash
npx tsx scripts/export_jsonl.ts
```
Outputs `data/dataset.jsonl` in OpenAI/Groq fine-tuning format.

### Check voice dependencies
```bash
npx ts-node check.ts
```

### Add a new music file
Place `.ogg` or `.mp3` files in `data/music/`. The directory is auto-created if missing.

## Debugging Tips

- The bot logs extensively to stdout. Filter by module tags: `[ChatLog]`, `[RAG Engine]`, `[Evolution]`, `[Reflection]`, `[AbsCmd]`, `[Proactive]`, `[Music]`, `[Persona]`, `[Context]`, `[Vector DB]`, `[WebSearch]`, `[Sanitizer]`, `[Memory]`.
- If the embedding model fails to load, check that `@huggingface/transformers` can download the ONNX model (requires internet on first run).
- Groq API 429 errors are handled automatically with exponential backoff (up to 3 retries). If persistent, check rate limits.
- The proactive loop only fires when: channel idle 3h+, time is 07:00-24:00, and a 30% random dice succeeds. Check logs for `[Proactive]` to verify.
- `sanitizeReply()` logs when it modifies output. If pronoun issues appear, check `[Sanitizer]` logs.

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { ChatLogEntry } from '../types/index';

export class ChatLogRepository {
    private db: Database.Database;

    constructor(dbPath: string = path.join(__dirname, '../../data/full_chatlog.sqlite')) {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.initialize();
    }

    private initialize(): void {
        const createRawLogs = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS raw_chatlogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        createRawLogs.run();

        // Migration: Add is_summarized to raw_chatlogs
        try {
            this.db.prepare('ALTER TABLE raw_chatlogs ADD COLUMN is_summarized BOOLEAN DEFAULT 0').run();
        } catch (err: any) {
            if (!err.message.includes('duplicate column name')) {
                console.warn('[Database] is_summarized column migration warning:', err.message);
            }
        }

        const createLongTermMemories = this.db.prepare(`
            CREATE TABLE IF NOT EXISTS long_term_memories (
                session_id TEXT PRIMARY KEY,
                summary_content TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        createLongTermMemories.run();
    }

    /**
     * Save a single message to the data lake
     */
    public saveMessage(sessionId: string, role: string, content: string): void {
        const stmt = this.db.prepare(
            'INSERT INTO raw_chatlogs (session_id, role, content) VALUES (@sessionId, @role, @content)'
        );
        stmt.run({ sessionId, role, content });
    }

    /**
     * Retrieve the most recent messages for context building or evolution extraction
     */
    public getRecentLogs(limit: number = 50, sessionId?: string): ChatLogEntry[] {
        let stmt;
        if (sessionId) {
            stmt = this.db.prepare('SELECT * FROM raw_chatlogs WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?');
            return stmt.all(sessionId, limit) as ChatLogEntry[];
        } else {
            stmt = this.db.prepare('SELECT * FROM raw_chatlogs ORDER BY timestamp DESC LIMIT ?');
            return stmt.all(limit) as ChatLogEntry[];
        }
    }

    /**
     * Cleanly close the database
     */
    public close(): void {
        this.db.close();
    }

    // ─── MEMORY MANAGEMENT METHODS ──────────────────────────────────────────────

    /**
     * Sliding Window - Get N most recent messages
     */
    public getShortTermMemory(sessionId: string, limit: number): { role: string, content: string, id: number }[] {
        const stmt = this.db.prepare(`
            SELECT id, role, content FROM raw_chatlogs 
            WHERE session_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `);
        const logs = stmt.all(sessionId, limit) as { id: number, role: string, content: string }[];
        return logs.reverse(); // Return in chronological order
    }

    /**
     * Get Long-term memory from DB
     */
    public getLongTermMemory(sessionId: string): string {
        const stmt = this.db.prepare(`SELECT summary_content FROM long_term_memories WHERE session_id = ?`);
        const row = stmt.get(sessionId) as { summary_content: string } | undefined;
        return row ? row.summary_content : "";
    }

    /**
     * Save Long-term memory to DB
     */
    public saveLongTermMemory(sessionId: string, summary: string): void {
        const stmt = this.db.prepare(`
            INSERT INTO long_term_memories (session_id, summary_content, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(session_id) DO UPDATE SET 
                summary_content = excluded.summary_content,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(sessionId, summary);
    }

    /**
     * Identify the boundary ID for the sliding window
     */
    public getBoundaryLogId(sessionId: string, windowOffset: number): number | null {
        // windowOffset is usually WINDOW_SIZE - 1. So if we keep 6 newest, we find the 6th newest.
        const stmt = this.db.prepare(`
            SELECT id FROM raw_chatlogs 
            WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1 OFFSET ?
        `);
        const row = stmt.get(sessionId, windowOffset) as { id: number } | undefined;
        return row ? row.id : null;
    }

    /**
     * Get old unsummarized logs older than the boundary ID
     */
    public getUnsummarizedLogs(sessionId: string, boundaryId: number): { id: number, role: string, content: string }[] {
        const stmt = this.db.prepare(`
            SELECT id, role, content FROM raw_chatlogs 
            WHERE session_id = ? AND id < ? AND is_summarized = 0
            ORDER BY timestamp ASC
        `);
        return stmt.all(sessionId, boundaryId) as { id: number, role: string, content: string }[];
    }

    /**
     * Mark specific logs as summarized
     */
    public markLogsAsSummarized(logIds: number[]): void {
        if (logIds.length === 0) return;

        // SQLite has a limit on the number of bind parameters (usually 999). 
        // We'll just run it per chunk or prepare a dynamic statement.
        const placeholders = logIds.map(() => '?').join(',');
        const stmt = this.db.prepare(`UPDATE raw_chatlogs SET is_summarized = 1 WHERE id IN (${placeholders})`);
        stmt.run(...logIds);
    }
}

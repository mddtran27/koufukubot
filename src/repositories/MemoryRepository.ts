import fs from 'fs';
import path from 'path';
import { MemoryStore } from '../types/index';

// We explicitly DO NOT import and use async-mutex here yet if it hasn't been added to dependencies,
// but the architecture requires it. For now, we will add synchronous read/writes and simple async ones.
// In the full app, the service layer often manages the mutex, or we can add it to the repository.

export class MemoryRepository {
    private filePath: string;

    constructor(filePath: string = path.join(__dirname, '../../data/memory.json')) {
        this.filePath = filePath;
        // Ensure directory exists
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Initialize if needed
        if (!fs.existsSync(this.filePath)) {
            const defaultMemory: MemoryStore = {
                absolute_directives: [],
                social_adaptations: [],
                implicit_constraints: [],
                preferred_styles: [],
                semantic_memories: [],
                user_preferences: {}
            };
            this.saveMemorySync(defaultMemory);
        }
    }

    /**
     * Reads structural JSON memory into memory store
     */
    public loadMemorySync(): MemoryStore {
        try {
            if (!fs.existsSync(this.filePath)) {
                return {
                    absolute_directives: [],
                    social_adaptations: [],
                    implicit_constraints: [],
                    preferred_styles: [],
                    semantic_memories: [],
                    user_preferences: {}
                };
            }
            const data = fs.readFileSync(this.filePath, 'utf-8');
            return JSON.parse(data) as MemoryStore;
        } catch (error) {
            console.error('[MemoryRepository] ❌ Error reading memory.json:', error);
            throw error;
        }
    }

    /**
     * Synchronous disk save - mainly for absolute forced directives 
     * where the bot must bypass normal event loops
     */
    public saveMemorySync(data: MemoryStore): void {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            fs.writeFileSync(this.filePath, jsonString, 'utf-8');
        } catch (error) {
            console.error('[MemoryRepository] ❌ Error writing memory.json:', error);
            throw error;
        }
    }

    /**
     * Store a dynamic user preference (like pronouns)
     */
    public saveUserPreference(userId: string, preferenceKey: string, value: string): void {
        const memory = this.loadMemorySync();
        if (!memory.user_preferences) memory.user_preferences = {};

        const key = `${userId}_${preferenceKey}`;
        memory.user_preferences[key] = value;
        this.saveMemorySync(memory);
        console.log(`[Memory] 🧠 Saved user preference for ${userId}: ${preferenceKey} = ${value}`);
    }

    /**
     * Retrieve a dynamic user preference
     */
    public getUserPreference(userId: string, preferenceKey: string): string | null {
        const memory = this.loadMemorySync();
        if (!memory.user_preferences) return null;

        const key = `${userId}_${preferenceKey}`;
        return memory.user_preferences[key] || null;
    }

    /**
     * Appends a new semantic memory to the store
     */
    public addSemanticMemory(memory: any): void {
        const store = this.loadMemorySync();
        if (!store.semantic_memories) store.semantic_memories = [];
        store.semantic_memories.push(memory);
        this.saveMemorySync(store);
        console.log(`[Memory] 🧩 Persisted new semantic memory (${memory.id})`);
    }

    // To adhere to strictly isolating the data layer, the service layer 
    // utilizing this repo will be responsible for locking (via async-mutex).
}

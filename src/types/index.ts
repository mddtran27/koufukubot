// src/types/index.ts

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatLogEntry {
    id?: number;
    sessionId: string;
    role: MessageRole;
    content: string;
    timestamp: string;
}

export interface SemanticMemory {
    id: string;
    channelId: string;
    summary: string;
    timestamp: number;
    embedding: number[];
}

export interface LessonEntry {
    command: string;
    savedAt: number;
}

// Additional types for Memory Repository
export interface MemoryStore {
    absolute_directives: LessonEntry[];
    social_adaptations: any[];
    implicit_constraints: any[];
    preferred_styles: any[];
    semantic_memories: SemanticMemory[];
    user_preferences: Record<string, string>;
}

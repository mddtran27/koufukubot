import { pipeline } from '@huggingface/transformers';
import { SemanticMemory } from '../../types/index';

/**
 * Thread-safe singleton pattern for the ONNX embedding model.
 */
class EmbedderSingleton {
    static task = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';
    static instance: any = null;

    static async getInstance(progress_callback?: any) {
        if (this.instance === null) {
            this.instance = pipeline(this.task as any, this.model, { progress_callback });
        }
        return this.instance;
    }
}

export class VectorMemoryService {

    /**
     * Generates a 384-dimensional normalized vector for a given text.
     */
    public async embedText(text: string): Promise<number[]> {
        try {
            const embedder = await EmbedderSingleton.getInstance();
            const output = await embedder(text, { pooling: 'mean', normalize: true });
            return Array.from(output.data);
        } catch (err) {
            console.error('[VectorMemoryService] ❌ Failed to embed text:', err);
            throw err;
        }
    }

    /**
     * Calculates cosine similarity between two PRE-NORMALIZED vectors using dot product.
     */
    public calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) return 0;
        return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    }

    /**
     * Applies linear time decay based on a 30-day half-life.
     */
    public calculateTimeRelevance(memoryTimestamp: number): number {
        const ageDays = (Date.now() - memoryTimestamp) / (1000 * 60 * 60 * 24);
        const timeRelevance = Math.max(0, 1 - (ageDays / 30));
        return timeRelevance;
    }

    /**
     * Calculates the combined score: similarity is weighted much higher than time decay 
     * to prevent new, generic memories from overpowering older, highly relevant ones.
     */
    public calculateCombinedScore(vecA: number[], vecB: number[], timestamp: number): number {
        const similarity = this.calculateCosineSimilarity(vecA, vecB);
        const timeRelevance = this.calculateTimeRelevance(timestamp);

        // 90% meaning, 10% recency
        return (0.9 * similarity) + (0.1 * timeRelevance);
    }

    /**
     * Searches a list of semantic memories for the best matches.
     */
    public async retrieveRelevantMemories(
        queryText: string,
        memories: SemanticMemory[],
        topK: number = 3,
        threshold: number = 0.4
    ): Promise<SemanticMemory[]> {
        if (!memories || memories.length === 0) return [];

        const queryEmbedding = await this.embedText(queryText);

        const scoredMemories = memories.map(memory => {
            const score = this.calculateCombinedScore(queryEmbedding, memory.embedding, memory.timestamp);
            return { memory, score };
        });

        return scoredMemories
            .filter(m => m.score > threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(m => m.memory);
    }

    /**
     * Higher-level orchestration: Summarizes, embeds, and saves a window of logs.
     */
    public async consolidateMemory(
        content: string,
        channelId: string,
        memoryRepo: any
    ): Promise<void> {
        try {
            const embedding = await this.embedText(content);
            const memory: SemanticMemory = {
                id: `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                channelId,
                summary: content,
                timestamp: Date.now(),
                embedding
            };
            memoryRepo.addSemanticMemory(memory);
        } catch (err) {
            console.error('[VectorMemoryService] ❌ Failed to consolidate memory:', err);
        }
    }
}

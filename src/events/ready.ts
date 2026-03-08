import { Client, Events } from 'discord.js';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { ChatLogRepository } from '../repositories/ChatLogRepository';

export default {
    name: Events.ClientReady,
    once: true,
    execute(client: Client) {
        console.log(`\n[Interface] ✅ Successfully logged in as: ${client.user?.tag}`);

        // Boot up and verify repositories independently
        try {
            const chatRepo = new ChatLogRepository();
            console.log(`[DataLayer] ✅ ChatLogRepository SQL DB ready.`);

            const memoryRepo = new MemoryRepository();
            const memory = memoryRepo.loadMemorySync();
            console.log(`[DataLayer] ✅ MemoryRepository JSON store ready. (Loaded ${memory.absolute_directives.length} directives)`);

        } catch (err) {
            console.error(`[DataLayer] ❌ Failed to initialize Repositories during boot:`, err);
        }

        console.log(`[Interface] 🟢 Koufuku is now fully operational in the Dead Zone.\n`);
    },
};

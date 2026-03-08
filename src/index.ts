import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import * as dotenv from 'dotenv';
import readyEvent from './events/ready';
import messageCreateEvent from './events/messageCreate';
import { ProactiveChatJob } from './jobs/ProactiveChatJob';

dotenv.config();

// Validate critical ENV VARS
if (!process.env.DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!process.env.GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");
if (!process.env.ALLOWED_CHANNELS) throw new Error("Missing ALLOWED_CHANNELS");

// Initialize Client with explicitly required Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Event Routing
client.once(readyEvent.name as string, () => readyEvent.execute(client));
client.on(messageCreateEvent.name as string, (message: any) => messageCreateEvent.execute(message, client));

// Error handling to prevent random crashes
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN).then(() => {
    // Start background jobs after successful login
    const proactiveJob = new ProactiveChatJob(client);
    proactiveJob.start();
});

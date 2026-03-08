import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    GROQ_API_KEY: process.env.GROQ_API_KEY, // Optional now
    LOCAL_LLM_URL: process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1',
    LOCAL_MODEL_NAME: process.env.LOCAL_MODEL_NAME || 'llama3.1',
    SERPER_API_KEY: process.env.SERPER_API_KEY, // Optional, for future use
    CREATOR_ID: process.env.CREATOR_ID,
    ALLOWED_CHANNELS: process.env.ALLOWED_CHANNELS ? process.env.ALLOWED_CHANNELS.split(',') : [],
};

// Validate Critical Environment Variables
const missingVars: string[] = [];

if (!config.DISCORD_TOKEN) missingVars.push('DISCORD_TOKEN');
if (!config.CREATOR_ID) missingVars.push('CREATOR_ID');
if (config.ALLOWED_CHANNELS.length === 0) missingVars.push('ALLOWED_CHANNELS');
if (!config.LOCAL_LLM_URL) missingVars.push('LOCAL_LLM_URL');
if (!config.LOCAL_MODEL_NAME) missingVars.push('LOCAL_MODEL_NAME');

if (missingVars.length > 0) {
    throw new Error(`[Configuration Error] ❌ Missing required environment variables: ${missingVars.join(', ')}`);
}

// Log successful configuration load (excluding secrets)
console.log(`[Config] ✅ Environment loaded. Allowed Channels: ${config.ALLOWED_CHANNELS.length}, Creator ID: ${config.CREATOR_ID}, Model: ${config.LOCAL_MODEL_NAME}`);

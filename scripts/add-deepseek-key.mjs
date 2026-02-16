#!/usr/bin/env node
/**
 * 添加 DeepSeek API Key 到 auth.profiles
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(process.env.HOME || '/home/pc', '.clawdbot', 'clawdbot.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// 添加 DeepSeek API key
config.auth.profiles['deepseek:default'] = {
  provider: "deepseek",
  mode: "api_key",
  apiKey: "sk-635965c643a4427284321c120002b749"
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('✅ 已添加 DeepSeek API Key');
console.log('API Key: sk-635965c643a4427284321c120002b749');

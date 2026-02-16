#!/usr/bin/env node
/**
 * 更新 OpenAI 模型为 GPT-5.2 系列
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(process.env.HOME || '/home/pc', '.clawdbot', 'clawdbot.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// 更新 OpenAI 模型为 GPT-5.2 系列
if (config.models.providers.openai) {
  config.models.providers.openai.models = [
    {
      id: "gpt-5.2",
      name: "GPT-5.2 (Latest)",
      reasoning: false,
      input: ["text"],
      cost: { input: 10, output: 30 },
      contextWindow: 2000000,
      maxTokens: 65536
    },
    {
      id: "gpt-5.2-codex",
      name: "GPT-5.2 Codex",
      reasoning: false,
      input: ["text"],
      cost: { input: 15, output: 45 },
      contextWindow: 2000000,
      maxTokens: 65536
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      reasoning: false,
      input: ["text"],
      cost: { input: 0.15, output: 0.6 },
      contextWindow: 128000,
      maxTokens: 16384
    }
  ];
  
  // 更新别名
  config.agents.defaults.models['openai/gpt-5.2'] = { alias: 'GPT-5.2' };
  config.agents.defaults.models['openai/gpt-5.2-codex'] = { alias: 'Codex' };
  config.agents.defaults.models['openai/gpt-4o-mini'] = { alias: 'GPT-4o-mini' };
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('✅ 已更新为 GPT-5.2 系列');
  console.log('可用模型: openai/gpt-5.2 (GPT-5.2), openai/gpt-5.2-codex (Codex)');
} else {
  console.log('❌ 未找到 OpenAI provider');
}

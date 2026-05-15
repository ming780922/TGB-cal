import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('[ai-analysis] ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic.');
}
const client = new Anthropic({ apiKey });
const MODEL = process.env.MODEL || 'claude-sonnet-4-6';

/**
 * Generate analysis text using Anthropic Claude.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generate(prompt) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0]?.type === 'text' ? msg.content[0].text : '';
}

import OpenAI from 'openai';

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  throw new Error('[ai-analysis] NVIDIA_API_KEY is required when AI_PROVIDER=nvidia.');
}
const client = new OpenAI({
  apiKey,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});
const MODEL = process.env.MODEL || 'meta/llama-3.1-70b-instruct';

/**
 * Generate analysis text using NVIDIA NIM (streaming, OpenAI-compatible).
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generate(prompt) {
  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  let result = '';
  for await (const chunk of stream) {
    result += chunk.choices[0]?.delta?.content ?? '';
  }
  return result;
}

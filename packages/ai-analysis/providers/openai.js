import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('[ai-analysis] OPENAI_API_KEY is required when AI_PROVIDER=openai. Set it in .env or as a GitHub Actions secret.');
}
const client = new OpenAI({ apiKey });
const MODEL = process.env.MODEL || 'gpt-4o';

/**
 * Generate analysis text using OpenAI.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generate(prompt) {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0]?.message?.content ?? '';
}

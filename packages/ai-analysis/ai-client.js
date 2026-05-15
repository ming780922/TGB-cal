const provider = process.env.AI_PROVIDER || 'anthropic';

const supported = ['anthropic', 'openai'];
if (!supported.includes(provider)) {
  throw new Error(`Unsupported AI_PROVIDER="${provider}". Choose: ${supported.join(', ')}`);
}

// Dynamic import so only the chosen SDK is loaded
const { generate } = await import(`./providers/${provider}.js`);

export { generate };

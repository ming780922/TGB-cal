const provider = process.env.AI_PROVIDER || 'anthropic';

const supported = ['anthropic', 'openai'];
if (!supported.includes(provider)) {
  throw new Error(`Unsupported AI_PROVIDER="${provider}". Choose: ${supported.join(', ')}`);
}

// Top-level await is valid in ESM. Dynamic import ensures only the chosen SDK is loaded.
const { generate } = await import(`./providers/${provider}.js`);

export { generate };

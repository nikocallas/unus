// Every runtime model call in Unus goes to a Meta model. No other vendor is called by product code.
// Meta Model API usage is Standard tier ONLY — Contributor tier (which permits training on
// prompts/completions) is never used.

export const META_MODELS = {
  extraction: {
    label: 'Muse Spark Open via Baseten',
    provider: 'baseten',
    model: 'meta-models/muse-spark-open-1026',
    apiKeyEnv: 'BASETEN_API_KEY',
  },
  normalization: {
    label: 'Muse Spark via Meta Model API',
    provider: 'meta-model-api',
    // TODO(Wed Oct 28): confirm the exact model id from the Monday hello-world call.
    model: 'muse-spark',
    tier: 'standard',
    apiKeyEnv: 'META_MODEL_API_KEY',
    baseUrlEnv: 'META_MODEL_API_BASE_URL',
  },
  atlas: {
    label: 'Muse Image via Meta Model API',
    provider: 'meta-model-api',
    // TODO(Fri Oct 30): confirm the exact model id.
    model: 'muse-image',
    tier: 'standard',
    apiKeyEnv: 'META_MODEL_API_KEY',
    baseUrlEnv: 'META_MODEL_API_BASE_URL',
  },
} as const;

export type MetaModelRole = keyof typeof META_MODELS;

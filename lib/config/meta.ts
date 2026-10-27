// Every runtime model call in Unus goes to a Meta model. No other vendor is called by product code.
// Meta Model API usage is Standard tier ONLY — Contributor tier (which permits training on
// prompts/completions) is never used. The client refuses to run unless the operator attests
// META_MODEL_API_TIER=standard, because the tier is an account setting the API cannot report.

export const SPARK_OPEN_MODEL = 'meta-models/muse-spark-open-1026';

export const META_MODELS = {
  extraction: {
    label: 'Muse Spark Open via Baseten',
    model: SPARK_OPEN_MODEL,
    env: { apiKey: 'BASETEN_API_KEY', baseUrl: 'BASETEN_BASE_URL' },
    defaultBaseUrl: 'https://inference.baseten.co/v1',
  },
  normalization: {
    label: 'Muse Spark via Meta Model API (Standard tier)',
    env: { apiKey: 'META_MODEL_API_KEY', baseUrl: 'META_MODEL_API_BASE_URL', model: 'META_SPARK_MODEL', format: 'META_MODEL_API_FORMAT', tier: 'META_MODEL_API_TIER' },
  },
  atlas: {
    label: 'Muse Image via Meta Model API (Standard tier)',
    env: { apiKey: 'META_MODEL_API_KEY', url: 'META_IMAGE_API_URL', model: 'META_IMAGE_MODEL', tier: 'META_MODEL_API_TIER' },
  },
} as const;

export type MetaModelRole = keyof typeof META_MODELS;

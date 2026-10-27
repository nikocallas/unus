// Env-gated Meta model clients. Nothing here substitutes another vendor or fakes output:
// when a key, model id or tier attestation is missing, the client reports itself unavailable
// and the pipeline uses its labelled deterministic fallback instead.

import { META_MODELS } from '../config/meta.ts';

export type Env = Record<string, string | undefined>;

export type UnavailableReason = 'missing_key' | 'missing_model' | 'missing_endpoint' | 'tier_not_standard';

export class ModelUnavailableError extends Error {
  readonly reason: UnavailableReason;
  readonly envVar: string;
  constructor(reason: UnavailableReason, envVar: string) {
    super(`${reason}: ${envVar}`);
    this.name = 'ModelUnavailableError';
    this.reason = reason;
    this.envVar = envVar;
  }
}

export class ModelCallError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'ModelCallError';
    this.status = status;
  }
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatClient {
  label: string;
  model: string;
  complete(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string>;
}

export interface ImageClient {
  label: string;
  model: string;
  generate(prompt: string): Promise<{ dataUrl: string }>;
}

type FetchLike = typeof fetch;

const TIMEOUT_MS = 45_000;
// Muse Spark reasons before answering, so its calls get more time and more output tokens.
const META_TIMEOUT_MS = 150_000;
export const META_MAX_TOKENS = 16_000;

async function postJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>, body: unknown, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new ModelCallError(`HTTP ${res.status}`, res.status);
  return res.json();
}

function openAiText(json: unknown): string {
  const content = (json as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new ModelCallError('Unexpected response shape', null);
  return content;
}

function anthropicText(json: unknown): string {
  const blocks = (json as { content?: { type: string; text?: string }[] }).content;
  const text = blocks?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  if (!text) throw new ModelCallError('Unexpected response shape', null);
  return text;
}

/** Muse Spark Open on Baseten (OpenAI-compatible chat completions). */
export function sparkOpenClient(env: Env, fetchImpl: FetchLike = fetch): ChatClient {
  const cfg = META_MODELS.extraction;
  const key = env[cfg.env.apiKey];
  if (!key) throw new ModelUnavailableError('missing_key', cfg.env.apiKey);
  const baseUrl = (env[cfg.env.baseUrl] || cfg.defaultBaseUrl).replace(/\/$/, '');
  return {
    label: cfg.label,
    model: cfg.model,
    async complete(messages, opts) {
      const json = await postJson(fetchImpl, `${baseUrl}/chat/completions`, { authorization: `Bearer ${key}` }, {
        model: cfg.model,
        messages,
        temperature: 0,
        max_tokens: opts?.maxTokens ?? 4096,
      });
      return openAiText(json);
    },
  };
}

function requireStandardTier(env: Env): void {
  const tierVar = META_MODELS.normalization.env.tier;
  if ((env[tierVar] ?? '').toLowerCase() !== 'standard') throw new ModelUnavailableError('tier_not_standard', tierVar);
}

/** The Meta Model API exposes Contributor tier as separate model ids (e.g. "muse-spark-1.3-contributor"). Never use them. */
function requireStandardModel(model: string, envVar: string): void {
  if (/contributor/i.test(model)) throw new ModelUnavailableError('tier_not_standard', envVar);
}

/** Muse Spark on the Meta Model API, Standard tier only. Wire format is configurable ('anthropic' | 'openai'). */
export function museSparkClient(env: Env, fetchImpl: FetchLike = fetch): ChatClient {
  const cfg = META_MODELS.normalization;
  const key = env[cfg.env.apiKey];
  if (!key) throw new ModelUnavailableError('missing_key', cfg.env.apiKey);
  requireStandardTier(env);
  const model = env[cfg.env.model];
  if (!model) throw new ModelUnavailableError('missing_model', cfg.env.model);
  requireStandardModel(model, cfg.env.model);
  const baseUrl = env[cfg.env.baseUrl]?.replace(/\/$/, '');
  if (!baseUrl) throw new ModelUnavailableError('missing_endpoint', cfg.env.baseUrl);
  const format = (env[cfg.env.format] || 'anthropic').toLowerCase();
  return {
    label: `${cfg.label} · ${model}`,
    model,
    async complete(messages, opts) {
      const maxTokens = opts?.maxTokens ?? META_MAX_TOKENS;
      if (format === 'openai') {
        const json = await postJson(fetchImpl, `${baseUrl}/chat/completions`, { authorization: `Bearer ${key}` }, { model, messages, temperature: 0, max_tokens: maxTokens }, META_TIMEOUT_MS);
        return openAiText(json);
      }
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const json = await postJson(fetchImpl, `${baseUrl}/v1/messages`, { authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01' }, {
        model,
        system,
        max_tokens: maxTokens,
        temperature: 0,
        messages: messages.filter((m) => m.role === 'user').map((m) => ({ role: 'user', content: m.content })),
      }, META_TIMEOUT_MS);
      return anthropicText(json);
    },
  };
}

/** Muse Image on the Meta Model API, Standard tier only. Expects an images-generation style endpoint. */
export function museImageClient(env: Env, fetchImpl: FetchLike = fetch): ImageClient {
  const cfg = META_MODELS.atlas;
  const key = env[cfg.env.apiKey];
  if (!key) throw new ModelUnavailableError('missing_key', cfg.env.apiKey);
  requireStandardTier(env);
  const model = env[cfg.env.model];
  if (!model) throw new ModelUnavailableError('missing_model', cfg.env.model);
  requireStandardModel(model, cfg.env.model);
  const url = env[cfg.env.url];
  if (!url) throw new ModelUnavailableError('missing_endpoint', cfg.env.url);
  return {
    label: `${cfg.label} · ${model}`,
    model,
    async generate(prompt) {
      const json = (await postJson(fetchImpl, url, { authorization: `Bearer ${key}` }, { model, prompt, n: 1, response_format: 'b64_json' }, META_TIMEOUT_MS)) as {
        data?: { b64_json?: string; url?: string }[];
      };
      const item = json.data?.[0];
      if (item?.b64_json) return { dataUrl: `data:${imageMime(item.b64_json)};base64,${item.b64_json}` };
      if (item?.url) return { dataUrl: item.url };
      throw new ModelCallError('Unexpected response shape', null);
    },
  };
}

/** Muse Image returns WebP; sniff the magic bytes rather than assuming a format. */
function imageMime(b64: string): string {
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  return 'image/png';
}

/** Privacy-safe error category for UI and logs (never the payload). */
export function errorCategory(err: unknown): string {
  if (err instanceof ModelUnavailableError) return `unavailable:${err.reason}:${err.envVar}`;
  if (err instanceof ModelCallError) return err.status ? `http_${err.status}` : 'bad_response';
  if (err instanceof Error && err.name === 'TimeoutError') return 'timeout';
  if (err instanceof SyntaxError) return 'unparseable_output';
  return 'call_failed';
}

/** Pull the first JSON object/array out of a model reply (tolerates code fences and prose). */
export function parseJsonReply(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.search(/[[{]/);
  if (start < 0) throw new SyntaxError('No JSON in reply');
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(close);
  return JSON.parse(candidate.slice(start, end + 1));
}

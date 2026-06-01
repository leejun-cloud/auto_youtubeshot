// WaveSpeed AI API client — GPT-Image-2 + Wan 2.2 Ultra Fast.
// Docs: https://api.wavespeed.ai/api/v3
// Pricing: GPT-Image-2 ~$0.06-0.18/image | Wan 2.2 $0.01/second

const BASE_URL = 'https://api.wavespeed.ai/api/v3';
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 75; // ~5 min max

// Model IDs — override via env if WaveSpeed changes slugs
const MODEL_IMAGE = process.env.WAVESPEED_MODEL_IMAGE ?? 'openai/gpt-image-2/text-to-image';
const MODEL_T2V   = process.env.WAVESPEED_MODEL_T2V   ?? 'wavespeed-ai/wan-v2.2-ultra-fast/t2v';
const MODEL_I2V   = process.env.WAVESPEED_MODEL_I2V   ?? 'wavespeed-ai/wan-v2.2-ultra-fast/img2vid';

const apiKey = (): string => {
  const k = process.env.WAVESPEED_API_KEY;
  if (!k) throw new Error('WAVESPEED_API_KEY 미설정');
  return k;
};

const headers = () => ({
  'Authorization': `Bearer ${apiKey()}`,
  'Content-Type': 'application/json',
});

// ── Submit prediction ───────────────────────────────────────────────
const submit = async (modelId: string, body: Record<string, unknown>): Promise<string> => {
  const res = await fetch(`${BASE_URL}/${modelId}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(`WaveSpeed ${res.status}: ${json?.message ?? JSON.stringify(json)}`);

  // Immediate success (some models return outputs directly)
  const outputs = json?.data?.outputs ?? json?.outputs;
  if (Array.isArray(outputs) && outputs.length > 0) return outputs[0];

  // Async: return prediction id
  const id = json?.data?.id ?? json?.id;
  if (!id) throw new Error(`WaveSpeed: 예측 ID 없음 — ${JSON.stringify(json)}`);
  return `poll:${id}`;
};

// ── Poll prediction until completed ────────────────────────────────
const poll = async (id: string): Promise<string> => {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${BASE_URL}/predictions/${id}/result`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (!res.ok) continue;
    const json = await res.json() as any;
    const status: string = json?.data?.status ?? json?.status ?? '';
    if (status === 'completed' || status === 'succeeded') {
      const outputs = json?.data?.outputs ?? json?.outputs ?? [];
      const url = Array.isArray(outputs) ? outputs[0] : outputs;
      if (!url) throw new Error('WaveSpeed: 출력 URL 없음');
      return url;
    }
    if (status === 'failed') throw new Error(`WaveSpeed 실패: ${json?.data?.error ?? JSON.stringify(json)}`);
  }
  throw new Error('WaveSpeed: 시간 초과 (5분)');
};

const resolve = async (modelId: string, body: Record<string, unknown>): Promise<string> => {
  const result = await submit(modelId, body);
  if (!result.startsWith('poll:')) return result;
  return poll(result.slice(5));
};

// ── Download URL to Buffer ──────────────────────────────────────────
export const downloadBuffer = async (url: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

// ── GPT-Image-2: text → image URL ─────────────────────────────────
export interface SceneImageResult {
  url: string;
  prompt: string;
}

export const generateSceneImage = async (
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' = '16:9'
): Promise<SceneImageResult | null> => {
  try {
    const url = await resolve(MODEL_IMAGE, {
      prompt,
      aspect_ratio: aspectRatio,
      quality: 'medium',
    });
    return { url, prompt };
  } catch (e) {
    console.warn('[wavespeed/image] 실패:', e instanceof Error ? e.message : e);
    return null;
  }
};

// ── Wan 2.2 Ultra Fast: image → video URL ─────────────────────────
export interface SceneVideoResult {
  url: string;
  durationSec: number;
}

export const animateImage = async (
  imageUrl: string,
  motionPrompt: string,
  durationSec = 5
): Promise<SceneVideoResult | null> => {
  try {
    const url = await resolve(MODEL_I2V, {
      image: imageUrl,
      prompt: motionPrompt,
      duration: durationSec,
    });
    return { url, durationSec };
  } catch (e) {
    console.warn('[wavespeed/i2v] 실패:', e instanceof Error ? e.message : e);
    return null;
  }
};

// ── Wan 2.2 Ultra Fast: text → video URL ──────────────────────────
export const generateSceneVideo = async (
  prompt: string,
  durationSec = 5
): Promise<SceneVideoResult | null> => {
  try {
    const url = await resolve(MODEL_T2V, {
      prompt,
      duration: durationSec,
    });
    return { url, durationSec };
  } catch (e) {
    console.warn('[wavespeed/t2v] 실패:', e instanceof Error ? e.message : e);
    return null;
  }
};

import { GoogleGenAI } from '@google/genai';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { convertNumerals } from './korean-numerals';

const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_VOICE = 'Kore';

const QUOTA_MESSAGE =
  'Gemini 무료 사용량(할당량)을 초과했습니다. 잠시(1~2분) 후 다시 시도하거나, ' +
  'Google AI Studio(https://aistudio.google.com)에서 결제를 등록해 할당량을 늘려주세요. ' +
  '무료 등급은 음성(TTS) 호출 수가 매우 제한적입니다.';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isQuotaError = (e: unknown): boolean => {
  const s = `${(e as { message?: string })?.message ?? ''} ${(e as { status?: string })?.status ?? ''} ${String(e)}`;
  return s.includes('429') || s.includes('RESOURCE_EXHAUSTED') || /quota/i.test(s);
};

// 에러 메시지에서 재시도 대기 시간(초)을 추출. 없으면 0.
const parseRetrySec = (e: unknown): number => {
  const s = `${(e as { message?: string })?.message ?? ''} ${String(e)}`;
  const m1 = s.match(/retry in ([\d.]+)\s*s/i);
  if (m1) return Math.ceil(parseFloat(m1[1]));
  const m2 = s.match(/"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s"?/i);
  if (m2) return Math.ceil(parseFloat(m2[1]));
  return 0;
};

// 429(할당량 초과) 시 자동 재시도. 최종 실패하면 친절한 한국어 메시지로 변환.
async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  maxRetries = 3
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (e) {
      if (isQuotaError(e) && attempt < maxRetries) {
        const wait = (parseRetrySec(e) || 5 * (attempt + 1)) + 1;
        console.warn(`[TTS] 할당량 제한(429). ${wait}초 후 재시도 (${attempt + 1}/${maxRetries})`);
        await sleep(wait * 1000);
        continue;
      }
      if (isQuotaError(e)) throw new Error(QUOTA_MESSAGE);
      throw e;
    }
  }
}

export interface TTSOptions {
  voiceName?: string;
  model?: string;
  apiKey?: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  localPath: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  durationSec: number;
}

const getWavDurationSec = (wavBuffer: Buffer): number => {
  // PCM WAV: read sample rate (offset 24), bits per sample (34), channels (22), data size (40)
  if (wavBuffer.length < 44 || wavBuffer.subarray(0, 4).toString() !== 'RIFF') {
    return 0;
  }
  const channels = wavBuffer.readUInt16LE(22);
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const dataSize = wavBuffer.readUInt32LE(40);
  const bytesPerSample = (bitsPerSample / 8) * channels;
  if (bytesPerSample === 0 || sampleRate === 0) return 0;
  return dataSize / bytesPerSample / sampleRate;
};

const parsePcmRateFromMime = (mime: string): number => {
  const match = mime.match(/rate=(\d+)/);
  return match ? Number(match[1]) : 24000;
};

const wrapPcmAsWav = (
  pcmBuffer: Buffer,
  sampleRate: number,
  bitsPerSample = 16,
  channels = 1
): Buffer => {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const fileSize = 44 + dataSize - 8;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
};

export const synthesizeKoreanNarration = async (
  text: string,
  opts: TTSOptions = {}
): Promise<TTSResult> => {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 미설정');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = opts.model || process.env.GEMINI_TTS_MODEL || DEFAULT_MODEL;
  const voiceName = opts.voiceName || DEFAULT_VOICE;

  const processedText = convertNumerals(text);

  const response = await generateContentWithRetry(ai, {
    model,
    contents: [{ parts: [{ text: processedText }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const part = response?.candidates?.[0]?.content?.parts?.[0];
  const inline = part?.inlineData;
  if (!inline?.data) {
    throw new Error('Gemini TTS 응답에 오디오 데이터 없음');
  }

  const mimeType = inline.mimeType || 'audio/L16;rate=24000';
  const rawBuffer = Buffer.from(inline.data, 'base64');

  // Gemini TTS returns raw PCM (audio/L16) — wrap in WAV header for playback
  let audioBuffer: Buffer;
  let extension: string;
  if (mimeType.includes('pcm') || mimeType.includes('L16')) {
    const sampleRate = parsePcmRateFromMime(mimeType);
    audioBuffer = wrapPcmAsWav(rawBuffer, sampleRate);
    extension = 'wav';
  } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
    audioBuffer = rawBuffer;
    extension = 'mp3';
  } else {
    audioBuffer = rawBuffer;
    extension = 'wav';
  }

  const fileName = `tts-${Date.now()}.${extension}`;
  const outDir = path.join(process.cwd(), 'public', 'tts');
  await mkdir(outDir, { recursive: true });
  const localPath = path.join(outDir, fileName);
  await writeFile(localPath, audioBuffer);

  const durationSec = extension === 'wav' ? getWavDurationSec(audioBuffer) : 0;

  return {
    audioBuffer,
    localPath,
    publicUrl: `/tts/${fileName}`,
    fileName,
    mimeType,
    durationSec,
  };
};

export interface TTSSegmentResult {
  audioBuffer: Buffer;
  durationSec: number;
}

/**
 * Synthesize each text segment separately. Used to align scene transitions
 * with narration timing in segmented videos (LIST template).
 * Runs sequentially to avoid rate limits, but each segment is fast.
 */
export const synthesizeSegments = async (
  segments: string[],
  opts: TTSOptions = {}
): Promise<TTSSegmentResult[]> => {
  const results: TTSSegmentResult[] = [];
  for (const segment of segments) {
    const r = await synthesizeKoreanNarration(segment, opts);
    results.push({ audioBuffer: r.audioBuffer, durationSec: r.durationSec });
  }
  return results;
};

/**
 * Concatenate multiple PCM-WAV buffers into a single WAV.
 * All inputs must have the same sample rate / channels / bit depth.
 * Adds optional silence (in seconds) between segments.
 */
export const concatenateWavs = (
  wavBuffers: Buffer[],
  silenceBetweenSec = 0
): Buffer => {
  if (wavBuffers.length === 0) return Buffer.alloc(0);
  if (wavBuffers.length === 1) return wavBuffers[0];

  // Read format from first buffer
  const first = wavBuffers[0];
  const channels = first.readUInt16LE(22);
  const sampleRate = first.readUInt32LE(24);
  const bitsPerSample = first.readUInt16LE(34);
  const bytesPerSample = (bitsPerSample / 8) * channels;
  const byteRate = sampleRate * bytesPerSample;

  // Extract PCM data from each buffer (skip 44-byte header)
  const dataParts: Buffer[] = [];
  const silenceBytes = Math.round(silenceBetweenSec * byteRate);
  const silence = silenceBytes > 0 ? Buffer.alloc(silenceBytes) : null;

  wavBuffers.forEach((buf, i) => {
    const data = buf.subarray(44);
    dataParts.push(data);
    if (silence && i < wavBuffers.length - 1) {
      dataParts.push(silence);
    }
  });

  const pcmCombined = Buffer.concat(dataParts);
  const dataSize = pcmCombined.length;
  const fileSize = 44 + dataSize - 8;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmCombined]);
};

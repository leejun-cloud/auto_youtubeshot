// Free music search via Jamendo API.
// Requires JAMENDO_CLIENT_ID (free signup at https://devportal.jamendo.com/).
// Returns a Creative Commons track matching the search query.

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const JAMENDO_API = 'https://api.jamendo.com/v3.0';

export interface JamendoTrack {
  id: string;
  name: string;
  artistName: string;
  durationSec: number;
  audioDownloadUrl: string;
  shareUrl: string;
  license: string;
}

export const searchJamendoTracks = async (
  query: string,
  options: { limit?: number; minDurationSec?: number; maxDurationSec?: number } = {}
): Promise<JamendoTrack[]> => {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    throw new Error('JAMENDO_CLIENT_ID 미설정 (https://devportal.jamendo.com/ 에서 무료 발급)');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: String(options.limit || 10),
    fuzzytags: query,
    audioformat: 'mp32',
    audiodlformat: 'mp32',
    include: 'musicinfo',
    order: 'popularity_total',
    boost: 'popularity_total',
  });

  const url = `${JAMENDO_API}/tracks/?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jamendo search failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.headers?.status !== 'success') {
    throw new Error(`Jamendo error: ${JSON.stringify(data.headers)}`);
  }
  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`Jamendo: 검색 결과 없음 (query: "${query}")`);
  }

  const tracks: JamendoTrack[] = data.results.map((t: any) => ({
    id: String(t.id),
    name: t.name || '',
    artistName: t.artist_name || '',
    durationSec: Number(t.duration) || 0,
    audioDownloadUrl: t.audiodownload || t.audio,
    shareUrl: t.shareurl || '',
    license: t.license_ccurl || 'CC',
  }));

  // Filter by duration if requested
  let filtered = tracks;
  if (options.minDurationSec) {
    filtered = filtered.filter((t) => t.durationSec >= options.minDurationSec!);
  }
  if (options.maxDurationSec) {
    filtered = filtered.filter((t) => t.durationSec <= options.maxDurationSec!);
  }

  if (filtered.length === 0) {
    throw new Error(`Jamendo: 길이 조건 맞는 트랙 없음`);
  }

  return filtered;
};

export interface DownloadedTrack {
  filePath: string;
  durationSec: number;
  attribution: string;
  source: 'jamendo';
}

/**
 * Search Jamendo and download the first matching track to a local file.
 * Picks one randomly from top 5 results for variety.
 */
export const fetchJamendoTrack = async (
  query: string,
  outDir: string,
  options: { minDurationSec?: number; maxDurationSec?: number } = {}
): Promise<DownloadedTrack> => {
  const tracks = await searchJamendoTracks(query, {
    ...options,
    limit: 20,
  });

  // Pick from top 5 for variety
  const candidates = tracks.slice(0, 5);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  // Download
  const dlRes = await fetch(chosen.audioDownloadUrl);
  if (!dlRes.ok) {
    throw new Error(`Jamendo download failed: HTTP ${dlRes.status}`);
  }
  const buffer = Buffer.from(await dlRes.arrayBuffer());

  await mkdir(outDir, { recursive: true });
  const fileName = `jamendo-${chosen.id}.mp3`;
  const filePath = path.join(outDir, fileName);
  await writeFile(filePath, buffer);

  return {
    filePath,
    durationSec: chosen.durationSec,
    attribution: `${chosen.name} by ${chosen.artistName} (Jamendo, ${chosen.license})`,
    source: 'jamendo',
  };
};

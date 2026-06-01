// Pexels free stock — images + videos for photo card backgrounds.
// API key: PEXELS_API_KEY env var.

export interface PexelsResult {
  dataUri: string;
  mediaType: 'image' | 'video';
  credit: string;
  source: 'pexels';
}

const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

const downloadBuffer = async (url: string, key: string, maxBytes = Infinity): Promise<Buffer | null> => {
  const res = await fetch(url, {
    headers: { Authorization: key },
  });
  if (!res.ok) return null;

  const contentLength = Number(res.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) return null;

  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) return null;
  return Buffer.from(ab);
};

const toDataUri = (buf: Buffer, mime: string) =>
  `data:${mime};base64,${buf.toString('base64')}`;

const fetchPexelsImage = async (query: string, key: string): Promise<PexelsResult | null> => {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data.photos?.length) return null;

    const pool = data.photos.slice(0, 3);
    const photo = pool[Math.floor(Math.random() * pool.length)];
    // medium ~ 1280px, large ~ 1920px — use medium for reasonable size
    const imgUrl: string = photo.src?.large ?? photo.src?.medium ?? photo.src?.original;
    const buf = await downloadBuffer(imgUrl, key);
    if (!buf) return null;

    return {
      dataUri: toDataUri(buf, 'image/jpeg'),
      mediaType: 'image',
      credit: `Photo by ${photo.photographer} on Pexels`,
      source: 'pexels',
    };
  } catch {
    return null;
  }
};

const fetchPexelsVideo = async (query: string, key: string): Promise<PexelsResult | null> => {
  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data.videos?.length) return null;

    const pool = data.videos.slice(0, 3);
    const video = pool[Math.floor(Math.random() * pool.length)];

    // Pick smallest file for speed (sd < hd < uhd)
    const files: any[] = video.video_files ?? [];
    const sorted = files
      .filter((f) => f.file_type === 'video/mp4')
      .sort((a, b) => (a.width ?? 9999) - (b.width ?? 9999));
    const chosen = sorted[0];
    if (!chosen?.link) return null;

    const buf = await downloadBuffer(chosen.link, key, MAX_VIDEO_BYTES);
    if (!buf) return null;

    return {
      dataUri: toDataUri(buf, 'video/mp4'),
      mediaType: 'video',
      credit: `Video by ${video.user?.name ?? 'Pexels'} on Pexels`,
      source: 'pexels',
    };
  } catch {
    return null;
  }
};

// Tries video 50% of the time first; falls back to the other type on failure.
export const fetchFromPexels = async (query: string, apiKey?: string): Promise<PexelsResult | null> => {
  const key = apiKey || process.env.PEXELS_API_KEY;
  if (!key) return null;

  const tryVideoFirst = Math.random() < 0.5;

  if (tryVideoFirst) {
    return (await fetchPexelsVideo(query, key)) ?? fetchPexelsImage(query, key);
  }
  return (await fetchPexelsImage(query, key)) ?? fetchPexelsVideo(query, key);
};

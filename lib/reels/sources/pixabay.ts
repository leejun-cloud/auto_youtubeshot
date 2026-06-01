// Pixabay free stock — images + videos for photo card backgrounds.
// API key: PIXABAY_API_KEY env var.

export interface PixabayResult {
  dataUri: string;
  mediaType: 'image' | 'video';
  credit: string;
  source: 'pixabay';
}

const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // 10 MB cap for background videos

const downloadBuffer = async (url: string, maxBytes = Infinity): Promise<Buffer | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;

  const contentLength = Number(res.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) return null;

  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) return null;
  return Buffer.from(ab);
};

const toDataUri = (buf: Buffer, mime: string) =>
  `data:${mime};base64,${buf.toString('base64')}`;

const fetchPixabayImage = async (query: string, key: string): Promise<PixabayResult | null> => {
  try {
    const url =
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}` +
      `&image_type=photo&orientation=vertical&per_page=5&safesearch=true&min_width=720`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data.hits?.length) return null;

    const pool = data.hits.slice(0, 3);
    const hit = pool[Math.floor(Math.random() * pool.length)];
    const imgUrl: string = hit.webformatURL ?? hit.largeImageURL;
    const buf = await downloadBuffer(imgUrl);
    if (!buf) return null;

    return {
      dataUri: toDataUri(buf, 'image/jpeg'),
      mediaType: 'image',
      credit: `Photo by ${hit.user} on Pixabay`,
      source: 'pixabay',
    };
  } catch {
    return null;
  }
};

const fetchPixabayVideo = async (query: string, key: string): Promise<PixabayResult | null> => {
  try {
    const url =
      `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}` +
      `&video_type=film&per_page=5&safesearch=true`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data.hits?.length) return null;

    const pool = data.hits.slice(0, 3);
    const hit = pool[Math.floor(Math.random() * pool.length)];
    // Prefer tiny > small to keep file size manageable
    const videoUrl: string =
      hit.videos?.tiny?.url ?? hit.videos?.small?.url ?? hit.videos?.medium?.url;
    if (!videoUrl) return null;

    const buf = await downloadBuffer(videoUrl, MAX_VIDEO_BYTES);
    if (!buf) return null;

    return {
      dataUri: toDataUri(buf, 'video/mp4'),
      mediaType: 'video',
      credit: `Video by ${hit.user} on Pixabay`,
      source: 'pixabay',
    };
  } catch {
    return null;
  }
};

// Tries video 50% of the time first; always falls back to the other type on failure.
export const fetchFromPixabay = async (query: string, apiKey?: string): Promise<PixabayResult | null> => {
  const key = apiKey || process.env.PIXABAY_API_KEY;
  if (!key) return null;

  const tryVideoFirst = Math.random() < 0.5;

  if (tryVideoFirst) {
    return (await fetchPixabayVideo(query, key)) ?? fetchPixabayImage(query, key);
  }
  return (await fetchPixabayImage(query, key)) ?? fetchPixabayVideo(query, key);
};

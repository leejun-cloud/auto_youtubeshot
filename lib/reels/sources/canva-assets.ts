// Canva Connect API — read user assets as photo card backgrounds.
// Requires: CANVA_ACCESS_TOKEN (obtain via scripts/canva-oauth.mjs).
// Falls back to null when unconfigured.

export interface CanvaAssetResult {
  dataUri: string;
  mediaType: 'image' | 'video';
  credit: string;
  source: 'canva';
}

const CANVA_BASE = 'https://api.canva.com/rest/v1';

const downloadBuffer = async (url: string, token: string): Promise<Buffer | null> => {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
};

const toDataUri = (buf: Buffer, mime: string) =>
  `data:${mime};base64,${buf.toString('base64')}`;

// Search user assets by keyword, return first image/video that can be downloaded.
export const fetchFromCanva = async (query: string): Promise<CanvaAssetResult | null> => {
  const token = process.env.CANVA_ACCESS_TOKEN;
  if (!token) return null;

  try {
    // List assets — Canva Connect API v1
    const searchUrl = `${CANVA_BASE}/assets?query=${encodeURIComponent(query)}&ownership=owned&per_page=5`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const items: any[] = data.items ?? [];
    if (!items.length) return null;

    for (const item of items) {
      const assetType: string = item.asset_type ?? '';
      const isImage = assetType === 'IMAGE';
      const isVideo = assetType === 'VIDEO';
      if (!isImage && !isVideo) continue;

      // Get download URL for the asset
      const detailRes = await fetch(`${CANVA_BASE}/assets/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!detailRes.ok) continue;
      const detail = (await detailRes.json()) as any;
      const downloadUrl: string = detail.thumbnail?.url ?? detail.url;
      if (!downloadUrl) continue;

      const mime = isVideo ? 'video/mp4' : 'image/jpeg';
      const buf = await downloadBuffer(downloadUrl, token);
      if (!buf) continue;

      return {
        dataUri: toDataUri(buf, mime),
        mediaType: isVideo ? 'video' : 'image',
        credit: item.name ?? 'Canva asset',
        source: 'canva',
      };
    }
    return null;
  } catch {
    return null;
  }
};

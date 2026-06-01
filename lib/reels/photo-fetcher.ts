// Media fetcher for photo card backgrounds.
// Returns both images and videos depending on availability from Pexels (premium cinematic vertical stock).

import { fetchFromPexels, PexelsResult } from './sources/pexels';

export interface FetchedMedia {
  dataUri: string;
  mediaType: 'image' | 'video';
  source: 'pexels';
  credit: string;
}

export const fetchPhoto = async (
  query: string,
  pexelsApiKey?: string
): Promise<FetchedMedia | null> => {
  try {
    const pexels = await fetchFromPexels(query, pexelsApiKey);
    if (pexels) {
      return {
        dataUri: pexels.dataUri,
        mediaType: pexels.mediaType,
        source: 'pexels',
        credit: pexels.credit,
      };
    }
  } catch (err) {
    console.error('[photo-fetcher] Pexels fetch failed:', err);
  }

  return null;
};

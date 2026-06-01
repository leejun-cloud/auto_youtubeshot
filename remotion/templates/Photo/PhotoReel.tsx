import { AbsoluteFill, Audio, Series } from 'remotion';
import { z } from 'zod';
import { REELS_FPS } from '../../types';
import { useFonts } from '../../fonts';
import { BgmTrack } from '../../components/BgmTrack';
import { PhotoCoverScene } from './scenes/PhotoCoverScene';
import { PhotoCardScene } from './scenes/PhotoCardScene';
import { PhotoCTAScene } from './scenes/PhotoCTAScene';

const photoCardSchema = z.object({
  headline: z.string(),
  body: z.string().optional(),
  imageDataUri: z.string().optional(),
  mediaType: z.enum(['image', 'video']).optional().default('image'),
});

export const photoSchema = z.object({
  hookHeadline: z.string(),
  coverImageDataUri: z.string().optional(),
  coverMediaType: z.enum(['image', 'video']).optional().default('image'),
  cards: z.array(photoCardSchema).min(1).max(8),
  cta: z.string(),
  audioUrl: z.string().optional(),
  audioDurationSec: z.number().optional().default(0),
  sceneDurationsSec: z.array(z.number()).optional(),
  bgmUrl: z.string().optional(),
  bgmVolume: z.number().optional().default(0.15),
  bgmTrackDurationSec: z.number().optional(),
});

export type PhotoReelProps = z.infer<typeof photoSchema>;
export type PhotoCardProps = z.infer<typeof photoCardSchema>;

export const PHOTO_DEFAULT_DURATION = Math.round(20 * REELS_FPS);

export const calculatePhotoDuration = (
  cardCount: number,
  audioDurationSec?: number,
  sceneDurationsSec?: number[]
): number => {
  if (typeof audioDurationSec === 'number' && audioDurationSec > 0) {
    return Math.max(Math.round(audioDurationSec * REELS_FPS) + REELS_FPS, 30);
  }
  if (Array.isArray(sceneDurationsSec) && sceneDurationsSec.length > 0) {
    return Math.round(sceneDurationsSec.reduce((a, b) => a + b, 0) * REELS_FPS);
  }
  // Default: 4 seconds per scene (cover + N cards + CTA)
  return Math.round((cardCount + 2) * 4 * REELS_FPS);
};

export const PhotoReel: React.FC<PhotoReelProps> = (props) => {
  const {
    hookHeadline,
    coverImageDataUri,
    coverMediaType = 'image',
    cards,
    cta,
    audioUrl,
    audioDurationSec = 0,
    sceneDurationsSec,
    bgmUrl,
    bgmVolume = 0.15,
    bgmTrackDurationSec,
  } = props;

  useFonts();

  const totalScenes = cards.length + 2; // cover + cards + CTA

  let durations: number[];
  if (Array.isArray(sceneDurationsSec) && sceneDurationsSec.length === totalScenes) {
    durations = sceneDurationsSec.map((s) => Math.max(Math.round(s * REELS_FPS), REELS_FPS));
  } else {
    const evenSec = audioDurationSec > 0 ? audioDurationSec / totalScenes : 4;
    durations = Array(totalScenes).fill(Math.round(evenSec * REELS_FPS));
  }

  const totalFrames = durations.reduce((a, b) => a + b, 0);

  return (
    <AbsoluteFill style={{ backgroundColor: '#080808' }}>
      {bgmUrl && (
        <BgmTrack
          src={bgmUrl}
          totalDurationInFrames={totalFrames}
          volume={bgmVolume ?? 0.15}
          trackDurationSec={bgmTrackDurationSec ?? 18}
        />
      )}
      {audioUrl && <Audio src={audioUrl} volume={1.0} />}

      <Series>
        {/* Cover scene */}
        <Series.Sequence durationInFrames={durations[0]}>
          <PhotoCoverScene
            headline={hookHeadline}
            mediaDataUri={coverImageDataUri}
            mediaType={coverMediaType}
          />
        </Series.Sequence>

        {/* Body card scenes */}
        {cards.map((card, i) => (
          <Series.Sequence key={i} durationInFrames={durations[i + 1]}>
            <PhotoCardScene
              headline={card.headline}
              body={card.body}
              mediaDataUri={card.imageDataUri}
              mediaType={card.mediaType ?? 'image'}
              index={i}
            />
          </Series.Sequence>
        ))}

        {/* CTA scene */}
        <Series.Sequence durationInFrames={durations[cards.length + 1]}>
          <PhotoCTAScene cta={cta} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

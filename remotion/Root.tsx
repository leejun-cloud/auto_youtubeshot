import { Composition } from 'remotion';
import {
  PhotoReel,
  PHOTO_DEFAULT_DURATION,
  photoSchema,
  calculatePhotoDuration,
} from './templates/Photo/PhotoReel';
import { REELS_FPS, REELS_WIDTH, REELS_HEIGHT } from './types';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PhotoReel"
        component={PhotoReel}
        schema={photoSchema}
        durationInFrames={PHOTO_DEFAULT_DURATION}
        fps={REELS_FPS}
        width={REELS_WIDTH}
        height={REELS_HEIGHT}
        calculateMetadata={({ props }) => ({
          durationInFrames: calculatePhotoDuration(
            props.cards?.length ?? 3,
            props.audioDurationSec,
            props.sceneDurationsSec
          ),
        })}
        defaultProps={{
          hookHeadline: '당신이 몰랐던 충격적인 사실',
          coverMediaType: 'image' as const,
          audioDurationSec: 0,
          bgmVolume: 0.15,
          cards: [
            { headline: '99%가 모르는 진실', body: '알고 나면 달라집니다', mediaType: 'image' as const },
            { headline: '지금 당장 필요한 것', body: '단 하나뿐입니다', mediaType: 'image' as const },
            { headline: '오늘부터 바꾸세요', body: '3분이면 충분합니다', mediaType: 'image' as const },
          ],
          cta: '저장하고 실천하세요',
        }}
      />
    </>
  );
};

import { Audio, Loop, Sequence, staticFile, useVideoConfig } from 'remotion';

interface Props {
  src: string;
  totalDurationInFrames: number;
  volume?: number;
  /**
   * Actual length of the track. Used to decide whether to loop.
   * - If >= video duration: track plays once, gets trimmed at the end (clean).
   * - If < video duration: track loops (boundary may be slightly noticeable).
   */
  trackDurationSec?: number;
}

export const BgmTrack: React.FC<Props> = ({
  src,
  totalDurationInFrames,
  volume = 0.18,
  trackDurationSec = 18,
}) => {
  const { fps } = useVideoConfig();
  const trackFrames = Math.max(1, Math.round(trackDurationSec * fps));

  const resolvedSrc =
    src.startsWith('http') || src.startsWith('data:')
      ? src
      : staticFile(src.replace(/^\//, ''));

  // If track is at least as long as the video, play once (no awkward loop).
  if (trackFrames >= totalDurationInFrames) {
    return (
      <Sequence from={0} durationInFrames={totalDurationInFrames}>
        <Audio src={resolvedSrc} volume={volume} />
      </Sequence>
    );
  }

  // Otherwise loop.
  return (
    <Sequence from={0} durationInFrames={totalDurationInFrames}>
      <Loop durationInFrames={trackFrames}>
        <Audio src={resolvedSrc} volume={volume} />
      </Loop>
    </Sequence>
  );
};

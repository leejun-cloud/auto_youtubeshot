import { AbsoluteFill, Img, Video, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props {
  headline: string;
  body?: string;
  mediaDataUri?: string;
  mediaType?: 'image' | 'video';
  index?: number;
}

// Distinct gradient palettes for gradient-fallback cards (vary by index)
const FALLBACK_GRADIENTS = [
  'linear-gradient(160deg, #0f0f1a 0%, #1a1535 100%)',
  'linear-gradient(160deg, #1a0f0a 0%, #2d1a10 100%)',
  'linear-gradient(160deg, #0a0f1a 0%, #0e2040 100%)',
  'linear-gradient(160deg, #0f0a1a 0%, #1e1040 100%)',
  'linear-gradient(160deg, #0a1a10 0%, #0f2d1a 100%)',
];

export const PhotoCardScene: React.FC<Props> = ({
  headline,
  body,
  mediaDataUri,
  mediaType = 'image',
  index = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const kenBurns = interpolate(frame, [0, durationInFrames], [1.0, 1.07], {
    extrapolateRight: 'clamp',
  });
  const textOpacity = interpolate(frame, [15, 40], [0, 1], { extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [15, 40], [36, 0], { extrapolateRight: 'clamp' });

  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `scale(${kenBurns})`,
    transformOrigin: 'center bottom',
  };

  return (
    <AbsoluteFill style={{ background: '#080808', overflow: 'hidden' }}>
      {mediaDataUri && mediaType === 'video' ? (
        <Video src={mediaDataUri} style={mediaStyle} muted loop />
      ) : mediaDataUri ? (
        <Img src={mediaDataUri} style={mediaStyle} />
      ) : (
        <AbsoluteFill style={{ background: gradient }} />
      )}

      {/* Bottom-heavy dark overlay — text lives in the lower 40% */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.65) 35%, rgba(0,0,0,0.1) 65%, rgba(0,0,0,0.3) 100%)',
        }}
      />

      {/* Text block: lower third */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          padding: '0 72px 160px',
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
        }}
      >
        {/* Bold headline */}
        <div
          style={{
            fontFamily: 'Pretendard, sans-serif',
            fontWeight: 900,
            fontSize: 76,
            color: '#ffffff',
            lineHeight: 1.2,
            letterSpacing: '-0.025em',
            textShadow: '0 4px 24px rgba(0,0,0,0.95)',
            marginBottom: body ? 28 : 0,
          }}
        >
          {headline}
        </div>

        {/* Body text */}
        {body && (
          <div
            style={{
              fontFamily: 'Pretendard, sans-serif',
              fontWeight: 500,
              fontSize: 46,
              color: 'rgba(255,255,255,0.82)',
              lineHeight: 1.45,
              letterSpacing: '-0.01em',
              textShadow: '0 2px 16px rgba(0,0,0,0.9)',
            }}
          >
            {body}
          </div>
        )}
      </AbsoluteFill>

      {/* Card index indicator (top-left subtle dot) */}
      <div
        style={{
          position: 'absolute',
          top: 72,
          left: 72,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.35)',
          opacity: textOpacity,
        }}
      />
    </AbsoluteFill>
  );
};

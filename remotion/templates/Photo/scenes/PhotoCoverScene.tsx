import { AbsoluteFill, Img, Video, interpolate, useCurrentFrame } from 'remotion';

interface Props {
  headline: string;
  mediaDataUri?: string;
  mediaType?: 'image' | 'video';
}

export const PhotoCoverScene: React.FC<Props> = ({
  headline,
  mediaDataUri,
  mediaType = 'image',
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const imgScale = interpolate(frame, [0, 120], [1.0, 1.06], { extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [0, 28], [50, 0], { extrapolateRight: 'clamp' });

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `scale(${imgScale})`,
    transformOrigin: 'center',
  };

  return (
    <AbsoluteFill style={{ background: '#080808', overflow: 'hidden' }}>
      {mediaDataUri && mediaType === 'video' ? (
        <Video src={mediaDataUri} style={mediaStyle} muted loop />
      ) : mediaDataUri ? (
        <Img src={mediaDataUri} style={mediaStyle} />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(160deg, #0d0d1a 0%, #12082b 50%, #0a0a0a 100%)',
          }}
        />
      )}

      {/* Cinematic overlay: vignette + bottom darkening for text legibility */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%), linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Hook headline — centered, maximum impact */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '80px 72px',
          opacity,
        }}
      >
        <div
          style={{
            fontFamily: 'Pretendard, sans-serif',
            fontWeight: 900,
            fontSize: 100,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: '-0.03em',
            textShadow: '0 6px 40px rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.8)',
            transform: `translateY(${textY}px)`,
            maxWidth: 900,
          }}
        >
          {headline}
        </div>
      </AbsoluteFill>

      {/* Subtle bottom accent line */}
      <div
        style={{
          position: 'absolute',
          bottom: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 60,
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.4)',
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};

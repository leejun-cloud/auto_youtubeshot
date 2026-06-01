import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props {
  cta: string;
}

export const PhotoCTAScene: React.FC<Props> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [20, 50], [40, 0], { extrapolateRight: 'clamp' });

  // Accent line grows in from left
  const lineSpring = spring({ frame: frame - 15, fps, config: { damping: 18, stiffness: 90 } });
  const lineWidth = interpolate(lineSpring, [0, 1], [0, 120]);

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(160deg, #080808 0%, #101010 100%)',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        opacity: fadeIn,
      }}
    >
      {/* Yellow accent line */}
      <div
        style={{
          width: lineWidth,
          height: 5,
          borderRadius: 3,
          background: '#fbbf24',
          marginBottom: 56,
          transformOrigin: 'left',
        }}
      />

      {/* CTA text */}
      <div
        style={{
          fontFamily: 'Pretendard, sans-serif',
          fontWeight: 900,
          fontSize: 72,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.3,
          letterSpacing: '-0.025em',
          padding: '0 80px',
          transform: `translateY(${textY}px)`,
          textShadow: '0 2px 20px rgba(0,0,0,0.5)',
          maxWidth: 960,
        }}
      >
        {cta}
      </div>

      {/* Subtle engagement prompt */}
      <div
        style={{
          position: 'absolute',
          bottom: 110,
          fontFamily: 'Pretendard, sans-serif',
          fontWeight: 600,
          fontSize: 34,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.08em',
          opacity: fadeIn,
        }}
      >
        저장 · 공유 · 팔로우
      </div>
    </AbsoluteFill>
  );
};

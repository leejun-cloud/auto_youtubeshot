'use client';

import { useState, useEffect } from 'react';

interface PlatformMetadata {
  instagramCaption: string;
  instagramHashtags: string[];
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string[];
}

export default function Home() {
  // API Keys (saved in localStorage)
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [pexelsApiKey, setPexelsApiKey] = useState('');

  // Script inputs
  const [topicPrompt, setTopicPrompt] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Video Pipeline Status
  const [isRendering, setIsRendering] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0: Idle, 1: Structuring, 2: Fetching Media, 3: TTS, 4: Remotion Render, 5: Done
  const [renderProgress, setRenderProgress] = useState(0); // overall percentage
  const [statusMessage, setStatusMessage] = useState('');

  // Result Video & Info
  const [videoUrl, setVideoUrl] = useState('');
  const [metadata, setMetadata] = useState<PlatformMetadata | null>(null);

  // System status (FFmpeg & BGM)
  const [sysStatus, setSysStatus] = useState<'checking' | 'installed' | 'missing'>('checking');
  const [isConfiguring, setIsConfiguring] = useState(false);

  // Load API Keys from localStorage on mount
  useEffect(() => {
    setGeminiApiKey(localStorage.getItem('yt_shorts_gemini_key') || '');
    setPexelsApiKey(localStorage.getItem('yt_shorts_pexels_key') || '');
    checkSystemStatus();
  }, []);

  const saveKeys = (gemini: string, pexels: string) => {
    localStorage.setItem('yt_shorts_gemini_key', gemini);
    localStorage.setItem('yt_shorts_pexels_key', pexels);
  };

  const checkSystemStatus = async () => {
    try {
      const res = await fetch('/api/install-dependencies');
      const data = await res.json();
      if (data.ffmpegInstalled && data.customBgmInstalled) {
        setSysStatus('installed');
      } else {
        setSysStatus('missing');
      }
    } catch {
      setSysStatus('missing');
    }
  };

  const runSystemSetup = async () => {
    setIsConfiguring(true);
    try {
      const res = await fetch('/api/install-dependencies', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSysStatus('installed');
        alert('필수 엔진(FFmpeg) 및 분위기별 추천 BGM 다운로드가 완료되었습니다!');
      } else {
        alert('설치 실패: ' + data.error);
      }
    } catch (e: any) {
      alert('오류가 발생했습니다: ' + e.message);
    } finally {
      setIsConfiguring(false);
    }
  };

  // 1. Generate Script from Topic
  const generateScript = async () => {
    if (!topicPrompt.trim()) {
      alert('스크립트를 만들 키워드나 주제를 입력해 주세요!');
      return;
    }
    if (!geminiApiKey) {
      alert('먼저 Gemini API 키를 입력해 주세요!');
      return;
    }

    setIsGeneratingScript(true);
    saveKeys(geminiApiKey, pexelsApiKey);

    try {
      const res = await fetch('/api/write-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicPrompt, geminiApiKey }),
      });
      const data = await res.json();
      if (data.success) {
        setScriptText(data.script);
      } else {
        alert('스크립트 생성 실패: ' + data.error);
      }
    } catch (e: any) {
      alert('오류가 발생했습니다: ' + e.message);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // 2. Generate Video Pipeline
  const createVideo = async () => {
    if (!scriptText.trim()) {
      alert('카드뉴스 본문 스크립트가 없습니다. 먼저 작성하거나 AI로 대본을 생성하세요!');
      return;
    }
    if (!geminiApiKey) {
      alert('Gemini API 키가 필요합니다.');
      return;
    }

    // Save keys
    saveKeys(geminiApiKey, pexelsApiKey);
    setIsRendering(true);
    setVideoUrl('');
    setMetadata(null);
    setRenderProgress(5);
    setCurrentStep(1);
    setStatusMessage('1. Gemini AI를 활용해 텍스트를 카드구조로 분석하는 중...');

    // Poll status from server
    let pollInterval: NodeJS.Timeout;
    
    const startPolling = () => {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/generate/status');
          if (!res.ok) return;
          const status = await res.json();
          
          if (status.step === 'idle') return;

          setRenderProgress(status.progress);
          setStatusMessage(status.message);

          if (status.step === 'structuring') {
            setCurrentStep(1);
          } else if (status.step === 'media') {
            setCurrentStep(2);
          } else if (status.step === 'tts') {
            setCurrentStep(3);
          } else if (status.step === 'rendering' || status.step === 'metadata') {
            setCurrentStep(4);
          } else if (status.step === 'done') {
            setCurrentStep(5);
            clearInterval(pollInterval);
          } else if (status.step === 'error') {
            setCurrentStep(0);
            setRenderProgress(0);
            clearInterval(pollInterval);
            if (status.error) {
              alert('비디오 생성 오류: ' + status.error);
            }
          }
        } catch (err) {
          console.error('Error polling status:', err);
        }
      }, 2000);
    };

    startPolling();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: scriptText,
          keys: { geminiApiKey, pexelsApiKey },
        }),
      });

      const data = await res.json();

      if (data.success) {
        setCurrentStep(5);
        setRenderProgress(100);
        setStatusMessage('완료! 비디오와 유튜브 마케팅 텍스트가 정상 발행되었습니다.');
        setVideoUrl(data.videoUrl);
        setMetadata(data.metadata);
      } else {
        alert('비디오 생성 중 오류 발생: ' + data.error);
        setCurrentStep(0);
        setRenderProgress(0);
      }
    } catch (e: any) {
      alert('서버 응답 오류: ' + e.message);
      setCurrentStep(0);
      setRenderProgress(0);
    } finally {
      clearInterval(pollInterval!);
      setIsRendering(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('클립보드에 복사되었습니다!');
  };

  return (
    <>
      <header>
        <div className="logo">
          ⚡ YouTube <span className="logo-accent">Shots Creator</span>
        </div>
        <div className="system-status">
          <span className={`status-dot ${sysStatus}`}></span>
          <span>
            엔진 및 BGM 상태: {
              sysStatus === 'checking' ? '확인 중...' :
              sysStatus === 'installed' ? '준비 완료' : '구성 필요'
            }
          </span>
          {sysStatus === 'missing' && (
            <button 
              className="setup-btn-pulse" 
              onClick={runSystemSetup} 
              disabled={isConfiguring}
            >
              {isConfiguring ? '설치 중...' : '⚠️ 원클릭 구성'}
            </button>
          )}
        </div>
      </header>

      <main>
        <div className="welcome-hero">
          <h1>단 10초 만에 끝내는 고품격 숏폼 비디오</h1>
          <p>
            AI 이미지 배경과 감성적인 성우 목소리, 자막 카피가 어우러진 손힘찬 스타일 C형 카드뉴스 릴스/쇼츠 제작기입니다.
          </p>
        </div>

        <div className="grid-layout">
          {/* Left Panel: Inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* API Keys Card */}
            <div className="card">
              <h2 className="card-title">🔑 API 환경 설정 (로컬 안전 저장)</h2>
              
              <div className="form-group">
                <label className="section-label">1. Gemini API 키</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="AI 분석 및 성우 TTS용 API 키 입력"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                />
                <div className="guide-text">
                  <span>* 필수 (영상 구성 및 음성 생성에 필수)</span>
                  <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="guide-link">
                    Google AI Studio에서 무료 발급 ➔
                  </a>
                </div>
              </div>

              <div className="form-group">
                <label className="section-label">2. Pexels API 키</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Pexels API 키 입력"
                  value={pexelsApiKey}
                  onChange={(e) => setPexelsApiKey(e.target.value)}
                />
                <div className="guide-text">
                  <span>* 고해상도 비디오 및 이미지 매칭에 사용됩니다. (선택사항)</span>
                  <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="guide-link">
                    Pexels에서 무료 발급 ➔
                  </a>
                </div>
              </div>
            </div>

            {/* Script Writer Card */}
            <div className="card highlight">
              <h2 className="card-title">📝 스크립트 작성 및 생성</h2>
              
              <div className="form-group">
                <label className="section-label">간단한 아이디어/주제 입력 (AI 초안 생성용)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ flex: 1 }}
                    placeholder="예: 아침 루틴으로 하루를 활기차게 시작하는 3가지 비결"
                    value={topicPrompt}
                    onChange={(e) => setTopicPrompt(e.target.value)}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={generateScript}
                    disabled={isGeneratingScript || !geminiApiKey}
                  >
                    {isGeneratingScript ? '작성 중...' : 'AI 대본 짜기'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="section-label">최종 카드뉴스 대본 (수정 가능)</label>
                <textarea
                  className="input-field"
                  placeholder="[표지], [본문 카드], [CTA], [나레이션] 구조로 스크립트를 직접 채우거나 위 AI 생성기를 클릭하세요."
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={createVideo}
                disabled={isRendering || !scriptText.trim()}
                style={{ width: '100%', padding: '16px' }}
              >
                {isRendering ? '쇼츠 비디오 만드는 중...' : '🎬 9:16 비디오 생성 시작'}
              </button>
            </div>
          </div>

          {/* Right Panel: Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Progress / Pipeline Status */}
            {(isRendering || currentStep > 0) && (
              <div className="card">
                <h2 className="card-title">⚙️ 실시간 제작 파이프라인</h2>
                
                <div className="progress-container">
                  <div className="progress-header">
                    <span>진행 단계</span>
                    <span>{renderProgress}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${renderProgress}%` }}></div>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: '600' }}>
                    {statusMessage}
                  </div>
                </div>

                <div className="steps-list">
                  <div className={`step-item ${currentStep >= 1 ? (currentStep > 1 ? 'completed' : 'active') : ''}`}>
                    <span className="step-icon">
                      {currentStep > 1 ? '✓' : currentStep === 1 ? <span className="spinner-mini"></span> : '1'}
                    </span>
                    <span>
                      Gemini AI 대본 구조화 (Hook 제목, CTA 도출)
                      {currentStep === 1 && <span className="pulse-text">(AI 분석 진행 중...)</span>}
                    </span>
                  </div>
                  <div className={`step-item ${currentStep >= 2 ? (currentStep > 2 ? 'completed' : 'active') : ''}`}>
                    <span className="step-icon">
                      {currentStep > 2 ? '✓' : currentStep === 2 ? <span className="spinner-mini"></span> : '2'}
                    </span>
                    <span>
                      시각적 고해상도 배경 이미지/동영상 매칭 및 다운로드
                      {currentStep === 2 && <span className="pulse-text">(Pexels 다운로드 중...)</span>}
                    </span>
                  </div>
                  <div className={`step-item ${currentStep >= 3 ? (currentStep > 3 ? 'completed' : 'active') : ''}`}>
                    <span className="step-icon">
                      {currentStep > 3 ? '✓' : currentStep === 3 ? <span className="spinner-mini"></span> : '3'}
                    </span>
                    <span>
                      Gemini Kore 보이스 감성 나레이션 TTS 및 백그라운드 BGM 합성
                      {currentStep === 3 && <span className="pulse-text">(TTS 음성 추출 중...)</span>}
                    </span>
                  </div>
                  <div className={`step-item ${currentStep >= 4 ? (currentStep > 4 ? 'completed' : 'active') : ''}`}>
                    <span className="step-icon">
                      {currentStep > 4 ? '✓' : currentStep === 4 ? <span className="spinner-mini"></span> : '4'}
                    </span>
                    <span>
                      Remotion을 통한 최종 MP4 인코딩 및 미디어 병합
                      {currentStep === 4 && <span className="pulse-text">(Remotion 인코딩 중...)</span>}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Video Player & Marketing Output */}
            {videoUrl && (
              <div className="card" style={{ gap: '32px' }}>
                <h2 className="card-title">🎉 완성된 숏폼 영상 및 업로드 정보</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', justifyContent: 'center' }}>
                  {/* Smartphone Frame Video Player */}
                  <div className="player-container">
                    <video src={videoUrl} controls loop playsInline />
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <a href={videoUrl} download className="btn btn-primary flex-center gap-sm" style={{ width: '100%', maxWidth: '240px', margin: '0 auto' }}>
                      💾 MP4 동영상 다운로드
                    </a>
                  </div>
                </div>

                {/* Metadata copy sections */}
                {metadata && (
                  <div className="metadata-box">
                    <div className="metadata-section">
                      <div className="metadata-header-row">
                        <span className="metadata-title">📺 유튜브 쇼츠 제목</span>
                        <button className="copy-btn" onClick={() => handleCopy(metadata.youtubeTitle)}>복사</button>
                      </div>
                      <div className="metadata-content">{metadata.youtubeTitle}</div>
                    </div>

                    <div className="metadata-section">
                      <div className="metadata-header-row">
                        <span className="metadata-title">📝 유튜브 쇼츠 상세 설명 & 태그</span>
                        <button className="copy-btn" onClick={() => handleCopy(metadata.youtubeDescription)}>복사</button>
                      </div>
                      <div className="metadata-content">{metadata.youtubeDescription}</div>
                    </div>

                    <div className="metadata-section">
                      <div className="metadata-header-row">
                        <span className="metadata-title">📱 인스타그램 Reels 캡션 & 해시태그</span>
                        <button className="copy-btn" onClick={() => handleCopy(metadata.instagramCaption)}>복사</button>
                      </div>
                      <div className="metadata-content">{metadata.instagramCaption}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

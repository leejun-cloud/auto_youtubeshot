export type ReelsTemplate = 'action' | 'emotion' | 'news' | 'insight';

export interface ActionData {
  problem: string;
  solution: string;
  benefit: string;
  cta: string;
  audioUrl?: string;
  audioDurationSec?: number;
}

export interface EmotionData {
  opening: string;
  story: string;
  message: string;
  closing: string;
  audioUrl?: string;
  audioDurationSec?: number;
}

export interface NewsData {
  headline: string;
  when: string;
  where: string;
  what: string;
  action: string;
  audioUrl?: string;
  audioDurationSec?: number;
}

export interface InsightData {
  quote: string;
  elaboration: string;
  source?: string;
  audioUrl?: string;
  audioDurationSec?: number;
}

export type ReelsData = ActionData | EmotionData | NewsData | InsightData;

export const REELS_FPS = 30;
export const REELS_WIDTH = 1080;
export const REELS_HEIGHT = 1920;

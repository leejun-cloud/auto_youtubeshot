import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

let fontsLoaded = false;
let fontsLoading: Promise<void> | null = null;

const loadFontsOnce = (): Promise<void> => {
  if (fontsLoaded) return Promise.resolve();
  if (fontsLoading) return fontsLoading;

  fontsLoading = (async () => {
    const regular = new FontFace(
      'Pretendard',
      `url(${staticFile('fonts/Pretendard-Regular.ttf')}) format('truetype')`,
      { weight: '400' }
    );

    const bold = new FontFace(
      'Pretendard',
      `url(${staticFile('fonts/Pretendard-Bold.ttf')}) format('truetype')`,
      { weight: '700' }
    );

    const black = new FontFace(
      'Pretendard',
      `url(${staticFile('fonts/Pretendard-Black.ttf')}) format('truetype')`,
      { weight: '900' }
    );

    const loaded = await Promise.all([regular.load(), bold.load(), black.load()]);
    loaded.forEach((f) => document.fonts.add(f));
    fontsLoaded = true;
  })();

  return fontsLoading;
};

export const useFonts = () => {
  const [handle] = useState(() => delayRender('Loading Pretendard fonts'));

  useEffect(() => {
    loadFontsOnce()
      .then(() => continueRender(handle))
      .catch((e) => {
        console.error('Font load failed:', e);
        continueRender(handle);
      });
  }, [handle]);
};

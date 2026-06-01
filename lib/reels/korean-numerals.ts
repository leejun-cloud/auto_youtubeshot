// Converts digit+unit patterns to correct Korean pronunciation before TTS.
// Prevents Gemini TTS from reading "1개" as "일개" instead of "한 개".
//
// Korean uses two number systems:
//   고유어(순우리말): 한, 두, 세, 네, 다섯... — for native Korean units
//   한자어: 일, 이, 삼, 사, 오...           — for Sino-Korean units

// ── Native numbers 1-99 ────────────────────────────────────────────
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const NATIVE_ONES = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];

const toNative = (n: number): string | null => {
  if (n < 1 || n > 99) return null;
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (t === 0) return NATIVE_ONES[o];
  if (o === 0) return NATIVE_TENS[t];
  return NATIVE_TENS[t] + NATIVE_ONES[o];
};

// ── Sino-Korean numbers ────────────────────────────────────────────
const SINO_UNITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

const toSino = (n: number): string => {
  if (n === 0) return '영';
  if (n < 10) return SINO_UNITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return (t === 1 ? '십' : SINO_UNITS[t] + '십') + (o ? SINO_UNITS[o] : '');
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return (h === 1 ? '백' : SINO_UNITS[h] + '백') + (rest ? toSino(rest) : '');
  }
  if (n < 10000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    return (th === 1 ? '천' : SINO_UNITS[th] + '천') + (rest ? (rest < 100 ? '영' : '') + toSino(rest) : '');
  }
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  return toSino(man) + '만' + (rest ? toSino(rest) : '');
};

// ── Unit lists ────────────────────────────────────────────────────
// 고유어 단위: 시간·시(時)·주(週)·개·달·명·마리·번·장·권·잔·병·가지·살·줄·채·대·벌·쌍·켤레
// Note: 시간 must come before 시 so it matches first in alternation.
const NATIVE_UNITS = '시간|시|주|개|달|명|마리|번|장|권|잔|병|가지|살|줄|채|대|벌|쌍|켤레';

// 한자어 단위: 년·월·일·개월·분·초·층·원·회·등·위
const SINO_UNITS_PAT = '년|개월|월|일|분|초|층|원|회|등|위';

// ── Main export ───────────────────────────────────────────────────

/**
 * Replace digit+unit patterns in TTS script with proper Korean words.
 * e.g. "1개" → "한 개", "3달" → "세 달", "2분" → "이 분"
 */
export const convertNumerals = (text: string): string => {
  let result = text;

  // 고유어: N개, N달, N명 ...
  result = result.replace(
    new RegExp(`(\\d+)\\s*(${NATIVE_UNITS})`, 'g'),
    (_, numStr, unit) => {
      const n = parseInt(numStr, 10);
      const word = toNative(n);
      return word ? `${word} ${unit}` : `${numStr} ${unit}`;
    },
  );

  // 한자어: N년, N분, N초, N원 ...
  result = result.replace(
    new RegExp(`(\\d+)\\s*(${SINO_UNITS_PAT})`, 'g'),
    (_, numStr, unit) => {
      const n = parseInt(numStr, 10);
      return `${toSino(n)} ${unit}`;
    },
  );

  // N% → N 퍼센트
  result = result.replace(/(\d+)%/g, (_, numStr) => `${toSino(parseInt(numStr, 10))} 퍼센트`);

  return result;
};

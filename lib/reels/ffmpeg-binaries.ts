import fs from 'fs';
import path from 'path';

const localBinDir = path.join(process.cwd(), 'bin');
const exe = process.platform === 'win32' ? '.exe' : '';

const findFirstExisting = (candidates: string[]) =>
  candidates.find((candidate) => fs.existsSync(candidate));

const findBinaryBelow = (root: string, binaryName: string): string | undefined => {
  if (!fs.existsSync(root)) return undefined;

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === binaryName) return fullPath;
    if (entry.isDirectory()) {
      const found = findBinaryBelow(fullPath, binaryName);
      if (found) return found;
    }
  }

  return undefined;
};

export const getFfmpegPath = () => {
  const local = path.join(localBinDir, `ffmpeg${exe}`);
  const packaged = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', `ffmpeg${exe}`);
  return findFirstExisting([process.env.FFMPEG_BIN || '', local, packaged]) || 'ffmpeg';
};

export const getFfprobePath = () => {
  const local = path.join(localBinDir, `ffprobe${exe}`);
  const packagedRoot = path.join(process.cwd(), 'node_modules', 'ffprobe-static', 'bin');
  const packaged = findBinaryBelow(packagedRoot, `ffprobe${exe}`);
  return findFirstExisting([process.env.FFPROBE_BIN || '', local, packaged || '']) || 'ffprobe';
};

export const hasBundledFfmpeg = () => fs.existsSync(getFfmpegPath());
export const hasBundledFfprobe = () => fs.existsSync(getFfprobePath());

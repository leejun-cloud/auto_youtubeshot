import { NextResponse } from 'next/server';
import { currentRenderStatus } from '../route';

export async function GET() {
  // Return the current render status (not cached)
  return NextResponse.json(currentRenderStatus, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

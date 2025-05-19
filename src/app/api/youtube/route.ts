import { NextResponse } from 'next/server';
import { searchYouTubeVideos, YouTubeSearchOptions } from '@/lib/youtube';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, chatContext, maxResults } = body as YouTubeSearchOptions;

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const videos = await searchYouTubeVideos({ query, chatContext, maxResults });
    
    return NextResponse.json(videos);

  } catch (error) {
    console.error("Error in YouTube API route:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch YouTube videos', details: errorMessage }, { status: 500 });
  }
} 
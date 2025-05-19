export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
  videoId: string;
  duration?: string; // e.g., "4:46"
  viewCount?: string; // e.g., "625K views"
  publishedAt?: string; // e.g., "2 days ago"
}

export interface YouTubeSearchOptions {
  query: string;
  chatContext?: string[]; // Array of recent messages for context
  maxResults?: number;
}

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

if (!YOUTUBE_API_KEY) {
  console.warn("YOUTUBE_API_KEY is not set. YouTube search functionality will not be available.");
}

// Helper function to parse ISO 8601 duration to MM:SS or HH:MM:SS
function parseISO8601Duration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";

  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");

  let formattedTime = "";
  if (hours > 0) {
    formattedTime += `${hours}:`;
    formattedTime += `${minutes.toString().padStart(2, '0')}:`;
  } else {
    formattedTime += `${minutes}:`;
  }
  formattedTime += seconds.toString().padStart(2, '0');
  return formattedTime;
}

// Helper function to format view count
function formatViewCount(viewCount: string | number): string {
  const num = Number(viewCount);
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B views';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
  return num.toString() + ' views';
}

// Helper function to format published date (e.g., "2 days ago")
function formatPublishedAt(publishedAt: string): string {
  const date = new Date(publishedAt);
  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const weeks = Math.round(days / 7);
  const months = Math.round(days / 30);
  const years = Math.round(days / 365);

  if (seconds < 60) return `just now`;
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (weeks < 5) return `${weeks} week${weeks > 1 ? 's' : ''} ago`; // approx a month
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

export async function searchYouTubeVideos(options: YouTubeSearchOptions): Promise<YouTubeVideo[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YouTube API key is not configured.");
  }

  const { query, chatContext = [], maxResults = 10 } = options;

  // let searchQuery = query;
  // if (chatContext.length > 0) {
  //   const contextKeywords = chatContext.slice(-3).join(' ').split(' ').slice(0, 5).join(' ');
  //   searchQuery = `${query} ${contextKeywords}`.trim();
  // }
  // console.log(`Searching YouTube with query: "${searchQuery}" (original: "${query}")`);

  // Use only the direct query, remove chatContext for now
  const searchQuery = query.trim();
  console.log(`Searching YouTube with query: "${searchQuery}" (Context disabled)`);

  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: searchQuery,
    key: YOUTUBE_API_KEY,
    maxResults: maxResults.toString(),
    type: 'video',
    order: 'viewCount', // Order by view count
  });

  try {
    const searchResponse = await fetch(`${YOUTUBE_SEARCH_URL}?${searchParams.toString()}`);
    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      console.error('YouTube Search API Error:', errorData);
      throw new Error(`YouTube Search API error: ${errorData.error?.message || searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.items || searchData.items.length === 0) {
      console.warn('No items found in YouTube Search API response for query:', searchQuery);
      return [];
    }

    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

    const videoDetailsParams = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: videoIds,
      key: YOUTUBE_API_KEY,
    });

    const videoDetailsResponse = await fetch(`${YOUTUBE_VIDEOS_URL}?${videoDetailsParams.toString()}`);
    if (!videoDetailsResponse.ok) {
      const errorData = await videoDetailsResponse.json();
      console.error('YouTube Videos API Error:', errorData);
      throw new Error(`YouTube Videos API error: ${errorData.error?.message || videoDetailsResponse.statusText}`);
    }

    const videoDetailsData = await videoDetailsResponse.json();

    // Create a map of video details for easy lookup
    const detailsMap = new Map();
    videoDetailsData.items.forEach((item: any) => {
      detailsMap.set(item.id, item);
    });

    // Map search results to include details
    return searchData.items.map((item: any) => {
      const videoDetails = detailsMap.get(item.id.videoId);
      return {
        id: item.id.videoId,
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails.medium.url, // or high
        channelTitle: item.snippet.channelTitle,
        duration: videoDetails?.contentDetails?.duration ? parseISO8601Duration(videoDetails.contentDetails.duration) : undefined,
        viewCount: videoDetails?.statistics?.viewCount ? formatViewCount(videoDetails.statistics.viewCount) : undefined,
        publishedAt: videoDetails?.snippet?.publishedAt ? formatPublishedAt(videoDetails.snippet.publishedAt) : undefined,
      };
    });

  } catch (error) {
    console.error('Failed to fetch YouTube videos:', error);
    return []; 
  }
} 
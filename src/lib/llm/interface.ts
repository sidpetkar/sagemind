import { YouTubeVideo } from "../youtube"; // Added import for YouTubeVideo type

// Define a type for the chat history messages
export interface ChatMessage {
  role: "user" | "model" | "assistant"; // Use "model" to align with the Gemini SDK, "assistant" for Replicate
  content: string;
  imageBase64?: string; // Optional field for images from assistant
}

// Add interface for processed file data (inline base64)
export interface FileData {
  mimeType: string;
  base64String: string;
}

// Add interface for file URI (for uploaded files)
export interface FileUri {
  uri: string;
  mimeType: string;
  name?: string;
}

export interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: any;
  error?: any;
  // Add other fields from the Replicate prediction object as needed
}

export interface LlmService {
  // Update signature to accept fileUri as an alternative to fileData
  // and to yield structured objects for text and grounding information.
  generateResponse(
    message: string, 
    history: ChatMessage[], 
    fileData?: FileData, 
    fileUri?: FileUri,
    modelName?: string
  ): Promise<AsyncIterable<{ 
    text?: string; 
    webSearchQueries?: string[]; 
    renderedContent?: string; 
    imageBase64?: string; 
    imageMimeType?: string; // Added for specifying the type of imageBase64
    sourceCitations?: string[]; 
    youtubeVideos?: YouTubeVideo[];
    prediction?: Prediction;
  }>>;
} 
// Define a type for the chat history messages
export interface ChatMessage {
  role: "user" | "model"; // Use "model" to align with the Gemini SDK
  content: string;
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

export interface LlmService {
  // Update signature to accept fileUri as an alternative to fileData
  // and to yield structured objects for text and grounding information.
  generateResponse(message: string, history?: ChatMessage[], fileData?: FileData, fileUri?: FileUri, modelName?: string): Promise<AsyncIterable<{ text?: string; webSearchQueries?: string[]; renderedContent?: string }>>;
} 
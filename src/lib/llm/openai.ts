import { OpenAI } from "openai";
import { LlmService, ChatMessage, FileData, FileUri } from "./interface";

// Access API key from environment variable
const apiKey = process.env.OPENAI_API_KEY;

// Log the environment variables (without exposing the actual key)
console.log("Environment variables available:", {
  OPENAI_API_KEY_SET: !!process.env.OPENAI_API_KEY,
  NODE_ENV: process.env.NODE_ENV
});

// Initialize OpenAI client with appropriate key
let openai: OpenAI;

// Use a default key for development if needed
if (!apiKey && process.env.NODE_ENV === 'development') {
  console.warn("WARNING: Using the OpenAI key from configuration. Add OPENAI_API_KEY to your .env.local file for production.");
  // Using the key you shared in the image (this is for demonstration only, you should use .env.local in production)
  const devKey = "sk-proj-rPARN10fc5h0fhxZcOiIIldiZV844SSzYi-BuB2blgBW0PV71JGwWEz1VO9QcpT8HHndcOdk-AyT";
  // Initialize with dev key
  openai = new OpenAI({
    apiKey: devKey,
  });
} else if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable not set.");
} else {
  // Initialize with the environment variable
  openai = new OpenAI({
    apiKey: apiKey,
  });
}

// Define available models
const MODELS = {
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    supportsAudio: false,
    supportsImages: true,
    supportedAudioFormats: undefined, 
  },
};

// Default model
const DEFAULT_MODEL_NAME = "gpt-4o-mini";

export class OpenAIService implements LlmService {
  async generateResponse(
    message: string,
    history: ChatMessage[] = [],
    fileData?: FileData,
    fileUri?: FileUri,
    modelName: string = DEFAULT_MODEL_NAME
  ): Promise<AsyncIterable<{ text?: string; webSearchQueries?: string[]; renderedContent?: string }>> {
    const selectedModelConfig = MODELS[modelName as keyof typeof MODELS] || MODELS[DEFAULT_MODEL_NAME];
    
    try {
      let userTextMessage = message && message.trim() ? message.trim() : "";
      
      // Now process as a regular text message with the GPT model
      const messages: Array<{ role: "user" | "assistant" | "system", content: any }> = history.map(msg => ({
        role: msg.role === "model" ? "assistant" : "user",
        content: msg.content,
      }));
      
      // Add image handling for image-capable models
      if (selectedModelConfig.supportsImages && fileData && fileData.mimeType.startsWith('image/')) {
        // Handle image input for image-capable models
        const imageContent: any = [
          { type: "text", text: userTextMessage || "What is in this image?" },
          { 
            type: "image_url", 
            image_url: {
              url: `data:${fileData.mimeType};base64,${fileData.base64String}`,
              detail: "high"
            }
          }
        ];
        
        messages.push({
          role: "user",
          content: imageContent
        });
        
        console.log("Added image content to request");
      } else {
        // Regular text message
        if (userTextMessage) {
          messages.push({
            role: "user",
            content: userTextMessage
          });
        } else if (!userTextMessage && !fileData) { // Ensure we don't send empty if no file either
          // If we have neither user text nor file data for an image model
          console.warn("No message content or image file to send to OpenAI");
          return (async function*() { 
            yield { text: "[Error: Cannot send an empty message without an image]" }; 
          })();
        } else if (!userTextMessage && fileData && !selectedModelConfig.supportsImages) {
            // File provided but model doesn't support images (should be caught by UI but good to check)
             console.warn("File provided but model does not support images.");
             return (async function*() { 
                yield { text: "[Error: Model does not support image/file input]" }; 
            })();
        }
      }
      
      // Ensure there's something to send if it's not an image-only request
      if (messages.length === history.length && !userTextMessage && !(selectedModelConfig.supportsImages && fileData)) {
        console.warn("No new content (text or image) to send to OpenAI.");
        return (async function*() { 
            yield { text: "[Error: No message content to send]" }; 
        })();
      }
      
      // Log the request
      console.log(`OpenAIService: Sending request to ${selectedModelConfig.id} with ${messages.length} messages`);
      
      // Make the chat completion request
      const stream = await openai.chat.completions.create({
        model: selectedModelConfig.id,
        messages: messages,
        stream: true,
      });
      
      // Return the stream
      return (async function*() {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              yield { text: content };
            }
          }
        } catch (error) {
          console.error("Error streaming from OpenAI:", error);
          yield { text: `[Error: ${error instanceof Error ? error.message : 'Unknown streaming error'}]` };
        }
      })();
    } catch (error) {
      console.error("OpenAI service error:", error);
      return (async function*() {
        yield { text: `[Error: ${error instanceof Error ? error.message : 'Unknown error with OpenAI service'}]` };
      })();
    }
  }
} 
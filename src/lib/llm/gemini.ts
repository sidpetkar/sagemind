import { GoogleGenerativeAI, Content, Part, HarmCategory, HarmBlockThreshold, StartChatParams } from "@google/generative-ai";
import { LlmService, ChatMessage, FileData, FileUri } from "./interface";

// Access your API key as an environment variable
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// Define available models
const MODELS = {
  "gemini-2.0-flash": { // Default model for text, audio, video, and future search/live capabilities
    model: "gemini-2.0-flash",
    supportsImageGeneration: false,
    supportsLiveAPI: true, // Placeholder for future Live API integration
    supportsGoogleSearch: true, // Placeholder for future Google Search integration
  }
};

// Default model name
const DEFAULT_MODEL_NAME = "gemini-2.0-flash";

// Define the new detailed system instruction
const systemInstruction = {
  role: "system",
  parts: [{ 
    text: `# System Prompt for SageMind Chatbot

You are SageMind, a knowledgeable and helpful AI assistant that provides accurate and thoughtful responses to user queries. Your primary goal is to be as helpful as possible while being honest about your capabilities. After answering each question, you should provide 3-4 suggested follow-up questions or related topics that the user might be interested in exploring next.

## Core Principles

1.  **Be helpful and direct**: Always attempt to answer the user's question directly rather than suggesting they search elsewhere.

2.  **Be confident when you know**: If you have information on a topic, provide it confidently without unnecessary disclaimers.

3.  **Handle uncertainty gracefully**: When you're unsure about something specific (like an unusual term, dish, or place name), instead of saying "I don't know" or "I can't access," offer your best interpretation or related information that might be helpful.

4.  **Balance code and explanation**: When providing code, always include explanations that make the solution clear to users of varying expertise levels.

5.  **Assume good intentions**: Interpret user queries in the most charitable way possible.

## Response Guidelines

### For knowledge-based questions:
- Provide direct answers based on your training
- For obscure topics, offer what you know about related concepts
- Avoid phrases like "I don't have access to" or "I can't provide"

### For recipe, food, or regional queries:
- If you recognize the dish or can infer what it might be, provide general information
- Offer similar dishes or possible interpretations if uncertain
- Include potential ingredients and preparation methods based on your knowledge
- Example: "Pau Bagi sounds like it might be a regional dish. Based on my knowledge, it could be similar to [related dish]. Typically, dishes from this region include [ingredients] and are prepared by [method]."

### For coding requests:
- Provide complete, functional code solutions
- Include clear explanations about how the code works
- Highlight any potential issues or alternative approaches
- Address edge cases when appropriate

### For location or place-based questions:
- Offer general knowledge about the location if recognized
- Discuss similar places or regions if uncertain
- Provide cultural, historical, or geographical context when possible

### When genuinely uncertain:
- Instead of "I don't know" or "search online," say: "Based on my understanding, [your best guess]. However, I'm not completely certain about the specifics."
- Provide adjacent information that might be useful
- Acknowledge limitations specifically rather than generally

## Tone and Style
- Maintain a helpful, knowledgeable, and friendly tone
- Be concise but thorough
- Convey confidence when providing information
- Use personal pronouns ("I think," "I suggest") rather than distancing language ("it is recommended")

## Suggested Follow-up Questions
- At the end of EVERY response, include a section titled "You might also be interested in:"
- Provide 3-4 specific follow-up questions related to the topic just discussed
- Format these as bullet points
- Make questions specific and interesting, not generic
- Ensure questions are directly related to the original topic
- Phrase questions as if the user would click or ask them (e.g., "How do I..." rather than "The user might want to know about...")

Remember, your purpose is to be as helpful as possible while maintaining accuracy. Users are coming to you for answers, not to be redirected elsewhere. Always try to provide value in your response, even when working with limited information.`
  }]
};

export class GeminiService implements LlmService {
  async generateResponse(
    message: string, 
    history: ChatMessage[] = [], 
    fileData?: FileData, 
    fileUri?: FileUri,
    modelName: string = DEFAULT_MODEL_NAME
  ): Promise<AsyncIterable<{ text?: string; webSearchQueries?: string[]; renderedContent?: string }>> {
    // Get the selected model configuration
    const selectedModelConfig = MODELS[modelName as keyof typeof MODELS] || MODELS[DEFAULT_MODEL_NAME];
    
    // Prepare model parameters, including tools for grounding if supported
    const modelParams: { model: string; tools?: any[] } = { model: selectedModelConfig.model };
    if (selectedModelConfig.supportsGoogleSearch) {
      modelParams.tools = [{ googleSearch: {} }];
      console.log(`Grounding with Google Search enabled for model: ${selectedModelConfig.model}`);
    }
    const activeModel = genAI.getGenerativeModel(modelParams);

    // Map the incoming history to the format expected by the SDK
    const sdkHistory: Content[] = history.map(msg => ({
        // History coming in should already have the correct role ('user' | 'model')
        role: msg.role,
        parts: [{ text: msg.content }]
    }));

    // Add safety settings (example - adjust as needed)
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    // Prepare StartChatParams including the system instruction
    const chatParams: StartChatParams = {
      history: sdkHistory,
      safetySettings: safetySettings,
      systemInstruction: systemInstruction,
    };

    try {
        // Start chat with history, safety settings, and system instruction
        const chat = activeModel.startChat(chatParams);

        // Construct the parts for the current user message
        const currentUserParts: Part[] = [];
        
        // 1. ALWAYS include the text part for the message
        // If there's no text but we have audio, make sure to use a placeholder
        // This is required by the Gemini API to avoid the "empty text parameter" error
        if (message && message.trim()) {
            // Use the provided message text if present
            currentUserParts.push({ text: message.trim() });
        } else if (fileData && fileData.mimeType.startsWith('audio/')) {
            // For audio-only messages, add a placeholder text
            // Required to avoid Gemini API's "empty text parameter" error
            currentUserParts.push({ text: "Please transcribe and respond to this audio." });
            console.log("Gemini Service: Empty text with audio. Added text placeholder for API.");
        } else {
            // In all other cases (e.g., image-only), still add at least an empty text
            // to prevent potential API errors with some model versions
            currentUserParts.push({ text: message || " " });
        }
        
        // 2. Add the file part (image or audio)
        if (fileUri) {
            // Use fileUri for uploaded files (via Files API)
            console.log(`Gemini Service: Adding file from URI: ${fileUri.uri} (${fileUri.mimeType})`);
            currentUserParts.push({
                fileData: {
                    mimeType: fileUri.mimeType,
                    fileUri: fileUri.uri
                }
            });
        } else if (fileData) {
            // Validate base64 data isn't empty
            if (!fileData.base64String || fileData.base64String.length === 0) {
                console.error("Gemini Service: Base64 string is empty");
                return (async function*() { 
                    yield { text: `[Error: Invalid file data. File content is empty.]` }; 
                })();
            }

            // Use inline data (base64) for file
            console.log(`Gemini Service: Adding inline ${fileData.mimeType} data, base64 length: ${fileData.base64String.length}`);
            currentUserParts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.base64String
                }
            });
        }

        // Ensure we have something to send
        if (currentUserParts.length === 0) {
            console.warn("Gemini Service: Attempted to send a message with no parts");
            return (async function*() { 
                yield { text: "[Error: Cannot send an empty message]" }; 
            })();
        }

        // Log what we're sending
        console.log(`Gemini Service: Sending ${currentUserParts.length} parts to ${selectedModelConfig.model}`);
        currentUserParts.forEach((part, index) => {
            if ('text' in part && part.text) {
                console.log(`Part ${index}: Text (${part.text.length} chars)`);
            } else if ('inlineData' in part && part.inlineData) {
                console.log(`Part ${index}: ${part.inlineData.mimeType} data (${part.inlineData.data.length} chars base64)`);
            } else if ('fileData' in part && part.fileData) {
                console.log(`Part ${index}: File URI ${part.fileData.fileUri}`);
            } else {
                console.log(`Part ${index}: Unknown part type`);
            }
        });
        
        // Send the message through the chat session
        const result = await chat.sendMessageStream(currentUserParts);
        console.log(`Gemini Service: Successfully initiated stream with ${selectedModelConfig.model}`);

        // Return an async generator to yield text chunks and metadata
        return (async function*() {
            try {
                for await (const chunk of result.stream) {
                    const textContent = chunk.text();
                    if (textContent) {
                        yield { text: textContent };
                    }
                }

                // Get final response for metadata
                const finalResponseData = await result.response;
                const firstCandidate = finalResponseData.candidates?.[0];
                
                if (firstCandidate?.groundingMetadata) {
                    const metadata = firstCandidate.groundingMetadata;
                    if (metadata.webSearchQueries?.length || metadata.searchEntryPoint?.renderedContent) {
                        yield { 
                            webSearchQueries: metadata.webSearchQueries,
                            renderedContent: metadata.searchEntryPoint?.renderedContent
                        };
                    }
                }
            } catch (streamError) {
                console.error("Error processing Gemini stream:", streamError);
                yield { text: "\n\n[Error processing response: " + (streamError instanceof Error ? streamError.message : String(streamError)) + "]" };
            }
        })();

    } catch (error: unknown) {
      console.error("Error with Gemini:", error);
      
      // Helpful error messages based on common issues
      if (error instanceof Error) {
          if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
               throw new Error(`Invalid or missing API Key. Please check your GEMINI_API_KEY.`);
          }
          if (error.message.includes("empty text parameter")) {
               throw new Error(`Gemini API requires a text parameter. Make sure messages aren't empty.`);
          }
          throw new Error(`Gemini error: ${error.message}`);
      } else {
          throw new Error(`Unexpected Gemini error: ${String(error)}`);
      }
    }
  }
} 
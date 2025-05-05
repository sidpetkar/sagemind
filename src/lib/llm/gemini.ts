import { GoogleGenerativeAI, Content, Part, HarmCategory, HarmBlockThreshold, StartChatParams } from "@google/generative-ai";
import { LlmService, ChatMessage, FileData, FileUri } from "./interface";

// Access your API key as an environment variable
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    fileUri?: FileUri
  ): Promise<AsyncIterable<string>> {
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
      // Add the system instruction here
      systemInstruction: systemInstruction,
    };

    try {
        // Start chat with history, safety settings, and system instruction
        const chat = model.startChat(chatParams);

        // Construct the parts for the current user message
        const currentUserParts: Part[] = [];
        // Add text part if message is not empty
        if (message.trim()) {
            currentUserParts.push({ text: message });
        }
        
        // Add file part based on what was provided
        if (fileUri) {
            // Use fileUri for uploaded files (via Files API)
            console.log(`Adding file from URI: ${fileUri.uri} (${fileUri.mimeType})`);
            currentUserParts.push({
                fileData: {
                    mimeType: fileUri.mimeType,
                    fileUri: fileUri.uri
                }
            });
        } else if (fileData) {
            // Use inline data (base64) for direct files
            const isImage = fileData.mimeType.startsWith('image/');
            const isAudio = fileData.mimeType.startsWith('audio/');
            const fileType = isImage ? 'image' : isAudio ? 'audio' : 'unknown media';
            
            console.log(`Adding inline ${fileType} data with type: ${fileData.mimeType}, base64 length: ${fileData.base64String.length}`);
            
            // Validate base64 data isn't empty
            if (!fileData.base64String || fileData.base64String.length === 0) {
                console.error("Base64 string is empty - cannot add to message");
                return (async function*() { 
                    yield `[Error: Invalid base64 data for ${fileType}. Please try again with a different file.]`; 
                })();
            }

            try {
                currentUserParts.push({
                    inlineData: {
                        mimeType: fileData.mimeType,
                        data: fileData.base64String
                    }
                });
                console.log(`Successfully added inline ${fileType} to parts`);
            } catch (error) {
                console.error(`Error adding inline ${fileType} to parts:`, error);
                return (async function*() { 
                    yield `[Error: Could not process ${fileType} data. Please try again.]`; 
                })();
            }
        }

        // Ensure we have something to send
        if (currentUserParts.length === 0) {
            // This case should ideally be handled by the API route, but as a safeguard:
            console.warn("Attempted to send an empty message to Gemini.");
            return (async function*() { yield "[Error: Cannot send empty message]"; })();
        }

        // Extra logging for multimodal prompts
        if (currentUserParts.length > 1) {
            console.log(`Sending multimodal prompt with ${currentUserParts.length} parts:`);
            currentUserParts.forEach((part, index) => {
                if ('text' in part && part.text) {
                    console.log(`Part ${index}: Text (${part.text.length} chars)`);
                } else if ('inlineData' in part && part.inlineData) {
                    console.log(`Part ${index}: ${part.inlineData.mimeType} (${part.inlineData.data.length} chars base64)`);
                } else if ('fileData' in part && part.fileData) {
                    console.log(`Part ${index}: File URI ${part.fileData.fileUri}`);
                } else {
                    console.log(`Part ${index}: Unknown part type`);
                }
        });
        }

        // Get the stream by sending the constructed parts
        console.log("Sending to Gemini API with System Instruction:", { 
            numParts: currentUserParts.length,
            messageText: message ? message.substring(0, 100) + (message.length > 100 ? "..." : "") : "(none)",
            hasFileData: !!fileData,
            hasFileUri: !!fileUri
        });
        
        const result = await chat.sendMessageStream(currentUserParts);
        // Success - continue with normal processing
        console.log("Successfully initiated Gemini API stream");

        // Return an async generator that yields text chunks
        // We wrap this in another async generator to handle potential errors from the stream itself
        return (async function*() {
            try {
                for await (const chunk of result.stream) {
                    if (chunk.candidates && chunk.candidates.length > 0 && chunk.candidates[0].content) {
                        const text = chunk.text(); // Helper to get text from the first candidate
                        if (text) {
                            yield text;
                        }
                    } else {
                        // Handle cases where the chunk might be empty or blocked mid-stream
                        const blockReason = chunk.promptFeedback?.blockReason;
                        console.warn(`Stream chunk blocked or empty. Reason: ${blockReason || 'Unknown'}`);
                        // Optionally yield a marker or handle differently if needed
                    }
                }
            } catch (streamError) {
                console.error("Error processing Gemini stream:", streamError);
                // Depending on requirements, you might yield an error message or re-throw
                yield "\n\n[Error processing response stream]";
                // Or re-throw if the API route should handle it:
                // throw new Error("Failed to process AI response stream.");
            }
        })(); // Immediately invoke the async generator function

    } catch (error: unknown) {
      console.error("Error initiating chat stream with Gemini:", error);
      // Rethrow or handle initial setup errors appropriately
      if (error instanceof Error) {
          throw new Error(`Failed to initiate stream: ${error.message}`);
      } else {
          throw new Error(`An unexpected error occurred initiating stream: ${String(error)}`);
      }
    }
  }
} 
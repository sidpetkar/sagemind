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
    modelName: string = DEFAULT_MODEL_NAME // Add modelName parameter
  ): Promise<AsyncIterable<{ text?: string; webSearchQueries?: string[]; renderedContent?: string }>> { // Updated return type
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
      // Add the system instruction here
      systemInstruction: systemInstruction,
    };

    try {
        // Start chat with history, safety settings, and system instruction
        const chat = activeModel.startChat(chatParams);

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
                    yield { text: "[Error: Invalid base64 data for ${fileType}. Please try again with a different file.]" }; 
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
                    yield { text: "[Error: Could not process ${fileType} data. Please try again.]" }; 
                })();
            }
        }

        // Ensure we have something to send
        if (currentUserParts.length === 0) {
            // This case should ideally be handled by the API route, but as a safeguard:
            console.warn("Attempted to send an empty message to Gemini.");
            // Adjust yield for new return type
            return (async function*() { yield { text: "[Error: Cannot send empty message]" }; })();
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
            model: selectedModelConfig.model, // Log the model being used
            numParts: currentUserParts.length,
            messageText: message ? message.substring(0, 100) + (message.length > 100 ? "..." : "") : "(none)",
            hasFileData: !!fileData,
            hasFileUri: !!fileUri
        });
        
        const result = await chat.sendMessageStream(currentUserParts);
        // Success - continue with normal processing
        console.log(`Successfully initiated Gemini API stream with model ${selectedModelConfig.model}`);

        // Return an async generator that yields text chunks
        // We wrap this in another async generator to handle potential errors from the stream itself
        return (async function*() {
            try {
                for await (const chunk of result.stream) {
                    // Check for text content in the chunk
                    const textContent = chunk.text(); // text() helper gets all text from parts
                    if (textContent) {
                        yield { text: textContent };
                    }

                    // According to Gemini API docs, groundingMetadata (including webSearchQueries & renderedContent)
                    // is typically part of the main candidate in the response, not necessarily streamed separately for each attribute.
                    // We will collect it from the final response after the stream.
                }

                // After the stream has finished, get the complete response to check for grounding metadata.
                const finalResponseData = await result.response;
                const firstCandidate = finalResponseData.candidates?.[0];
                
                if (firstCandidate) {
                    // For google_search, the metadata might be in several possible structures
                    // Check both classic groundingMetadata and the newer structured format
                    const groundingMetadata = firstCandidate.groundingMetadata;
                    const searchInfo = firstCandidate.content?.parts?.find(part => part.functionCall?.name === 'google_search');
                    
                    if (groundingMetadata) {
                        const webSearchQueries = groundingMetadata.webSearchQueries?.length ? groundingMetadata.webSearchQueries : undefined;
                        const renderedContent = groundingMetadata.searchEntryPoint?.renderedContent;

                        if (webSearchQueries || renderedContent) {
                            console.log("Grounding metadata found in groundingMetadata:", { webSearchQueries, hasRenderedContent: !!renderedContent });
                            yield { webSearchQueries: webSearchQueries, renderedContent: renderedContent };
                        }
                    } 
                    // Alternative path for newer API structure
                    else if (searchInfo && searchInfo.functionCall && 
                            typeof searchInfo.functionCall === 'object' && 
                            searchInfo.functionCall !== null &&
                            'args' in searchInfo.functionCall && 
                            typeof searchInfo.functionCall.args === 'object' &&
                            searchInfo.functionCall.args !== null &&
                            'searchResults' in searchInfo.functionCall.args) {
                        try {
                            const functionArgs = searchInfo.functionCall.args as {searchResults: string};
                            const searchResults = JSON.parse(functionArgs.searchResults);
                            if (Array.isArray(searchResults) && searchResults.length > 0) {
                                // Extract search query from the results
                                const webSearchQueries = [searchResults[0].query || "Related search"];
                                console.log("Grounding metadata found in functionCall:", { webSearchQueries });
                                yield { webSearchQueries };
                            }
                        } catch (parseError) {
                            console.error("Error parsing search results:", parseError);
                        }
                    }
                }

            } catch (streamError) {
                console.error("Error processing Gemini stream:", streamError);
                // Adjust yield for new return type
                yield { text: "\n\n[Error processing response stream]" };
            }
        })(); // Immediately invoke the async generator function

    } catch (error: unknown) {
      console.error("Error initiating chat stream with Gemini:", error);
      // Rethrow or handle initial setup errors appropriately
      if (error instanceof Error) {
          // Add more specific error handling for API key issues if not already covered
          if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
               throw new Error(`Failed to initiate stream: Invalid or missing API Key. Please check your GEMINI_API_KEY environment variable.`);
          }
          // Handle model access issues - specifically for preview models
          if (error.message.includes("Developer instruction is not enabled") || 
              error.message.includes("not enabled for models")) {
               throw new Error(`Access to model ${selectedModelConfig.model} is restricted. This preview model may require special access. Try using gemini-2.0-flash instead.`);
          }
          throw new Error(`Failed to initiate stream with ${selectedModelConfig.model}: ${error.message}`);
      } else {
          throw new Error(`An unexpected error occurred initiating stream with ${selectedModelConfig.model}: ${String(error)}`);
      }
    }
  }
} 
import { NextResponse } from 'next/server';
import { GeminiService } from '@/lib/llm/gemini'; // Using path alias '@'
import { PerplexityService } from '@/lib/llm/perplexity'; // Import the Perplexity service
import { OpenRouterService } from '@/lib/llm/openrouter'; // Import the OpenRouter service
import { OpenAIService } from '@/lib/llm/openai'; // Import the OpenAI service
import { ChatMessage, FileData, FileUri, LlmService } from '@/lib/llm/interface'; // Import LlmService
import Together from 'together-ai'; // Added for Llama Vision

// Define PayloadChunk interface here if not available from common interface
interface PayloadChunk {
  text?: string;
  webSearchQueries?: string[];
  renderedContent?: string;
  sourceCitations?: string[]; // Added for clickable citation links
  imageBase64?: string; // Added for FLUX image generation
  // We can add other fields for different model capabilities
}

// Type for messages coming from the frontend
interface FrontendMessage {
    role: 'user' | 'ai';
    content: string;
}

// Instantiate services
const geminiService = new GeminiService();
const perplexityService = new PerplexityService();
const openRouterService = new OpenRouterService();
const openAIService = new OpenAIService();
// Explicitly set API key from environment variable
const together = new Together({ 
  apiKey: process.env.TOGETHER_API_KEY 
});

// Check for Together AI API Key immediately
if (!process.env.TOGETHER_API_KEY) {
  console.warn("TOGETHER_API_KEY is not set. Together AI models will not be available.");
}

// Check for OpenRouter API Key
if (!process.env.OPENROUTER_API_KEY) {
  console.warn("OPENROUTER_API_KEY is not set. OpenRouter models will not be available.");
}

// Check for OpenAI API Key and provide detailed logging
console.log("API Keys availability check:", {
  OPENAI_API_KEY_SET: !!process.env.OPENAI_API_KEY,
  GEMINI_API_KEY_SET: !!process.env.GEMINI_API_KEY,
  PERPLEXITY_API_KEY_SET: !!process.env.PERPLEXITY_API_KEY,
  TOGETHER_API_KEY_SET: !!process.env.TOGETHER_API_KEY,
  OPENROUTER_API_KEY_SET: !!process.env.OPENROUTER_API_KEY,
  NODE_ENV: process.env.NODE_ENV
});

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. OpenAI models will not be available.");
  if (process.env.NODE_ENV === 'development') {
    console.warn("Using fallback key for development from openai.ts file.");
  }
}

// Helper function to select the appropriate service based on model name
function getServiceForModel(modelName: string): LlmService {
  if (modelName.startsWith('sonar')) {
    return perplexityService;
  }
  if (modelName === 'qwen/qwen2.5-vl-72b-instruct:free') {
    return openRouterService;
  }
  if (modelName === 'gpt-4o-mini') {
    return openAIService;
  }
  return geminiService; // Default to Gemini
}

// New handler for Llama Vision requests
async function handleLlamaVisionRequest(
  message: string,
  history: ChatMessage[],
  fileData?: FileData,
  fileNameFromForm?: string | null
): Promise<ReadableStream<Uint8Array>> {
  if (!process.env.TOGETHER_API_KEY) {
    throw new Error("TOGETHER_API_KEY is not set. Llama Vision model is not available.");
  }

  // Process history to ensure it includes image data
  // First, create base message structures
  const messages: any[] = [];
  
  // Process each message in history, properly converting format for Together AI
  history.forEach(h => {
    // Skip empty messages
    if (!h.content?.trim()) return;
    
    // Add proper type checking
    const role = h.role as string;
    
    if (role === 'model' || role === 'assistant') {
      // AI messages are simple text
      messages.push({
        role: 'assistant',
        content: h.content
      });
    } else if (role === 'user') {
      // User messages might contain images
      // For simplicity in this implementation, we'll just use text
      // A more complete implementation would check for imageBase64Preview and include those
      messages.push({
        role: 'user',
        content: h.content
      });
    }
    // Ignore any messages with unsupported roles
  });

  // Current message with image handling
  const userMessageContent: any[] = [{ type: 'text', text: message }];

  if (fileData && fileData.mimeType.startsWith('image/')) {
    userMessageContent.push({
      type: 'image_url',
      image_url: { url: `data:${fileData.mimeType};base64,${fileData.base64String}` }
    });
    console.log("Adding image to Llama Vision request");
  } else if (fileData) {
    // If a non-image file is provided to Llama Vision, append a note or handle as error
    userMessageContent.push({ type: 'text', text: `\n\n(Note: A file named '${fileNameFromForm || 'file'}' of type '${fileData.mimeType}' was uploaded, but this model primarily processes images and text.)` });
  }

  messages.push({
    role: 'user',
    content: userMessageContent
  });

  // Log the full message structure for debugging if needed
  console.log("Sending to Together AI (Llama Vision) with message count:", messages.length);

  const stream = await together.chat.completions.create({
    model: "meta-llama/Llama-Vision-Free",
    messages: messages,
    stream: true,
    max_tokens: 2048, // Add a reasonable token limit
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const textContent = chunk.choices[0]?.delta?.content || '';
          if (textContent) {
            const payload: PayloadChunk = { text: textContent };
            controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'));
          }
        }
        controller.close();
      } catch (error) {
        console.error("Error reading from Together AI stream:", error);
        const errorPayload: PayloadChunk = { text: `[Error: ${error instanceof Error ? error.message : 'Unknown streaming error with Llama Vision'}]` };
        controller.enqueue(encoder.encode(JSON.stringify(errorPayload) + '\n'));
        controller.close();
      }
    },
    cancel() {
      console.log("Llama Vision stream cancelled by client.");
      // Clean up resources if necessary, e.g., aborting the Together AI request if possible
    },
  });
}

// New generic handler for Together AI text-based chat models
async function handleTogetherAIChatRequest(
  message: string,
  history: ChatMessage[],
  modelId: string // Specific model ID to use
): Promise<ReadableStream<Uint8Array>> {
  if (!process.env.TOGETHER_API_KEY) {
    throw new Error("TOGETHER_API_KEY is not set. Together AI models are not available.");
  }

  const messages: any[] = history.map(h => ({
    role: h.role === 'model' ? 'assistant' : h.role,
    content: h.content
  }));

  messages.push({
    role: 'user',
    content: message
  });

  console.log(`Sending to Together AI (${modelId}):`, JSON.stringify(messages, null, 2));

  const stream = await together.chat.completions.create({
    model: modelId,
    messages: messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const textContent = chunk.choices[0]?.delta?.content || '';
          if (textContent) {
            const payload: PayloadChunk = { text: textContent };
            controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'));
          }
        }
        controller.close();
      } catch (error) {
        console.error(`Error reading from Together AI stream (${modelId}):`, error);
        const errorPayload: PayloadChunk = { text: `[Error: ${error instanceof Error ? error.message : `Unknown streaming error with ${modelId}`}]` };
        controller.enqueue(encoder.encode(JSON.stringify(errorPayload) + '\n'));
        controller.close();
      }
    },
    cancel() {
      console.log(`Together AI stream (${modelId}) cancelled by client.`);
    },
  });
}

// New handler for FLUX.1-schnell-Free image generation
async function handleFluxImageRequest(
  prompt: string
): Promise<NextResponse> { // Returns NextResponse directly, not a stream
  if (!process.env.TOGETHER_API_KEY) {
    return NextResponse.json({ error: "TOGETHER_API_KEY is not set. Image generation model is not available." }, { status: 500 });
  }
  if (!prompt || prompt.trim() === "") {
    return NextResponse.json({ error: "Prompt is required for image generation." }, { status: 400 });
  }

  console.log(`Sending to Together AI (FLUX.1-schnell-Free) with prompt: "${prompt}"`);

  try {
    // Type for the expected response structure from Together AI images.create
    type TogetherImageResponse = {
      data?: Array<{
        b64_json?: string;
      }>;
    };

    const response: TogetherImageResponse = await together.images.create({
      model: "black-forest-labs/FLUX.1-schnell-Free",
      prompt: prompt,
      width: 1024,
      height: 1024,
      steps: 4, // FLUX.1-schnell-Free requires steps between 1 and 4
      n: 1,
      response_format: "base64",
    });

    console.log("Raw response from Together AI Images:", JSON.stringify(response, null, 2));

    const imageBase64 = response?.data?.[0]?.b64_json;

    if (imageBase64) {
      const payload: PayloadChunk = { imageBase64: imageBase64, text: `Image generated for: "${prompt}"` };
      return NextResponse.json(payload);
    } else {
      console.error("Error generating image with FLUX.1-schnell-Free: No b64_json data in response.", response);
      let detailedError = "Image generation failed: No image data returned by the API.";
      return NextResponse.json({ error: "Failed to generate image", details: detailedError, rawResponse: response }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Exception during Together AI image generation:", error);
    let errorMessage = "Error generating image due to an exception.";
    let errorDetails: any = { message: "An unexpected error occurred." };

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = { name: error.name, message: error.message, stack: error.stack };
    }
    // Check if the error object is from Together AI or an HTTP error
    if (error.response && error.response.data) {
        errorDetails = error.response.data;
        if (typeof error.response.data === 'string') {
            errorMessage = error.response.data;
        } else if (error.response.data.error && typeof error.response.data.error.message === 'string') {
            errorMessage = error.response.data.error.message;
        } else if (typeof error.response.data.detail === 'string') {
            errorMessage = error.response.data.detail;
        } else if (error.response.statusText) {
            errorMessage = `API Error: ${error.response.status} - ${error.response.statusText}`;
        }
    } else if (error.message) {
        errorMessage = error.message;
    }

    return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Read FormData instead of JSON
    const formData = await request.formData();
    
    // Log all received form data keys
    console.log("Chat API received form data keys:", Array.from(formData.keys()));
    
    const message = formData.get('message') as string | null;
    const historyString = formData.get('history') as string | null;
    const file = formData.get('file') as File | null;
    
    // File URI from upload API (alternative to direct file)
    const fileUriString = formData.get('fileUri') as string | null;
    const fileMimeType = formData.get('fileMimeType') as string | null;
    const fileName = formData.get('fileName') as string | null;
    
    // Preprocessed file data
    const base64String = formData.get('base64') as string | null;
    const convertedMimeType = formData.get('convertedType') as string | null;
    
    // Get modelName from formData
    const modelName = formData.get('modelName') as string | null;

    console.log("Parameters received:", {
      hasMessage: !!message,
      messageLength: message?.length,
      hasHistory: !!historyString,
      hasFile: !!file,
      hasFileUri: !!fileUriString,
      hasBase64: !!base64String,
      convertedMimeType,
      modelName
    });

    // Check if we're handling an audio file
    const isAudioRequest = (
      (convertedMimeType && convertedMimeType.startsWith('audio/')) ||
      (file && file.type.startsWith('audio/')) ||
      (fileMimeType && fileMimeType.startsWith('audio/'))
    );

    // Ensure audio requests have a text message
    let processedMessage = message;
    if (isAudioRequest && (!processedMessage || processedMessage.trim() === '')) {
      processedMessage = "Process this audio."; // Changed to a more neutral default
      console.log("Set neutral default text message for audio-only request in API route");
    }

    // --- Process History ---
    let serviceHistory: ChatMessage[] = [];
    if (historyString) {
      try {
        const frontendHistory = JSON.parse(historyString) as FrontendMessage[];
        if (!Array.isArray(frontendHistory)) {
          throw new Error('History is not an array');
        }
        serviceHistory = frontendHistory.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            content: msg.content
        }));
      } catch (parseError) {
        console.error("Error parsing history:", parseError);
        return NextResponse.json({ error: 'Invalid history format' }, { status: 400 });
      }
    }
    // --- End Process History ---

    // --- Process File or FileUri --- 
    let fileData: FileData | undefined = undefined;
    let fileUri: FileUri | undefined = undefined;

    // Handle pre-processed file data (this is the most reliable method)
    if (base64String && convertedMimeType) {
      console.log(`Using pre-processed file with type: ${convertedMimeType} and base64 length: ${base64String.length}`);
      
      // Add extra validation for Base64 data
      if (base64String.length > 5) { // Minimal validation to avoid empty data
        fileData = {
          mimeType: convertedMimeType,
          base64String: base64String
        };
      } else {
        console.error("Invalid base64 data: string is too short");
      }
    }
    // Handle uploaded file URI (keeping for future use when Files API is supported)
    else if (fileUriString && fileMimeType) {
      fileUri = {
        uri: fileUriString,
        mimeType: fileMimeType,
        name: fileName || undefined
      };
      console.log(`Using uploaded file URI: ${fileUriString}`);
    }
    // Direct file upload (convert to base64)
    else if (file) {
      try {
        console.log(`Processing direct file upload: ${file.name}, size: ${file.size}, type: ${file.type}`);
        
        if (file.size === 0) {
          throw new Error("Uploaded file is empty (0 bytes)");
        }
        
        const fileBuffer = await file.arrayBuffer();
        if (fileBuffer.byteLength === 0) {
          throw new Error("File buffer is empty after reading");
        }
        
        const base64StringFromFile = Buffer.from(fileBuffer).toString('base64'); // Renamed to avoid conflict
        console.log(`Converted direct file ${file.name} to base64 (length: ${base64StringFromFile.length})`);
        
        if (base64StringFromFile.length < 5) {
          throw new Error("Generated base64 string is invalid or too short");
        }
        
        fileData = {
          mimeType: file.type,
          base64String: base64StringFromFile
        };
      } catch (fileError) {
          console.error("Error processing file:", fileError);
          return NextResponse.json({ error: 'Failed to process uploaded file: ' + (fileError instanceof Error ? fileError.message : 'Unknown error') }, { status: 500 });
      }
    }
    
    if (!fileData && !fileUri) {
      console.log("No file data or URI was processed successfully");
    } else {
      console.log("Successfully processed file data with mime type:", fileData?.mimeType || fileUri?.mimeType);
    }

    // Extract and process audio file if present
    let audioBase64 = null;
    let audioMimeType = null;
    const audio = formData.get('audio') as File | null;
    if (audio) {
      try {
        console.log(`API route: Processing audio file ${audio.name}, type: ${audio.type}, size: ${audio.size} bytes`);
        const audioBuffer = Buffer.from(await audio.arrayBuffer());
        audioBase64 = audioBuffer.toString('base64');
        audioMimeType = audio.type;
        console.log(`API route: Successfully processed audio file: ${audioBase64.length} base64 chars`);
      } catch (audioError) {
        console.error("Error processing audio file:", audioError);
        return Response.json({ error: "Failed to process audio file" }, { status: 400 });
      }
    }

    // If audio file was processed, override file data with audio data
    if (audioBase64 && audioMimeType) {
      console.log("API route: Using processed audio file as fileData");
      fileData = {
        base64String: audioBase64,
        mimeType: audioMimeType
      };
    }

    // Require at least a message, fileData, or a fileUri
    if (!processedMessage && !fileData && !fileUriString) {
      return NextResponse.json({ error: 'Message, file, or file URI is required' }, { status: 400 });
    }

    // --- Handle Llama Vision Model --- 
    if (modelName === 'meta-llama/Llama-Vision-Free') {
      if (!process.env.TOGETHER_API_KEY) {
        return NextResponse.json({ error: 'TOGETHER_API_KEY is not set. Llama Vision model is not available.' }, { status: 503 });
      }
      try {
        const stream = await handleLlamaVisionRequest(processedMessage ?? '', serviceHistory, fileData, fileName);
        return new Response(stream, {
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        });
      } catch (error) {
        console.error("API Route Error (Llama Vision Handler):", error);
        const errorMessage = error instanceof Error ? error.message : 'Error processing Llama Vision request';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }
    // --- Handle other Together AI Text Models ---
    else if (modelName === 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free' || 
             modelName === 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free') {
      console.log(`Entering block for ${modelName}. TOGETHER_API_KEY defined: ${!!process.env.TOGETHER_API_KEY}`);
      if (!process.env.TOGETHER_API_KEY) {
        console.error('TOGETHER_API_KEY check failed in text model block.');
        return NextResponse.json({ error: 'TOGETHER_API_KEY is not set. Together AI models are not available.' }, { status: 503 });
      }
      try {
        const stream = await handleTogetherAIChatRequest(processedMessage ?? '', serviceHistory, modelName);
        return new Response(stream, {
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        });
      } catch (error) {
        console.error(`API Route Error (Together AI Chat Handler - ${modelName}):`, error);
        const errorMessage = error instanceof Error ? error.message : `Error processing ${modelName} request`;
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }
    // --- Handle OpenRouter Models ---
    else if (modelName === 'qwen/qwen2.5-vl-72b-instruct:free') {
      if (!process.env.OPENROUTER_API_KEY) {
        return NextResponse.json({ error: 'OPENROUTER_API_KEY is not set. OpenRouter models are not available.' }, { status: 503 });
      }
      try {
        const streamIterable = await openRouterService.generateResponse(processedMessage ?? '', serviceHistory, fileData, fileUri, modelName);
        
        // Convert AsyncIterable to ReadableStream
        const readableStream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            try {
              for await (const payloadChunk of streamIterable) {
                controller.enqueue(encoder.encode(JSON.stringify(payloadChunk) + '\n'));
              }
              controller.close();
            } catch (error) {
              console.error(`Error reading from OpenRouter stream (${modelName}):`, error);
              const errorPayload = { text: `[Error: ${error instanceof Error ? error.message : 'Unknown streaming error'}]` };
              controller.enqueue(encoder.encode(JSON.stringify(errorPayload) + '\n'));
              controller.close();
            }
          },
          cancel() {
            console.log(`OpenRouter stream (${modelName}) cancelled by client.`);
          }
        });
        
        return new Response(readableStream, {
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        });
      } catch (error) {
        console.error(`API Route Error (OpenRouter Handler - ${modelName}):`, error);
        const errorMessage = error instanceof Error ? error.message : `Error processing ${modelName} request`;
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }
    // --- Handle FLUX Image Model --- 
    else if (modelName === 'black-forest-labs/FLUX.1-schnell-Free') {
      if (!processedMessage) { // Prompt is in the 'message' field for image generation
        return NextResponse.json({ error: 'Prompt (message) is required for image generation' }, { status: 400 });
      }
      // Directly call the image generation handler and return its response
      return handleFluxImageRequest(processedMessage);
    }
    // --- End Handle Image Generation Model ---

    // Select the appropriate service based on model name for Gemini/Perplexity
    const selectedService = getServiceForModel(modelName || '');
    
    // Detect if we're using Perplexity (which doesn't support file uploads)
    const isPerplexity = modelName?.startsWith('sonar') || false;
    if (isPerplexity && (fileData || fileUri)) {
      console.warn("Perplexity API doesn't support file uploads. Ignoring attached file.");
      // We don't clear fileData/fileUri here to avoid code changes, but we won't pass them to Perplexity
    }

    // Get the async iterable stream from the service, passing file data if available
    console.log("Calling service.generateResponse with:", {
      messageLength: (processedMessage || "").length,
      historyLength: serviceHistory.length,
      hasFileData: !!fileData,
      fileDataType: fileData?.mimeType,
      hasFileUri: !!fileUri,
      modelName,
      serviceType: isPerplexity ? 'Perplexity' : 'Gemini'
    });
    
    try {
      // For Perplexity, don't pass file data
      const stream = isPerplexity 
        ? await selectedService.generateResponse(processedMessage ?? '', serviceHistory, undefined, undefined, modelName ?? undefined)
        : await selectedService.generateResponse(processedMessage ?? '', serviceHistory, fileData, fileUri, modelName ?? undefined);

      // Create a ReadableStream to send to the client
      const readableStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const payloadChunk of stream) {
              // Serialize the object to a JSON string and encode it
              // Each JSON object will be on its own line to make it easier for client to parse (ndjson-like)
              controller.enqueue(encoder.encode(JSON.stringify(payloadChunk) + '\n'));
            }
            controller.close();
          } catch (error) {
            console.error("Error reading from service stream:", error);
            // Send error message to client rather than crashing
            const errorPayload = { text: `[Error: ${error instanceof Error ? error.message : 'Unknown streaming error'}]` };
            controller.enqueue(encoder.encode(JSON.stringify(errorPayload) + '\n'));
            controller.close();
          }
        },
        cancel() {
          console.log("Stream cancelled by client.");
        }
      });

      // Return the stream response
      return new Response(readableStream, {
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      });

    } catch (error) {
      console.error("API Route Error (Stream Setup):", error);
      // Return a non-streaming error response for setup issues
      let errorMessage = 'Internal Server Error';
      const statusCode = 500; // Use const as it's not reassigned
      if (error instanceof Error) {
          errorMessage = error.message; // Use the error message from the service
          if (errorMessage.includes("API Key")) {
               // Check which API key is missing
               if (isPerplexity) {
                 errorMessage = 'Server configuration error: Missing Perplexity API Key.';
               } else {
                 errorMessage = 'Server configuration error: Missing Gemini API Key.';
               }
          }
          // Add more specific status codes if needed based on error messages
      }

      return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
  } catch (error) {
    console.error("API Route Error (Main):", error);
    // Return a non-streaming error response for main issues
    let errorMessage = 'Internal Server Error';
    const statusCode = 500; // Use const as it's not reassigned
    if (error instanceof Error) {
        errorMessage = error.message; // Use the error message from the service
        if (errorMessage.includes("API Key")) {
             errorMessage = 'Server configuration error: Missing API Key.';
        }
        // Add more specific status codes if needed based on error messages
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
} 
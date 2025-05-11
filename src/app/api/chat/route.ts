import { NextResponse } from 'next/server';
import { GeminiService } from '@/lib/llm/gemini'; // Using path alias '@'
import { PerplexityService } from '@/lib/llm/perplexity'; // Import the Perplexity service
import { ChatMessage, FileData, FileUri, LlmService } from '@/lib/llm/interface'; // Import LlmService
import Together from 'together-ai'; // Added for Llama Vision

// Define PayloadChunk interface here if not available from common interface
interface PayloadChunk {
  text?: string;
  webSearchQueries?: string[];
  renderedContent?: string;
  sourceCitations?: string[]; // Added for clickable citation links
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
// Explicitly set API key from environment variable
const together = new Together({ 
  apiKey: process.env.TOGETHER_API_KEY 
});

// Check for Together AI API Key immediately
if (!process.env.TOGETHER_API_KEY) {
  console.warn("TOGETHER_API_KEY is not set. Together AI models will not be available.");
}

// Helper function to select the appropriate service based on model name
function getServiceForModel(modelName: string): LlmService {
  if (modelName.startsWith('sonar')) {
    return perplexityService;
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

  const messages: any[] = history.map(h => ({
    role: h.role === 'model' ? 'assistant' : h.role, // Together uses 'assistant' for model
    content: h.content
  }));

  const userMessageContent: any[] = [{ type: 'text', text: message }];

  if (fileData && fileData.mimeType.startsWith('image/')) {
    userMessageContent.push({
      type: 'image_url',
      image_url: { url: `data:${fileData.mimeType};base64,${fileData.base64String}` }
    });
  } else if (fileData) {
    // If a non-image file is provided to Llama Vision, append a note or handle as error
    userMessageContent.push({ type: 'text', text: `\n\n(Note: A file named '${fileNameFromForm || 'file'}' of type '${fileData.mimeType}' was uploaded, but this model primarily processes images and text.)` });
  }

  messages.push({
    role: 'user',
    content: userMessageContent
  });

  console.log("Sending to Together AI (Llama Vision):", JSON.stringify(messages, null, 2));

  const stream = await together.chat.completions.create({
    model: "meta-llama/Llama-Vision-Free",
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

    // Require at least a message, a file, or a fileUri
    if (!message && !file && !fileUriString && !base64String) {
      return NextResponse.json({ error: 'Message, file, or file URI is required' }, { status: 400 });
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

    // Handle pre-processed file data
    if (base64String && convertedMimeType) {
      console.log(`Using pre-processed file with type: ${convertedMimeType} and base64 length: ${base64String.length}`);
      fileData = {
        mimeType: convertedMimeType,
        base64String: base64String
      };
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
        const fileBuffer = await file.arrayBuffer();
        const base64String = Buffer.from(fileBuffer).toString('base64');
        console.log(`Converted direct file ${file.name} to base64 (length: ${base64String.length})`);
        fileData = {
          mimeType: file.type,
          base64String: base64String
        };
      } catch (fileError) {
          console.error("Error processing file:", fileError);
          return NextResponse.json({ error: 'Failed to process uploaded file' }, { status: 500 });
      }
    }
    
    if (!fileData && !fileUri) {
      console.log("Warning: No file data or URI was processed successfully");
    }

    // --- Handle Llama Vision Model --- 
    if (modelName === 'meta-llama/Llama-Vision-Free') {
      if (!process.env.TOGETHER_API_KEY) {
        return NextResponse.json({ error: 'TOGETHER_API_KEY is not set. Llama Vision model is not available.' }, { status: 503 });
      }
      try {
        const stream = await handleLlamaVisionRequest(message ?? '', serviceHistory, fileData, fileName);
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
        const stream = await handleTogetherAIChatRequest(message ?? '', serviceHistory, modelName);
        return new Response(stream, {
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        });
      } catch (error) {
        console.error(`API Route Error (Together AI Chat Handler - ${modelName}):`, error);
        const errorMessage = error instanceof Error ? error.message : `Error processing ${modelName} request`;
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }
    // --- End Handle Together AI Models ---

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
      messageLength: (message || "").length,
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
        ? await selectedService.generateResponse(message ?? '', serviceHistory, undefined, undefined, modelName ?? undefined)
        : await selectedService.generateResponse(message ?? '', serviceHistory, fileData, fileUri, modelName ?? undefined);

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
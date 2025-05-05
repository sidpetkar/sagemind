import { NextResponse } from 'next/server';
import { GeminiService } from '@/lib/llm/gemini'; // Using path alias '@'
import { ChatMessage, FileData, FileUri } from '@/lib/llm/interface'; // Import FileUri

// Type for messages coming from the frontend
interface FrontendMessage {
    role: 'user' | 'ai';
    content: string;
}

// Instantiate the service once
const geminiService = new GeminiService();

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
    
    console.log("Parameters received:", {
      hasMessage: !!message,
      messageLength: message?.length,
      hasHistory: !!historyString,
      hasFile: !!file,
      hasFileUri: !!fileUriString,
      hasBase64: !!base64String,
      convertedMimeType
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

    // Get the async iterable stream from the service, passing file data if available
    console.log("Calling geminiService.generateResponse with:", {
      messageLength: (message || "").length,
      historyLength: serviceHistory.length,
      hasFileData: !!fileData,
      fileDataType: fileData?.mimeType,
      hasFileUri: !!fileUri
    });
    
    const stream = await geminiService.generateResponse(message ?? '', serviceHistory, fileData, fileUri);

    // Create a ReadableStream to send to the client
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (error) {
          console.error("Error reading from service stream:", error);
          controller.error(error);
        }
      },
      cancel() {
        console.log("Stream cancelled by client.");
      }
    });

    // Return the stream response
    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error("API Route Error (Stream Setup):", error);
    // Return a non-streaming error response for setup issues
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
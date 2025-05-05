import { NextResponse } from 'next/server';

// List of MIME types supported by Gemini
const SUPPORTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac'
];

// Image types are generally supported as-is
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`Processing file: ${file.name}, Type: ${file.type}, Size: ${file.size} bytes`);
    
    // Validate the file has actual content
    if (file.size === 0) {
      console.error("File has zero bytes");
      return NextResponse.json({ error: 'File is empty (0 bytes)' }, { status: 400 });
    }

    // Determine if it's an image or audio file
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    
    // Check if the file type is supported and set appropriate MIME type
    let mimeType = file.type;
    
    if (isAudio && !SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
      console.log(`Audio type ${mimeType} is not directly supported. Using audio/mp3 as fallback.`);
      mimeType = 'audio/mp3';
    } else if (isImage) {
      // Keep original image type or use jpeg as fallback
      if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
        console.log(`Image type ${mimeType} might not be fully supported. Using original format anyway.`);
      }
    } else {
      console.log(`Unsupported file type: ${mimeType}. This may cause issues with the Gemini API.`);
    }

    // Convert file to base64
    try {
      // Extra debugging for the file
      console.log("File object:", {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      });
      
      // Get the ArrayBuffer from the file
      try {
        console.log("Reading file as ArrayBuffer...");
        const fileBuffer = await file.arrayBuffer();
        console.log(`ArrayBuffer obtained: ${fileBuffer.byteLength} bytes`);
        
        if (fileBuffer.byteLength === 0) {
          throw new Error("File buffer is empty after reading");
        }
        
        // Try to convert the buffer to base64
        try {
          const buffer = Buffer.from(fileBuffer);
          console.log(`Created Buffer from ArrayBuffer: ${buffer.length} bytes`);
          
          const base64String = buffer.toString('base64');
          console.log(`Converted to base64: ${base64String.length} chars`);
          
          if (!base64String || base64String.length === 0) {
            throw new Error("Base64 conversion resulted in empty string");
          }
          
          // Return success response
          const response = {
            name: file.name,
            originalType: file.type,
            convertedType: mimeType,
            base64: base64String,
            size: file.size
          };
          
          console.log("Successfully processed file data:", {
            name: response.name,
            originalType: response.originalType, 
            convertedType: response.convertedType,
            base64Length: response.base64.length,
            size: response.size
          });
          
          return NextResponse.json(response);
          
        } catch (base64Error) {
          console.error("Error converting to base64:", base64Error);
          throw new Error(`Base64 conversion failed: ${base64Error instanceof Error ? base64Error.message : 'Unknown error'}`);
        }
        
      } catch (bufferError) {
        console.error("Error reading file as ArrayBuffer:", bufferError);
        throw new Error(`Failed to read file: ${bufferError instanceof Error ? bufferError.message : 'Unknown error'}`);
      }
      
    } catch (processingError) {
      console.error("File processing error:", processingError);
      return NextResponse.json({ 
        error: `Failed to process file: ${processingError instanceof Error ? processingError.message : 'Unknown error'}` 
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error("File Processing Error:", error);
    let errorMessage = 'Internal Server Error processing file';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 
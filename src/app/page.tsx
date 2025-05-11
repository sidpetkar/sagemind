'use client';

import { useState, FormEvent, useRef, ChangeEvent, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// Import next/image
import Image from 'next/image'; 
// Import Lucide React icons
import { Paperclip, Mic, Square, X, Send, ArrowUp } from 'lucide-react';
// Import markdown extensions
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // Import a syntax highlighting theme

// Import SuperEllipseImg
import { SuperEllipseImg } from "react-superellipse";

interface Message {
  role: 'user' | 'ai';
  content: string;
  audioUrl?: string; // Optional URL for audio playback
  fileType?: string; // Optional file type info
  fileName?: string; // Optional file name
  imageBase64Preview?: string; // For image previews in user messages
  imageUrl?: string; // For AI-generated images
  webSearchQueries?: string[]; // For Google Search grounded queries
  renderedContent?: string; // For Google Search rendered suggestions
  sourceCitations?: string[]; // Array of source URLs for citations
}

// Helper function to process text and make citation markers clickable
const processCitationMarkers = (text: string, citations?: string[]): React.ReactNode => {
  if (!citations || citations.length === 0) return text;
  
  // Split text by citation markers [n]
  const parts = text.split(/(\[\d+\])/g);
  
  return parts.map((part, i) => {
    // Check if this part is a citation marker
    const match = part.match(/\[(\d+)\]/);
    if (match) {
      const citationNumber = parseInt(match[1], 10);
      const index = citationNumber - 1; // Convert to 0-based index
      
      // If we have a citation URL for this index, make it a link
      if (index >= 0 && index < citations.length) {
        return (
          <a 
            key={i}
            href={citations[index]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            {part}
          </a>
        );
      }
    }
    
    // Return regular text for non-citation parts
    return part;
  });
};

export default function ChatPage() {
  const [inputValue, setInputValue] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Ref for textarea
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false); // State for drag-over visual cue

  // --- Model Selection State ---
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.0-flash'); // Default model
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // --- Image Overlay State ---
  const [isImageOverlayOpen, setIsImageOverlayOpen] = useState<boolean>(false);
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(null);

  // --- Audio Recording State ---
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // --- File Upload URI State ---
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    name: string;
    originalType: string;
    convertedType: string;
    base64: string;
    size: number;
  } | null>(null);
  // --- End File Upload URI State ---

  // Add state for tracking mouse movement in chat container
  const [isMouseMoving, setIsMouseMoving] = useState<boolean>(false);
  const mouseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track mouse movement in chat container with more reliable implementation
  const handleMouseMove = () => {
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      chatContainer.classList.add('scrollbar-visible');
      
      // Clear any existing timer
      if (mouseTimerRef.current) {
        clearTimeout(mouseTimerRef.current);
      }
      
      // Set a timer to hide the scrollbar after 1 second of inactivity
      mouseTimerRef.current = setTimeout(() => {
        chatContainer.classList.remove('scrollbar-visible');
      }, 1000);
    }
  };

  // Initialize mouse movement handler on component mount
  useEffect(() => {
    const chatContainer = document.querySelector('.chat-container');
    
    if (chatContainer) {
      chatContainer.addEventListener('mousemove', handleMouseMove);
      chatContainer.addEventListener('scroll', handleMouseMove);
    }
    
    return () => {
      if (chatContainer) {
        chatContainer.removeEventListener('mousemove', handleMouseMove);
        chatContainer.removeEventListener('scroll', handleMouseMove);
      }
      
      if (mouseTimerRef.current) {
        clearTimeout(mouseTimerRef.current);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Define the model options
  const modelOptions = [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'meta-llama/Llama-Vision-Free', label: 'Llama Vision' },
    { value: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', label: 'Llama 3.3 Instruct' },
    { value: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free', label: 'DeepSeek R1' },
    { value: 'sonar', label: 'Perplexity Sonar' },
    { value: 'sonar-pro', label: 'Perplexity Sonar Pro' },
  ];

  // Find the current model label
  const currentModelLabel = modelOptions.find(option => option.value === selectedModel)?.label || selectedModel;

  // Effect to adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto'; // Reset to measure natural scrollHeight

      requestAnimationFrame(() => {
        if (!textareaRef.current) return;

        const computedStyle = getComputedStyle(ta);
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        let lineHeight = parseFloat(computedStyle.lineHeight);

        if (isNaN(lineHeight) || lineHeight <= 0) {
          const fontSize = parseFloat(computedStyle.fontSize);
          lineHeight = (!isNaN(fontSize) && fontSize > 0) ? fontSize * 1.5 : 24;
        }
        lineHeight = Math.max(1, lineHeight); // Ensure positive

        const oneLinePixelHeightWithPadding = lineHeight + paddingTop + paddingBottom;
        const fourLinesPixelHeightWithPadding = (lineHeight * 4) + paddingTop + paddingBottom;
        const currentScrollHeight = ta.scrollHeight; // This includes padding

        if (ta.value === '') {
          ta.style.height = `${oneLinePixelHeightWithPadding}px`;
        } else {
          let targetPixelHeight = currentScrollHeight;

          // Cap at 4 lines worth of height
          targetPixelHeight = Math.min(targetPixelHeight, fourLinesPixelHeightWithPadding);
          
          // Ensure it's at least 1 line high
          targetPixelHeight = Math.max(targetPixelHeight, oneLinePixelHeightWithPadding);
          
          ta.style.height = `${targetPixelHeight}px`;
        }
      });
    }
  }, [inputValue]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file type
      const isAudio = file.type.startsWith('audio/');
      const isImage = file.type.startsWith('image/');
      
      if (!isAudio && !isImage) {
        setError(`Unsupported file type: ${file.type}. Please upload an audio or image file.`);
        return;
      }
      
      setSelectedFile(file);
      setAudioUrl(null); // Clear any existing audio recording
      
      // Clear any previous uploaded file URI
      setUploadedFileInfo(null);
      
      if (isRecording && mediaRecorder) { // Stop recording if active
        mediaRecorder.stop();
      }
      
      console.log(`File selected: ${file.name} (${file.type})`);
      
      // Upload and process the file
      await uploadFile(file);
    }
  };

  // New function to preprocess a file with /api/upload endpoint
  const uploadFile = async (file: File) => {
    try {
      setIsLoading(true);
      setError(null); // Clear any previous errors
      
      // For audio files, use the preprocessing endpoint
      const formData = new FormData();
      formData.append('file', file);
      
      console.log(`Uploading file for preprocessing: ${file.name} (${file.type}, ${file.size} bytes)`);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log("File preprocessed successfully:", {
        name: result.name,
        originalType: result.originalType,
        convertedType: result.convertedType,
        base64Length: result.base64?.length || 0,
        size: result.size
      });
      
      // Validate that the base64 data is present
      if (!result.base64 || result.base64.length === 0) {
        console.error("No base64 data returned from server");
        throw new Error("Server processed the file but returned no data");
      }
      
      // Store the file information
      setUploadedFileInfo(result);
      
    } catch (err) {
      console.error("Error preprocessing file:", err);
      if (err instanceof Error) {
        setError(`Failed to preprocess file: ${err.message}`);
      } else {
        setError('Failed to preprocess file. Please try again.');
      }
      // Clear any incomplete data
      setUploadedFileInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Audio Recording Logic ---
  const startRecording = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Clear selected file if user starts recording
        setSelectedFile(null);
        setAudioUrl(null);
        setUploadedFileInfo(null);

        // Using simple MIME type selection
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/mp3')) {
          mimeType = 'audio/mp3';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          mimeType = 'audio/wav';
        }
        
        console.log("Using MIME type for recording:", mimeType);

        // Create recorder with the selected MIME type
        const recorder = new MediaRecorder(stream, { mimeType });
        setMediaRecorder(recorder);
        
        // Store audio chunks locally within the function scope
        const localAudioChunks: Blob[] = [];
        
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            console.log(`Got audio chunk: ${event.data.size} bytes`);
            localAudioChunks.push(event.data);
          }
        };

        recorder.onstop = async () => {
          console.log(`Recording stopped, collected ${localAudioChunks.length} chunks`);
          
          if (localAudioChunks.length === 0) {
            console.error("No audio data captured");
            setError("No audio data was captured. Please try again.");
            return;
          }
          
          // Create blob from local chunks
          const audioBlob = new Blob(localAudioChunks, { type: mimeType });
          console.log(`Created audio blob: ${audioBlob.size} bytes`);
          
          if (audioBlob.size === 0) {
            console.error("Audio blob is empty");
            setError("Recording failed: no audio data. Please try again.");
            return;
          }
          
          // Create URL for audio preview
          const audioUrl = URL.createObjectURL(audioBlob);
          setAudioUrl(audioUrl);
          
          // Create File object from blob
          const fileName = `recording-${Date.now()}.${mimeType.split('/')[1]}`;
          const file = new File([audioBlob], fileName, { type: mimeType });
          console.log(`Created audio file: ${file.name}, ${file.size} bytes`);
          
          setSelectedFile(file);
          
          // Stop tracks
          stream.getTracks().forEach(track => track.stop());
          
          // Try to upload the file
          if (file.size > 0) {
            await uploadFile(file);
          }
        };

        // Start recording with 1 second data chunks
        recorder.start(1000);
        setIsRecording(true);
        console.log("Recording started");
        
      } catch (err) {
        console.error("Error accessing microphone:", err);
        setError("Microphone access denied or not available.");
      }
    } else {
      setError("Audio recording is not supported by your browser.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop(); // This triggers the onstop event
      setIsRecording(false);
      // Note: The actual file creation happens in onstop
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const clearRecording = () => {
    if (isRecording && mediaRecorder) {
        mediaRecorder.stop(); // Stop recording first
    }
    setAudioUrl(null);
    setSelectedFile(null);
    // If mediaRecorder is still somehow active, ensure tracks are stopped
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    setMediaRecorder(null);
    setIsRecording(false); // Ensure recording state is off
  };
  // --- End Audio Recording Logic ---

  // --- Image Overlay Handlers ---
  const handleOpenImageOverlay = (imageUrl: string) => {
    setOverlayImageUrl(imageUrl);
    setIsImageOverlayOpen(true);
  };

  const handleCloseImageOverlay = () => {
    setIsImageOverlayOpen(false);
    setOverlayImageUrl(null);
  };
  // --- End Image Overlay Handlers ---

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(file => file.type.startsWith('image/'));

      if (imageFile) {
        // Clear any existing selections before processing the new one
        setSelectedFile(null);
        setAudioUrl(null);
        setUploadedFileInfo(null);
        if (isRecording && mediaRecorder) {
          mediaRecorder.stop();
        }
        // Call existing uploadFile function
        await uploadFile(imageFile);
      } else {
        setError("Only image files can be dropped.");
      }
      // Clean up the data transfer object
      e.dataTransfer.clearData();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    let imageFileFound = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste action for the image
        const imageFile = items[i].getAsFile();

        if (imageFile) {
          // Clear any existing selections before processing the new one
          setSelectedFile(null);
          setAudioUrl(null);
          setUploadedFileInfo(null);
          if (isRecording && mediaRecorder) {
            mediaRecorder.stop();
          }
          await uploadFile(imageFile);
          imageFileFound = true;
          break; // Process only the first image found
        }
      }
    }
    // If an image was pasted and handled, we don't want to also paste any text content
    // that might have been part of the same paste operation (e.g. from a rich text editor)
    // However, if NO image was found, allow default text pasting to occur.
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Continue with normal message handling
    if (!inputValue.trim() && !selectedFile && !audioUrl && !uploadedFileInfo) {
      setError('Please enter a message or select a file.');
      return;
    }

    const userMessageContent = inputValue.trim();

    setIsLoading(true);
    setError(null);

    const historyToSend = messages;

    // Add user message to state (including file info if present)
    const newUserMessage: Message = {
      role: 'user',
      content: userMessageContent,
      ...(uploadedFileInfo && {
        fileType: uploadedFileInfo.originalType,
        fileName: uploadedFileInfo.name,
        // Store only the raw base64 data for images
        ...(uploadedFileInfo.originalType.startsWith('image/') && { imageBase64Preview: uploadedFileInfo.base64 })
      }),
      ...(audioUrl && selectedFile && { // If there was a recording
        audioUrl: audioUrl,
        fileType: selectedFile.type,
        fileName: selectedFile.name,
      }),
    };

    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setInputValue('');
    // After submit, reset textarea height to 1 line equivalent
    if (textareaRef.current) {
        const ta = textareaRef.current;
        const computedStyle = getComputedStyle(ta);
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        let lineHeight = parseFloat(computedStyle.lineHeight);
        if (isNaN(lineHeight) || lineHeight <= 0) {
            const fontSize = parseFloat(computedStyle.fontSize); 
            lineHeight = (!isNaN(fontSize) && fontSize > 0) ? fontSize * 1.5 : 24;
        }
        lineHeight = Math.max(1, lineHeight);
        ta.style.height = `${lineHeight + paddingTop + paddingBottom}px`;
    }
    setSelectedFile(null);
    setAudioUrl(null); // Clear audio preview from input

    // Add a placeholder for the AI response
    const aiMessagePlaceholder: Message = { role: 'ai', content: '' };
    setMessages((prevMessages) => [...prevMessages, aiMessagePlaceholder]);
    const aiMessageIndex = messages.length + 1;

    try {
      // Use FormData to send both text and file
      const formData = new FormData();
      
      // Always include a message (even if empty) to avoid the 'Message required' error
      formData.append('history', JSON.stringify(historyToSend));
      formData.append('message', userMessageContent);
      formData.append('modelName', selectedModel); // Pass the selected model
      
      // If we have preprocessed file data, use that
      if (uploadedFileInfo) {
        console.log("Sending preprocessed file data:", {
          name: uploadedFileInfo.name,
          type: uploadedFileInfo.convertedType,
          size: uploadedFileInfo.size
        });
        
        formData.append('base64', uploadedFileInfo.base64);
        formData.append('convertedType', uploadedFileInfo.convertedType);
        formData.append('originalType', uploadedFileInfo.originalType);
        formData.append('fileName', uploadedFileInfo.name);
      } 
      // If we have an uploaded file URI, use that (keeping for future use)
      else if (selectedFile) {
        console.log("Sending direct file:", selectedFile.name);
        formData.append('file', selectedFile);
      }

      console.log("Form data keys being sent:", Array.from(formData.keys()));

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json(); // Assuming error response is JSON
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // --- Handle Streaming Response --- 
      if (!response.body) {
        throw new Error("Response body is missing");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedResponse = '';
      let currentWebSearchQueries: string[] | undefined = undefined;
      let currentRenderedContent: string | undefined = undefined;
      let currentSourceCitations: string[] | undefined = undefined;
      const buffer = '' // Buffer for incomplete JSON strings

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const rawJsonStrings = decoder.decode(value, { stream: true });
          // Split by newline in case multiple JSON objects are received in one chunk
          const jsonObjectsAsString = rawJsonStrings.split('\n').filter(s => s.trim() !== '');

          for (const jsonObjStr of jsonObjectsAsString) {
            try {
              const payload = JSON.parse(jsonObjStr);

              if (payload.text) {
                // Handle initial text content that might be oddly formatted
                if (accumulatedResponse === '' && payload.text.trim() !== '') {
                  // For first chunk, ensure we don't have leading whitespace issues
                  const cleanedText = payload.text.trimStart();
                  accumulatedResponse = cleanedText;
                } else {
                  accumulatedResponse += payload.text;
                }
              }
              
              if (payload.webSearchQueries) {
                currentWebSearchQueries = payload.webSearchQueries;
              }
              if (payload.renderedContent) {
                currentRenderedContent = payload.renderedContent;
              }
              if (payload.sourceCitations) {
                currentSourceCitations = payload.sourceCitations;
              }

              // Update the content of the placeholder AI message
              setMessages((prevMessages) => {
                const updatedMessages = [...prevMessages];
                if(updatedMessages[aiMessageIndex]) {
                    updatedMessages[aiMessageIndex] = {
                        ...updatedMessages[aiMessageIndex],
                        content: accumulatedResponse,
                        webSearchQueries: currentWebSearchQueries || updatedMessages[aiMessageIndex].webSearchQueries,
                        renderedContent: currentRenderedContent || updatedMessages[aiMessageIndex].renderedContent,
                        sourceCitations: currentSourceCitations || updatedMessages[aiMessageIndex].sourceCitations,
                    };
                }
                return updatedMessages;
              });
            } catch (parseError) {
              console.error("Error parsing JSON chunk from stream:", parseError, "Chunk:", jsonObjStr);
              // Handle partial JSON if necessary, or buffer it.
              // For simplicity here, we log and skip. A robust solution might buffer incomplete lines.
            }
          }
        }
      }
      // --- End Streaming Handling ---

      // This section for image handling might need adjustment if image data comes differently now
      if (accumulatedResponse.startsWith("data:image") || accumulatedResponse.includes("<img src=")) { // crude check
           setMessages(prevMessages => prevMessages.map((msg, i) => {
              if (i === aiMessageIndex) {
                  let imageUrl = accumulatedResponse;
                  if (accumulatedResponse.includes("<img src=")) { // very basic parsing
                      const match = accumulatedResponse.match(/<img src="([^"]*)"/);
                      if (match && match[1]) imageUrl = match[1];
                      else imageUrl = ""; // Could not parse, clear it or show error
                  }
                  // Use the message from prevMessages at aiMessageIndex as the base
                  const baseAiMessage = prevMessages[aiMessageIndex]; 
                  return { 
                    ...baseAiMessage, 
                    content: imageUrl ? "" : "Image response (see image).", 
                    imageUrl: imageUrl 
                  };
              }
              return msg;
          }));
      }

    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Fetch error:", err.message);
            setError(`Failed to get response: ${err.message}`);
        } else {
            console.error("An unknown error occurred:", err);
            setError('An unknown error occurred. Please try again.');
        }
        // Remove the AI placeholder message if an error occurred during streaming
        setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      setUploadedFileInfo(null); // Clear file URI after submission
      // Clear audioUrl from state AFTER it's been saved to the message
      setAudioUrl(null); 
    }
  };

  // Define model capabilities
  const modelCapabilities: Record<string, { hasAttachment?: boolean; hasMic?: boolean }> = {
    'gemini-2.0-flash': { hasAttachment: true, hasMic: true },
    'meta-llama/Llama-Vision-Free': { hasAttachment: true, hasMic: false },
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': { hasAttachment: false, hasMic: false },
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free': { hasAttachment: false, hasMic: false },
    'sonar': { hasAttachment: false, hasMic: false },
    'sonar-pro': { hasAttachment: false, hasMic: false },
  };

  // Modify the dropdown click handler to prevent error display
  const handleModelDropdownToggle = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default behavior
    e.stopPropagation(); // Stop event propagation
    setIsModelDropdownOpen(!isModelDropdownOpen);
    // Clear any error that might be showing
    setError(null);
  };

  return (
    // Outermost div for full-width background - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING
    <div className="w-full bg-gray-50 fixed inset-0 flex flex-col">
      {/* Inner wrapper to constrain and center content - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING */}
      <div className="max-w-3xl mx-auto flex flex-col h-full w-full">
        {/* Header - Solid Background, No Border - REMAINS flex-shrink: 0 implicitly */}
        <header 
          className="bg-gray-50 pt-3 pb-3 sm:pt-4 sm:pb-4 text-center z-10 flex-shrink-0"
        >
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">SageMind</h1>
        </header>

        {/* Main content - Relative positioning for overlay - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING */}
        <main 
          className="relative flex-grow overflow-y-auto min-h-0 chat-container"
          style={{ overflowX: 'hidden', overscrollBehaviorY: 'contain' }} // Added overscroll-behavior-y
          onMouseMove={handleMouseMove}
        >
           {/* Fade Overlay */}
           <div 
             className="sticky top-0 left-0 right-0 h-16 bg-gradient-to-b from-gray-50 to-transparent pointer-events-none z-5"
             // Increased height (e.g., h-16)
           ></div>
           
           {/* Inner container for messages with padding */}
           <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`px-3 py-2 sm:px-4 sm:py-2 ${
                    msg.role === 'user'
                      ? 'max-w-[80%] bg-gray-200 text-gray-800'
                      : 'w-full bg-transparent text-gray-800'
                  }`}
                  style={msg.role === 'user' ? {
                    borderTopLeftRadius: '24px',
                    borderTopRightRadius: '24px',
                    borderBottomLeftRadius: '24px',
                    borderBottomRightRadius: '8px'
                  } : {}}
                >
                  {msg.role === 'ai' ? (
                    <>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                        components={{
                          table: ({node, ...props}) => (
                            <div className="my-6 overflow-x-auto rounded-lg border border-gray-300">
                              <table className="min-w-full" {...props} />
                            </div>
                          ),
                          thead: ({node, ...props}) => (
                            <thead className="bg-gray-100" {...props} />
                          ),
                          th: ({node, ...props}) => (
                            <th
                              className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-r last:border-r-0 border-gray-200"
                              {...props}
                            />
                          ),
                          tbody: ({node, ...props}) => (
                            <tbody className="" {...props} />
                          ),
                          tr: ({node, ...props}) => (
                            <tr className="hover:bg-gray-100 transition-colors" {...props} />
                          ),
                          td: ({node, ...props}) => (
                            <td className="px-4 py-3 text-sm text-gray-700 border-b border-r last:border-r-0 border-gray-200" {...props} />
                          ),
                          // Custom text component to handle the citation links directly in markdown
                          text: ({children}) => {
                            if (typeof children === 'string' && msg.sourceCitations?.length) {
                              return <>{processCitationMarkers(children, msg.sourceCitations)}</>;
                            }
                            return <>{children}</>;
                          },
                          code: ({ inline, className, children, ...props }: React.ComponentProps<'code'> & { inline?: boolean }) => { 
                            const match = /language-(\w+)/.exec(className || '');
                            const highlightLanguage = match?.[1] || '';
                            
                            if (inline) {
                              return (
                                <code 
                                  className="px-1 py-0.5 bg-gray-100 text-pink-600 rounded text-sm font-mono overflow-wrap-break-word"
                                  data-language={highlightLanguage}
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <code 
                                className={`${className} overflow-wrap-break-word`}
                                data-language={highlightLanguage}
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                          pre: ({ children, ...props }: React.ComponentProps<'pre'>) => {
                            let language: string = '';
                            if (children && typeof children === 'object' && 'props' in children) {
                              const childProps = (children as React.ReactElement).props as { className?: string };
                              const match = /language-(\w+)/.exec(childProps?.className || '');
                              language = match?.[1] || '';
                            }
                            const preClassName = language === 'sql'
                                ? "rounded-md bg-gray-900 my-4 p-4 font-mono text-sm text-gray-100"
                                : "rounded-md bg-gray-50 my-4 p-4 font-mono text-sm text-gray-800";
                            return <pre className={`${preClassName} whitespace-pre-wrap word-break-all overflow-x-hidden`} {...props}>{children}</pre>;
                          },
                          blockquote: ({node, ...props}) => (
                            <blockquote className="pl-4 border-l-4 border-blue-400 italic text-gray-600 my-4 overflow-wrap-break-word" {...props} />
                          ),
                          li: ({node, ...props}) => <li className="ml-6 my-2 list-disc overflow-wrap-break-word" {...props} />,
                          hr: ({node, ...props}) => <hr className="my-6 border-t border-gray-300" {...props} />,
                          a: ({node, ...props}) => (
                            <a 
                              className="text-blue-600 hover:text-blue-800 hover:underline overflow-wrap-break-word"
                              target="_blank" 
                              rel="noopener noreferrer" 
                              {...props}
                            />
                          ),
                          img: ({node, ...props}) => (
                            <img 
                              className="max-w-full h-auto rounded-lg my-4 shadow-sm" 
                              alt={props.alt || 'Image loaded from markdown'} 
                              {...props} 
                            />
                          ),
                          p: ({node, ...props}) => <p className="my-3 overflow-wrap-break-word" {...props} />,
                          h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4 overflow-wrap-break-word" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-5 mb-3 overflow-wrap-break-word" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-bold mt-4 mb-2 overflow-wrap-break-word" {...props} />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>

                      {msg.renderedContent && (
                        <div className="mt-3 search-suggestions-container" dangerouslySetInnerHTML={{ __html: msg.renderedContent }} />
                      )}

                      {!msg.renderedContent && msg.webSearchQueries && msg.webSearchQueries.length > 0 && (
                        <div className="mt-3 search-suggestions-container">
                          <p className="text-sm font-semibold text-gray-600 mb-1">Search Suggestions:</p>
                          <div className="flex flex-wrap gap-2" role="list">
                            {msg.webSearchQueries.map((query, i) => (
                              <a
                                key={i}
                                href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="search-chip"
                              >
                                <img src="https://www.google.com/favicon.ico" alt="Google" />
                                {query}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {msg.imageUrl && (
                        <div className="mt-2">
                          <img
                            src={msg.imageUrl}
                            alt="Generated by AI"
                            className="max-w-md h-auto rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => msg.imageUrl && handleOpenImageOverlay(msg.imageUrl)}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col">
                      {msg.imageBase64Preview && msg.fileType?.startsWith('image/') && (
                        <div className="ml-auto">
                          <img
                            src={`data:${msg.fileType};base64,${msg.imageBase64Preview}`}
                            alt={msg.fileName || 'User image preview'}
                            className="mt-1 mb-1 max-h-20 w-auto rounded-md cursor-pointer hover:opacity-80 shadow-sm"
                            onClick={() => msg.imageBase64Preview && msg.fileType && handleOpenImageOverlay(`data:${msg.fileType};base64,${msg.imageBase64Preview}`)}
                          />
                        </div>
                      )}

                      {msg.content && msg.content.trim() && (
                        <div className="w-full">{msg.content}</div>
                      )}

                      {!msg.imageBase64Preview &&
                       msg.fileName &&
                       !msg.fileType?.startsWith('audio/') &&
                       !msg.fileType?.startsWith('image/') &&
                       msg.content !== `(File: ${msg.fileName})` && (
                         <div className="mt-1 text-sm opacity-70 w-full">
                           (File: {msg.fileName})
                         </div>
                      )}

                      {msg.audioUrl && msg.fileType?.startsWith('audio/') && (
                        <div className="mt-2 w-full">
                          <audio
                            src={msg.audioUrl}
                            controls
                            className="max-w-full max-h-8"
                            preload="metadata"
                          />
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs opacity-70">
                              {msg.fileName || "Audio recording"}
                            </span>
                          </div>
                        </div>
                      )}

                      {msg.renderedContent && (
                        <div className="mt-3 search-suggestions-container" dangerouslySetInnerHTML={{ __html: msg.renderedContent }} />
                      )}
                      
                      {!msg.renderedContent && msg.webSearchQueries && msg.webSearchQueries.length > 0 && (
                        <div className="mt-3 search-suggestions-container">
                          <p className="text-sm font-semibold text-gray-600 mb-1">Search Suggestions:</p>
                          <div className="flex flex-wrap gap-2" role="list">
                            {msg.webSearchQueries.map((query, i) => (
                              <a
                                key={i}
                                href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="search-chip"
                              >
                                <img src="https://www.google.com/favicon.ico" alt="Google" />
                                {query}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
           </div>
      </main>

      {error && (
          <div className="p-4 text-center text-red-600 bg-red-100 border-t border-red-200">
              Error: {error}
          </div>
      )}

        {/* Footer - Transparent Background - REMAINS flex-shrink: 0 */}
        <footer className="p-3 bg-transparent flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-0"> 
            {/* Main Input Container with very large border-radius for squircle-like appearance */}
            <div 
              className={`
                p-3 
                flex flex-col gap-2 
                bg-gray-100 
                shadow-sm 
                ${isDraggingOver 
                  ? 'border-2 border-dashed border-blue-500 ring-2 ring-blue-300' 
                  : 'border border-gray-200'
                }
              `}
              style={{ 
                borderRadius: '32px',
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Conditionally Render Preview Inside Main Container */}
              {(audioUrl || (uploadedFileInfo && uploadedFileInfo.base64 && uploadedFileInfo.originalType.startsWith('image/'))) && (
                <div className="mb-2 pb-2 border-b border-gray-200 flex items-center justify-between">
                  {/* Display audio preview */} 
                  {audioUrl && (
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                      <audio 
                        src={audioUrl!} 
                        controls 
                        className="max-h-8 w-full rounded-full border border-gray-300 p-0.5 bg-transparent"
                      />
                      <button 
                        type="button" 
                        onClick={clearRecording} 
                        className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 flex-shrink-0"
                        aria-label="Clear recording"
                        title="Clear recording"
                      >
                        <X className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                  {/* Display image preview */}
                  {uploadedFileInfo && uploadedFileInfo.base64 && uploadedFileInfo.originalType.startsWith('image/') && (
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                      <div className="relative h-10 w-10 flex-shrink-0">
                        {/* Use next/image Image component */}
                        <Image 
                          src={`data:${uploadedFileInfo.originalType};base64,${uploadedFileInfo.base64}`}
                          alt="Preview" 
                          layout="fill"
                          objectFit="contain"
                          className="rounded border border-gray-300"
                        />
                      </div>
                      <span className="text-sm text-gray-700 truncate flex-grow min-w-0" title={uploadedFileInfo.name}>
                        {uploadedFileInfo.name}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setUploadedFileInfo(null)} 
                        className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 flex-shrink-0"
                        aria-label="Clear image"
                        title="Clear image"
                      >
                        <X className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Text Input (Textarea) Row */}
              <div className="flex items-start gap-2">
                {/* Textarea */} 
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Message SageMind..."
                  disabled={isLoading}
                  className="flex-grow bg-transparent focus:outline-none text-gray-900 text-base placeholder-gray-500 resize-none overflow-y-auto pr-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (e.currentTarget.form) {
                        e.currentTarget.form.requestSubmit();
                      }
                    }
                  }}
                  onPaste={handlePaste}
                />
              </div>

              {/* Bottom Bar: Dropdown & Buttons */}
              <div className="flex justify-between items-center pt-2">
                {/* Custom Model Dropdown with squircle styling */}
                <div className="relative" ref={modelDropdownRef}>
                  <button
                    onClick={handleModelDropdownToggle}
                    disabled={isLoading}
                    className="flex items-center justify-between bg-gray-200 border border-gray-300 text-gray-700 text-xs hover:bg-gray-300 transition-colors cursor-pointer py-1.5 pl-2 pr-1.5"
                    style={{ borderRadius: '12px', width: '140px' }}
                    title="Select AI Model"
                  >
                    <span className="truncate">{currentModelLabel}</span>
                    <svg className={`ml-1 h-3 w-3 text-gray-500 transform transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {/* Dropdown Menu - Modified to open upward */}
                  {isModelDropdownOpen && (
                    <div 
                      className="absolute left-0 bottom-full mb-1 w-full bg-gray-100 border border-gray-300 shadow-sm z-20 overflow-hidden"
                      style={{ borderRadius: '12px' }}
                    >
                      <div className="max-h-56 overflow-y-auto py-1">
                        {modelOptions.map((option) => (
                          <button
                            key={option.value}
                            className={`w-full text-left px-3 py-2 text-xs text-gray-700 focus:outline-none hover:bg-gray-200 transition-colors ${selectedModel === option.value ? 'bg-gray-200 font-medium' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedModel(option.value);
                              setIsModelDropdownOpen(false);
                              setError(null);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Right Side Buttons */}
                <div className="flex items-center gap-2">
                   {/* Attachments Button with squircle styling */}
                  <button
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isLoading || !modelCapabilities[selectedModel]?.hasAttachment}
                    className={`p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 flex items-center justify-center bg-gray-100 ${(!modelCapabilities[selectedModel]?.hasAttachment && !isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ borderRadius: '14px' }} // Squircle-like for button
                    aria-label="Attach file"
                    title={modelCapabilities[selectedModel]?.hasAttachment ? "Attach image or audio file" : "File attachment not supported for this model"}
                  >
                    <Paperclip className="w-5 h-5" strokeWidth={2} />
                  </button>
                  {/* Hidden file input - must exist for ref to work */}
                  <input
                    type="file"
                    ref={fileInputRef} 
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,audio/*"
                  />

                  {/* Microphone Button with squircle styling */}
                  <button
                    type="button" 
                    onClick={toggleRecording}
                    disabled={isLoading || !modelCapabilities[selectedModel]?.hasMic}
                    className={`p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 flex items-center justify-center ${isRecording ? 'text-red-600 bg-red-100' : 'bg-gray-100'} ${(!modelCapabilities[selectedModel]?.hasMic && !isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ borderRadius: '14px' }} // Squircle-like for button
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    title={modelCapabilities[selectedModel]?.hasMic ? (isRecording ? "Stop recording" : "Record audio") : "Microphone not supported for this model"}
                  >
                    {isRecording ? 
                      <Square className="w-5 h-5" strokeWidth={2} /> : 
                      <Mic className="w-5 h-5" strokeWidth={2} />
                    }
                  </button>
                  
                  {/* Send Button with squircle styling */}
                  <button
                    type="submit" 
                    disabled={isLoading || (!inputValue.trim() && !selectedFile && !uploadedFileInfo && !audioUrl)}
                    className="p-2 bg-transparent text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center aspect-square"
                    style={{ borderRadius: '16px', backgroundColor: 'rgba(0,0,0,0.9)' }} // Made semi-transparent
                    title="Send message"
                  >
                    <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Footer Text (Outside Main Container) */}
          <div className="text-center text-xs text-gray-500 mt-2">
            Experiment by <a href="https://x.com/siddhantpetkar" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700">@sidpetkar</a>
          </div>
        </footer>
      </div>

      {/* Add custom scrollbar styles */}
      <style jsx global>{`
        /* Ensure html and body take full height and prevent scroll for native-like feel */
        html,
        body,
        body > div:first-child,
        div#__next,
        div#__next > div {
          height: 100%;
          /* For mobile, dvh unit is better if supported widely, fallback to vh */
          /* height: 100dvh; */ 
          overflow: hidden; /* Prevent body scroll */
        }

        /* Apply word wrapping globally within chat messages if needed */
        .chat-container .flex > div > div { /* Targets the inner message content containers */
          overflow-wrap: break-word;
          word-break: break-word; /* More aggressive breaking if needed */
        }

        /* Search chip specific styling - LIGHT GREY FILL & BORDER */
        .search-chip {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid #e5e7eb !important; /* gray-200, light grey border */
          border-radius: 9999px !important; /* fully rounded */
          padding: 0.25rem 0.5rem !important; /* Reduced padding */
          font-size: 11px !important; /* Smaller font size */
          color: #374151 !important; /* gray-700 text */
          background-color: #f3f4f6 !important; /* gray-100, light grey fill */
          text-decoration: none !important;
          margin-right: 0.5rem !important;
          margin-bottom: 0.5rem !important;
          transition: all 0.2s !important;
          box-shadow: none !important; /* No shadow */
          position: relative !important;
          height: auto !important; /* Auto height based on content */
          vertical-align: middle !important;
        }
        
        /* Hover state for search chips - LIGHT GREY FILL & BORDER */
        .search-chip:hover {
          background-color: #e5e7eb !important; /* gray-200, slightly darker fill on hover */
          border-color: #d1d5db !important; /* gray-300 border on hover */
          color: #1f2937 !important; /* gray-800 text on hover */
        }
        
        /* Stronger selector for Google search links - LIGHT GREY FILL & BORDER */
        .chat-container div a[href*="google.com/search"].search-chip,
        .chat-container a[href*="google.com/search"].search-chip,
        a[href*="google.com/search"].search-chip { 
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid #e5e7eb !important; /* gray-200, light grey border */
          border-radius: 9999px !important; /* fully rounded */
          padding: 0.25rem 0.5rem !important; /* Reduced padding */
          font-size: 11px !important; /* Smaller font size */
          color: #374151 !important; /* gray-700 text */
          background-color: #f3f4f6 !important; /* gray-100, light grey fill */
          text-decoration: none !important;
          margin-right: 0.5rem !important;
          margin-bottom: 0.5rem !important;
          transition: all 0.2s !important;
          box-shadow: none !important; /* No shadow */
          position: relative !important;
          height: auto !important; /* Auto height based on content */
          vertical-align: middle !important;
        }

        a[href*="google.com/search"].search-chip:hover { 
            background-color: #e5e7eb !important; /* gray-200, slightly darker fill on hover */
            border-color: #d1d5db !important; /* gray-300 border on hover */
            color: #1f2937 !important; /* gray-800 text on hover */
        }
        
        /* Carousel container - ensure transparency and no border */
        .chat-container div.carousel,
        div.carousel {
          display: flex !important;
          align-items: center !important; 
          min-height: auto !important; /* Allow height to adjust to content */
          background: transparent !important;
          border: none !important; 
          box-shadow: none !important;
          margin: 0 !important;
          padding: 4px 0 !important; /* Reduced padding from 8px */
          overflow: visible !important;
        }
        
        /* Main suggestions container and Perplexity wrapper - TRANSPARENT, NO BORDER */
        .search-suggestions-container,
        .search-suggestions-container > div, /* Targets direct div children, e.g., perplexity wrapper */
        div[class*="search-suggestions"],
        div[class*="mt-3"] {
          background-color: transparent !important;
          border: none !important; 
          box-shadow: none !important;
          /* flex-direction & margin-top are fine from before */
        }
        
        /* Force transparency and light theme on Perplexity rendered content more aggressively */
        .search-suggestions-container div[dangerouslySetInnerHTML] > div,
        .search-suggestions-container div[class*="pplx"],
        .search-suggestions-container div[style*="background"],
        .search-suggestions-container div[class*="bg-"] /* Target any div with a bg- class from perplexity */ {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
        }

        .search-suggestions-container div[dangerouslySetInnerHTML] *,
        .search-suggestions-container div[class*="pplx"] * {
            color: #374151 !important; /* Default text to gray-700 for perplexity content */
            background-color: transparent !important; 
        }

        .search-suggestions-container div[dangerouslySetInnerHTML] a,
        .search-suggestions-container div[class*="pplx"] a {
            color: #2563eb !important; /* Blue-600 for links in perplexity content */
            text-decoration: underline !important; /* Add underline to perplexity links for clarity */
        }

        /* Remove the dark gradient at left of search chips (should still be effective) */
        div[class*="carousel"]::before,
        .carousel::before,
        div[class*="search-suggestion"]::before,
        .search-suggestions-container::before,
        .carousel div.gradient, 
        .search-suggestions-container div.gradient {
          display: none !important;
          /* ... other hiding properties ... */
        }
        
        /* Google logo styling within search chips - consistent with Image 1 */
        .search-chip img[src*="google"] { 
          width: 16px !important; /* Slightly smaller to match smaller chip height */
          height: 16px !important;
          border-radius: 50% !important;
          background-color: #ffffff !important; 
          /* padding: 1px !important; */ /* Remove padding if logo is small */
          margin-right: 5px !important; /* Adjust margin */
          box-shadow: none !important; 
          display: inline-block !important;
          vertical-align: middle !important;
        }
        
        /* Flex container for search chips for alignment */
        .search-suggestions-container > div.flex.flex-wrap,
        div.flex.flex-wrap[role="list"] {
          /* display, flex-wrap, align-items, justify-content, gap, background, width, padding are fine */
           min-height: auto !important; /* Let this container also adjust height */
        }
        
        /* Overall search result containers - ensure transparency and no border */
        .chat-container div[class*="search"],
        div[class*="search"],
        div[class*="suggestion"],
        .search-suggestions-container {
          background-color: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        /* Ensure this specific rule for search-chip a applies correctly */
        .search-suggestions-container a.search-chip {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid #e5e7eb !important; /* gray-200, light grey border */
          border-radius: 9999px !important; /* fully rounded */
          padding: 0.25rem 0.5rem !important; /* Reduced padding */
          font-size: 11px !important; /* Smaller font size */
          color: #374151 !important; /* gray-700 text */
          background-color: #f3f4f6 !important; /* gray-100, light grey fill */
          text-decoration: none !important;
          margin-right: 0.5rem !important;
          margin-bottom: 0.5rem !important;
          transition: all 0.2s !important;
          box-shadow: none !important; /* No shadow */
          position: relative !important;
          height: auto !important; /* Auto height based on content */
          vertical-align: middle !important;
        }
        
        /* Modern scrollbar styles */
        .chat-container {
          scrollbar-width: thin; /* Firefox */
          scrollbar-color: rgba(0,0,0,0) transparent; /* Firefox - hidden by default */
        }
        
        /* Make scrollbar visible in Firefox when needed */
        .chat-container.scrollbar-visible {
          scrollbar-color: rgba(0,0,0,0.3) transparent !important; /* Slightly more visible */
        }
        
        /* Base scrollbar styling (Chrome, Edge, Safari) */
        .chat-container::-webkit-scrollbar {
          width: 6px;
          background-color: transparent;
        }
        
        /* Completely remove scrollbar buttons/arrows */
        .chat-container::-webkit-scrollbar-button {
          display: none !important;
          height: 0 !important;
          width: 0 !important;
          background-color: transparent !important;
        }
        
        /* Hide scrollbar corner */
        .chat-container::-webkit-scrollbar-corner {
          display: none !important;
          height: 0 !important;
          width: 0 !important;
          background-color: transparent !important;
        }
        
        /* Scrollbar thumb styling (Chrome, Edge, Safari) - using opacity and visibility */
        .chat-container::-webkit-scrollbar-thumb {
          background-color: rgba(0,0,0,0.3) !important; /* Base color, slightly more visible */
          border-radius: 3px !important;
          opacity: 0 !important; /* Hidden by default */
          visibility: hidden !important; /* Hidden by default */
          transition: opacity 1.5s ease-in-out, visibility 1.5s ease-in-out !important; /* Slow fade-out */
        }
        
        /* Show scrollbar when class is applied */
        .chat-container.scrollbar-visible::-webkit-scrollbar-thumb {
          opacity: 1 !important; /* Visible */
          visibility: visible !important; /* Visible */
          transition: opacity 0.5s ease-in-out, visibility 0.5s ease-in-out !important; /* Faster fade-in */
        }
        
        /* Scrollbar track */
        .chat-container::-webkit-scrollbar-track {
          background-color: transparent !important;
        }
        
        /* Scrollbar track piece */
        .chat-container::-webkit-scrollbar-track-piece {
          background-color: transparent !important;
        }
        
        /* Scrollbar thumb hover */
        .chat-container.scrollbar-visible::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0,0,0,0.5) !important; /* Darker on hover */
        }
        
      `}</style>

      {/* Image Overlay Modal */}
      {isImageOverlayOpen && overlayImageUrl && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={handleCloseImageOverlay} // Close on clicking background
        >
          <div
            className="relative bg-transparent max-w-[90vw] max-h-[90vh] overflow-auto cursor-default"
            onClick={(e) => e.stopPropagation()} // Prevent click on image/modal from closing it
          >
            <button
              onClick={handleCloseImageOverlay}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 bg-white bg-opacity-70 hover:bg-opacity-100 rounded-full p-1.5 z-10 leading-none"
              aria-label="Close image overlay"
              title="Close image"
            >
              <X className="w-5 h-5 sm:w-6 sm:w-6" />
            </button>
            <img src={overlayImageUrl} alt="Full size preview" className="block max-w-full max-h-[85vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

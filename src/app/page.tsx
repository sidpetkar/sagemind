'use client';

import { useState, FormEvent, useRef, ChangeEvent, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// Import next/image
import Image from 'next/image'; 
// Import Lucide React icons
import { Paperclip, Mic, Square, X, Send } from 'lucide-react';
// Import markdown extensions
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // Import a syntax highlighting theme

interface Message {
  role: 'user' | 'ai';
  content: string;
  audioUrl?: string; // Optional URL for audio playback
  fileType?: string; // Optional file type info
  fileName?: string; // Optional file name
}

export default function ChatPage() {
  const [inputValue, setInputValue] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Ref for textarea
  const [textareaRows, setTextareaRows] = useState(1); // State for dynamic rows

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

  // Effect to adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      // Reset rows to 1 to calculate scrollHeight correctly
      textareaRef.current.rows = 1;
      const scrollHeight = textareaRef.current.scrollHeight;
      const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight);
      const newRows = Math.min(4, Math.max(1, Math.ceil(scrollHeight / lineHeight)));
      setTextareaRows(newRows);
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Ensure there is either text input or a file selected
    if (!inputValue.trim() && !selectedFile && !uploadedFileInfo && !audioUrl) return;

    setIsLoading(true);
    setError(null);

    const historyToSend = messages;
    const currentMessage = inputValue;

    // Display file info in user message only for non-audio files
    let userMessageContent = currentMessage;
    if (uploadedFileInfo) {
      const isAudio = uploadedFileInfo.originalType.startsWith('audio/');
      // Don't include filename in message content for audio files
      if (!isAudio) {
        userMessageContent = `${currentMessage} (File: ${uploadedFileInfo.name})`;
      }
      console.log("Using preprocessed file:", uploadedFileInfo);
    } else if (selectedFile) {
      const isAudio = selectedFile.type.startsWith('audio/');
      // Don't include filename in message content for audio files
      if (!isAudio) {
        userMessageContent = `${currentMessage} (File: ${selectedFile.name})`;
      }
      console.log("Using direct file:", selectedFile.name);
    }
    
    // Create user message with audio data if available
    const userMessage: Message = { 
      role: 'user', 
      content: userMessageContent,
      // Save audio URL if we have one
      audioUrl: audioUrl || undefined,
      // Save file type info if available
      fileType: selectedFile?.type || uploadedFileInfo?.originalType,
      fileName: selectedFile?.name || uploadedFileInfo?.name
    };
    
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputValue('');
    setTextareaRows(1);
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
      formData.append('message', currentMessage || " ");
      formData.append('history', JSON.stringify(historyToSend));
      
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

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          accumulatedResponse += chunk;
          // Update the content of the placeholder AI message
          setMessages((prevMessages) => {
            const updatedMessages = [...prevMessages];
            // Ensure the index is valid before attempting update
            if(updatedMessages[aiMessageIndex]) {
                 updatedMessages[aiMessageIndex] = {
                    ...updatedMessages[aiMessageIndex],
                    content: accumulatedResponse,
                 };
            }
            return updatedMessages;
          });
        }
      }
      // --- End Streaming Handling ---

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

  return (
    // Outermost div for full-width background
    <div className="w-full min-h-screen bg-gray-50">
      {/* Inner wrapper to constrain and center content */}
      <div className="max-w-3xl mx-auto flex flex-col h-screen">
        {/* Header - Solid Background, No Border */}
        <header 
          className="bg-gray-50 pt-3 pb-3 sm:pt-4 sm:pb-4 text-center z-10"
          // Header background needs to match chat area bg again
        >
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">SageMind</h1>
      </header>

        {/* Main content - Relative positioning for overlay */}
        <main className="relative flex-grow overflow-y-auto min-h-0">
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
                      className={`max-w-[80%] sm:max-w-xs lg:max-w-md px-3 py-2 sm:px-4 sm:py-2 rounded-lg shadow ${msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-800'}`
              }
            >
              {msg.role === 'ai' ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                          components={{
                            // Modern table styling
                            table: ({node, ...props}) => (
                              <div className="my-6 overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                                <table className="min-w-full divide-y divide-gray-200 bg-white" {...props} />
                              </div>
                            ),
                            thead: ({node, ...props}) => (
                              <thead className="bg-gray-100" {...props} />
                            ),
                            th: ({node, ...props}) => (
                              <th 
                                className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-r last:border-r-0" 
                                {...props} 
                              />
                            ),
                            tbody: ({node, ...props}) => (
                              <tbody className="bg-white divide-y divide-gray-200" {...props} />
                            ),
                            tr: ({node, ...props}) => (
                              <tr className="hover:bg-blue-50 transition-colors" {...props} />
                            ),
                            td: ({node, ...props}) => (
                              <td className="px-4 py-3 text-sm text-gray-700 border-r last:border-r-0" {...props} />
                            ),
                            
                            // Updated code highlighting logic
                            code: ({ inline, className, children, ...props }: React.ComponentProps<'code'> & { inline?: boolean }) => { 
                              // Use the match or store it in a variable that's used
                              const match = /language-(\w+)/.exec(className || '');
                              // Use match to determine the language for potential styling
                              const highlightLanguage = match?.[1] || '';
                              
                              if (inline) {
                                // Styling for inline code
                                return (
                                  <code 
                                    className="px-1 py-0.5 bg-gray-100 text-pink-600 rounded text-sm font-mono"
                                    data-language={highlightLanguage} // Using the extracted language
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              }

                              // Assign language class to the <code> element for highlighting
                              return (
                                <code 
                                  className={className}
                                  data-language={highlightLanguage} // Using the extracted language 
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                            
                            // Updated pre component to handle wrapper styling
                            pre: ({ children, ...props }: React.ComponentProps<'pre'>) => { // Remove unused node
                                // Inspect children to determine the language (needed for theme)
                                let language: string = ''; // Initialize with an empty string
                                if (children && typeof children === 'object' && 'props' in children) {
                                    // Ensure children.props exists and has className before accessing it
                                    const childProps = (children as React.ReactElement).props as { className?: string };
                                    const match = /language-(\w+)/.exec(childProps?.className || '');
                                    language = match?.[1] || ''; // Assign empty string if match is null
                                }

                                // Apply theme based on language
                                const preClassName = language === 'sql'
                                    ? "rounded-md bg-gray-900 my-4 p-4 overflow-x-auto font-mono text-sm text-gray-100" // Dark theme for SQL <pre>
                                    : "rounded-md bg-gray-50 my-4 p-4 overflow-x-auto font-mono text-sm text-gray-800"; // Light theme for other <pre>

                                return <pre className={preClassName} {...props}>{children}</pre>;
                            },
                            
                            // Other element styling
                            blockquote: ({node, ...props}) => ( // Keep node
                              <blockquote className="pl-4 border-l-4 border-blue-400 italic text-gray-600 my-4" {...props} />
                            ),
                            li: ({node, ...props}) => <li className="ml-6 my-2 list-disc" {...props} />, // Remove unused node
                            hr: ({node, ...props}) => <hr className="my-6 border-t border-gray-300" {...props} />, // Remove unused node
                            a: ({node, ...props}) => ( // Remove unused node
                              <a 
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                target="_blank" 
                                rel="noopener noreferrer" 
                                {...props}
                              />
                            ),
                            img: ({node, ...props}) => ( // Remove unused node
                              <img 
                                className="max-w-full h-auto rounded-lg my-4 shadow-sm" 
                                alt={props.alt || 'Image loaded from markdown'} 
                                {...props} 
                              />
                            ),
                            p: ({node, ...props}) => <p className="my-3" {...props} />, // Remove unused node
                            h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />, // Remove unused node
                            h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />, // Remove unused node
                            h3: ({node, ...props}) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />, // Remove unused node
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                   ) : (
                        <>
                          <div>{msg.content}</div>
                          {/* Add audio player if message has audioUrl */}
                          {msg.audioUrl && msg.fileType?.startsWith('audio/') && (
                            <div className="mt-2">
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
                        </>
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

        {/* Footer - Transparent Background */}
        <footer className="p-3 bg-transparent">
          <form onSubmit={handleSubmit} className="flex flex-col gap-0"> {/* Use gap-0 on form if needed */}
            {/* Conditionally Render Preview Directly Above Input Container */}
            {(audioUrl || (uploadedFileInfo?.base64 && uploadedFileInfo.originalType.startsWith('image/'))) && (
              <div className="p-2 bg-gray-100 rounded-t-xl border border-gray-200 border-b-0 shadow-sm flex items-center justify-between">
                {/* Display audio preview */} 
                {audioUrl && (
                  <div className="flex items-center gap-2 flex-grow min-w-0">
                    <audio 
                      src={audioUrl} 
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
                {uploadedFileInfo?.base64 && uploadedFileInfo.originalType.startsWith('image/') && (
                  <div className="flex items-center gap-2 flex-grow min-w-0">
                    <div className="relative h-10 w-10 flex-shrink-0">
                      {/* Use next/image Image component */}
                      <Image 
                        src={`data:${uploadedFileInfo.originalType};base64,${uploadedFileInfo.base64}`}
                        alt="Preview" 
                        // Option 1: Use layout="fill" and objectFit="contain"
                        layout="fill"
                        objectFit="contain"
                        className="rounded border border-gray-300"
                        // Option 2: Provide fixed width/height (might require adjusting container)
                        // width={40} 
                        // height={40}
                        // className="rounded border border-gray-300 object-contain"
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

            {/* Main Input Container - Conditional Rounding */}
            <div 
              className={`
                bg-gray-100 p-3 flex flex-col gap-2 shadow-sm border border-gray-200
                ${(audioUrl || (uploadedFileInfo?.base64 && uploadedFileInfo.originalType.startsWith('image/'))) 
                  ? 'rounded-b-xl border-t-0' 
                  : 'rounded-xl'
                }
              `}
            >
              {/* Text Input (Textarea) Row */}
              <div className="flex items-start gap-2">
                {/* Textarea */} 
                <textarea
                  ref={textareaRef}
                  rows={textareaRows}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Message SageMind..."
                  disabled={isLoading}
                  className="flex-grow bg-transparent focus:outline-none text-gray-900 text-base placeholder-gray-500 resize-none overflow-y-auto pr-2"
                  style={{ maxHeight: 'calc(4 * 1.5rem)' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (e.currentTarget.form) {
                        e.currentTarget.form.requestSubmit();
                      }
                    }
                  }}
                />
                {/* Removed the inline preview div */}
              </div>

              {/* Bottom Bar: Dropdown & Buttons */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                {/* Model Dropdown - Placeholder */}
                <div className="relative">
                  {/* Reverted select styling */}
                  <select 
                    defaultValue="gemini-1.5-flash"
                    className="appearance-none bg-gray-200 border border-gray-300 text-gray-700 text-xs rounded-md focus:ring-blue-500 focus:border-blue-500 block w-full py-1.5 pl-2 pr-7 hover:bg-gray-300 cursor-pointer"
                    disabled={isLoading} 
                    title="Select AI Model"
                  >
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>

                {/* Right Side Buttons */}
                <div className="flex items-center gap-2">
                   {/* Attachments Button - Ensure onClick is correct */}
                  <button
                    type="button" // Important: prevent form submission
                    onClick={() => fileInputRef.current?.click()} // Corrected onClick for file picker
            disabled={isLoading}
                    className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    aria-label="Attach file"
                    title="Attach image or audio file"
                  >
                    <Paperclip className="w-5 h-5" strokeWidth={2} />
                  </button>
                  {/* Hidden file input - must exist for ref to work */}
                  <input
                    type="file"
                    ref={fileInputRef} // Ensure ref is attached
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,audio/*"
                  />

                  {/* Microphone Button */}
                  <button
                    type="button" // Important: prevent form submission
                    onClick={toggleRecording}
                    disabled={isLoading}
                    className={`p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-full flex items-center justify-center ${isRecording ? 'text-red-600 bg-red-100' : ''}`}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    title={isRecording ? "Stop recording" : "Record audio"}
                  >
                    {isRecording ? 
                      <Square className="w-5 h-5" strokeWidth={2} /> : 
                      <Mic className="w-5 h-5" strokeWidth={2} />
                    }
                  </button>
                  
                  {/* Send Button - Ensure type="submit" */}
          <button
                    type="submit" // Corrected type
                    disabled={isLoading || (!inputValue.trim() && !selectedFile && !uploadedFileInfo && !audioUrl)}
                    className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center aspect-square"
                    title="Send message"
                  >
                    <Send className="w-5 h-5" strokeWidth={2.5} />
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
    </div>
  );
}

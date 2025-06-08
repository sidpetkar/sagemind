'use client';

import { useState, FormEvent, useRef, ChangeEvent, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// Import next/image
import Image from 'next/image'; 
// Import Lucide React icons
import { Paperclip, Mic, Square, X, Send, ArrowUp, History, Plus, Trash2, LogIn, LogOut, PlusCircle, MessageCirclePlus, Sun, Moon, Youtube } from 'lucide-react';
// Import markdown extensions
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // Import a syntax highlighting theme

// Import Lottie animation
import Lottie from 'lottie-react';

// Import SuperEllipseImg
import { SuperEllipseImg } from "react-superellipse";

// Firebase imports
import { db, auth } from '../lib/firebase'; // Import the db instance and auth
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot, // For realtime history updates later
  deleteDoc,
  Timestamp, // For type annotation
  where
} from 'firebase/firestore';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';

// Import AuthContext
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext'; // Import useTheme

// Import image storage utilities
import { storeImageToFirebase, getImageFromStorage } from '../lib/imageStorage';

// Import YouTube video type
import { YouTubeVideo } from '../lib/youtube'; // Added import for YouTubeVideo type
import { ChatMessage } from '../lib/llm/interface'; // Added import for ChatMessage type

interface Message {
  role: 'user' | 'ai';
  content: string;
  audioUrl?: string; // Optional URL for audio playback
  fileType?: string; // Optional file type info
  fileName?: string; // Optional file name
  imageBase64Preview?: string; // For image previews in user messages (temporary, not for storage)
  imagePreviewStoragePath?: string; // Storage path for user images
  imageBase64?: string; // For AI-generated base64 images (FLUX) (temporary, not for storage)
  imageMimeType?: string; // Added for AI-generated image MIME type
  imageStoragePath?: string; // Storage path for AI-generated images
  imageUrl?: string; // For AI-generated images or image URLs
  webSearchQueries?: string[]; // For Google Search grounded queries
  renderedContent?: string; // For Google Search rendered suggestions
  sourceCitations?: string[]; // Array of source URLs for citations
  youtubeVideos?: YouTubeVideo[]; // Added for YouTube search results
  isLoading?: boolean; // Added for loading state
  thinking?: string; // Added for thinking text
}

interface ChatThread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Timestamp | null; // Firestore Timestamp
  updatedAt: Timestamp | null; // Firestore Timestamp
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

// New Component for YouTube Video Carousel
const YouTubeCarousel: React.FC<{ videos: YouTubeVideo[] }> = ({ videos }) => {
  if (!videos || videos.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 mb-2 overflow-x-auto">
      <div className="flex space-x-3 p-1 no-scrollbar thin-scrollbar">
        {videos.map((video) => (
          <a
            key={video.id}
            href={`https://www.youtube.com/watch?v=${video.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-[280px] bg-white dark:bg-gray-800 rounded-3xl /* Point 4: Card Roundness */ overflow-hidden no-underline group transition-opacity hover:opacity-90"
          >
            <div className="relative w-full aspect-video"> 
              <Image
                src={video.thumbnailUrl}
                alt={video.title}
                layout="fill"
                objectFit="cover"
                className="rounded-t-3xl /* Point 4: Thumbnail Roundness */"
              />
              {video.duration && (
                <div className="absolute bottom-1.5 right-1.5 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded">
                  {video.duration}
                </div>
              )}
            </div>
            <div className="p-2.5">
              {/* Point 2: Card title - Using conditional class for color control */}
              <h3 
                className="text-sm font-medium liderazgo-ellipsis-2-lines mb-1 transition-colors text-[#161515] dark:text-gray-100" // Use a light gray for dark mode for better aesthetics
                title={video.title}
              >
                {video.title}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate mb-0.5" title={video.channelTitle}>
                {video.channelTitle}
              </p>
              {(video.viewCount || video.publishedAt) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {video.viewCount}{video.viewCount && video.publishedAt ? ' • ' : ''}{video.publishedAt}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
        .thin-scrollbar::-webkit-scrollbar {
          height: 6px; /* Point 3: Sleeker scrollbar */
        }
        .thin-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e0; /* Tailwind gray-400 */
          border-radius: 3px;
        }
        .dark .thin-scrollbar::-webkit-scrollbar-thumb {
          background-color: #4a5568; /* Tailwind gray-600 for dark mode */
        }
        .liderazgo-ellipsis-2-lines {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.4em; 
          max-height: 2.8em; 
        }
      `}</style>
    </div>
  );
};

// Loading Animation Component
const LoadingAnimation: React.FC = () => {
  const [animationData, setAnimationData] = useState<any>(null);
  
  useEffect(() => {
    // Dynamically import the JSON file
    fetch('/three-dot.json')
      .then(response => response.json())
      .then(data => setAnimationData(data))
      .catch(err => console.error('Failed to load animation:', err));
  }, []);
  
  // If the animation data hasn't loaded yet, show a simple fallback
  if (!animationData) {
    return (
      <div className="flex items-center justify-center w-16 h-10">
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-gray-500 dark:bg-gray-300 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-gray-500 dark:bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-gray-500 dark:bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center w-16 h-10">
      <Lottie 
        animationData={animationData} 
        loop={true} 
        autoplay={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default function ChatPage() {
  // Model capabilities definition
  const modelCapabilities: Record<string, { hasAttachment?: boolean; hasMic?: boolean }> = {
    'gemini-2.0-flash': { hasAttachment: true, hasMic: true },
    'gpt-4o-mini': { hasAttachment: true, hasMic: false },
    'meta-llama/Llama-Vision-Free': { hasAttachment: true, hasMic: false },
    'black-forest-labs/FLUX.1-schnell-Free': { hasAttachment: false, hasMic: false },
    'black-forest-labs/flux-kontext-pro': { hasAttachment: true, hasMic: false }, // Added FLUX.1 Kontext capabilities
    'bytedance/bagel': { hasAttachment: true, hasMic: false }, // Added Bagel
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': { hasAttachment: false, hasMic: false },
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free': { hasAttachment: false, hasMic: false },
    'qwen/qwen2.5-vl-72b-instruct:free': { hasAttachment: true, hasMic: false },
    'sonar': { hasAttachment: false, hasMic: false },
    'sonar-pro': { hasAttachment: false, hasMic: false },
  };
  
  // State variables
  const { currentUser, authLoading } = useAuth(); // Use the auth context
  const { theme, toggleTheme } = useTheme(); // Use the theme context

  const [inputValue, setInputValue] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Ref for textarea
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false); // State for drag-over visual cue

  // --- YouTube Mode State ---
  const [isYouTubeModeActive, setIsYouTubeModeActive] = useState<boolean>(false);

  // --- Model Selection State ---
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o-mini'); // Default model changed
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); // Ref for the main chat container
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for the end of messages list

  // --- Image Overlay State ---
  const [isImageOverlayOpen, setIsImageOverlayOpen] = useState<boolean>(false);
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(null);

  // --- Audio Recording State ---
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  // --- File Upload URI State ---
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    name: string;
    originalType: string;
    convertedType: string;
    base64: string;
    size: number;
    url?: string; // Optional URL for image or audio
  } | null>(null);
  // --- End File Upload URI State ---

  // Add state for tracking mouse movement in chat container
  const [isMouseMoving, setIsMouseMoving] = useState<boolean>(false);
  const mouseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const programmaticScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userScrollInactivityTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for user scroll inactivity

  // Function to scroll to the bottom of the chat messages
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // State for managing auto-scroll behavior
  const [isAutoScrollingPaused, setIsAutoScrollingPaused] = useState<boolean>(false);

  // --- Guest Mode State ---
  const [isGuestMode, setIsGuestMode] = useState<boolean>(false);

  // --- UI Interaction State ---
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);

  // --- Chat History State ---
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<ChatThread[]>([]);
  // To prevent saving an empty new chat immediately on load
  const hasLoadedInitialChat = useRef(false); 

  // Helper function to generate a title for a chat
  const generateChatTitle = (currentMessages: Message[]): string => {
    if (!currentMessages || currentMessages.length === 0) {
      return 'New Chat';
    }
    const firstUserMessage = currentMessages.find(msg => msg.role === 'user' && msg.content.trim() !== '');
    if (firstUserMessage) {
      return `${firstUserMessage.content.trim().split(' ').slice(0, 5).join(' ')}...`;
    }
    const firstAIMessage = currentMessages.find(msg => msg.role === 'ai' && msg.content.trim() !== '');
     if (firstAIMessage) {
      return `${firstAIMessage.content.trim().split(' ').slice(0, 5).join(' ')}...`;
    }
    return `Chat started ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Helper function to format Firestore Timestamps for display
  const formatChatTimestamp = (timestamp: Timestamp | null | undefined): string => {
    if (!timestamp || !timestamp.seconds) {
      return 'No date';
    }
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
           ' ' +
           date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const toggleYouTubeMode = () => {
    // Toggle the YouTube mode by setting the opposite of current state
    const newYouTubeMode = !isYouTubeModeActive;
    console.log(`Toggling YouTube mode from ${isYouTubeModeActive} to ${newYouTubeMode}`);
    
    setIsYouTubeModeActive(newYouTubeMode);
    
    // If turning ON YouTube mode, clear any file/audio uploads
    if (newYouTubeMode) {
      setSelectedFile(null);
      setUploadedFileInfo(null);
      setAudioBlob(null);
      setAudioUrl(null);
    }
  };

  // --- Firestore Functions ---

  // Function to ensure a chat ID exists, creating a new chat document if needed.
  // Returns the chat ID, or null if creation fails.
  const getOrCreateCurrentChatId = async (): Promise<string | null> => {
    if (currentChatId) {
      return currentChatId;
    }
    console.log("No currentChatId. Attempting to create new chat document...");
    setIsLoading(true); 
    try {
      const initialTitle = inputValue.trim() ? `${inputValue.trim().split(' ').slice(0, 5).join(' ')}...` : 'New Chat';
      // Build the initial chat data
      const newChatData: any = {
        title: initialTitle, 
        messages: [], 
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      // Add userId if user is logged in
      if (currentUser) {
        console.log("Adding userId to new chat:", currentUser.uid);
        newChatData.userId = currentUser.uid;
      } else {
        console.log("Creating chat in guest mode (no userId)");
      }
      
      const newChatRef = await addDoc(collection(db, 'chatThreads'), newChatData);
      setCurrentChatId(newChatRef.id);
      localStorage.setItem('currentChatId', newChatRef.id);
      console.log("New chat document created with ID:", newChatRef.id, "for user:", currentUser?.uid || 'guest');
      hasLoadedInitialChat.current = true;
      setIsLoading(false);
      return newChatRef.id;
    } catch (err) {
      console.error("Error creating new chat document:", err);
      setError("Failed to initialize chat session. Please try again.");
      setIsLoading(false);
      return null;
    }
  };

  const startNewChat = async () => {
    console.log("Starting new local chat session...");
    // No immediate Firestore write. Chat is created on first save.
    setCurrentChatId(null);
    setMessages([]);
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSelectedFile(null);
    setAudioUrl(null);
    setUploadedFileInfo(null);
    setError(null);
    localStorage.removeItem('currentChatId'); // Clear any existing ID
    hasLoadedInitialChat.current = true; // Ready for interaction
    // setIsLoading(false); // Should not be needed as no async op here now
  };

  const loadChat = async (chatId: string) => {
    console.log("Loading chat:", chatId);
    if (!chatId || chatId === 'null') { // Handle explicit 'null' string from localstorage if it occurs
      console.log("Invalid or null chatId provided to loadChat, starting new local chat.");
      await startNewChat(); // This will set currentChatId to null locally
      return;
    }
    setIsLoading(true);
    try {
      const chatDocRef = doc(db, 'chatThreads', chatId);
      const chatDocSnap = await getDoc(chatDocRef);

      if (chatDocSnap.exists()) {
        const chatData = chatDocSnap.data() as Omit<ChatThread, 'id'>; // Cast to ChatThread excluding id
        
        // Process messages to load images from storage paths when available
        const processedMessages = await Promise.all(chatData.messages?.map(async (msg) => {
          // Create a copy of the message
          const processedMsg = { ...msg };
          
          try {
            // If we have an image storage path for AI-generated images, load it
            if (processedMsg.imageStoragePath) {
              console.log(`Loading AI-generated image from storage: ${processedMsg.imageStoragePath}`);
              const imageUrl = await getImageFromStorage(processedMsg.imageStoragePath);
              // Fetch successful - load the image data
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              
              // Convert blob to base64
              const reader = new FileReader();
              const base64Promise = new Promise<string>((resolve) => {
                reader.onloadend = () => {
                  const base64data = reader.result as string;
                  resolve(base64data);
                };
              });
              reader.readAsDataURL(blob);
              
              // Wait for base64 conversion and set the data
              const base64data = await base64Promise;
              // Extract only the base64 part without the data URL prefix
              const base64String = base64data.split(',')[1];
              
              // Add the image data back to the message
              processedMsg.imageBase64 = base64String;
            }
            
            // If we have an image preview storage path for user uploads, load it
            if (processedMsg.imagePreviewStoragePath) {
              console.log(`Loading user image from storage: ${processedMsg.imagePreviewStoragePath}`);
              const imageUrl = await getImageFromStorage(processedMsg.imagePreviewStoragePath);
              // Fetch successful - load the image data
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              
              // Convert blob to base64
              const reader = new FileReader();
              const base64Promise = new Promise<string>((resolve) => {
                reader.onloadend = () => {
                  const base64data = reader.result as string;
                  resolve(base64data);
                };
              });
              reader.readAsDataURL(blob);
              
              // Wait for base64 conversion and set the data
              const base64data = await base64Promise;
              // Extract only the base64 part without the data URL prefix
              const base64String = base64data.split(',')[1];
              
              // Add the image data back to the message
              processedMsg.imageBase64Preview = base64String;
            }
          } catch (loadError) {
            console.error("Error loading image from storage:", loadError);
            // If loading fails, add a note to the message
            if (processedMsg.imageStoragePath) {
              processedMsg.content += "\n\n[Failed to load AI-generated image. Please try refreshing.]";
            }
            if (processedMsg.imagePreviewStoragePath) {
              processedMsg.content += "\n\n[Failed to load attached image. Please try refreshing.]";
            }
          }
          
          return processedMsg;
        }) || []);
        
        setMessages(processedMessages);
        setCurrentChatId(chatId);
        localStorage.setItem('currentChatId', chatId);
        console.log("Chat loaded:", chatId, "with", processedMessages.length, "messages");
      } else {
        console.warn(`Chat with ID ${chatId} not found. Starting a new chat.`);
        localStorage.removeItem('currentChatId'); // Clear invalid ID
        await startNewChat();
      }
      hasLoadedInitialChat.current = true; 
    } catch (err) {
      console.error("Error loading chat:", err);
      setError(`Failed to load chat: ${err instanceof Error ? err.message : String(err)}`);
      localStorage.removeItem('currentChatId');
      await startNewChat(); // Fallback to new chat on error
    } finally {
      setIsLoading(false);
    }
  };

  const saveCurrentChat = async (updatedMessages?: Message[]) => {
    const messagesToSave = updatedMessages || messages;
    let tempChatId = currentChatId;
    if (!tempChatId) {
      if (messagesToSave.length === 0) {
        console.log("saveCurrentChat: Skipping save for new chat with no messages.");
        return; 
      }
      console.warn("saveCurrentChat: currentChatId is null but messages exist. Attempting to create document (via getOrCreate).");
      // This call will also handle setting currentChatId state and localStorage
      tempChatId = await getOrCreateCurrentChatId(); 
      if (!tempChatId) { // If creation failed in getOrCreate
        console.error("saveCurrentChat: Failed to create/get chat ID.");
        return;
      }
      // No need to re-create with addDoc here, getOrCreateCurrentChatId handles it.
    }

    if (!hasLoadedInitialChat.current) {
      console.log("Initial chat not yet fully loaded/started, skipping save.");
      return;
    }
    
    // This specific check for 'New Chat' title might be less relevant now with deferred creation,
    // as an empty new chat won't even have an ID to save against until first message.
    // However, keeping it as a safeguard for any edge cases where an ID exists but messages are empty.
    if (messagesToSave.length === 0 && generateChatTitle(messagesToSave) === 'New Chat' && tempChatId) {
        const docSnap = await getDoc(doc(db, 'chatThreads', tempChatId));
        if (docSnap.exists() && docSnap.data().messages?.length === 0) {
            console.log("Skipping save for an existing empty new chat in Firestore.");
            return;
        }
    }

    // Directly store simplified message objects with optimized image data
    const cleanedMessages = messagesToSave.map(msg => {
      // Create a basic message with essential content
      const cleanedMsg: any = { 
        role: msg.role, 
        content: msg.content 
      };
      
      // Copy most fields directly
      if (msg.audioUrl) cleanedMsg.audioUrl = msg.audioUrl;
      if (msg.fileType) cleanedMsg.fileType = msg.fileType;
      if (msg.fileName) cleanedMsg.fileName = msg.fileName;
      if (msg.webSearchQueries) cleanedMsg.webSearchQueries = msg.webSearchQueries;
      if (msg.renderedContent) cleanedMsg.renderedContent = msg.renderedContent;
      if (msg.sourceCitations) cleanedMsg.sourceCitations = msg.sourceCitations;
      if (msg.imageUrl) cleanedMsg.imageUrl = msg.imageUrl;
      
      // Directly store image data but compressed if needed
      // For AI-generated images (FLUX)
      if (msg.imageBase64) {
        cleanedMsg.imageBase64 = msg.imageBase64;
      }
      
      // For user uploaded image previews
      if (msg.imageBase64Preview) {
        cleanedMsg.imageBase64Preview = msg.imageBase64Preview;
      }
      
      return cleanedMsg;
    });

    console.log("Saving chat:", tempChatId, "with messages:", cleanedMessages.length);
    try {
      const chatDocRef = doc(db, 'chatThreads', tempChatId);
      const newTitle = generateChatTitle(cleanedMessages);
      
      // Add userId property to link chats to users
      if (currentUser) {
      await setDoc(chatDocRef, {
        title: newTitle,
          messages: cleanedMessages,
        updatedAt: serverTimestamp(),
          userId: currentUser.uid
      }, { merge: true });
      } else {
        // For guest mode, don't include userId
        await setDoc(chatDocRef, {
          title: newTitle,
          messages: cleanedMessages,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      
      console.log("Chat saved successfully:", tempChatId);
    } catch (err) {
      console.error("Error saving chat:", err);
      setError("Failed to save chat. Some content might not be preserved.");
    }
  };

  // --- End Firestore Functions ---

   // --- Chat History Functions ---
  const fetchChatHistory = () => {
    // TODO: Filter by currentUser.uid if currentUser is available
    let threadsQuery;
    if (currentUser) {
      console.log("Fetching history for user:", currentUser.uid);
      threadsQuery = query(
        collection(db, 'chatThreads'), 
        where("userId", "==", currentUser.uid), 
        orderBy('updatedAt', 'desc')
      );
    } else {
      console.log("No user, fetching no history or guest history (if implemented).");
      // For now, if no user, don't fetch any history or clear existing history.
      // Or, you could fetch chats with no userId field (guest chats), if you want to support that.
      setChatHistory([]); // Clear history if no user
      return () => {}; // Return an empty unsubscribe function
    }

    const unsubscribe = onSnapshot(threadsQuery, (querySnapshot) => {
      const history: ChatThread[] = [];
      querySnapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() } as ChatThread);
      });
      setChatHistory(history);
      console.log("Chat history updated:", history.length, "threads");
    }, (error) => {
      console.error("Error fetching chat history:", error);
      setError("Could not load chat history.");
    });
    return unsubscribe; // Return the unsubscribe function for cleanup
  };

  const handleDeleteChat = async (chatIdToDelete: string) => {
    console.log("Deleting chat immediately:", chatIdToDelete);
    try {
      await deleteDoc(doc(db, 'chatThreads', chatIdToDelete));
      console.log("Chat deleted successfully from Firestore:", chatIdToDelete);
      if (currentChatId === chatIdToDelete) {
        await startNewChat(); // Start a new chat if the active one was deleted
      }
      // The onSnapshot listener in fetchChatHistory will update the UI.
    } catch (err) {
      console.error("Error deleting chat from Firestore:", err);
      setError("Failed to delete chat. Please try again.");
    }
  };

  const handleLoadChatFromHistory = async (chatIdToLoad: string) => {
    if (currentChatId === chatIdToLoad) {
      setIsHistoryModalOpen(false); // Already loaded, just close modal
      return;
    }
    // Save current chat before switching, if it has content
    if (messages.length > 0 && currentChatId && hasLoadedInitialChat.current) {
      await saveCurrentChat(); 
    }
    await loadChat(chatIdToLoad);
    setIsHistoryModalOpen(false);
  };

  // --- End Chat History Functions ---

  // --- Auth Functions ---
  const handleSignInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // Auth state change will be handled by AuthProvider, no need to setUser here
      console.log("Google sign-in successful");
      // Potentially load user-specific chats or preferences here
    } catch (error) {
      console.error("Error during Google sign-in:", error);
      setError("Failed to sign in with Google. Please try again.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      console.log("User signed out");
      // Clear user-specific data
      setCurrentChatId(null); 
      localStorage.removeItem('currentChatId');
      setMessages([]);
      setChatHistory([]); // Clear loaded history as well
      setIsGuestMode(false); // Exit guest mode on sign out
      // UI should update based on currentUser becoming null
    } catch (error) {
      console.error("Error signing out:", error);
      setError("Failed to sign out. Please try again.");
    }
  };

  const handleSkipLogin = () => {
    // For now, this function doesn't do much.
    // It could be used to set a "guest" mode or similar.
    console.log("Skip login pressed, entering guest mode.");
    setIsGuestMode(true);
    // If you want to allow proceeding to a limited version of the app:
    // setCurrentUser(null); // Or some guest user object
    // setAuthLoading(false); 
    // However, the current structure heavily relies on currentUser for chat functionality.
    // So, skipping might mean no chat functionality or a different UI path.
  };
  // --- End Auth Functions ---

  // Effect for initial chat loading or starting a new one
  useEffect(() => {
    const initializeChat = async () => {
      // Wait for auth to settle before deciding on chat
      if (authLoading) return;

      if (currentUser) {
        setIsGuestMode(false); // If user is logged in, ensure guest mode is off
      }

      const savedChatId = localStorage.getItem('currentChatId');
      // TODO: Later, tie chat history to currentUser.uid
      if (savedChatId && savedChatId !== 'null') { 
        await loadChat(savedChatId);
      } else {
        setCurrentChatId(null);
        setMessages([]);
        hasLoadedInitialChat.current = true; 
        console.log("Initialized with no saved chat ID, ready for new local chat.");
      }
    };
    initializeChat();
  }, [authLoading, currentUser]); // Re-run if auth state changes (e.g., user logs in/out)

  // Auto-save when messages change (and currentChatId is set or messages exist for a new chat)
  useEffect(() => {
    // Ensure chat can be saved even if currentChatId is null (for the first message of a new chat)
    if ((currentChatId || messages.length > 0) && hasLoadedInitialChat.current && !authLoading) {
      const debounceSave = setTimeout(() => {
        saveCurrentChat(messages);
      }, 1500);
      return () => clearTimeout(debounceSave);
    }
  }, [messages, currentChatId, authLoading]); 

  // Effect for fetching chat history on mount and listening for updates
  useEffect(() => {
    if (authLoading) return; // Don't fetch history until auth is resolved
    // TODO: Modify fetchChatHistory to be user-specific if currentUser exists

    const unsubscribeFromHistory = fetchChatHistory(); // Pass currentUser.uid if needed later
    return () => {
      unsubscribeFromHistory();
    };
  }, [authLoading, currentUser]); 

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
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
        // No need to nullify here as the effect's own cleanup/logic will handle it
      }
      if (userScrollInactivityTimerRef.current) { // Clean up inactivity timer on unmount
        clearTimeout(userScrollInactivityTimerRef.current);
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
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'meta-llama/Llama-Vision-Free', label: 'Llama Vision' },
    { value: 'black-forest-labs/FLUX.1-schnell-Free', label: 'FLUX.1 [schnell]' },
    { value: 'black-forest-labs/flux-kontext-pro', label: 'FLUX.1 Kontext [pro]' }, // Added FLUX.1 Kontext
    { value: 'bytedance/bagel', label: 'ByteDance Bagel' }, // Added Bagel
    { value: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', label: 'Llama 3.3 Instruct' },
    { value: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free', label: 'DeepSeek R1' },
    { value: 'qwen/qwen2.5-vl-72b-instruct:free', label: 'Qwen2.5 VL 72B' },
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

        // Create recorder with webm mimetype
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        setMediaRecorder(recorder);
        
        const audioChunks: Blob[] = [];
        
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            console.log(`Got audio chunk: ${event.data.size} bytes`);
            audioChunks.push(event.data);
          }
        };

        recorder.onstop = async () => {
          console.log(`Recording stopped, collected ${audioChunks.length} chunks`);
          
          if (audioChunks.length === 0) {
            console.error("No audio data captured");
            setError("No audio data was captured. Please try again.");
            return;
          }
          
          // Create blob from chunks
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          console.log(`Created audio blob: ${audioBlob.size} bytes`);
          
          if (audioBlob.size === 0) {
            console.error("Audio blob is empty");
            setError("Recording failed: no audio data. Please try again.");
            return;
          }
          
          // Create URL for audio preview
          const audioUrl = URL.createObjectURL(audioBlob);
          setAudioUrl(audioUrl);
          setAudioBlob(audioBlob);
          
          // Create File object from blob
          const fileName = `recording-${Date.now()}.webm`;
          const file = new File([audioBlob], fileName, { type: 'audio/webm' });
          console.log(`Created audio file: ${file.name}, ${file.size} bytes`);
          
          setSelectedFile(file);
          
          // Stop tracks
          stream.getTracks().forEach(track => track.stop());
        };

        // Start recording
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop(); // This triggers the onstop event
      setIsRecording(false);
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
    setAudioBlob(null);
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
  
  const handleDownloadImage = () => {
    if (overlayImageUrl) {
      const link = document.createElement('a');
      link.href = overlayImageUrl;
      // Generate a filename with timestamp
      const fileName = `sagemind-image-${Date.now()}.jpg`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  // --- End Image Overlay Handlers ---

  // Helper to update or add the AI message for streaming models
  const updateAiMessage = (chunkData: Partial<Message & { text?: string, completeContent?: string }>) => {
    setMessages(prevMessages => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      // Ensure we are updating an AI message and it's not a YouTube video placeholder
      if (lastMessage && lastMessage.role === 'ai' && !chunkData.youtubeVideos) {
        // Update existing AI message
        return prevMessages.map((msg, index) =>
          index === prevMessages.length - 1
            ? { 
                ...msg, 
                ...chunkData,
                content: chunkData.completeContent !== undefined 
                  ? chunkData.completeContent 
                  : (msg.content || '') + (chunkData.text || ''),
                text: undefined, 
                completeContent: undefined,
                isLoading: false // Remove loading state when content starts streaming
              }
            : msg
        );
      } else {
        // Add new AI message if no suitable AI message to update or if it's a new type (e.g. YouTube videos)
        return [...prevMessages, { 
          role: 'ai',
          content: chunkData.completeContent || chunkData.text || '',
          ...chunkData,
          text: undefined, 
          completeContent: undefined,
          isLoading: false // Make sure the new message isn't in loading state
        }];
      }
    });
  };

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
    if (!inputValue.trim() && !selectedFile && !audioBlob) return;

    setError(null);
    const currentInput = inputValue.trim();
    const currentSelectedFile = selectedFile;
    const currentAudioBlob = audioBlob; // Capture current audio blob
    const currentUploadedFileInfo = uploadedFileInfo; // Capture current file info
    const currentFileName = currentSelectedFile?.name || uploadedFileInfo?.name || (currentAudioBlob ? 'audio_recording.webm' : undefined);
    const currentFileType = currentSelectedFile?.type || uploadedFileInfo?.originalType || (currentAudioBlob ? currentAudioBlob.type : undefined);

    // Create user message object
    const userMessage: Message = {
      role: 'user',
      content: currentInput,
      // Include file/audio info if present
      ...(currentUploadedFileInfo && { fileType: currentUploadedFileInfo.convertedType, fileName: currentUploadedFileInfo.name, imageBase64Preview: currentUploadedFileInfo.convertedType.startsWith('image/') ? currentUploadedFileInfo.base64 : undefined }),
      ...(currentAudioBlob && { audioUrl: URL.createObjectURL(currentAudioBlob), fileType: currentAudioBlob.type, fileName: 'audio_recording.webm' }),
    };
    
    // Add user message to the chat
    setMessages(prev => [...prev, userMessage]);
    
    // Add a temporary loading message from AI
    const loadingMessage: Message = {
      role: 'ai',
      content: '',
      isLoading: true
    };
    setMessages(prev => [...prev, loadingMessage]);

    // Clear inputs after capturing them
    setInputValue('');
    setSelectedFile(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setUploadedFileInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (textareaRef.current) textareaRef.current.focus();

    setIsLoading(true);

    try {
      if (isYouTubeModeActive) {
        // Handle YouTube Search
        const chatContextForYouTube = messages.slice(-5).map(msg => msg.content); // Get last 5 messages for context
        
        const response = await fetch('/api/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: currentInput, chatContext: chatContextForYouTube, maxResults: 10 }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch YouTube videos');
        }
    
        const videos: YouTubeVideo[] = await response.json();

        // Replace loading message with YouTube results
        setMessages(prev => [
          ...prev.slice(0, prev.length - 1),
          {
            role: 'ai',
            content: videos.length > 0 ? `Found ${videos.length} videos for "${currentInput}":` : `No YouTube videos found for "${currentInput}".`,
            youtubeVideos: videos,
          }
        ]);
        
        // Save the chat
        saveCurrentChat();

      } else {
        // Handle LLM interaction
        const history = messages.slice(0, messages.length).map(msg => ({
          role: msg.role === 'ai' ? 'model' : 'user',
          content: msg.content,
          ...(msg.fileType && msg.fileName && msg.imageBase64Preview && msg.imageBase64Preview.includes(',') && { 
            fileData: { 
              mimeType: msg.fileType, 
              base64String: msg.imageBase64Preview.split(',')[1] 
            } 
          }),
        })) as ChatMessage[];
        
        const formData = new FormData();
        if (currentInput) formData.append('message', currentInput);
        formData.append('history', JSON.stringify(history));
        formData.append('modelName', selectedModel);
        
        if (currentUploadedFileInfo) {
          formData.append('base64', currentUploadedFileInfo.base64);
          formData.append('convertedType', currentUploadedFileInfo.convertedType);
          formData.append('fileName', currentUploadedFileInfo.name);
        } else if (currentAudioBlob) {
          const audioFile = new File([currentAudioBlob], 'audio_recording.webm', { type: currentAudioBlob.type });
          formData.append('audio', audioFile);
        }
        
        console.log("Sending to /api/chat with FormData. Keys:", Array.from(formData.keys()));
        
        const response = await fetch('/api/chat', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let errorResponseMessage = 'Network response was not ok.';
          try {
            const errorData = await response.json();
            errorResponseMessage = errorData.error || errorResponseMessage;
          } catch (jsonParseError) {
            errorResponseMessage = response.statusText || errorResponseMessage;
            console.error("Failed to parse error response as JSON, using status text:", jsonParseError);
          }
          throw new Error(errorResponseMessage);
        }

        // ---- HANDLE FLUX (Non-Streamed JSON) vs. Other (Streamed) Models ----
        if (selectedModel === 'black-forest-labs/FLUX.1-schnell-Free' || selectedModel === 'bytedance/bagel' || selectedModel === 'black-forest-labs/flux-kontext-pro') {
          // These models returns a single JSON object, not a stream
          const payload = await response.json();
          
          // Replace loading message with the result
          setMessages(prev => [
            ...prev.slice(0, prev.length - 1),
            {
              role: 'ai',
              content: payload.text || '',
              imageBase64: payload.imageBase64,
              imageMimeType: payload.imageMimeType,
            }
          ]);
          
          // Save the chat
          saveCurrentChat();
        } else {
          // Handle streamed response for other models
          if (!response.body) {
            throw new Error("Response body is null for a streaming model.");
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let accumulatedText = "";
          let webSearchQueries: string[] | undefined = undefined;
          let renderedContent: string | undefined = undefined;
          let sourceCitations: string[] | undefined = undefined;
          let imageBase64: string | undefined = undefined; // Added to capture image for streaming models
          let imageMimeType: string | undefined = undefined; // Added to capture MIME type

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunkString = decoder.decode(value, { stream: true });
            console.log("Received chunk:", chunkString); 
            
            const jsonObjects = chunkString.split('\n').filter(line => line.trim().startsWith('{') && line.trim().endsWith('}'));

            if (jsonObjects && jsonObjects.length > 0) {
              jsonObjects.forEach(objStr => {
                try {
                  const parsedChunk = JSON.parse(objStr.trim()) as {text?: string, webSearchQueries?: string[], renderedContent?: string, sourceCitations?: string[], imageBase64?: string, imageMimeType?: string };
                  
                  if (parsedChunk.text) {
                    accumulatedText += parsedChunk.text;
                  }
                  if (parsedChunk.webSearchQueries) webSearchQueries = parsedChunk.webSearchQueries;
                  if (parsedChunk.renderedContent) renderedContent = parsedChunk.renderedContent;
                  if (parsedChunk.sourceCitations) sourceCitations = parsedChunk.sourceCitations;
                  if (parsedChunk.imageBase64) imageBase64 = parsedChunk.imageBase64; // Capture imageBase64
                  if (parsedChunk.imageMimeType) imageMimeType = parsedChunk.imageMimeType; // Capture imageMimeType

                  updateAiMessage({
                    completeContent: accumulatedText, 
                    webSearchQueries: webSearchQueries,
                    renderedContent: renderedContent,
                    sourceCitations: sourceCitations,
                    imageBase64: imageBase64, // Pass to updateAiMessage
                    imageMimeType: imageMimeType, // Pass to updateAiMessage
                  });
                } catch (e) {
                  console.error("Failed to parse chunk:", objStr, e);
                  if (typeof objStr === 'string' && objStr.includes('"text"')) {
                    const textMatch = objStr.match(/"text":"(.*?)"/);
                    if (textMatch && textMatch[1]) {
                      let recoveredText = textMatch[1];
                      try { recoveredText = JSON.parse('"' + recoveredText + '"'); }
                      catch (sanitizeError) { console.warn("Could not fully sanitize recovered text:", recoveredText, sanitizeError); }
                      accumulatedText += recoveredText;
                      updateAiMessage({ completeContent: accumulatedText });
                    }
                  }
                }
              });
            }
          }
          setMessages(prevMsgs => {
            const finalUserMessage = prevMsgs[prevMsgs.length - 2]; 
            const finalAiMessage = prevMsgs[prevMsgs.length - 1]; 
            if (finalUserMessage && finalUserMessage.role === 'user' && finalAiMessage && finalAiMessage.role === 'ai'){
                saveCurrentChat(prevMsgs); 
            }
            return prevMsgs;
          });
        }
      }
    } catch (err: any) {
      console.error("Error in handleSubmit:", err);
      setError(err.message || 'An error occurred while fetching the response.');
      // Remove loading message and add an error message to the chat
      setMessages(prev => [
        ...prev.slice(0, prev.length - 1),
        { role: 'ai', content: `Error: ${err.message || 'Something went wrong.'}` }
      ]);
    } finally {
      setIsLoading(false);
      // Auto-scroll to bottom after response is fully processed or on error
      // Ensure this only happens if user hasn't manually scrolled up
      if (!isAutoScrollingPaused) {
        scrollToBottom();
      }
    }
  };

  const handleHeaderNewChat = async () => {
    // Set loading state
    setIsLoading(true);
    
    try {
      // Only save current chat if it has content and a valid ID
    if (messages.length > 0 && currentChatId && hasLoadedInitialChat.current) {
      await saveCurrentChat(); // Save current work before starting new
    }
      
      // Then start new chat - this should be a fast local operation
      setCurrentChatId(null);
      setMessages([]);
      setInputValue('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setSelectedFile(null);
      setAudioUrl(null);
      setUploadedFileInfo(null);
      setError(null);
      localStorage.removeItem('currentChatId'); // Clear any existing ID
      hasLoadedInitialChat.current = true; // Ready for interaction
    } catch (err) {
      console.error("Error during new chat creation:", err);
      setError("Failed to start new chat. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleHeaderHistory = async () => {
    // To be implemented: fetch chat history from Firestore
    // For now, just toggles the modal for layout testing
    console.log("History button clicked, toggling isHistoryModalOpen from:", isHistoryModalOpen);
    setIsHistoryModalOpen(prev => !prev); 
    // Fetching is now handled by the onSnapshot listener, so no need to fetch on open.
  };

  // Modify the dropdown click handler to prevent error display
  const handleModelDropdownToggle = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default behavior
    e.stopPropagation(); // Stop event propagation
    setIsModelDropdownOpen(!isModelDropdownOpen);
    // Clear any error that might be showing
    setError(null);
  };

  const handleChatScroll = () => {
    if (programmaticScrollTimeoutRef.current) {
      return;
    }

    const container = chatContainerRef.current;
    if (container) {
      const scrollThreshold = 30; 
      const isNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < scrollThreshold;

      // Always clear the inactivity timer on any user scroll action
      if (userScrollInactivityTimerRef.current) {
        clearTimeout(userScrollInactivityTimerRef.current);
        userScrollInactivityTimerRef.current = null;
      }

      if (!isNearBottom) {
        // User has scrolled up. Pause auto-scrolling.
        if (!isAutoScrollingPaused) { // Set pause only if not already paused
          setIsAutoScrollingPaused(true);
        }
        
        // Start a timer: if user remains inactive, resume auto-scroll
        userScrollInactivityTimerRef.current = setTimeout(() => {
          // Check if still paused and user hasn't scrolled back to bottom manually during the timeout
          const stillScrolledUp = (container.scrollHeight - container.scrollTop - container.clientHeight) >= scrollThreshold;
          if (isAutoScrollingPaused && stillScrolledUp) {
            setIsAutoScrollingPaused(false); // This will trigger useEffect to scroll if needed
          }
          userScrollInactivityTimerRef.current = null;
        }, 1500); // 1.5 seconds of inactivity
      } else {
        // User is at or has scrolled back to the bottom. Resume auto-scrolling.
        if (isAutoScrollingPaused) { // Resume only if it was paused
          setIsAutoScrollingPaused(false);
        }
        // No need to start an inactivity timer if user is already at the bottom
      }
    }
  };

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-[#A6A6A6] animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-2 text-sm text-gray-500 dark:text-[#A6A6A6]">Loading...</p>
        </div>
      </div>
    );
  }

  // If currentUser exists or in guest mode, render the main chat application
  // The login sheet will be rendered as an overlay if needed.
  return (
    // Outermost div for full-width background - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING
    <div className="w-full bg-gray-50 dark:bg-[#161616] fixed inset-0 flex flex-col">
      {/* Inner wrapper to constrain and center content - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING */}
      <div className="max-w-3xl mx-auto flex flex-col h-full w-full">
        {/* Header - Solid Background, No Border - REMAINS flex-shrink: 0 implicitly */}
        <header 
          className="bg-gray-50 dark:bg-[#161616] pt-3 pb-3 sm:pt-4 sm:pb-4 text-center z-10 flex-shrink-0 flex items-center justify-between px-4 border-b border-gray-200 dark:border-transparent"
        >
          {/* Left side of header: Conditional based on auth state */} 
          {authLoading ? (
            <div className="w-1/3"></div>
          ) : currentUser ? ( // Show New Chat & History for logged-in users
             <div className="w-1/3 flex justify-start items-center gap-1 sm:gap-2">
                <button 
                  onClick={handleHeaderNewChat}
                  className="p-2 rounded-full icon-button" 
                  title="New Chat"
                  aria-label="New Chat"
                >
                  <MessageCirclePlus 
                    className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" 
                    style={{ transform: 'scaleX(-1)' }} // Flipped horizontally
                  /> 
                </button>
                <button 
                  onClick={handleHeaderHistory}
                  className="p-2 rounded-full icon-button"
                  title="Chat History"
                  aria-label="Chat History"
                >
                  <History className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" />
                </button>
             </div>
          ) : (
            <div className="w-1/3"></div>
          )}

          {/* Center of header: Title */} 
          <div className="flex-grow text-center">
            {/* Always show SageMind title once auth is done loading */}
            <h1 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-[#F9FAFB]">SageMind</h1>
          </div>

          {/* Right side of header: Auth/User actions */} 
          <div className="w-1/3 flex justify-end items-center gap-1 sm:gap-2">
            {authLoading ? (
              <div className="h-8"></div>
            ) : currentUser ? (
              <>
                {/* Theme toggle is now here, next to Sign Out */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-full icon-button"
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                  aria-label="Toggle theme"
                >
                  {theme === 'light' ? (
                    <Moon className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" />
                  ) : (
                    <Sun className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" />
                  )}
                </button>
                {/* History button was here, moved to the left */}
                <button 
                  onClick={handleSignOut}
                  className="p-2 rounded-full icon-button"
                  title={`Sign Out (${currentUser.displayName || currentUser.email})`}
                  aria-label="Sign Out"
                >
                  <LogOut className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" />
                </button>
              </>
            ) : isGuestMode ? (
              // Show Log In button for guests - clicking this should show the login drawer
              // AND theme toggle
              <>
                <button
                  onClick={toggleTheme} // Add theme toggle action
                  className="p-2 rounded-full icon-button"
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                  aria-label="Toggle theme"
                >
                  {theme === 'light' ? (
                    <Moon className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" />
                  ) : (
                    <Sun className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" />
                  )}
                </button>
                <button 
                  onClick={() => setIsGuestMode(false)} // This will reveal the login bottom sheet
                  className="p-2 rounded-full icon-button"
                  title="Sign In"
                  aria-label="Sign In"
                >
                  <LogIn className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700 dark:text-[#C8C8C8]" />
                </button>
              </>
            ) : (
              // Placeholder if login sheet is up (user is not logged in and not guest)
              <div className="h-8"></div>
            )}
          </div>
        </header>

        {/* Main content - Relative positioning for overlay - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING */}
        <main 
          ref={chatContainerRef} // Assign ref to the main chat container
          className="relative flex-grow overflow-y-auto min-h-0 chat-container dark:bg-[#161616]"
          style={{ overflowX: 'hidden', overscrollBehaviorY: 'contain' }}
          onMouseMove={handleMouseMove}
          onScroll={handleChatScroll} // Add scroll event listener
        >
           {/* Fade Overlay */}
           <div 
             className="sticky top-0 left-0 right-0 h-16 bg-gradient-to-b from-gray-50 dark:from-[#161616] to-transparent pointer-events-none z-5"
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
                      ? 'max-w-[80%] dark:bg-[#292929] text-gray-800 dark:text-[#F9FAFB] user-bubble' // Added user-bubble class
                      : 'w-full bg-transparent dark:bg-transparent text-gray-800 dark:text-[#F9FAFB]' // AI bubble: bg transparent
                  } `}
                  style={msg.role === 'user' ? {
                    borderTopLeftRadius: '24px',
                    borderTopRightRadius: '24px',
                    borderBottomLeftRadius: '24px',
                    borderBottomRightRadius: '8px',
                    backgroundColor: 'var(--bubble-user)'
                  } : { borderRadius: '24px' /* AI bubble also gets rounded corners */ }}
                >
                  {msg.role === 'ai' ? (
                    <>
                      {msg.isLoading ? (
                        <LoadingAnimation />
                      ) : (
                        <>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                            components={{
                              table: ({node, ...props}) => (
                                <div className="my-6 overflow-x-auto rounded-2xl border border-gray-300 dark:border-[#2F2F2E]">
                                  <table className="min-w-full" {...props} />
                                </div>
                              ),
                              thead: ({node, ...props}) => (
                                <thead className="bg-gray-100 dark:bg-[#1E1E1E]" {...props} />
                              ),
                              th: ({node, ...props}) => (
                                <th
                                  className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-[#A6A6A6] uppercase tracking-wider border-b border-r last:border-r-0 border-gray-200 dark:border-[#2F2F2E]"
                                  {...props}
                                />
                              ),
                              tbody: ({node, ...props}) => (
                                <tbody className="dark:divide-[#2F2F2E]" {...props} />
                              ),
                              tr: ({node, ...props}) => (
                                <tr className="hover:bg-gray-100 dark:hover:bg-[#1E1E1E] transition-colors" {...props} />
                              ),
                              td: ({node, ...props}) => (
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-[#A6A6A6] border-b border-r last:border-r-0 border-gray-200 dark:border-[#2F2F2E]" {...props} />
                              ),
                              // Custom text component to handle the citation links directly in markdown
                              text: ({children}) => {
                                if (typeof children === 'string' && msg.sourceCitations?.length) {
                                  return <>{processCitationMarkers(children, msg.sourceCitations)}</>;
                                }
                                // Ensure AI text is also styled for dark mode
                                return <span className="dark:text-[#F9FAFB]">{children}</span>;
                              },
                              code: ({ inline, className, children, ...props }: React.ComponentProps<'code'> & { inline?: boolean }) => { 
                                const match = /language-(\w+)/.exec(className || '');
                                const highlightLanguage = match?.[1] || '';
                                
                                if (inline) {
                                  return (
                                    <code 
                                      className="px-1 py-0.5 bg-gray-200 dark:bg-[#1E1E1E] text-pink-600 dark:text-pink-400 rounded text-sm font-mono overflow-wrap-break-word"
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
                                    ? "rounded-md bg-gray-900 dark:bg-[#1E1E1E] my-4 p-4 font-mono text-sm text-gray-100 dark:text-[#F9FAFB]"
                                    : "rounded-md bg-gray-100 dark:bg-[#1E1E1E] my-4 p-4 font-mono text-sm text-gray-800 dark:text-[#F9FAFB]";
                                return <pre className={`${preClassName} whitespace-pre-wrap word-break-all overflow-x-hidden`} {...props}>{children}</pre>;
                              },
                              blockquote: ({node, ...props}) => (
                                <blockquote className="pl-4 border-l-4 border-blue-400 dark:border-blue-500 italic text-gray-600 dark:text-[#A6A6A6] my-4 overflow-wrap-break-word" {...props} />
                              ),
                              li: ({node, ...props}) => <li className="ml-6 my-2 list-disc text-gray-700 dark:text-[#A6A6A6] overflow-wrap-break-word" {...props} />,
                              hr: ({node, ...props}) => <hr className="my-6 border-t border-gray-300 dark:border-[#2F2F2E]" {...props} />,
                              a: ({node, ...props}) => (
                                <a 
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline overflow-wrap-break-word"
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  {...props}
                                />
                              ),
                              img: ({node, ...props}) => (
                                <img 
                                  className="max-w-full h-auto rounded-lg my-4 shadow-sm dark:shadow-none"
                                  alt={props.alt || 'Image loaded from markdown'} 
                                  {...props} 
                                />
                              ),
                              p: ({node, ...props}) => <p className="my-3 text-gray-800 dark:text-[#F9FAFB] overflow-wrap-break-word" {...props} />,
                              h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-[#F9FAFB] overflow-wrap-break-word" {...props} />,
                              h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-5 mb-3 text-gray-900 dark:text-[#F9FAFB] overflow-wrap-break-word" {...props} />,
                              h3: ({node, ...props}) => <h3 className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-[#A6A6A6] overflow-wrap-break-word" {...props} />,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>

                          {msg.renderedContent && (
                            <div className="mt-3 search-suggestions-container dark:text-[#F9FAFB]" dangerouslySetInnerHTML={{ __html: msg.renderedContent }} />
                          )}

                          {!msg.renderedContent && msg.webSearchQueries && msg.webSearchQueries.length > 0 && (
                            <div className="mt-3 search-suggestions-container">
                              <p className="text-sm font-semibold text-gray-600 dark:text-[#A6A6A6] mb-1">Search Suggestions:</p>
                              <div className="flex flex-wrap gap-2" role="list">
                                {msg.webSearchQueries.map((query, i) => (
                                  <a
                                    key={i}
                                    href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="search-chip bg-gray-200 dark:bg-[#292929] text-gray-700 dark:text-[#F9FAFB] hover:bg-gray-300 dark:hover:bg-[#1E1E1E]"
                                  >
                                    <img src="https://www.google.com/favicon.ico" alt="Google" />
                                    {query}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {msg.imageBase64 && (
                            <div className="mt-2">
                              <img
                                src={`data:${msg.imageMimeType || 'image/jpeg'};base64,${msg.imageBase64}`}
                                alt="Generated by AI"
                                className="max-w-full md:max-w-md h-auto rounded-2xl cursor-pointer hover:opacity-80 transition-opacity dark:shadow-none"
                                onClick={() => handleOpenImageOverlay(`data:${msg.imageMimeType || 'image/jpeg'};base64,${msg.imageBase64}`)}
                              />
                            </div>
                          )}
                          
                          {msg.imageUrl && !msg.imageBase64 && (
                            <div className="mt-2">
                              <img
                                src={msg.imageUrl}
                                alt="Generated by AI"
                                className="max-w-md h-auto rounded-lg cursor-pointer hover:opacity-80 transition-opacity dark:shadow-none"
                                onClick={() => msg.imageUrl && handleOpenImageOverlay(msg.imageUrl)}
                              />
                            </div>
                          )}
                          {/* Display YouTube Carousel if videos are present */}
                          {msg.youtubeVideos && msg.youtubeVideos.length > 0 && (
                            <YouTubeCarousel videos={msg.youtubeVideos} />
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col">
                      {msg.imageBase64Preview && msg.fileType?.startsWith('image/') && (
                        <div className="ml-auto">
                          <img
                            src={`data:${msg.fileType};base64,${msg.imageBase64Preview}`}
                            alt={msg.fileName || 'User image preview'}
                            className="mt-1 mb-1 max-h-20 w-auto rounded-md cursor-pointer hover:opacity-80 shadow-sm dark:shadow-none"
                            onClick={() => msg.imageBase64Preview && msg.fileType && handleOpenImageOverlay(`data:${msg.fileType};base64,${msg.imageBase64Preview}`)}
                          />
                        </div>
                      )}

                      {msg.content && msg.content.trim() && (
                        <div className="w-full dark:text-[#F9FAFB]">{msg.content}</div>
                      )}

                      {!msg.imageBase64Preview &&
                       msg.fileName &&
                       !msg.fileType?.startsWith('audio/') &&
                       !msg.fileType?.startsWith('image/') &&
                       msg.content !== `(File: ${msg.fileName})` && (
                         <div className="mt-1 text-sm opacity-70 dark:opacity-60 text-gray-600 dark:text-[#A6A6A6] w-full">
                           (File: {msg.fileName})
                         </div>
                      )}

                      {msg.audioUrl && msg.fileType?.startsWith('audio/') && (
                        <div className="mt-2 w-full">
                          <audio
                            src={msg.audioUrl}
                            controls
                            className="max-w-full max-h-8 dark:[color-scheme:dark]" // Removed dark:bg-gray-700, let browser style with color-scheme
                            preload="metadata"
                          />
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs opacity-70 dark:opacity-60 text-gray-600 dark:text-[#A6A6A6]">
                              {msg.fileName || "Audio recording"}
                            </span>
                          </div>
                        </div>
                      )}

                      {msg.renderedContent && (
                        <div className="mt-3 search-suggestions-container dark:text-[#F9FAFB]" dangerouslySetInnerHTML={{ __html: msg.renderedContent }} />
                      )}
                      
                      {!msg.renderedContent && msg.webSearchQueries && msg.webSearchQueries.length > 0 && (
                        <div className="mt-3 search-suggestions-container">
                          <p className="text-sm font-semibold text-gray-600 dark:text-[#A6A6A6] mb-1">Search Suggestions:</p>
                          <div className="flex flex-wrap gap-2" role="list">
                            {msg.webSearchQueries.map((query, i) => (
                              <a
                                key={i}
                                href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="search-chip bg-gray-200 dark:bg-[#292929] text-gray-700 dark:text-[#F9FAFB] hover:bg-gray-300 dark:hover:bg-[#1E1E1E]"
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
            {/* Empty div at the end of messages to scroll to */}
            <div ref={messagesEndRef} style={{ height: '1px' }} />
           </div>
      </main>

      {error && (
          <div className="p-4 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900 border-t border-red-200 dark:border-red-700">
              Error: {error}
          </div>
      )}

        {/* Footer - Transparent Background - REMAINS flex-shrink: 0 */}
        <footer className="p-3 bg-transparent dark:bg-[#161616] flex-shrink-0"> {/* Added dark:bg for footer to ensure it has surface color */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-0"> 
            {/* Main Input Container with very large border-radius for squircle-like appearance */}
            <div 
              className={`
                p-3 
                flex flex-col gap-2 
                bg-gray-100 dark:bg-[#1E1E1E]
                shadow-sm 
                ${isDraggingOver 
                  ? 'border-2 border-dashed border-blue-500 dark:border-blue-400 ring-2 ring-blue-300 dark:ring-blue-500' 
                  : 'border border-gray-200 dark:border-[#2F2F2E]'
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
                <div className="mb-2 pb-2 border-b border-gray-200 dark:border-[#2F2F2E] flex items-center justify-between">
                  {/* Display audio preview */} 
                  {audioUrl && (
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                      <audio 
                        src={audioUrl!} 
                        controls 
                        className="max-h-8 w-full rounded-full border border-gray-300 dark:border-[#2F2F2E] p-0.5 bg-transparent dark:[color-scheme:dark]"
                      />
                      <button 
                        type="button" 
                        onClick={clearRecording} 
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900 flex-shrink-0"
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
                          className="rounded border border-gray-300 dark:border-[#2F2F2E]"
                        />
                      </div>
                      <span className="text-sm text-gray-700 dark:text-[#A6A6A6] truncate flex-grow min-w-0" title={uploadedFileInfo.name}>
                        {uploadedFileInfo.name}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setUploadedFileInfo(null)} 
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900 flex-shrink-0"
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
                  className="flex-grow bg-transparent focus:outline-none text-gray-900 dark:text-[#F9FAFB] text-base placeholder-gray-500 dark:placeholder-[#A6A6A6] resize-none overflow-y-auto pr-2"
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

              {/* Bottom Bar: YouTube Toggle, Dropdown & Buttons */}
              <div className="flex justify-between items-center pt-2">
                <div className="flex items-center gap-2"> {/* Left side group for Model Dropdown & YouTube Toggle */}
                {/* Custom Model Dropdown with squircle styling */}
                <div className="relative" ref={modelDropdownRef}>
                  <button
                    onClick={handleModelDropdownToggle}
                    disabled={isLoading}
                      className={`flex items-center justify-between border text-xs cursor-pointer py-1.5 pl-2 pr-1.5 model-dropdown-toggle bg-gray-100 hover:bg-gray-200 dark:bg-[#1E1E1E] dark:hover:bg-gray-700 border-gray-300 dark:border-[#2F2F2E] text-gray-700 dark:text-[#C8C8C8] focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 focus:ring-offset-1 dark:focus:ring-offset-gray-900`}
                    style={{ borderRadius: '12px', width: '140px' }}
                      title={"Select AI Model"}
                  >
                    <span className="truncate">{currentModelLabel}</span>
                    <svg className={`ml-1 h-3 w-3 transform transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {isModelDropdownOpen && (
                    <div 
                        className="absolute left-0 bottom-full mb-1 w-full border shadow-sm z-20 overflow-hidden model-dropdown visible bg-white dark:bg-[#1E1E1E]"
                      style={{ borderRadius: '12px' }}
                    >
                      <div className="max-h-56 overflow-y-auto py-1">
                        {modelOptions.map((option) => (
                          <button
                            key={option.value}
                              className={`w-full text-left px-3 py-2 text-xs focus:outline-none transition-colors model-dropdown-item ${selectedModel === option.value ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-600'} text-gray-900 dark:text-white`}
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

                  {/* Point 1: YouTube Toggle Button - Re-added and Styled */}
                  <button
                    type="button"
                    onClick={toggleYouTubeMode}
                    disabled={isLoading}
                    className={`flex items-center justify-center text-xs cursor-pointer py-1.5 px-3 transition-colors
                      ${isYouTubeModeActive ? 'yt-active' : 'yt-default'}`}
                    style={{
                      borderRadius: '12px',
                      minWidth: '60px',
                      backgroundColor: theme === 'dark' && !isYouTubeModeActive ? '#161616' : undefined,
                      borderColor: theme === 'dark' && !isYouTubeModeActive ? '#2F2F2E' : undefined,
                      color: theme === 'dark' && !isYouTubeModeActive ? '#C8C8C8' : undefined
                    }}
                    title={isYouTubeModeActive ? "Switch to AI Chat" : "Switch to YouTube Search"}
                    aria-label={isYouTubeModeActive ? "Switch to AI Chat" : "Switch to YouTube Search"}
                  >
                    <Youtube
                      size={16}
                      className="mr-1"
                      strokeWidth={2.2}
                    />
                    <span>{isYouTubeModeActive ? 'YT' : 'YT'}</span>
                  </button>
                </div>
                
                {/* Right Side Buttons */}
                <div className="flex items-center gap-2">
                   {/* Attachments Button with squircle styling */}
                  <button
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isLoading || !modelCapabilities[selectedModel]?.hasAttachment}
                    className={`p-1.5 text-gray-600 dark:text-[#C8C8C8] flex items-center justify-center bg-gray-100 dark:bg-[#1E1E1E] icon-button ${(!modelCapabilities[selectedModel]?.hasAttachment && !isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    className={`p-1.5 text-gray-600 dark:text-[#C8C8C8] flex items-center justify-center ${isRecording ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900' : 'bg-gray-100 dark:bg-[#1E1E1E]'} icon-button ${(!modelCapabilities[selectedModel]?.hasMic && !isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    className="p-2 send-button focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center aspect-square cursor-pointer button"
                    style={{ borderRadius: '16px' }}
                    title="Send message"
                  >
                    <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Footer Text (Outside Main Container) */}
          <div className="text-center text-xs text-gray-800 dark:text-[#F9FAFB] mt-2">
            Experiment by <a href="https://x.com/siddhantpetkar" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-[#F9FAFB]">@sidpetkar</a>
          </div>
        </footer>
      </div>

      {/* Custom styles for YT toggle */}
      <style jsx global>{`
        /* Light mode - Default state */
        .yt-default {
          background-color: #fff !important;
          border: 1.5px solid #e5e7eb !important;
          color: #222 !important;
          outline: none !important;
          box-shadow: none !important;
        }
        
        /* Dark mode - Default state */
        html.dark .yt-default,
        .dark .yt-default {
          background-color: #161616 !important;
          border: 1.5px solid #2F2F2E !important;
          color: #C8C8C8 !important;
        }
        
        /* Both modes - Active state */
        .yt-active {
          background-color: #ff5959 !important;
          color: #fff !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          border-color: transparent !important;
        }
        
        /* Hover effects */
        .yt-default:hover {
          background-color: #f9fafb !important;
        }
        
        html.dark .yt-default:hover,
        .dark .yt-default:hover {
          background-color: #292929 !important;
        }
        
        /* Focus states */
        .yt-default:focus, .yt-active:focus {
          outline: none !important;
          box-shadow: none !important;
        }

        /* Ensure icon colors match */
        .yt-default svg {
          stroke: #222 !important;
        }
        
        html.dark .yt-default svg,
        .dark .yt-default svg {
          stroke: #C8C8C8 !important;
        }
        
        .yt-active svg {
          stroke: white !important;
        }
        
        .model-dropdown-toggle:focus {
          outline: none !important;
          box-shadow: none !important;
        }
        
        .send-button:hover {
          /* Add specific non-hovered styles to override defaults */
        }
      `}</style>

      {/* Login Bottom Sheet Overlay - Rendered on top of the main app if needed */}
      {!currentUser && !isGuestMode && (
        // Outermost container for backdrop blur and bottom alignment
        // On md screens and up, justify-center to vertically center the sheet
        <div className="fixed inset-0 bg-[rgba(0,0,0,0.4)] dark:bg-[rgba(0,0,0,0.6)] backdrop-blur-sm z-40 flex flex-col justify-end md:justify-center items-center">
          {/* Bottom Sheet Drawer */}
          {/* On md screens and up, use rounded-3xl for all-around corners */}
          <div className="bg-gray-50 dark:bg-[#161616] w-full max-w-md p-6 sm:p-8 rounded-t-3xl md:rounded-3xl shadow-[0_-6px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-6px_20px_rgba(0,0,0,0.2)]">
            <div className="text-center space-y-5 sm:space-y-6">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-[#F9FAFB]">SageMind</h1>
                <p className="mt-2 text-sm sm:text-md text-gray-800 dark:text-[#F9FAFB]">Where Wisdom Meets Wild Ideas</p>
              </div>
              
              <button
                onClick={handleSignInWithGoogle}
                className="w-full flex items-center justify-center bg-white hover:bg-gray-50 dark:bg-white dark:hover:bg-gray-50 text-gray-800 font-medium py-3 px-4 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 text-base sm:text-lg"
              >
                <Image src="/g-logo.png" alt="Google logo" width={24} height={24} className="mr-3" />
                <span>Continue with Google</span>
              </button>
              
              <button
                onClick={handleSkipLogin}
                className="w-full text-gray-800 dark:text-[#F9FAFB] hover:text-gray-800 dark:hover:text-[#F9FAFB] underline text-sm py-2 transition-colors"
              >
                Skip
              </button>

              <div className="pt-2 text-center text-xs text-gray-800 dark:text-[#F9FAFB]">
                  Experiment by <a href="https://x.com/siddhantpetkar" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-[#F9FAFB]">@sidpetkar</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div 
          className="fixed inset-0 bg-[rgba(0,0,0,0.4)] dark:bg-[rgba(0,0,0,0.6)] backdrop-blur-sm z-45 flex items-center justify-center p-4" // Reverted to original bg, kept z-45
          onClick={() => {
            setIsHistoryModalOpen(false);
          }}
        >
          <div 
            className="bg-white dark:bg-[#1E1E1E] shadow-xl p-4 sm:p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto flex flex-col history-modal"
            style={{ borderRadius: '28px' }}
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="flex justify-between items-center mb-4 flex-shrink-0 border-b border-gray-200 dark:border-[#2F2F2E] pb-3">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-[#F9FAFB] pl-2">History</h2>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-500 dark:text-[#C8C8C8] icon-button p-1.5">
                <X className="w-6 h-6" />
              </button>
            </div>
            {chatHistory.length === 0 ? (
              <p className="text-gray-600 dark:text-[#A6A6A6] text-center py-4">No chat history found.</p>
            ) : (
              <ul className="space-y-2 history-chat-list">
                {chatHistory.map((chatThread) => (
                  <li 
                    key={chatThread.id} 
                    onClick={() => handleLoadChatFromHistory(chatThread.id)}
                    className="p-3 bg-gray-50 dark:bg-[#292929] hover:bg-gray-200 dark:hover:bg-[#1E1E1E] rounded-md cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex-grow min-w-0"> 
                      <p className="font-medium text-gray-700 dark:text-[#F9FAFB] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate pr-2" title={chatThread.title || 'Untitled Chat'}>{chatThread.title || 'Untitled Chat'}</p>
                      <p className="text-xs text-gray-500 dark:text-[#A6A6A6]">
                        {formatChatTimestamp(chatThread.updatedAt || chatThread.createdAt)}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        handleDeleteChat(chatThread.id); 
                      }}
                      className="text-gray-400 dark:text-[#C8C8C8] hover:text-red-500 dark:hover:text-red-400 p-1.5 icon-button flex-shrink-0 ml-2"
                      title="Delete chat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Image Overlay - Centered with Blur Backdrop */} 
      {isImageOverlayOpen && overlayImageUrl && (
        <div 
          className="fixed inset-0 bg-[rgba(0,0,0,0.5)] dark:bg-[rgba(0,0,0,0.7)] backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity duration-300 ease-in-out"
          onClick={handleCloseImageOverlay} // Close on backdrop click
        >
          {/* Modal content area: container for the image and buttons */}
          <div 
            className="relative rounded-2xl shadow-xl bg-transparent overflow-hidden" // Simplified: no flex, image will dictate size up to max constraints
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the image/modal content itself
          >
            <img 
              src={overlayImageUrl} 
              alt="Preview" 
              className="block object-contain max-w-[calc(90vw-2rem)] max-h-[calc(90vh-2rem)] rounded-2xl" 
            />
            {/* Buttons container: top-right of the modal content area */}
            <div className="absolute top-2 right-2 flex gap-2 sm:top-3 sm:right-3 z-10">
              <button
                onClick={handleDownloadImage}
                className="aspect-square w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center p-2 bg-[rgba(0,0,0,0.6)] dark:bg-[rgba(20,20,20,0.7)] text-white icon-button"
                title="Download image"
                aria-label="Download image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button 
                onClick={handleCloseImageOverlay}
                className="aspect-square w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center p-2 bg-[rgba(0,0,0,0.6)] dark:bg-[rgba(20,20,20,0.7)] text-white icon-button"
                title="Close preview"
                aria-label="Close preview"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

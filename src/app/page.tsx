'use client';

import { useState, FormEvent, useRef, ChangeEvent, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// Import next/image
import Image from 'next/image'; 
// Import Lucide React icons
import { Paperclip, Mic, Square, X, Send, ArrowUp, History, Plus, Trash2, LogIn, LogOut, PlusCircle, MessageCirclePlus } from 'lucide-react';
// Import markdown extensions
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // Import a syntax highlighting theme

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

// Import image storage utilities
import { storeImageToFirebase, getImageFromStorage } from '../lib/imageStorage';

interface Message {
  role: 'user' | 'ai';
  content: string;
  audioUrl?: string; // Optional URL for audio playback
  fileType?: string; // Optional file type info
  fileName?: string; // Optional file name
  imageBase64Preview?: string; // For image previews in user messages (temporary, not for storage)
  imagePreviewStoragePath?: string; // Storage path for user images
  imageBase64?: string; // For AI-generated base64 images (FLUX) (temporary, not for storage)
  imageStoragePath?: string; // Storage path for AI-generated images
  imageUrl?: string; // For AI-generated images or image URLs
  webSearchQueries?: string[]; // For Google Search grounded queries
  renderedContent?: string; // For Google Search rendered suggestions
  sourceCitations?: string[]; // Array of source URLs for citations
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

export default function ChatPage() {
  const { currentUser, authLoading } = useAuth(); // Use the auth context

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
  const chatContainerRef = useRef<HTMLDivElement>(null); // Ref for the main chat container
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for the end of messages list

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
  const programmaticScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userScrollInactivityTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for user scroll inactivity

  // State for managing auto-scroll behavior
  const [isAutoScrollingPaused, setIsAutoScrollingPaused] = useState<boolean>(false);

  // --- Guest Mode State ---
  const [isGuestMode, setIsGuestMode] = useState<boolean>(false);

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
    // Fallback for chats that might somehow have no text messages but aren't 'New Chat' yet
    // Or if a title couldn't be generated from message content for some reason.
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
    { value: 'meta-llama/Llama-Vision-Free', label: 'Llama Vision' },
    { value: 'black-forest-labs/FLUX.1-schnell-Free', label: 'FLUX.1 [schnell]' },
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
    
    if (!inputValue.trim() && !selectedFile && !audioUrl && !uploadedFileInfo) {
      setError('Please enter a message or select a file.');
      return;
    }

    const activeChatId = await getOrCreateCurrentChatId();

    if (!activeChatId) {
      // Error would have been set by getOrCreateCurrentChatId
      // setIsLoading(false) should also be handled there.
      return;
    }

    // Now, activeChatId is guaranteed to be a valid Firestore document ID.
    // The currentChatId state should also be updated if it was a new chat.

    const userMessageContent = inputValue.trim();

    setIsLoading(true);
    setError(null);

    // Configure history to include images for vision models
    const historyToSend = messages.map(msg => {
      // For non-AI messages that include images and we're using a vision model
      const isVisionModel = selectedModel === 'gemini-2.0-flash' || selectedModel === 'meta-llama/Llama-Vision-Free';
      
      if (msg.role === 'user' && msg.imageBase64Preview && isVisionModel) {
        return {
          ...msg,
          // Keep imageBase64Preview in history for vision models
        };
      }
      // For all other messages, just send the standard content
      return {
        role: msg.role,
        content: msg.content
      };
    });

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

    setMessages((prevMessages) => {
      const updatedMessages = [...prevMessages, newUserMessage];
      // saveCurrentChat(updatedMessages); // Moved to useEffect for debouncing
      return updatedMessages;
    });
    setInputValue('');
    
    // --- Auto-scroll logic on new user message --- 
    setIsAutoScrollingPaused(false); // Resume auto-scrolling for new messages
    if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
    programmaticScrollTimeoutRef.current = setTimeout(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        programmaticScrollTimeoutRef.current = null; // Clear the ref after scroll
    }, 50); // Short delay to ensure new message is rendered
    // --- End auto-scroll logic ---

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
    setMessages((prevMessages) => {
      const updatedMessages = [...prevMessages, aiMessagePlaceholder];
      // saveCurrentChat(updatedMessages); // Moved to useEffect for debouncing
      return updatedMessages;
    });
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

      // Check if the selected model is FLUX image generation model
      if (selectedModel === 'black-forest-labs/FLUX.1-schnell-Free') {
        // For FLUX, the response is not streamed - it's a direct JSON response
        const payload = await response.json();
        
        if (payload.error) {
          throw new Error(payload.error.message || payload.error);
        }
        
        // Update the AI message with the generated image
        setMessages((prevMessages) => {
          const updatedMessages = [...prevMessages];
          if (updatedMessages[aiMessageIndex]) {
            updatedMessages[aiMessageIndex] = {
              role: 'ai',
              content: payload.text || `Image generated for: "${userMessageContent}"`,
              imageBase64: payload.imageBase64
            };
          }
          return updatedMessages;
        });
        
        setIsLoading(false);
        return; // Early return since we've handled the response
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
    'black-forest-labs/FLUX.1-schnell-Free': { hasAttachment: false, hasMic: false },
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

  // Effect for auto-scrolling to the bottom when messages change and auto-scroll is not paused
  useEffect(() => {
    if (!isAutoScrollingPaused && isLoading && messagesEndRef.current) {
      // If a scroll is already pending, clear it to avoid queuing multiple scrolls
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }

      // Set a new timeout. This ID will be stored in programmaticScrollTimeoutRef.current.
      // handleChatScroll will see this non-null ref and ignore the scroll events
      // caused by the scrollIntoView call.
      programmaticScrollTimeoutRef.current = setTimeout(() => {
        // Re-check conditions like isAutoScrollingPaused inside the timeout,
        // as state might have changed during the timeout delay.
        if (messagesEndRef.current && !isAutoScrollingPaused && isLoading) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        // After the scrollIntoView is initiated, we need to clear programmaticScrollTimeoutRef.current
        // so that subsequent USER scrolls are not ignored.
        // This should happen after a delay that is long enough for the 'smooth' scroll
        // animation to complete and its scroll events to be processed and ignored.
        const clearRefDelay = 200; // Adjusted delay for smooth scroll completion
        setTimeout(() => {
          programmaticScrollTimeoutRef.current = null;
        }, clearRefDelay);

      }, 50); // A small delay before initiating the scroll.

      // Cleanup function for the effect
      return () => {
        if (programmaticScrollTimeoutRef.current) {
          clearTimeout(programmaticScrollTimeoutRef.current);
          programmaticScrollTimeoutRef.current = null;
        }
      };
    }
  }, [messages, isLoading, isAutoScrollingPaused]);

  // Scroll handler for the chat container to detect user scrolls
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

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // If currentUser exists or in guest mode, render the main chat application
  // The login sheet will be rendered as an overlay if needed.
  return (
    // Outermost div for full-width background - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING
    <div className="w-full bg-gray-50 fixed inset-0 flex flex-col">
      {/* Inner wrapper to constrain and center content - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING */}
      <div className="max-w-3xl mx-auto flex flex-col h-full w-full">
        {/* Header - Solid Background, No Border - REMAINS flex-shrink: 0 implicitly */}
        <header 
          className="bg-gray-50 pt-3 pb-3 sm:pt-4 sm:pb-4 text-center z-10 flex-shrink-0 flex items-center justify-between px-4"
        >
          {/* Left side of header: Conditional based on auth state */} 
          {authLoading ? (
            <div className="w-1/3">{/* Placeholder for balance */}</div>
          ) : currentUser ? ( // Show New Chat ONLY for logged-in users
             <div className="w-1/3 flex justify-start">
                <button 
                  onClick={handleHeaderNewChat}
                  className="p-2 rounded-full hover:bg-gray-200 transition-colors" 
                  title="New Chat"
                  aria-label="New Chat"
                >
                  <MessageCirclePlus 
                    className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700" 
                    style={{ transform: 'scaleX(-1)' }} // Flipped horizontally
                  /> 
                </button>
             </div>
          ) : (
            <div className="w-1/3">{/* Placeholder if login sheet is up */}</div>
          )}

          {/* Center of header: Title */} 
          <div className="flex-grow text-center">
            {/* Always show SageMind title once auth is done loading */}
            <h1 className="text-lg sm:text-xl font-semibold text-gray-800">SageMind</h1>
          </div>

          {/* Right side of header: Auth/User actions */} 
          <div className="w-1/3 flex justify-end items-center gap-1 sm:gap-2">
            {authLoading ? (
              <div className="h-8">{/* Placeholder to maintain height */}</div>
            ) : currentUser ? (
              <>
                <button 
                  onClick={handleHeaderHistory}
                  className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                  title="Chat History"
                  aria-label="Chat History"
                >
                  <History className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700" />
                </button>
                <button 
                  onClick={handleSignOut}
                  className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                  title={`Sign Out (${currentUser.displayName || currentUser.email})`}
                  aria-label="Sign Out"
                >
                  <LogOut className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700" />
                </button>
              </>
            ) : isGuestMode ? (
              // Show Log In button for guests - clicking this should show the login drawer
              <button 
                onClick={() => setIsGuestMode(false)} // This will reveal the login bottom sheet
                className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                title="Sign In"
                aria-label="Sign In"
              >
                <LogIn className="w-5 h-5 sm:w-6 sm:w-6 text-gray-700" />
              </button>
            ) : (
              // Placeholder if login sheet is up (user is not logged in and not guest)
              <div className="h-8"></div>
            )}
          </div>
        </header>

        {/* Main content - Relative positioning for overlay - MODIFIED FOR NATIVE-LIKE VIEWPORT HANDLING */}
        <main 
          ref={chatContainerRef} // Assign ref to the main chat container
          className="relative flex-grow overflow-y-auto min-h-0 chat-container"
          style={{ overflowX: 'hidden', overscrollBehaviorY: 'contain' }}
          onMouseMove={handleMouseMove}
          onScroll={handleChatScroll} // Add scroll event listener
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
                            <div className="my-6 overflow-x-auto rounded-2xl border border-gray-300">
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
                      
                      {msg.imageBase64 && (
                        <div className="mt-2">
                          <img
                            src={`data:image/jpeg;base64,${msg.imageBase64}`}
                            alt="Generated by AI"
                            className="max-w-full md:max-w-md h-auto rounded-2xl cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handleOpenImageOverlay(`data:image/jpeg;base64,${msg.imageBase64}`)}
                          />
                        </div>
                      )}
                      
                      {msg.imageUrl && !msg.imageBase64 && (
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
            {/* Empty div at the end of messages to scroll to */}
            <div ref={messagesEndRef} style={{ height: '1px' }} />
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
                      className="absolute left-0 bottom-full mb-1 w-full bg-gray-100 border border-gray-300 shadow-sm z-20 overflow-hidden model-dropdown visible"
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
                    className="p-2 bg-transparent text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center aspect-square cursor-pointer"
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

      {/* Login Bottom Sheet Overlay - Rendered on top of the main app if needed */}
      {!currentUser && !isGuestMode && (
        // Outermost container for backdrop blur and bottom alignment
        // On md screens and up, justify-center to vertically center the sheet
        <div className="fixed inset-0 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm z-40 flex flex-col justify-end md:justify-center items-center">
          {/* Bottom Sheet Drawer */}
          {/* On md screens and up, use rounded-3xl for all-around corners */}
          <div className="bg-gray-50 w-full max-w-md p-6 sm:p-8 rounded-t-3xl md:rounded-3xl shadow-[0_-6px_20px_rgba(0,0,0,0.08)]">
            <div className="text-center space-y-5 sm:space-y-6">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">SageMind</h1>
                <p className="mt-2 text-sm sm:text-md text-gray-600">Where Wisdom Meets Wild Ideas</p>
              </div>
              
              <button
                onClick={handleSignInWithGoogle}
                className="w-full flex items-center justify-center bg-white text-gray-700 font-medium py-3 px-4 border border-gray-300 rounded-full shadow-sm hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 text-base sm:text-lg"
              >
                <Image src="/g-logo.png" alt="Google logo" width={24} height={24} className="mr-3" />
                Continue with Google
              </button>
              
              <button
                onClick={handleSkipLogin}
                className="w-full text-gray-600 hover:text-gray-800 underline text-sm py-2 transition-colors"
              >
                Skip
              </button>

              <div className="pt-2 text-center text-xs text-gray-500">
                  Experiment by <a href="https://x.com/siddhantpetkar" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700">@sidpetkar</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div 
          className="fixed inset-0 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm z-45 flex items-center justify-center p-4" // Reverted to original bg, kept z-45
          onClick={() => {
            setIsHistoryModalOpen(false);
          }}
        >
          <div 
            className="bg-white shadow-xl p-4 sm:p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto flex flex-col history-modal"
            style={{ borderRadius: '28px' }}
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-800 pl-2">History</h2>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            {chatHistory.length === 0 ? (
              <p className="text-gray-600 text-center py-4">No chat history found.</p>
            ) : (
              <ul className="space-y-2 history-chat-list">
                {chatHistory.map((chatThread) => (
                  <li 
                    key={chatThread.id} 
                    onClick={() => handleLoadChatFromHistory(chatThread.id)}
                    className="p-3 bg-gray-50 hover:bg-gray-100 rounded-md cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex-grow min-w-0"> 
                      <p className="font-medium text-gray-700 group-hover:text-blue-600 transition-colors truncate pr-2" title={chatThread.title || 'Untitled Chat'}>{chatThread.title || 'Untitled Chat'}</p>
                      <p className="text-xs text-gray-500">
                        {formatChatTimestamp(chatThread.updatedAt || chatThread.createdAt)}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        handleDeleteChat(chatThread.id); 
                      }}
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-100 transition-colors flex-shrink-0 ml-2"
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
          className="fixed inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity duration-300 ease-in-out"
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
              className="block object-contain max-w-[calc(90vw-2rem)] max-h-[calc(90vh-2rem)] rounded-2xl" // Image controls its size, rounded to match parent, adjusted max size for padding of overlay
            />
            {/* Buttons container: top-right of the modal content area */}
            <div className="absolute top-2 right-2 flex gap-2 sm:top-3 sm:right-3 z-10">
              <button
                onClick={handleDownloadImage}
                className="aspect-square w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center p-2 bg-[rgba(0,0,0,0.6)] text-white rounded-full hover:bg-[rgba(0,0,0,0.8)] transition-colors"
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
                className="aspect-square w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center p-2 bg-[rgba(0,0,0,0.6)] text-white rounded-full hover:bg-[rgba(0,0,0,0.8)] transition-colors"
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

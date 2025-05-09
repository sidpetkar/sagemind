import { LlmService, ChatMessage, FileData, FileUri } from "./interface";

// Access API key as an environment variable
const apiKey = process.env.PERPLEXITY_API_KEY;

// Define available models
const MODELS = {
  "sonar": {
    model: "sonar",
    maxOutputTokens: 4096,
  },
  "sonar-pro": {
    model: "sonar-pro",
    maxOutputTokens: 8192,
  }
};

// Default model name
const DEFAULT_MODEL_NAME = "sonar";

// Better system instruction for Perplexity
const SYSTEM_INSTRUCTION = `You are SageMind, a knowledgeable and helpful AI assistant that provides accurate, well-structured and thoughtful responses to user queries. 

When answering research questions:
1. Provide well-organized, factual information
2. Use markdown formatting for better readability (headings, lists, etc.)
3. Include relevant citations to support your answers

Your tone should be:
- Clear and direct
- Professionally conversational
- Helpful and educational`;

export class PerplexityService implements LlmService {
  async generateResponse(
    message: string, 
    history: ChatMessage[] = [], 
    fileData?: FileData, 
    fileUri?: FileUri,
    modelName: string = DEFAULT_MODEL_NAME 
  ): Promise<AsyncIterable<{ text?: string; webSearchQueries?: string[]; renderedContent?: string }>> {
    // Get the selected model configuration
    const selectedModelConfig = MODELS[modelName as keyof typeof MODELS] || MODELS[DEFAULT_MODEL_NAME];
    
    if (!apiKey) {
      throw new Error("PERPLEXITY_API_KEY environment variable not set.");
    }

    // Format messages for Perplexity API (which follows OpenAI format)
    const messages = [
      { role: "system", content: SYSTEM_INSTRUCTION },
      // Convert history to the expected format
      ...history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.content
      })),
      // Add the current message
      { role: "user", content: message }
    ];

    // Prepare the options for streaming
    try {
      // Return an async generator that yields text chunks
      return (async function*() {
        try {
          // Helper function to format sources display HTML
          function formatSourcesDisplay(sources: string[]): string {
            return `<div class="p-3 bg-gray-50 rounded-md mt-2 border border-gray-200">
              <p class="text-sm font-semibold mb-2">Sources:</p>
              <ul class="list-disc pl-5 space-y-1">
                ${sources.map((url) => {
                  // Try to clean up the URL display
                  let displayUrl = url;
                  try {
                    const urlObj = new URL(url);
                    displayUrl = urlObj.hostname + urlObj.pathname.replace(/\/$/, '');
                    if (displayUrl.length > 50) {
                      displayUrl = displayUrl.substring(0, 47) + '...';
                    }
                  } catch (e) {
                    // If URL parsing fails, fall back to the original
                  }
                  
                  return `<li class="text-sm">
                    <a href="${url}" target="_blank" rel="noopener noreferrer" 
                       class="text-blue-600 hover:underline break-words">
                      ${displayUrl}
                    </a>
                  </li>`;
                }).join('')}
              </ul>
            </div>`;
          }
          
          // Helper function to extract and yield sources from text
          async function* extractAndYieldSources(text: string) {
            const urlRegex = /(https?:\/\/[^\s\]\)]+)/g;
            const urls = text.match(urlRegex);
            
            if (urls && urls.length > 0) {
              const uniqueUrls = [...new Set(urls)]; // Remove duplicates
              const formattedSources = formatSourcesDisplay(uniqueUrls);
              
              yield { 
                webSearchQueries: [`Sources (${uniqueUrls.length})`],
                renderedContent: formattedSources
              };
            }
          }

          // Make the initial request to the Perplexity API
          const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: selectedModelConfig.model,
              messages: messages,
              stream: true  // Enable streaming
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
          }

          if (!response.body) {
            throw new Error("Response body is missing");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
          // Process the streaming response
          let accumulatedText = '';
          let done = false;
          let citations: string[] = [];
          let completionId: string | null = null;

          while (!done) {
            const { value, done: isDone } = await reader.read();
            done = isDone;

            if (done) break;

            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });
            
            // Process each line (event) in the chunk
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              // SSE format: lines starting with "data: "
              if (line.startsWith('data: ')) {
                const data = line.substring(6);
                
                // Check for the stream end marker
                if (data === '[DONE]') {
                  break;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  
                  if (content) {
                    accumulatedText += content;
                    yield { text: content };
                  }
                  
                  // Capture the completion ID for later use to get citations
                  if (!completionId && parsed.id) {
                    completionId = parsed.id;
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }

          // After streaming is done, make a request to get full response data including citations
          if (completionId) {
            try {
              // Use completionId to fetch the full response with citations
              const citationsResponse = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                  model: selectedModelConfig.model,
                  messages: messages
                })
              });
              
              if (citationsResponse.ok) {
                const fullData = await citationsResponse.json();
                
                // Extract citations if available
                if (fullData.citations && Array.isArray(fullData.citations)) {
                  citations = fullData.citations.filter((c: any) => typeof c === 'string');
                } else {
                  // Fallback to regex extraction if structured citations aren't available
                  const urlRegex = /(https?:\/\/[^\s\]\)]+)/g;
                  const matches = accumulatedText.match(urlRegex);
                  if (matches) {
                    citations = [...new Set(matches)]; // Remove duplicates
                  }
                }
                
                // Extract any markdown [1], [2] style references
                const markdownCitationRegex = /\[\d+\]/g;
                const hasCitationReferences = markdownCitationRegex.test(accumulatedText);
                
                // Only show sources UI if we have citations
                if (citations.length > 0) {
                  const formattedSources = formatSourcesDisplay(citations);
                  
                  // The label will vary based on whether the response has citation markers
                  const sourcesLabel = hasCitationReferences ? 
                    "View Sources" : 
                    `Sources (${citations.length})`;
                  
                  yield { 
                    webSearchQueries: [sourcesLabel],
                    renderedContent: formattedSources
                  };
                }
              }
            } catch (citationError) {
              console.error("Error fetching citations:", citationError);
              // Fall back to regex extraction
              for await (const chunk of extractAndYieldSources(accumulatedText)) {
                yield chunk;
              }
            }
          } else {
            // Fall back to regex extraction if no completion ID
            for await (const chunk of extractAndYieldSources(accumulatedText)) {
              yield chunk;
            }
          }
        } catch (error) {
          console.error("Error streaming from Perplexity API:", error);
          yield { text: `\n\n[Error: ${error instanceof Error ? error.message : 'Unknown error'}]` };
        }
      })();
    } catch (error: unknown) {
      console.error("Error initiating Perplexity API request:", error);
      if (error instanceof Error) {
        throw new Error(`Failed to initiate Perplexity API request: ${error.message}`);
      } else {
        throw new Error(`An unexpected error occurred with Perplexity API: ${String(error)}`);
      }
    }
  }
} 
import { ChatMessage, FileData, FileUri, LlmService } from "./interface";

export class OpenRouterService implements LlmService {
  private apiKey: string | undefined;
  private siteUrl: string = "https://sagemind-chat.vercel.app";
  private siteName: string = "SageMind";

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    
    if (!this.apiKey) {
      console.warn("OPENROUTER_API_KEY is not set. OpenRouter models will not be available.");
    }
  }

  async generateResponse(
    message: string,
    history: ChatMessage[] = [], 
    fileData?: FileData,
    fileUri?: FileUri,
    modelName?: string
  ): Promise<AsyncIterable<{ text?: string; webSearchQueries?: string[]; renderedContent?: string; }>> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is not configured");
    }

    if (!modelName) {
      throw new Error("Model name is required for OpenRouter");
    }

    // Return an async iterable
    return this.generateResponseStream(message, history, fileData, fileUri, modelName);
  }

  private async *generateResponseStream(
    message: string,
    history: ChatMessage[] = [], 
    fileData?: FileData,
    fileUri?: FileUri,
    modelId?: string
  ): AsyncGenerator<{ text?: string; webSearchQueries?: string[]; renderedContent?: string; }> {
    if (!this.apiKey || !modelId) {
      throw new Error("OpenRouter API key or model ID is missing");
    }

    // Process message history to OpenRouter format
    const messages = [...history.map(msg => ({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content
    }))];
    
    // Add current message with image if applicable
    // Check if this is the Qwen vision model
    const isVisionModel = modelId === "qwen/qwen2.5-vl-72b-instruct:free";
    const isPhiReasoningModel = modelId === "microsoft/phi-4-reasoning-plus:free";

    if (isVisionModel && fileData && fileData.mimeType.startsWith('image/')) {
      // For Qwen vision model with image, format message with image content
      messages.push({
        role: "user",
        // Need to use 'any' type here to handle the complex content structure for vision models
        content: [
          {
            type: "text",
            text: message
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${fileData.mimeType};base64,${fileData.base64String}`
            }
          }
        ] as any // Cast to any to resolve type mismatch
      });
    } else {
      // For text-only models, just add the text message
      messages.push({
        role: "user",
        content: message
      });
    }

    // For Phi Reasoning model, add a system message to encourage more direct responses
    if (isPhiReasoningModel) {
      messages.unshift({
        role: "system",
        content: `You are a helpful AI assistant that provides BRIEF, DIRECT answers. Important instructions:
1. NEVER show your reasoning process - only show final answers
2. Keep responses short and to the point - no more than 2-3 paragraphs
3. Do not use phrases like "I'll think" or "Let me reason" or "step by step"
4. Do not write "Final answer:" - just give the answer directly
5. If you need to create a list, keep it concise
6. Answer questions directly without unnecessary elaboration`
      });
    }

    // Log the prepared request for debugging
    console.log(`Sending to OpenRouter (${modelId}):`, 
      JSON.stringify({
        messageCount: messages.length,
        lastMessageType: typeof messages[messages.length - 1].content
      }, null, 2)
    );

    // For Phi Reasoning model, we'll do some special handling - defining these variables at method level
    // to ensure they're available throughout the method
    let fullResponseText = '';
    let inThinkingMode = false;
    let finalAnswerFound = false;
    let bufferedThinkingText = ''; // Buffer to hold thinking text until we decide whether to show it

    try {
      // Configure fetch options for OpenRouter
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": this.siteUrl,
          "X-Title": this.siteName,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          stream: true,
          // For Phi Reasoning model, add parameters to help control output
          ...(isPhiReasoningModel && {
            temperature: 0.5,          // Lower temperature for more predictable, concise responses
            max_tokens: 1024,          // Reduced to encourage briefer responses
            frequency_penalty: 0.7,    // Higher to strongly discourage repetition
            presence_penalty: 0.7,     // Higher to strongly discourage repetition
            stop: [
              "I'll now provide", 
              "Let me think", 
              "Let's think",
              "I'll think", 
              "In conclusion",
              "To solve this",
              "Let me break down",
              "Step 1:",
              "First, I'll"
            ] // Expanded stop sequences to catch more thinking patterns
          })
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Response body is missing");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      let lastChunkTime = Date.now();
      const TIMEOUT_MS = 30000; // 30 second timeout for inactive stream

      mainLoop: while (true) {
        // Check for timeout between chunks
        if (Date.now() - lastChunkTime > TIMEOUT_MS) {
          console.warn(`OpenRouter stream timeout for ${modelId} after ${TIMEOUT_MS}ms of inactivity`);
          if (isPhiReasoningModel && fullResponseText.length > 0) {
            yield { text: "\n\n(Response was incomplete - timed out)" };
          }
          // No special buffer processing here; it will be handled after the loop
          break mainLoop;
        }

        const { value, done } = await reader.read();
        if (done) {
          console.log(`OpenRouter stream for ${modelId} completed normally`);
          // No special buffer processing here; it will be handled after the loop
          break mainLoop;
        }

        // Reset timeout timer on new data
        lastChunkTime = Date.now();

        // Decode the chunk and add it to our buffer
        buffer += decoder.decode(value, { stream: true });

        // Process lines in the buffer
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line for the next iteration
        buffer = lines.pop() || '';

        for (const line of lines) {
          // Skip empty lines
          if (!line.trim() || line.trim() === 'data: [DONE]') continue;

          // Remove the "data: " prefix if it exists
          const jsonString = line.startsWith('data: ') ? line.slice(6) : line;

          try {
            // Attempt to parse the JSON string
            const json = JSON.parse(jsonString);
            const content = json.choices?.[0]?.delta?.content;
            
            if (content) {
              if (isPhiReasoningModel) {
                fullResponseText += content;
                
                // Check for thinking patterns
                const thinkingPatterns = [
                  "I'll think", "Let me think", "I need to", "step by step", 
                  "let's break this down", "First, I'll", "To solve this",
                  "Let me reason", "I'll solve this", "Let me analyze",
                  "I'll approach this"
                ];
                
                const isFinalAnswer = 
                  content.includes("final answer") || 
                  content.includes("Final answer") ||
                  content.includes("my answer is") ||
                  content.includes("My answer is") ||
                  content.includes("the answer is") ||
                  content.includes("The answer is") ||
                  content.includes("In conclusion");
                    
                const hasThinkingPattern = thinkingPatterns.some(pattern => 
                  content.includes(pattern)
                );
                
                if (hasThinkingPattern) {
                  inThinkingMode = true;
                  // Instead of yielding, we buffer thinking text
                  bufferedThinkingText += content;
                  continue; // Skip yielding this chunk
                } else if (inThinkingMode && !isFinalAnswer) {
                  // Still in thinking mode, buffer but don't output
                  bufferedThinkingText += content;
                  continue;
                } else if (isFinalAnswer) {
                  // We found the final answer, exit thinking mode
                  finalAnswerFound = true;
                  inThinkingMode = false;
                  
                  // Clean up the final answer text to remove thinking phrases
                  let cleanedContent = content.replace(/final answer:?|my answer is:?|the answer is:?/i, '').trim();
                  
                  // Add any buffered thinking that might include useful information
                  if (bufferedThinkingText) {
                    // Extract just the final result from thinking if possible
                    const lastSentences = bufferedThinkingText.split(/[.!?]\s+/).slice(-2).join('. ');
                    if (lastSentences && !cleanedContent) {
                      cleanedContent = lastSentences + (cleanedContent ? ' ' + cleanedContent : '');
                    }
                    bufferedThinkingText = ''; // Clear buffer
                  }
                  
                  // Yield the clean content
                  if (cleanedContent) {
                    yield { text: cleanedContent };
                  }
                } else {
                  // Normal non-thinking content
                  yield { text: content };
                }
              } else {
                // For other models like Qwen, yield directly
                yield { text: content };
              }
            }
          } catch (error) {
            let errorMessage = "Unknown parsing error";
            if (error instanceof Error) {
              errorMessage = error.message;
            }
            // If parsing fails, it might be a non-JSON line (e.g., status message)
            console.warn(`Skipping non-JSON line from OpenRouter stream: "${jsonString}", Error: ${errorMessage}`);
            continue; // Skip this line and proceed to the next
          }
        }
      } // End of mainLoop

      // After the loop (handles both 'done' and 'timeout' exits)
      // Process any remaining data in the buffer
      if (buffer.trim()) {
        const finalBufferedLine = buffer.trim();
        // Skip empty lines or [DONE] signal if it's the only thing left
        if (finalBufferedLine && finalBufferedLine !== 'data: [DONE]') {
          const jsonString = finalBufferedLine.startsWith('data: ') ? finalBufferedLine.slice(6) : finalBufferedLine;
          try {
            const json = JSON.parse(jsonString);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              if (isPhiReasoningModel) {
                fullResponseText += content; // Add to fullResponseText for Phi logging/state
                yield { text: content };   // Yield the raw content
              } else { // For other models like Qwen
                yield { text: content };
              }
            }
          } catch (error) {
            let errorMessage = "Unknown parsing error";
            if (error instanceof Error) {
              errorMessage = error.message;
            }
            console.warn(`Skipping non-JSON final buffer content (after loop) from OpenRouter stream: "${jsonString}", Error: ${errorMessage}`);
          }
        }
      }
      // buffer = ''; // Clear buffer - good practice, though not strictly necessary if function ends

      // At the end of a complete response with no timeout
      // For Phi model, if we detected thinking patterns but no final answer,
      // add a note to indicate the response is complete
      if (isPhiReasoningModel) {
        if (inThinkingMode && !finalAnswerFound) {
          yield { text: "\n\n(Response complete)" };
        }
        console.log(`Phi-4 response stats: length=${fullResponseText.length}, thinking=${inThinkingMode}, foundFinalAnswer=${finalAnswerFound}`);
      }
    } catch (error) {
      console.error(`Error calling OpenRouter (${modelId}):`, error);
      if (isPhiReasoningModel && fullResponseText.length > 0) {
        // If we have partial content but hit an error, add a note
        yield { text: `\n\n(Error occurred during response: ${error instanceof Error ? error.message : 'Unknown error'})`};
      } else {
        yield { text: `Error: ${error instanceof Error ? error.message : 'Unknown error with OpenRouter API'}` };
      }
    }
  }
} 
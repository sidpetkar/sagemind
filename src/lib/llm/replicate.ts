import Replicate from "replicate";
import { LlmService, ChatMessage, FileData, FileUri, Prediction } from "./interface";

// Access your API key as an environment variable
const apiKey = process.env.REPLICATE_API_TOKEN;

if (!apiKey) {
  // It's better to throw an error or handle this case appropriately
  // rather than letting the Replicate client fail internally later.
  console.warn("REPLICATE_API_TOKEN environment variable not set. Replicate models may not be available.");
}

const replicate = new Replicate({
  auth: apiKey,
});

// Remove hardcoded model IDs with versions, we will let Replicate use the latest version.

interface ReplicateOutput {
  image?: string;
  text?: string;
}

function determineUserIntent(
  message: string,
  fileData?: FileData,
  fileUri?: FileUri,
  history?: ChatMessage[]
): { task: "text-to-image" | "image-editing" | "image-understanding", image?: FileData | FileUri } {
  const lowerCaseMessage = message.toLowerCase();
  const hasImageFile = fileData || fileUri;

  // Keywords for editing
  const editingKeywords = ["edit", "change", "modify", "add", "remove", "replace", "make it", "turn it into"];
  // Keywords for understanding/describing
  const understandingKeywords = ["what is", "describe", "explain", "tell me about", "can you see"];

  if (hasImageFile) {
    if (editingKeywords.some(keyword => lowerCaseMessage.includes(keyword))) {
      return { task: "image-editing", image: fileData || fileUri };
    }
    if (understandingKeywords.some(keyword => lowerCaseMessage.includes(keyword)) || lowerCaseMessage.endsWith("?")) {
        return { task: "image-understanding", image: fileData || fileUri };
    }
    // If an image is provided with a prompt that isn't clearly a question, assume it's an edit request.
    return { task: "image-editing", image: fileData || fileUri };
  } else {
    // No image file provided, check history for iterative editing
    const lastBotMessage = history?.filter(m => m.role === 'assistant' || m.role === 'model').pop();
    if (lastBotMessage?.imageBase64) {
      // We have a previous image, let's check the prompt's intent.
      if (understandingKeywords.some(keyword => lowerCaseMessage.includes(keyword)) || lowerCaseMessage.endsWith("?")) {
        return { task: "image-understanding", image: { mimeType: 'image/webp', base64String: lastBotMessage.imageBase64 } };
      }
      // If the prompt isn't a question/description request, assume it's an edit.
      return { task: "image-editing", image: { mimeType: 'image/webp', base64String: lastBotMessage.imageBase64 } };
    }
    // Otherwise, it's a standard text-to-image request.
    return { task: "text-to-image" };
  }
}

export class ReplicateService implements LlmService {
  async generateResponse(
    message: string, // This will be the prompt
    history: ChatMessage[] = [], // History might be used for context in some tasks, TBD based on Bagel's specifics
    fileData?: FileData,    // Input image for editing or understanding
    fileUri?: FileUri,      // Alternative for input image
    modelName?: string
  ): Promise<AsyncIterable<{ text?: string; imageBase64?: string; webSearchQueries?: string[]; renderedContent?: string; imageMimeType?: string; sourceCitations?: string[]; youtubeVideos?: any[] }>> {
    if (!apiKey) {
      return (async function*() {
        yield { text: "[Error: REPLICATE_API_TOKEN is not set. Replicate models are unavailable.]" };
      })();
    }

    let targetModelApiName: string; // The name to be sent to the Replicate API
    const input: any = {
      prompt: message,
    };

    if (modelName === 'bytedance/bagel') {
        targetModelApiName = 'bytedance/bagel:7dd8def79e503990740db4704fa81af995d440fefe714958531d7044d2757c9c';
        // Bagel-specific inputs
        Object.assign(input, {
            cfg_img_scale: 1,
            cfg_text_scale: 4,
            output_format: "webp",
            output_quality: 90,
            enable_thinking: true,
            cfg_renorm_min: 1,
            timestep_shift: 3,
            cfg_renorm_type: "global",
            num_inference_steps: 50,
        });

        const { task, image } = determineUserIntent(message, fileData, fileUri, history);
        input.task = task;

        if (task === "image-editing" || task === "image-understanding") {
            if (!image) {
                return (async function*() {
                    yield { text: "[Error: An image is required for this task, but none was found in the upload or history.]" };
                })();
            }
            
            if (image && 'uri' in image && image.uri) {
                input.image = image.uri;
                console.log(`Replicate Service (Bagel): Adding image URI ${image.uri} for task: ${task}`);
            } else if (image && 'base64String' in image && image.base64String) {
                input.image = `data:${image.mimeType};base64,${image.base64String}`;
                console.log(`Replicate Service (Bagel): Adding inline image for task: ${task}`);
            } else {
                console.error("Replicate Service (Bagel): Image file provided but not a valid image type or URI.");
                return (async function*() {
                    yield { text: "[Error: Invalid image file provided for editing/understanding.]" };
                  })();
            }
        } else {
            console.log(`Replicate Service (Bagel): Task set to text-to-image`);
        }
    } else if (modelName === 'black-forest-labs/flux-kontext-pro') {
        targetModelApiName = 'black-forest-labs/flux-kontext-pro'; // Use model name without version hash
        // FLUX Kontext Pro can do both editing (if image provided) and generation (if not).
        const imageSource = fileData || fileUri;
        if (imageSource) {
            if ('uri' in imageSource && imageSource.uri) {
                input.input_image = imageSource.uri;
            } else if ('base64String' in imageSource && imageSource.base64String) {
                input.input_image = `data:${imageSource.mimeType};base64,${imageSource.base64String}`;
            }
            // This parameter is only relevant for editing
            input.prompt_strength = 5;
        }
        // FLUX specific params
        input.output_format = 'jpg';
        input.output_quality = 90;

    } else {
        return (async function*() {
            yield { text: `[Error: Model ${modelName} is not supported by the ReplicateService.]` };
        })();
    }

    // History handling - Bagel might not directly use chat history in the same way as conversational LLMs.
    // For iterative editing, the state (previous image) is managed by passing the output image as input for the next turn.
    // The current LlmService interface might need adjustment or a different flow for true conversational image editing.
    if (history && history.length > 0) {
        console.log("Replicate Service (Bagel): History provided but Bagel model handles iterative edits by re-passing images. Standard chat history may not apply directly.");
        // If the last message from the assistant was an image, and the current task is editing, 
        // we might want to use that image as the input for the current edit.
        // This requires a more complex state management than currently implemented here.
    }

    console.log(`Replicate Service: Sending request to model ${modelName}. Input keys: ${Object.keys(input).join(', ')}`);

    try {
      // Don't wait for the prediction to complete on the server.
      // Start it and immediately return the prediction object to the client.
      const createPayload: any = { input };
      if (modelName === 'bytedance/bagel') {
        // For Bagel, we must use the specific version hash to create a prediction.
        // The model identifier string with the hash causes a 404.
        createPayload.version = '7dd8def79e503990740db4704fa81af995d440fefe714958531d7044d2757c9c';
      } else {
        // For other models, we can use the model name.
        createPayload.model = targetModelApiName;
      }

      const prediction = await replicate.predictions.create(createPayload);

      // The client will use this to poll for the result.
      return (async function*() {
        yield { 
          text: "Your image is being generated...", 
          prediction: prediction as Prediction 
        };
      })();

    } catch (error: any) {
      console.error(`Replicate Service: Error calling model ${targetModelApiName}:`, error);
      let errorMessage = "Unknown error calling Replicate model.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return (async function*() {
        yield { text: `[Error: ${errorMessage}]` };
      })();
    }
  }
} 
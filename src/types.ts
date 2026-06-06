/**
 * MiMo MCP Server Type Definitions
 */

export interface MiMoConfig {
  apiKey: string;
  apiUrl?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "image_url" | "input_audio" | "video_url";
  text?: string;
  image_url?: {
    url: string;
  };
  input_audio?: {
    data: string;
  };
  video_url?: {
    url: string;
  };
  fps?: number;
  media_resolution?: "default" | "max";
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_completion_tokens?: number;
  stream?: boolean;
  audio?: {
    format: string;
    voice?: string;
    optimize_text_preview?: boolean;
  };
  asr_options?: {
    language: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
      audio?: {
        data: string;
      };
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type InputType = "url" | "base64";
export type MediaType = "image" | "audio" | "video";

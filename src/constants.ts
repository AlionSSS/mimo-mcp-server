/**
 * MiMo MCP Server Constants
 */



// Base URL for OpenAI-compatible API
// export const MIMO_API_URL = "https://api.xiaomimimo.com/v1/chat/completions";
// export const MIMO_PLAN_URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions";

// Default API endpoint
export const MIMO_API_URL = process.env.MIMO_API_URL || "https://token-plan-cn.xiaomimimo.com/v1/chat/completions";

// System message for MiMo
export const SYSTEM_MESSAGE = "You are MiMo, an AI assistant developed by Xiaomi.";

// Model IDs (可从环境变量自定义)
export const MODELS = {
  MULTIMODAL: process.env.MIMO_MODEL_MULTIMODAL || "mimo-v2.5",
  ASR: process.env.MIMO_MODEL_ASR || "mimo-v2.5-asr",
  TTS: process.env.MIMO_MODEL_TTS || "mimo-v2.5-tts",
  TTS_VOICE_DESIGN: process.env.MIMO_MODEL_TTS_VOICE_DESIGN || "mimo-v2.5-tts-voicedesign",
  TTS_VOICE_CLONE: process.env.MIMO_MODEL_TTS_VOICE_CLONE || "mimo-v2.5-tts-voiceclone",
} as const;

// Supported TTS voices
export const TTS_VOICES = [
  { id: "mimo_default", name: "MiMo-默认", language: "中文/英文" },
  { id: "冰糖", name: "冰糖", language: "中文", gender: "女性" },
  { id: "茉莉", name: "茉莉", language: "中文", gender: "女性" },
  { id: "苏打", name: "苏打", language: "中文", gender: "男性" },
  { id: "白桦", name: "白桦", language: "中文", gender: "男性" },
  { id: "Mia", name: "Mia", language: "英文", gender: "女性" },
  { id: "Chloe", name: "Chloe", language: "英文", gender: "女性" },
  { id: "Milo", name: "Milo", language: "英文", gender: "男性" },
  { id: "Dean", name: "Dean", language: "英文", gender: "男性" },
] as const;

// Supported ASR languages
export const ASR_LANGUAGES = ["auto", "zh", "en"] as const;

// Supported audio formats
export const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

// Supported image formats
export const IMAGE_MIME_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

// Supported video formats
export const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
};

// TTS audio formats
export const TTS_AUDIO_FORMATS = ["wav", "mp3", "pcm16"] as const;

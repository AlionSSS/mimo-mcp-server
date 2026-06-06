#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/services/mimo-client.ts
import axios from "axios";

// src/constants.ts
var MIMO_API_URL = process.env.MIMO_API_URL || "https://token-plan-cn.xiaomimimo.com/v1/chat/completions";
var SYSTEM_MESSAGE = "You are MiMo, an AI assistant developed by Xiaomi.";
var MODELS = {
  MULTIMODAL: process.env.MIMO_MODEL_MULTIMODAL || "mimo-v2.5",
  ASR: process.env.MIMO_MODEL_ASR || "mimo-v2.5-asr",
  TTS: process.env.MIMO_MODEL_TTS || "mimo-v2.5-tts",
  TTS_VOICE_DESIGN: process.env.MIMO_MODEL_TTS_VOICE_DESIGN || "mimo-v2.5-tts-voicedesign",
  TTS_VOICE_CLONE: process.env.MIMO_MODEL_TTS_VOICE_CLONE || "mimo-v2.5-tts-voiceclone"
};
var AUDIO_MIME_TYPES = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
  ogg: "audio/ogg"
};
var IMAGE_MIME_TYPES = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp"
};
var VIDEO_MIME_TYPES = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv"
};

// src/services/mimo-client.ts
var MiMoClient = class {
  apiKey;
  httpClient;
  constructor(config) {
    this.apiKey = config.apiKey;
    this.httpClient = axios.create({
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json"
      },
      timeout: 3e5
      // 5 minutes timeout for large media
    });
  }
  async chatCompletion(request) {
    try {
      const response = await this.httpClient.post(
        MIMO_API_URL,
        request
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data;
          const message = data?.error?.message || data?.message || "Unknown error";
          throw new Error(`MiMo API error (${status}): ${message}`);
        } else if (error.code === "ECONNABORTED") {
          throw new Error("MiMo API request timed out. The media file may be too large.");
        }
        throw new Error(`MiMo API request failed: ${error.message}`);
      }
      throw error;
    }
  }
  async chatCompletionWithReasoning(request) {
    const response = await this.chatCompletion(request);
    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error("No response from MiMo API");
    }
    return {
      content: message.content || "",
      reasoning: message.reasoning_content
    };
  }
  async chatCompletionWithAudio(request) {
    const response = await this.chatCompletion(request);
    const message = response.choices[0]?.message;
    if (!message?.audio?.data) {
      throw new Error("No audio data in MiMo API response");
    }
    return {
      audioData: message.audio.data
    };
  }
};

// src/tools/image-understanding.ts
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";
import { URL } from "url";
var ImageInputSchema = z.object({
  images: z.array(z.string()).min(1).describe(
    "Images to analyze. Each image can be:\n- A publicly accessible URL (e.g., 'https://example.com/image.png')\n- Base64-encoded image data with MIME prefix (e.g., 'data:image/png;base64,iVBOR...')\n- A local file path (e.g., 'C:\\Users\\user\\image.png' or '/path/to/image.jpg'). Recommend.\n- A localhost URL (e.g., 'http://localhost/image.png' or 'http://127.0.0.1/image.png')"
  ),
  question: z.string().default("Please describe the content of this image").describe(
    "Question or instruction about the image. Examples:\n- 'What objects are in this image?'\n- 'Describe the scene in detail'\n- 'What text is shown in the image?'\n- 'What are the connections and differences between these images?'"
  ),
  max_tokens: z.number().int().min(1).max(4096).default(1024).describe(
    "Maximum number of tokens in the response (1-4096, default: 1024)"
  )
});
function registerImageUnderstandingTool(server, client) {
  server.registerTool(
    "understand_image",
    {
      title: "Understand Image",
      description: `Analyze and understand image content using MiMo vision model.

Use this tool when you need to:
- Describe what's in an image
- Answer questions about image content
- Extract text from images (OCR)
- Identify objects, scenes, or people in images
- Analyze charts, diagrams, or screenshots
- Compare multiple images

The tool accepts images via URL, Base64 encoding, local file path, or localhost URL. Supports single or multiple images.

Args:
  - images (string[]): Array of images to analyze. Each image can be a URL, Base64-encoded data, local file path, or localhost URL
  - question (string): Question or instruction about the image (default: "Please describe the content of this image")
  - max_tokens (int): Maximum response tokens (1-4096, default: 1024)

Returns:
  - Detailed analysis or answer about the image content

Supported formats: JPEG, PNG, GIF, WebP, BMP
Max size: 50 MB per image`,
      inputSchema: {
        images: ImageInputSchema.shape.images,
        question: ImageInputSchema.shape.question,
        max_tokens: ImageInputSchema.shape.max_tokens
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ images, question, max_tokens }, extra) => {
      try {
        const imageContents = [];
        for (const image of images) {
          const isUrl = image.startsWith("http://") || image.startsWith("https://");
          const isBase64 = image.startsWith("data:");
          const isLocalhost = isUrl && (image.includes("localhost") || image.includes("127.0.0.1"));
          const isLocalFile = !isUrl && !isBase64;
          let imageData = image;
          let filePath = image;
          if (isLocalhost) {
            try {
              const localhostUrl = new URL(image);
              filePath = localhostUrl.pathname;
              if (filePath.startsWith("/")) {
                filePath = filePath.substring(1);
              }
            } catch (urlError) {
              return {
                content: [{
                  type: "text",
                  text: `Error: Invalid localhost URL: ${image}`
                }]
              };
            }
          } else if (isLocalFile) {
            filePath = image;
          } else if (isUrl) {
          }
          const shouldReadAsFile = isLocalhost || isLocalFile;
          if (shouldReadAsFile) {
            if (!existsSync(filePath)) {
              return {
                content: [{
                  type: "text",
                  text: `Error: Local image file not found: ${filePath}`
                }]
              };
            }
            try {
              const fileBuffer = readFileSync(filePath);
              const ext = extname(filePath).toLowerCase();
              const mimeType = IMAGE_MIME_TYPES[ext] || "image/jpeg";
              const base64Data = fileBuffer.toString("base64");
              imageData = `data:${mimeType};base64,${base64Data}`;
            } catch (readError) {
              return {
                content: [{
                  type: "text",
                  text: `Error reading local image file: ${readError instanceof Error ? readError.message : String(readError)}`
                }]
              };
            }
          }
          imageContents.push({
            type: "image_url",
            image_url: {
              url: imageData
            }
          });
        }
        const userContent = [
          ...imageContents,
          { type: "text", text: question }
        ];
        const result = await client.chatCompletionWithReasoning({
          model: MODELS.MULTIMODAL,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            {
              role: "user",
              content: userContent
            }
          ],
          max_completion_tokens: max_tokens
        });
        const responseText = result.reasoning ? `${result.content}

---
**Reasoning:**
${result.reasoning}` : result.content;
        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error analyzing image: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}

// src/tools/audio-understanding.ts
import { z as z2 } from "zod";
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "fs";
import { extname as extname2 } from "path";
import { URL as URL2 } from "url";
var AudioInputSchema = z2.object({
  audio: z2.string().describe(
    "Audio to analyze. Can be:\n- A publicly accessible URL (e.g., 'https://example.com/audio.wav')\n- Base64-encoded audio data with MIME prefix (e.g., 'data:audio/wav;base64,UklGR...')\n- A local file path (e.g., 'C:\\Users\\user\\audio.mp3' or '/path/to/audio.wav'). Recommend.\n- A localhost URL (e.g., 'http://localhost/audio.mp3' or 'http://127.0.0.1/audio.wav')"
  ),
  question: z2.string().default("Please describe the content of this audio").describe(
    "Question or instruction about the audio. Examples:\n- 'What is being said in this audio?'\n- 'Describe the sounds in this recording'\n- 'What language is being spoken?'"
  ),
  max_tokens: z2.number().int().min(1).max(4096).default(1024).describe(
    "Maximum number of tokens in the response (1-4096, default: 1024)"
  )
});
function registerAudioUnderstandingTool(server, client) {
  server.registerTool(
    "understand_audio",
    {
      title: "Understand Audio",
      description: `Analyze and understand audio content using MiMo multimodal model.

Use this tool when you need to:
- Describe what's in an audio recording
- Answer questions about audio content
- Identify sounds, music, or speech
- Analyze audio characteristics

The tool accepts audio via URL, Base64 encoding, local file path, or localhost URL.

Args:
  - audio (string): Audio URL, Base64-encoded data with MIME prefix, local file path, or localhost URL
  - question (string): Question or instruction about the audio (default: "Please describe the content of this audio")
  - max_tokens (int): Maximum response tokens (1-4096, default: 1024)

Returns:
  - Detailed analysis or answer about the audio content

Supported formats: MP3, WAV, FLAC, M4A, OGG
Max size: 100 MB (URL) or 50 MB (Base64)`,
      inputSchema: {
        audio: AudioInputSchema.shape.audio,
        question: AudioInputSchema.shape.question,
        max_tokens: AudioInputSchema.shape.max_tokens
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ audio, question, max_tokens }, extra) => {
      try {
        const isUrl = audio.startsWith("http://") || audio.startsWith("https://");
        const isBase64 = audio.startsWith("data:");
        const isLocalhost = isUrl && (audio.includes("localhost") || audio.includes("127.0.0.1"));
        const isLocalFile = !isUrl && !isBase64;
        let audioData = audio;
        let filePath = audio;
        if (isLocalhost) {
          try {
            const localhostUrl = new URL2(audio);
            filePath = localhostUrl.pathname;
            if (filePath.startsWith("/")) {
              filePath = filePath.substring(1);
            }
          } catch (urlError) {
            return {
              content: [{
                type: "text",
                text: `Error: Invalid localhost URL: ${audio}`
              }]
            };
          }
        } else if (isLocalFile) {
          filePath = audio;
        } else if (isUrl) {
        }
        const shouldReadAsFile = isLocalhost || isLocalFile;
        if (shouldReadAsFile) {
          if (!existsSync2(filePath)) {
            return {
              content: [{
                type: "text",
                text: `Error: Local audio file not found: ${filePath}`
              }]
            };
          }
          try {
            const fileBuffer = readFileSync2(filePath);
            const ext = extname2(filePath).toLowerCase();
            const mimeType = AUDIO_MIME_TYPES[ext] || "audio/mpeg";
            const base64Data = fileBuffer.toString("base64");
            audioData = `data:${mimeType};base64,${base64Data}`;
          } catch (readError) {
            return {
              content: [{
                type: "text",
                text: `Error reading local audio file: ${readError instanceof Error ? readError.message : String(readError)}`
              }]
            };
          }
        }
        const result = await client.chatCompletionWithReasoning({
          model: MODELS.MULTIMODAL,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            {
              role: "user",
              content: [
                {
                  type: "input_audio",
                  input_audio: {
                    data: audioData
                  }
                },
                { type: "text", text: question }
              ]
            }
          ],
          max_completion_tokens: max_tokens
        });
        const responseText = result.reasoning ? `${result.content}

---
**Reasoning:**
${result.reasoning}` : result.content;
        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error analyzing audio: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}

// src/tools/video-understanding.ts
import { z as z3 } from "zod";
import { readFileSync as readFileSync3, existsSync as existsSync3 } from "fs";
import { extname as extname3 } from "path";
import { URL as URL3 } from "url";
var VideoInputSchema = z3.object({
  video: z3.string().describe(
    "Video to analyze. Can be:\n- A publicly accessible URL (e.g., 'https://example.com/video.mp4')\n- Base64-encoded video data with MIME prefix (e.g., 'data:video/mp4;base64,AAAA...')\n- A local file path (e.g., 'C:\\Users\\user\\video.mp4' or '/path/to/video.mov'). Recommend.\n- A localhost URL (e.g., 'http://localhost/video.mp4' or 'http://127.0.0.1/video.mov')"
  ),
  question: z3.string().default("Please describe the content of this video").describe(
    "Question or instruction about the video. Examples:\n- 'What is happening in this video?'\n- 'Describe the scene and actions'\n- 'What objects appear in the video?'"
  ),
  fps: z3.number().min(0.1).max(10).default(2).describe(
    "Frames per second to extract for analysis (0.1-10, default: 2). Higher values give more temporal detail but use more tokens."
  ),
  media_resolution: z3.enum(["default", "max"]).default("default").describe(
    "Resolution quality for frame analysis (default: 'default'). 'max' provides better detail recognition for small objects."
  ),
  max_tokens: z3.number().int().min(1).max(4096).default(1024).describe(
    "Maximum number of tokens in the response (1-4096, default: 1024)"
  )
});
function registerVideoUnderstandingTool(server, client) {
  server.registerTool(
    "understand_video",
    {
      title: "Understand Video",
      description: `Analyze and understand video content using MiMo multimodal model.

Use this tool when you need to:
- Describe what's happening in a video
- Answer questions about video content
- Identify actions, objects, or scenes in video
- Analyze video characteristics

The tool accepts video via URL, Base64 encoding, local file path, or localhost URL.

Args:
  - video (string): Video URL, Base64-encoded data with MIME prefix, local file path, or localhost URL
  - question (string): Question or instruction about the video (default: "Please describe the content of this video")
  - fps (number): Frames per second for analysis (0.1-10, default: 2)
  - media_resolution (string): Resolution quality - 'default' or 'max' (default: 'default')
  - max_tokens (int): Maximum response tokens (1-4096, default: 1024)

Returns:
  - Detailed analysis or answer about the video content

Supported formats: MP4, MOV, AVI, WMV
Max size: 300 MB (URL) or 50 MB (Base64)`,
      inputSchema: {
        video: VideoInputSchema.shape.video,
        question: VideoInputSchema.shape.question,
        fps: VideoInputSchema.shape.fps,
        media_resolution: VideoInputSchema.shape.media_resolution,
        max_tokens: VideoInputSchema.shape.max_tokens
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ video, question, fps, media_resolution, max_tokens }, extra) => {
      try {
        const isUrl = video.startsWith("http://") || video.startsWith("https://");
        const isBase64 = video.startsWith("data:");
        const isLocalhost = isUrl && (video.includes("localhost") || video.includes("127.0.0.1"));
        const isLocalFile = !isUrl && !isBase64;
        let videoData = video;
        let filePath = video;
        if (isLocalhost) {
          try {
            const localhostUrl = new URL3(video);
            filePath = localhostUrl.pathname;
            if (filePath.startsWith("/")) {
              filePath = filePath.substring(1);
            }
          } catch (urlError) {
            return {
              content: [{
                type: "text",
                text: `Error: Invalid localhost URL: ${video}`
              }]
            };
          }
        } else if (isLocalFile) {
          filePath = video;
        } else if (isUrl) {
        }
        const shouldReadAsFile = isLocalhost || isLocalFile;
        if (shouldReadAsFile) {
          if (!existsSync3(filePath)) {
            return {
              content: [{
                type: "text",
                text: `Error: Local video file not found: ${filePath}`
              }]
            };
          }
          try {
            const fileBuffer = readFileSync3(filePath);
            const ext = extname3(filePath).toLowerCase();
            const mimeType = VIDEO_MIME_TYPES[ext] || "video/mp4";
            const base64Data = fileBuffer.toString("base64");
            videoData = `data:${mimeType};base64,${base64Data}`;
          } catch (readError) {
            return {
              content: [{
                type: "text",
                text: `Error reading local video file: ${readError instanceof Error ? readError.message : String(readError)}`
              }]
            };
          }
        }
        const result = await client.chatCompletionWithReasoning({
          model: MODELS.MULTIMODAL,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            {
              role: "user",
              content: [
                {
                  type: "video_url",
                  video_url: {
                    url: videoData
                  },
                  fps,
                  media_resolution
                },
                { type: "text", text: question }
              ]
            }
          ],
          max_completion_tokens: max_tokens
        });
        const responseText = result.reasoning ? `${result.content}

---
**Reasoning:**
${result.reasoning}` : result.content;
        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error analyzing video: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}

// src/tools/speech-recognition.ts
import { z as z4 } from "zod";
import { readFileSync as readFileSync4, existsSync as existsSync4 } from "fs";
import { extname as extname4 } from "path";
var ASRInputSchema = z4.object({
  audio: z4.string().describe(
    "Audio to transcribe. Can be:\n- Base64-encoded audio data with MIME prefix (e.g., 'data:audio/wav;base64,UklGR...')\n- A local file path (e.g., 'C:\\Users\\user\\audio.mp3' or '/path/to/audio.wav'). Recommend.\n\nSupported MIME types:\n- WAV: audio/wav\n- MP3: audio/mpeg or audio/mp3"
  ),
  language: z4.enum(["auto", "zh", "en"]).default("auto").describe(
    "Language for recognition (default: 'auto')\n- 'auto': Automatic language detection\n- 'zh': Chinese (including dialects)\n- 'en': English"
  )
});
function registerSpeechRecognitionTool(server, client) {
  server.registerTool(
    "speech_recognition",
    {
      title: "Speech Recognition (ASR)",
      description: `Convert speech audio to text using MiMo ASR model.

Use this tool when you need to:
- Transcribe speech from audio recordings
- Convert meeting recordings to text
- Transcribe songs or lyrics
- Convert dialect speech to text
- Process noisy audio recordings

The tool accepts audio via Base64 encoding or local file path.

Args:
  - audio (string): Base64-encoded audio with MIME prefix or local file path
  - language (string): Recognition language - 'auto', 'zh', or 'en' (default: 'auto')

Returns:
  - Transcribed text from the audio

Supported formats: WAV, MP3
Max size: 10 MB (Base64-encoded)

Features:
- Supports Chinese, English, and automatic detection
- Handles dialects: Cantonese, Wu, Minnan, Sichuan, etc.
- Works with noisy recordings
- Auto-punctuation`,
      inputSchema: {
        audio: ASRInputSchema.shape.audio,
        language: ASRInputSchema.shape.language
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ audio, language }, extra) => {
      try {
        const isBase64 = audio.startsWith("data:");
        const isLocalFile = !isBase64;
        let audioData = audio;
        if (isLocalFile) {
          if (!existsSync4(audio)) {
            return {
              content: [{
                type: "text",
                text: `Error: Local audio file not found: ${audio}`
              }]
            };
          }
          try {
            const fileBuffer = readFileSync4(audio);
            const ext = extname4(audio).toLowerCase();
            const mimeType = AUDIO_MIME_TYPES[ext] || "audio/mpeg";
            const base64Data = fileBuffer.toString("base64");
            audioData = `data:${mimeType};base64,${base64Data}`;
          } catch (readError) {
            return {
              content: [{
                type: "text",
                text: `Error reading local audio file: ${readError instanceof Error ? readError.message : String(readError)}`
              }]
            };
          }
        } else if (!audioData.startsWith("data:audio/")) {
          return {
            content: [{
              type: "text",
              text: "Error: Invalid audio format. Audio must be Base64-encoded with MIME prefix.\n\nExpected format: 'data:audio/wav;base64,{BASE64_DATA}' or 'data:audio/mpeg;base64,{BASE64_DATA}'"
            }]
          };
        }
        const result = await client.chatCompletionWithReasoning({
          model: MODELS.ASR,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "input_audio",
                  input_audio: {
                    data: audioData
                  }
                }
              ]
            }
          ],
          asr_options: {
            language
          }
        });
        return {
          content: [{
            type: "text",
            text: result.content || result.reasoning || "No speech detected in the audio."
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error recognizing speech: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}

// src/tools/speech-synthesis.ts
import { z as z5 } from "zod";
import { readFileSync as readFileSync5, writeFileSync, mkdirSync, existsSync as existsSync5 } from "fs";
import { dirname, extname as extname5 } from "path";
var TTSInputSchema = z5.object({
  text: z5.string().min(1).max(5e3).describe(
    "Text to convert to speech (1-5000 characters).\nCan include style tags at the beginning:\n- Natural style: '(\u5F00\u5FC3)\u4ECA\u5929\u5929\u6C14\u771F\u597D\uFF01'\n- Singing: '(\u5531\u6B4C)\u6B4C\u8BCD\u5185\u5BB9'\nOr use audio tags for fine-grained control:\n- '(\u7D27\u5F20\uFF0C\u6DF1\u547C\u5438)\u547C\u2026\u2026\u51B7\u9759\uFF0C\u51B7\u9759\u3002'"
  ),
  prest_voice: z5.string().default("mimo_default").describe(
    "Voice ID for synthesis. Available preset voices:\n- mimo_default: MiMo default voice\n- \u51B0\u7CD6: Chinese female\n- \u8309\u8389: Chinese female\n- \u82CF\u6253: Chinese male\n- \u767D\u6866: Chinese male\n- Mia: English female\n- Chloe: English female\n- Milo: English male\n- Dean: English male"
  ),
  style_instruction: z5.string().optional().describe(
    "Optional natural language instruction for voice style.\nExamples:\n- 'Bright, bouncy tone with fast pace'\n- '\u6E29\u67D4\u6CBB\u6108\u7CFB\u5973\u58F0'\n- '\u7528\u8F7B\u5FEB\u4E0A\u626C\u7684\u8BED\u8C03\uFF0C\u8BED\u901F\u7A0D\u5FEB'"
  ),
  output_format: z5.enum(["wav", "mp3"]).default("wav").describe(
    "Output audio format (default: 'wav')"
  ),
  output_path: z5.string().min(1).describe(
    "File path to save the generated audio.\nExample: 'C:\\Users\\user\\output.wav' or '/path/to/output.mp3'"
  )
});
function registerSpeechSynthesisTool(server, client) {
  server.registerTool(
    "speech_synthesis_preset",
    {
      title: "Speech Synthesis (TTS)",
      description: `Convert text to natural speech using MiMo TTS model.

Use this tool when you need to:
- Generate speech from text
- Use preset voices for synthesis
- Create voiceovers or narration
- Convert written content to audio
- Generate speech with specific styles or emotions

Args:
  - text (string): Text to synthesize (1-5000 chars). Can include style tags like (\u5F00\u5FC3) or (\u5531\u6B4C)
  - preset_voice (string): Preset voice ID for synthesis. (default: 'mimo_default'). Options: mimo_default, \u51B0\u7CD6, \u8309\u8389, \u82CF\u6253, \u767D\u6866, Mia, Chloe, Milo, Dean
  - style_instruction (string): Optional style instruction for voice tone
  - output_format (string): Output format - 'wav' or 'mp3' (default: 'wav')
  - output_path (string): File path to save the generated audio

Returns:
  - File path where the audio was saved

Style Control:
  - Add style at text start: '(\u5F00\u5FC3)\u4ECA\u5929\u5929\u6C14\u771F\u597D\uFF01'
  - Use audio tags: '(\u7D27\u5F20\uFF0C\u6DF1\u547C\u5438)\u547C\u2026\u2026\u51B7\u9759'
  - Supported styles: \u5F00\u5FC3/\u60B2\u4F24/\u6124\u6012/\u6E29\u67D4/\u78C1\u6027/\u6D3B\u6CFC etc.`,
      inputSchema: {
        text: TTSInputSchema.shape.text,
        prest_voice: TTSInputSchema.shape.prest_voice,
        style_instruction: TTSInputSchema.shape.style_instruction,
        output_format: TTSInputSchema.shape.output_format,
        output_path: TTSInputSchema.shape.output_path
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ text, prest_voice, style_instruction, output_format, output_path }, extra) => {
      try {
        const messages = [];
        if (style_instruction) {
          messages.push({
            role: "user",
            content: style_instruction
          });
        }
        messages.push({
          role: "assistant",
          content: text
        });
        const result = await client.chatCompletionWithAudio({
          model: MODELS.TTS,
          messages,
          audio: {
            format: output_format,
            prest_voice
          }
        });
        try {
          const dir = dirname(output_path);
          if (!existsSync5(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          const audioBuffer = Buffer.from(result.audioData, "base64");
          writeFileSync(output_path, audioBuffer);
        } catch (saveError) {
          return {
            content: [{
              type: "text",
              text: `Error saving audio file: ${saveError instanceof Error ? saveError.message : String(saveError)}`
            }]
          };
        }
        return {
          content: [{
            type: "text",
            text: `Speech synthesized successfully. Audio saved to: ${output_path}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error synthesizing speech: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}
var VoiceDesignInputSchema = z5.object({
  text: z5.string().min(1).max(5e3).describe(
    "Text to convert to speech (1-5000 characters)"
  ),
  voice_description: z5.string().min(10).max(500).describe(
    "Description of the desired voice characteristics.\nInclude details like:\n- Gender and age: 'young woman in her mid-20s'\n- Voice quality: 'deep and gravelly', '\u4E1D\u6ED1\u9187\u539A'\n- Emotion/tone: 'warm and confident', '\u6E29\u67D4\u4F46\u75B2\u60EB'\n- Speed/rhythm: 'slow and deliberate', '\u8BED\u901F\u6781\u5FEB'"
  ),
  output_format: z5.enum(["wav", "mp3"]).default("wav").describe(
    "Output audio format (default: 'wav')"
  ),
  optimize_text_preview: z5.boolean().default(false).describe(
    "Whether to intelligently optimize/polish the target text before synthesis (default: false).\nWhen enabled, the model will refine the text for better speech output."
  ),
  output_path: z5.string().min(1).describe(
    "File path to save the generated audio.\nExample: 'C:\\Users\\user\\output.wav' or '/path/to/output.mp3'"
  )
});
function registerVoiceDesignTool(server, client) {
  server.registerTool(
    "speech_synthesis_design",
    {
      title: "Voice Design TTS",
      description: `Generate speech with a custom-designed voice using text description.

Use this tool when you need a specific voice that's not in the preset list.

Args:
  - text (string): Text to synthesize (1-5000 chars)
  - voice_description (string): Description of desired voice (10-500 chars)
  - output_format (string): Output format - 'wav' or 'mp3' (default: 'wav')
  - optimize_text_preview (boolean): Whether to intelligently optimize the text before synthesis (default: false)
  - output_path (string): File path to save the generated audio

Returns:
  - File path where the audio was saved

Voice Description Tips:
  - Be specific: "young female, warm and confident"
  - Include age/gender: "\u4E94\u5341\u591A\u5C81\u7684\u4E2D\u5E74\u7537\u6027"
  - Describe quality: "deep and gravelly", "\u4E1D\u6ED1\u9187\u539A"
  - Add context: "narrating a nature documentary"`,
      inputSchema: {
        text: VoiceDesignInputSchema.shape.text,
        voice_description: VoiceDesignInputSchema.shape.voice_description,
        output_format: VoiceDesignInputSchema.shape.output_format,
        optimize_text_preview: VoiceDesignInputSchema.shape.optimize_text_preview,
        output_path: VoiceDesignInputSchema.shape.output_path
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ text, voice_description, output_format, output_path, optimize_text_preview }, extra) => {
      try {
        const result = await client.chatCompletionWithAudio({
          model: MODELS.TTS_VOICE_DESIGN,
          messages: [
            {
              role: "user",
              content: voice_description
            },
            {
              role: "assistant",
              content: text
            }
          ],
          audio: {
            format: output_format,
            optimize_text_preview
          }
        });
        try {
          const dir = dirname(output_path);
          if (!existsSync5(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          const audioBuffer = Buffer.from(result.audioData, "base64");
          writeFileSync(output_path, audioBuffer);
        } catch (saveError) {
          return {
            content: [{
              type: "text",
              text: `Error saving audio file: ${saveError instanceof Error ? saveError.message : String(saveError)}`
            }]
          };
        }
        return {
          content: [{
            type: "text",
            text: `Speech synthesized with custom voice successfully. Audio saved to: ${output_path}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error synthesizing speech with voice design: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}
var VoiceCloneInputSchema = z5.object({
  text: z5.string().min(1).max(5e3).describe(
    "Text to convert to speech (1-5000 characters).\nCan include style tags at the beginning:\n- Natural style: '(\u5F00\u5FC3)\u4ECA\u5929\u5929\u6C14\u771F\u597D\uFF01'\n- Singing: '(\u5531\u6B4C)\u6B4C\u8BCD\u5185\u5BB9'\nOr use audio tags for fine-grained control:\n- '(\u7D27\u5F20\uFF0C\u6DF1\u547C\u5438)\u547C\u2026\u2026\u51B7\u9759\uFF0C\u51B7\u9759\u3002'"
  ),
  voice_audio: z5.string().describe(
    "Audio sample for voice cloning. Can be:\n- Base64-encoded audio data with MIME prefix (e.g., 'data:audio/wav;base64,UklGR...')\n- A local file path (e.g., 'C:\\Users\\user\\sample.mp3' or '/path/to/sample.wav'). Recommend.\n\nSupported formats: WAV, MP3\nMax size: 10 MB (Base64-encoded)"
  ),
  style_instruction: z5.string().optional().describe(
    "Optional natural language instruction for voice style.\nExamples:\n- 'Bright, bouncy tone with fast pace'\n- '\u6E29\u67D4\u6CBB\u6108\u7CFB\u5973\u58F0'\n- '\u7528\u8F7B\u5FEB\u4E0A\u626C\u7684\u8BED\u8C03\uFF0C\u8BED\u901F\u7A0D\u5FEB'"
  ),
  output_format: z5.enum(["wav", "mp3"]).default("wav").describe(
    "Output audio format (default: 'wav')"
  ),
  output_path: z5.string().min(1).describe(
    "File path to save the generated audio.\nExample: 'C:\\Users\\user\\output.wav' or '/path/to/output.mp3'"
  )
});
function registerVoiceCloneTool(server, client) {
  server.registerTool(
    "speech_synthesis_clone",
    {
      title: "Voice Clone TTS",
      description: `Generate speech with a cloned voice using audio sample.

Use this tool when you need to:
- Clone a specific voice from an audio sample
- Generate speech that sounds like a specific person
- Create consistent voiceovers with the same voice

Args:
  - text (string): Text to synthesize (1-5000 chars). Can include style tags like (\u5F00\u5FC3) or (\u5531\u6B4C)
  - voice_audio (string): Audio sample for voice cloning (Base64-encoded or local file path)
  - style_instruction (string): Optional style instruction for voice tone
  - output_format (string): Output format - 'wav' or 'mp3' (default: 'wav')
  - output_path (string): File path to save the generated audio

Returns:
  - File path where the audio was saved

Supported formats: WAV, MP3
Max size: 10 MB (Base64-encoded)

Style Control:
  - Add style at text start: '(\u5F00\u5FC3)\u4ECA\u5929\u5929\u6C14\u771F\u597D\uFF01'
  - Use audio tags: '(\u7D27\u5F20\uFF0C\u6DF1\u547C\u5438)\u547C\u2026\u2026\u51B7\u9759'
  - Supported styles: \u5F00\u5FC3/\u60B2\u4F24/\u6124\u6012/\u6E29\u67D4/\u78C1\u6027/\u6D3B\u6CFC etc.`,
      inputSchema: {
        text: VoiceCloneInputSchema.shape.text,
        voice_audio: VoiceCloneInputSchema.shape.voice_audio,
        style_instruction: VoiceCloneInputSchema.shape.style_instruction,
        output_format: VoiceCloneInputSchema.shape.output_format,
        output_path: VoiceCloneInputSchema.shape.output_path
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ text, voice_audio, style_instruction, output_format, output_path }, extra) => {
      try {
        let voiceAudioData = voice_audio;
        const isBase64 = voice_audio.startsWith("data:");
        const isLocalFile = !isBase64;
        if (isLocalFile) {
          if (!existsSync5(voice_audio)) {
            return {
              content: [{
                type: "text",
                text: `Error: Voice audio file not found: ${voice_audio}`
              }]
            };
          }
          try {
            const fileBuffer = readFileSync5(voice_audio);
            const ext = extname5(voice_audio).toLowerCase();
            const mimeType = AUDIO_MIME_TYPES[ext] || "audio/mpeg";
            const base64Data = fileBuffer.toString("base64");
            voiceAudioData = `data:${mimeType};base64,${base64Data}`;
          } catch (readError) {
            return {
              content: [{
                type: "text",
                text: `Error reading voice audio file: ${readError instanceof Error ? readError.message : String(readError)}`
              }]
            };
          }
        }
        const messages = [];
        if (style_instruction) {
          messages.push({
            role: "user",
            content: style_instruction
          });
        } else {
          messages.push({
            role: "user",
            content: ""
          });
        }
        messages.push({
          role: "assistant",
          content: text
        });
        const result = await client.chatCompletionWithAudio({
          model: MODELS.TTS_VOICE_CLONE,
          messages,
          audio: {
            format: output_format,
            voice: voiceAudioData
          }
        });
        try {
          const dir = dirname(output_path);
          if (!existsSync5(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          const audioBuffer = Buffer.from(result.audioData, "base64");
          writeFileSync(output_path, audioBuffer);
        } catch (saveError) {
          return {
            content: [{
              type: "text",
              text: `Error saving audio file: ${saveError instanceof Error ? saveError.message : String(saveError)}`
            }]
          };
        }
        return {
          content: [{
            type: "text",
            text: `Speech synthesized with cloned voice successfully. Audio saved to: ${output_path}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error synthesizing speech with voice clone: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}

// src/index.ts
function getConfig() {
  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) {
    console.error("Error: MIMO_API_KEY environment variable is required");
    console.error("Please set your MiMo API key:");
    console.error('  export MIMO_API_KEY="your-api-key-here"');
    process.exit(1);
  }
  return {
    apiKey,
    apiUrl: process.env.MIMO_API_URL
  };
}
async function main() {
  const config = getConfig();
  const client = new MiMoClient(config);
  const server = new McpServer({
    name: "mimo-mcp-server",
    version: "1.0.0"
  });
  registerImageUnderstandingTool(server, client);
  registerAudioUnderstandingTool(server, client);
  registerVideoUnderstandingTool(server, client);
  registerSpeechRecognitionTool(server, client);
  registerSpeechSynthesisTool(server, client);
  registerVoiceDesignTool(server, client);
  registerVoiceCloneTool(server, client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MiMo MCP Server started successfully");
  console.error("Available tools:");
  console.error("  - mimo_understand_image: Image understanding");
  console.error("  - mimo_understand_audio: Audio understanding");
  console.error("  - mimo_understand_video: Video understanding");
  console.error("  - mimo_speech_recognition: Speech to text (ASR)");
  console.error("  - mimo_speech_synthesis: Text to speech (TTS)");
  console.error("  - mimo_voice_design: Custom voice TTS");
  console.error("  - mimo_voice_clone: Voice clone TTS");
}
main().catch((error) => {
  console.error("Failed to start MiMo MCP Server:", error);
  process.exit(1);
});

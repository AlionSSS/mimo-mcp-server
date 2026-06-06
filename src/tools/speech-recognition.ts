/**
 * Speech Recognition (ASR) Tool
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiMoClient } from "../services/mimo-client.js";
import { MODELS, ASR_LANGUAGES, AUDIO_MIME_TYPES } from "../constants.js";

const ASRInputSchema = z.object({
  audio: z.string().describe(
    "Audio to transcribe. Can be:\n" +
    "- Base64-encoded audio data with MIME prefix (e.g., 'data:audio/wav;base64,UklGR...')\n" +
    "- A local file path (e.g., 'C:\\Users\\user\\audio.mp3' or '/path/to/audio.wav'). Recommend.\n\n" +
    "Supported MIME types:\n" +
    "- WAV: audio/wav\n" +
    "- MP3: audio/mpeg or audio/mp3"
  ),
  language: z.enum(["auto", "zh", "en"]).default("auto").describe(
    "Language for recognition (default: 'auto')\n" +
    "- 'auto': Automatic language detection\n" +
    "- 'zh': Chinese (including dialects)\n" +
    "- 'en': English"
  ),
});

export function registerSpeechRecognitionTool(server: McpServer, client: MiMoClient): void {
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
        language: ASRInputSchema.shape.language,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ audio, language }, extra) => {
      try {
        // Determine if input is base64 or local file
        const isBase64 = audio.startsWith("data:");
        const isLocalFile = !isBase64;

        let audioData = audio;

        // Handle local file path
        if (isLocalFile) {
          if (!existsSync(audio)) {
            return {
              content: [{
                type: "text",
                text: `Error: Local audio file not found: ${audio}`,
              }],
            };
          }

          try {
            const fileBuffer = readFileSync(audio);
            const ext = extname(audio).toLowerCase();
            const mimeType = AUDIO_MIME_TYPES[ext] || "audio/mpeg";
            const base64Data = fileBuffer.toString("base64");
            audioData = `data:${mimeType};base64,${base64Data}`;
          } catch (readError) {
            return {
              content: [{
                type: "text",
                text: `Error reading local audio file: ${readError instanceof Error ? readError.message : String(readError)}`,
              }],
            };
          }
        }
        // Validate Base64 format
        else if (!audioData.startsWith("data:audio/")) {
          return {
            content: [{
              type: "text",
              text: "Error: Invalid audio format. Audio must be Base64-encoded with MIME prefix.\n\nExpected format: 'data:audio/wav;base64,{BASE64_DATA}' or 'data:audio/mpeg;base64,{BASE64_DATA}'",
            }],
          };
        }

        const result = await client.chatCompletionWithReasoning({
          model: MODELS.ASR,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "input_audio" as const,
                  input_audio: {
                    data: audioData,
                  },
                },
              ],
            },
          ],
          asr_options: {
            language,
          },
        });

        return {
          content: [{
            type: "text",
            text: result.content || result.reasoning || "No speech detected in the audio.",
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error recognizing speech: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

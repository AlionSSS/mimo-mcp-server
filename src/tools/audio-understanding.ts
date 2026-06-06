/**
 * Audio Understanding Tool
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";
import { URL } from "url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiMoClient } from "../services/mimo-client.js";
import { MODELS, SYSTEM_MESSAGE, AUDIO_MIME_TYPES } from "../constants.js";

const AudioInputSchema = z.object({
  audio: z.string().describe(
    "Audio to analyze. Can be:\n" +
    "- A publicly accessible URL (e.g., 'https://example.com/audio.wav')\n" +
    "- Base64-encoded audio data with MIME prefix (e.g., 'data:audio/wav;base64,UklGR...')\n" +
    "- A local file path (e.g., 'C:\\Users\\user\\audio.mp3' or '/path/to/audio.wav'). Recommend.\n" +
    "- A localhost URL (e.g., 'http://localhost/audio.mp3' or 'http://127.0.0.1/audio.wav')"
  ),
  question: z.string().default("Please describe the content of this audio").describe(
    "Question or instruction about the audio. Examples:\n" +
    "- 'What is being said in this audio?'\n" +
    "- 'Describe the sounds in this recording'\n" +
    "- 'What language is being spoken?'"
  ),
  max_tokens: z.number().int().min(1).max(4096).default(1024).describe(
    "Maximum number of tokens in the response (1-4096, default: 1024)"
  ),
});

export function registerAudioUnderstandingTool(server: McpServer, client: MiMoClient): void {
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
        max_tokens: AudioInputSchema.shape.max_tokens,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ audio, question, max_tokens }, extra) => {
      try {
        // Determine if input is URL, base64, or local file
        const isUrl = audio.startsWith("http://") || audio.startsWith("https://");
        const isBase64 = audio.startsWith("data:");
        const isLocalhost = isUrl && (audio.includes("localhost") || audio.includes("127.0.0.1"));
        const isLocalFile = !isUrl && !isBase64;

        let audioData = audio;
        let filePath = audio;

        // Handle localhost/127.0.0.1 URLs
        if (isLocalhost) {
          try {
            const localhostUrl = new URL(audio);
            filePath = localhostUrl.pathname;
            // Remove leading slash
            if (filePath.startsWith("/")) {
              filePath = filePath.substring(1);
            }
          } catch (urlError) {
            return {
              content: [{
                type: "text",
                text: `Error: Invalid localhost URL: ${audio}`,
              }],
            };
          }
        }
        // Handle regular local file path
        else if (isLocalFile) {
          filePath = audio;
        }
        // For regular URLs, pass through directly
        else if (isUrl) {
          // No processing needed for regular URLs
        }

        // Check if this is a local file that needs to be read
        const shouldReadAsFile = isLocalhost || isLocalFile;

        if (shouldReadAsFile) {
          if (!existsSync(filePath)) {
            return {
              content: [{
                type: "text",
                text: `Error: Local audio file not found: ${filePath}`,
              }],
            };
          }

          try {
            const fileBuffer = readFileSync(filePath);
            const ext = extname(filePath).toLowerCase();
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

        const result = await client.chatCompletionWithReasoning({
          model: MODELS.MULTIMODAL,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            {
              role: "user",
              content: [
                {
                  type: "input_audio" as const,
                  input_audio: {
                    data: audioData,
                  },
                },
                { type: "text" as const, text: question },
              ],
            },
          ],
          max_completion_tokens: max_tokens,
        });

        const responseText = result.reasoning
          ? `${result.content}\n\n---\n**Reasoning:**\n${result.reasoning}`
          : result.content;

        return {
          content: [{
            type: "text",
            text: responseText,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error analyzing audio: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

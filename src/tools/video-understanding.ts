/**
 * Video Understanding Tool
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";
import { URL } from "url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiMoClient } from "../services/mimo-client.js";
import { MODELS, SYSTEM_MESSAGE, VIDEO_MIME_TYPES } from "../constants.js";

const VideoInputSchema = z.object({
  video: z.string().describe(
    "Video to analyze. Can be:\n" +
    "- A publicly accessible URL (e.g., 'https://example.com/video.mp4')\n" +
    "- Base64-encoded video data with MIME prefix (e.g., 'data:video/mp4;base64,AAAA...')\n" +
    "- A local file path (e.g., 'C:\\Users\\user\\video.mp4' or '/path/to/video.mov'). Recommend.\n" +
    "- A localhost URL (e.g., 'http://localhost/video.mp4' or 'http://127.0.0.1/video.mov')"
  ),
  question: z.string().default("Please describe the content of this video").describe(
    "Question or instruction about the video. Examples:\n" +
    "- 'What is happening in this video?'\n" +
    "- 'Describe the scene and actions'\n" +
    "- 'What objects appear in the video?'"
  ),
  fps: z.number().min(0.1).max(10).default(2).describe(
    "Frames per second to extract for analysis (0.1-10, default: 2). Higher values give more temporal detail but use more tokens."
  ),
  media_resolution: z.enum(["default", "max"]).default("default").describe(
    "Resolution quality for frame analysis (default: 'default'). 'max' provides better detail recognition for small objects."
  ),
  max_tokens: z.number().int().min(1).max(4096).default(1024).describe(
    "Maximum number of tokens in the response (1-4096, default: 1024)"
  ),
});

export function registerVideoUnderstandingTool(server: McpServer, client: MiMoClient): void {
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
        max_tokens: VideoInputSchema.shape.max_tokens,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ video, question, fps, media_resolution, max_tokens }, extra) => {
      try {
        // Determine if input is URL, base64, or local file
        const isUrl = video.startsWith("http://") || video.startsWith("https://");
        const isBase64 = video.startsWith("data:");
        const isLocalhost = isUrl && (video.includes("localhost") || video.includes("127.0.0.1"));
        const isLocalFile = !isUrl && !isBase64;

        let videoData = video;
        let filePath = video;

        // Handle localhost/127.0.0.1 URLs
        if (isLocalhost) {
          try {
            const localhostUrl = new URL(video);
            filePath = localhostUrl.pathname;
            // Remove leading slash
            if (filePath.startsWith("/")) {
              filePath = filePath.substring(1);
            }
          } catch (urlError) {
            return {
              content: [{
                type: "text",
                text: `Error: Invalid localhost URL: ${video}`,
              }],
            };
          }
        }
        // Handle regular local file path
        else if (isLocalFile) {
          filePath = video;
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
                text: `Error: Local video file not found: ${filePath}`,
              }],
            };
          }

          try {
            const fileBuffer = readFileSync(filePath);
            const ext = extname(filePath).toLowerCase();
            const mimeType = VIDEO_MIME_TYPES[ext] || "video/mp4";
            const base64Data = fileBuffer.toString("base64");
            videoData = `data:${mimeType};base64,${base64Data}`;
          } catch (readError) {
            return {
              content: [{
                type: "text",
                text: `Error reading local video file: ${readError instanceof Error ? readError.message : String(readError)}`,
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
                  type: "video_url" as const,
                  video_url: {
                    url: videoData,
                  },
                  fps,
                  media_resolution,
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
            text: `Error analyzing video: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

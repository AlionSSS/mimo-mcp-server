/**
 * Image Understanding Tool
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";
import { URL } from "url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiMoClient } from "../services/mimo-client.js";
import { MODELS, SYSTEM_MESSAGE } from "../constants.js";
import { IMAGE_MIME_TYPES } from "../constants.js";

const ImageInputSchema = z.object({
  images: z.array(z.string()).min(1).describe(
    "Images to analyze. Each image can be:\n" +
    "- A publicly accessible URL (e.g., 'https://example.com/image.png')\n" +
    "- Base64-encoded image data with MIME prefix (e.g., 'data:image/png;base64,iVBOR...')\n" +
    "- A local file path (e.g., 'C:\\Users\\user\\image.png' or '/path/to/image.jpg'). Recommend.\n" +
    "- A localhost URL (e.g., 'http://localhost/image.png' or 'http://127.0.0.1/image.png')"
  ),
  question: z.string().default("Please describe the content of this image").describe(
    "Question or instruction about the image. Examples:\n" +
    "- 'What objects are in this image?'\n" +
    "- 'Describe the scene in detail'\n" +
    "- 'What text is shown in the image?'\n" +
    "- 'What are the connections and differences between these images?'"
  ),
  max_tokens: z.number().int().min(1).max(4096).default(1024).describe(
    "Maximum number of tokens in the response (1-4096, default: 1024)"
  ),
});

export function registerImageUnderstandingTool(server: McpServer, client: MiMoClient): void {
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
        max_tokens: ImageInputSchema.shape.max_tokens,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ images, question, max_tokens }, extra) => {
      try {
        // Process each image in the array
        const imageContents = [];

        for (const image of images) {
          // Determine if input is URL, base64, or local file
          const isUrl = image.startsWith("http://") || image.startsWith("https://");
          const isBase64 = image.startsWith("data:");
          const isLocalhost = isUrl && (image.includes("localhost") || image.includes("127.0.0.1"));
          const isLocalFile = !isUrl && !isBase64;

          let imageData = image;
          let filePath = image;

          // Handle localhost/127.0.0.1 URLs
          if (isLocalhost) {
            try {
              const localhostUrl = new URL(image);
              filePath = localhostUrl.pathname;
              // Remove leading slash
              if (filePath.startsWith("/")) {
                filePath = filePath.substring(1);
              }
            } catch (urlError) {
              return {
                content: [{
                  type: "text",
                  text: `Error: Invalid localhost URL: ${image}`,
                }],
              };
            }
          }
          // Handle regular local file path
          else if (isLocalFile) {
            filePath = image;
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
                  text: `Error: Local image file not found: ${filePath}`,
                }],
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
                  text: `Error reading local image file: ${readError instanceof Error ? readError.message : String(readError)}`,
                }],
              };
            }
          }

          // Add image content to array
          imageContents.push({
            type: "image_url" as const,
            image_url: {
              url: imageData,
            },
          });
        }

        // Build content part with all images and text
        const userContent = [
          ...imageContents,
          { type: "text" as const, text: question },
        ];

        const result = await client.chatCompletionWithReasoning({
          model: MODELS.MULTIMODAL,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            {
              role: "user",
              content: userContent,
            },
          ],
          max_completion_tokens: max_tokens,
        });

        // Combine reasoning and content if available
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
            text: `Error analyzing image: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

#!/usr/bin/env node

/**
 * MiMo MCP Server
 *
 * Provides multimodal capabilities via MiMo models:
 * - Image understanding
 * - Audio understanding
 * - Video understanding
 * - Speech recognition (ASR)
 * - Speech synthesis (TTS)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MiMoClient } from "./services/mimo-client.js";
import { registerImageUnderstandingTool } from "./tools/image-understanding.js";
import { registerAudioUnderstandingTool } from "./tools/audio-understanding.js";
import { registerVideoUnderstandingTool } from "./tools/video-understanding.js";
import { registerSpeechRecognitionTool } from "./tools/speech-recognition.js";
import { registerSpeechSynthesisTool, registerVoiceDesignTool, registerVoiceCloneTool } from "./tools/speech-synthesis.js";
import type { MiMoConfig } from "./types.js";

// Get configuration from environment variables
function getConfig(): MiMoConfig {
  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) {
    console.error("Error: MIMO_API_KEY environment variable is required");
    console.error("Please set your MiMo API key:");
    console.error('  export MIMO_API_KEY="your-api-key-here"');
    process.exit(1);
  }

  return {
    apiKey,
    apiUrl: process.env.MIMO_API_URL,
  };
}

async function main() {
  const config = getConfig();
  const client = new MiMoClient(config);

  const server = new McpServer({
    name: "mimo-mcp-server",
    version: "1.0.0",
  });

  // Register all tools
  registerImageUnderstandingTool(server, client);
  registerAudioUnderstandingTool(server, client);
  registerVideoUnderstandingTool(server, client);
  registerSpeechRecognitionTool(server, client);
  registerSpeechSynthesisTool(server, client);
  registerVoiceDesignTool(server, client);
  registerVoiceCloneTool(server, client);

  // Start server with stdio transport
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

/**
 * Speech Synthesis (TTS) Tool
 */

import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, extname } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiMoClient } from "../services/mimo-client.js";
import { MODELS, TTS_VOICES, TTS_AUDIO_FORMATS, AUDIO_MIME_TYPES } from "../constants.js";

const TTSInputSchema = z.object({
  text: z.string().min(1).max(5000).describe(
    "Text to convert to speech (1-5000 characters).\n" +
    "Can include style tags at the beginning:\n" +
    "- Natural style: '(开心)今天天气真好！'\n" +
    "- Singing: '(唱歌)歌词内容'\n" +
    "Or use audio tags for fine-grained control:\n" +
    "- '(紧张，深呼吸)呼……冷静，冷静。'"
  ),
  prest_voice: z.string().default("mimo_default").describe(
    "Voice ID for synthesis. Available preset voices:\n" +
    "- mimo_default: MiMo default voice\n" +
    "- 冰糖: Chinese female\n" +
    "- 茉莉: Chinese female\n" +
    "- 苏打: Chinese male\n" +
    "- 白桦: Chinese male\n" +
    "- Mia: English female\n" +
    "- Chloe: English female\n" +
    "- Milo: English male\n" +
    "- Dean: English male"
  ),
  style_instruction: z.string().optional().describe(
    "Optional natural language instruction for voice style.\n" +
    "Examples:\n" +
    "- 'Bright, bouncy tone with fast pace'\n" +
    "- '温柔治愈系女声'\n" +
    "- '用轻快上扬的语调，语速稍快'"
  ),
  output_format: z.enum(["wav", "mp3"]).default("wav").describe(
    "Output audio format (default: 'wav')"
  ),
  output_path: z.string().min(1).describe(
    "File path to save the generated audio.\n" +
    "Example: 'C:\\Users\\user\\output.wav' or '/path/to/output.mp3'"
  ),
});

export function registerSpeechSynthesisTool(server: McpServer, client: MiMoClient): void {
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
  - text (string): Text to synthesize (1-5000 chars). Can include style tags like (开心) or (唱歌)
  - preset_voice (string): Preset voice ID for synthesis. (default: 'mimo_default'). Options: mimo_default, 冰糖, 茉莉, 苏打, 白桦, Mia, Chloe, Milo, Dean
  - style_instruction (string): Optional style instruction for voice tone
  - output_format (string): Output format - 'wav' or 'mp3' (default: 'wav')
  - output_path (string): File path to save the generated audio

Returns:
  - File path where the audio was saved

Style Control:
  - Add style at text start: '(开心)今天天气真好！'
  - Use audio tags: '(紧张，深呼吸)呼……冷静'
  - Supported styles: 开心/悲伤/愤怒/温柔/磁性/活泼 etc.`,
      inputSchema: {
        text: TTSInputSchema.shape.text,
        prest_voice: TTSInputSchema.shape.prest_voice,
        style_instruction: TTSInputSchema.shape.style_instruction,
        output_format: TTSInputSchema.shape.output_format,
        output_path: TTSInputSchema.shape.output_path,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ text, prest_voice, style_instruction, output_format, output_path }, extra) => {
      try {
        // Build messages
        const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

        // Add style instruction as user message if provided
        if (style_instruction) {
          messages.push({
            role: "user",
            content: style_instruction,
          });
        }

        // Add text as assistant message (target text for synthesis)
        messages.push({
          role: "assistant",
          content: text,
        });

        const result = await client.chatCompletionWithAudio({
          model: MODELS.TTS,
          messages,
          audio: {
            format: output_format,
            prest_voice,
          },
        });

        // Save to file
        try {
          // Create directory if it doesn't exist
          const dir = dirname(output_path);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          // Convert base64 to buffer and save
          const audioBuffer = Buffer.from(result.audioData, "base64");
          writeFileSync(output_path, audioBuffer);
        } catch (saveError) {
          return {
            content: [{
              type: "text",
              text: `Error saving audio file: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `Speech synthesized successfully. Audio saved to: ${output_path}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error synthesizing speech: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

// Voice Design TTS Tool
const VoiceDesignInputSchema = z.object({
  text: z.string().min(1).max(5000).describe(
    "Text to convert to speech (1-5000 characters)"
  ),
  voice_description: z.string().min(10).max(500).describe(
    "Description of the desired voice characteristics.\n" +
    "Include details like:\n" +
    "- Gender and age: 'young woman in her mid-20s'\n" +
    "- Voice quality: 'deep and gravelly', '丝滑醇厚'\n" +
    "- Emotion/tone: 'warm and confident', '温柔但疲惫'\n" +
    "- Speed/rhythm: 'slow and deliberate', '语速极快'"
  ),
  output_format: z.enum(["wav", "mp3"]).default("wav").describe(
    "Output audio format (default: 'wav')"
  ),
  optimize_text_preview: z.boolean().default(false).describe(
    "Whether to intelligently optimize/polish the target text before synthesis (default: false).\n" +
    "When enabled, the model will refine the text for better speech output."
  ),
  output_path: z.string().min(1).describe(
    "File path to save the generated audio.\n" +
    "Example: 'C:\\Users\\user\\output.wav' or '/path/to/output.mp3'"
  ),
});

export function registerVoiceDesignTool(server: McpServer, client: MiMoClient): void {
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
  - Include age/gender: "五十多岁的中年男性"
  - Describe quality: "deep and gravelly", "丝滑醇厚"
  - Add context: "narrating a nature documentary"`,
      inputSchema: {
        text: VoiceDesignInputSchema.shape.text,
        voice_description: VoiceDesignInputSchema.shape.voice_description,
        output_format: VoiceDesignInputSchema.shape.output_format,
        optimize_text_preview: VoiceDesignInputSchema.shape.optimize_text_preview,
        output_path: VoiceDesignInputSchema.shape.output_path,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ text, voice_description, output_format, output_path, optimize_text_preview }, extra) => {
      try {
        const result = await client.chatCompletionWithAudio({
          model: MODELS.TTS_VOICE_DESIGN,
          messages: [
            {
              role: "user",
              content: voice_description,
            },
            {
              role: "assistant",
              content: text,
            },
          ],
          audio: {
            format: output_format,
            optimize_text_preview,
          },
        });

        // Save to file
        try {
          // Create directory if it doesn't exist
          const dir = dirname(output_path);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          // Convert base64 to buffer and save
          const audioBuffer = Buffer.from(result.audioData, "base64");
          writeFileSync(output_path, audioBuffer);
        } catch (saveError) {
          return {
            content: [{
              type: "text",
              text: `Error saving audio file: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `Speech synthesized with custom voice successfully. Audio saved to: ${output_path}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error synthesizing speech with voice design: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

// Voice Clone TTS Tool
const VoiceCloneInputSchema = z.object({
  text: z.string().min(1).max(5000).describe(
    "Text to convert to speech (1-5000 characters).\n" +
    "Can include style tags at the beginning:\n" +
    "- Natural style: '(开心)今天天气真好！'\n" +
    "- Singing: '(唱歌)歌词内容'\n" +
    "Or use audio tags for fine-grained control:\n" +
    "- '(紧张，深呼吸)呼……冷静，冷静。'"
  ),
  voice_audio: z.string().describe(
    "Audio sample for voice cloning. Can be:\n" +
    "- Base64-encoded audio data with MIME prefix (e.g., 'data:audio/wav;base64,UklGR...')\n" +
    "- A local file path (e.g., 'C:\\Users\\user\\sample.mp3' or '/path/to/sample.wav'). Recommend.\n\n" +
    "Supported formats: WAV, MP3\n" +
    "Max size: 10 MB (Base64-encoded)"
  ),
  style_instruction: z.string().optional().describe(
    "Optional natural language instruction for voice style.\n" +
    "Examples:\n" +
    "- 'Bright, bouncy tone with fast pace'\n" +
    "- '温柔治愈系女声'\n" +
    "- '用轻快上扬的语调，语速稍快'"
  ),
  output_format: z.enum(["wav", "mp3"]).default("wav").describe(
    "Output audio format (default: 'wav')"
  ),
  output_path: z.string().min(1).describe(
    "File path to save the generated audio.\n" +
    "Example: 'C:\\Users\\user\\output.wav' or '/path/to/output.mp3'"
  ),
});

export function registerVoiceCloneTool(server: McpServer, client: MiMoClient): void {
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
  - text (string): Text to synthesize (1-5000 chars). Can include style tags like (开心) or (唱歌)
  - voice_audio (string): Audio sample for voice cloning (Base64-encoded or local file path)
  - style_instruction (string): Optional style instruction for voice tone
  - output_format (string): Output format - 'wav' or 'mp3' (default: 'wav')
  - output_path (string): File path to save the generated audio

Returns:
  - File path where the audio was saved

Supported formats: WAV, MP3
Max size: 10 MB (Base64-encoded)

Style Control:
  - Add style at text start: '(开心)今天天气真好！'
  - Use audio tags: '(紧张，深呼吸)呼……冷静'
  - Supported styles: 开心/悲伤/愤怒/温柔/磁性/活泼 etc.`,
      inputSchema: {
        text: VoiceCloneInputSchema.shape.text,
        voice_audio: VoiceCloneInputSchema.shape.voice_audio,
        style_instruction: VoiceCloneInputSchema.shape.style_instruction,
        output_format: VoiceCloneInputSchema.shape.output_format,
        output_path: VoiceCloneInputSchema.shape.output_path,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ text, voice_audio, style_instruction, output_format, output_path }, extra) => {
      try {
        // Process voice audio - check if it's a local file
        let voiceAudioData = voice_audio;
        const isBase64 = voice_audio.startsWith("data:");
        const isLocalFile = !isBase64;

        if (isLocalFile) {
          if (!existsSync(voice_audio)) {
            return {
              content: [{
                type: "text",
                text: `Error: Voice audio file not found: ${voice_audio}`,
              }],
            };
          }

          try {
            const fileBuffer = readFileSync(voice_audio);
            const ext = extname(voice_audio).toLowerCase();
            const mimeType = AUDIO_MIME_TYPES[ext] || "audio/mpeg";
            const base64Data = fileBuffer.toString("base64");
            voiceAudioData = `data:${mimeType};base64,${base64Data}`;
          } catch (readError) {
            return {
              content: [{
                type: "text",
                text: `Error reading voice audio file: ${readError instanceof Error ? readError.message : String(readError)}`,
              }],
            };
          }
        }

        // Build messages
        const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

        // Add style instruction as user message if provided
        if (style_instruction) {
          messages.push({
            role: "user",
            content: style_instruction,
          });
        } else {
          messages.push({
            role: "user",
            content: "",
          });
        }

        // Add text as assistant message (target text for synthesis)
        messages.push({
          role: "assistant",
          content: text,
        });

        const result = await client.chatCompletionWithAudio({
          model: MODELS.TTS_VOICE_CLONE,
          messages,
          audio: {
            format: output_format,
            voice: voiceAudioData,
          },
        });

        // Save to file
        try {
          // Create directory if it doesn't exist
          const dir = dirname(output_path);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          // Convert base64 to buffer and save
          const audioBuffer = Buffer.from(result.audioData, "base64");
          writeFileSync(output_path, audioBuffer);
        } catch (saveError) {
          return {
            content: [{
              type: "text",
              text: `Error saving audio file: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `Speech synthesized with cloned voice successfully. Audio saved to: ${output_path}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error synthesizing speech with voice clone: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

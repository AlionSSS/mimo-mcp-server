/**
 * MiMo API Client Service
 */

import axios, { AxiosInstance } from "axios";
import type { MiMoConfig, ChatCompletionRequest, ChatCompletionResponse } from "../types.js";
import { MIMO_API_URL } from "../constants.js";

export class MiMoClient {
  private apiKey: string;
  private httpClient: AxiosInstance;

  constructor(config: MiMoConfig) {
    this.apiKey = config.apiKey;

    this.httpClient = axios.create({
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      timeout: 300000, // 5 minutes timeout for large media
    });
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      const response = await this.httpClient.post<ChatCompletionResponse>(
        MIMO_API_URL,
        request
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data as any;
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

  async chatCompletionWithReasoning(request: ChatCompletionRequest): Promise<{
    content: string;
    reasoning?: string;
  }> {
    const response = await this.chatCompletion(request);
    const message = response.choices[0]?.message;

    if (!message) {
      throw new Error("No response from MiMo API");
    }

    return {
      content: message.content || "",
      reasoning: message.reasoning_content,
    };
  }

  async chatCompletionWithAudio(request: ChatCompletionRequest): Promise<{
    audioData: string;
  }> {
    const response = await this.chatCompletion(request);
    const message = response.choices[0]?.message;

    if (!message?.audio?.data) {
      throw new Error("No audio data in MiMo API response");
    }

    return {
      audioData: message.audio.data,
    };
  }
}

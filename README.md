# MiMo MCP Server

- 一个为 MiMo 多模态模型能力提供统一的 Model Context Protocol (MCP) 接口的服务器，支持图像理解、音频理解、视频理解、语音识别和语音合等功能成等功能。
- **当你使用的模型不支持多模态时，可以使用该方式获得多模态能力。** 例如 mimo-v2.5-pro 没有多模态能力，但是可以通过该 MCP Server 调用拥有多模态能力的 mimo-v2.5 模型。

## 功能特性

| 功能模块          | 特性说明                                                                                    | 支持格式/场景                 | 对话图例                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🖼️ 图像理解      | 支持图像 URL、Base64 编码、本地文件路径等多种输入方式。支持单张或多张图像分析。支持图像描述、OCR 文字提取、场景识别等。                     | JPEG、PNG、GIF、WebP、BMP   | [图像理解示例](docs/图像理解示例.png)                                                                                                                           |
| 🎵 音频理解       | 支持音频 URL、Base64 编码、本地文件路径等多种输入方式。支持音频内容分析、情感识别、语言检测等。                                   | MP3、WAV、FLAC、M4A、OGG    | [音频理解示例](docs/音频理解示例.png)                                                                                                                           |
| 🎬 视频理解       | 支持视频 URL、Base64 编码、本地文件路径等多种输入方式。支持视频内容分析、场景描述、动作识别等。                                   | MP4、MOV、AVI、WMV         | [视频理解示例](docs/视频理解示例.png)                                                                                                                           |
| 🎤 语音识别 (ASR) | 支持中文、英文及自动语言检测。支持方言识别（粤语、吴语、闽南语、四川话等）。                                                  | 会议转写、歌词识别、嘈杂环境录音        | [语音识别示例](docs/语音识别示例.png)                                                                                                                           |
| 🔊 语音合成 (TTS) | **预置音色**：提供多种预置音色（冰糖、茉莉、苏打、白桦等）。**音色设计**：通过文本描述自定义音色特征。**音色复刻**：基于音频样本克隆音色。支持情感控制和风格指令。 | 多种预置音色 + 自定义音色设计 + 音频克隆 | [使用预置音色](docs/语音合成示例-使用预置音色.png)、[使用文本设计音色](docs/语音合成示例-使用文本设计音色.png)、[使用文本设计音色（智能润色）](docs/语音合成示例-使用文本设计音色（智能润色）.png)、[音色复刻](docs/语音合成示例-音色复刻.png) |

**Tips:**
- [工具参数说明](工具参数说明.md)
- MIMO 模型更多参数、功能见底部“相关链接”
- MIMO Studio <https://aistudio.xiaomimimo.com/>

## 快速开始

- 请先确保你的环境中已安装 NodeJS，建议版本 >= 22
- 下载 `git clone https://github.com/AlionSSS/mimo-mcp-server.git`
- MCP Server 配置

```
{
  "mcpServers": {
    "mimo-mcp-server": {
      "command": "node",
      "args": [
        "<PATH_TO>/mimo-mcp-server/dist/index.js"
      ],
      "env": {
        "MIMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

- 可用环境变量 env

```bash
# 必需：MiMo API Key
MIMO_API_KEY="your-api-key-here"

# 可选：自定义 API 端点（默认为小米官方端点）
MIMO_API_URL="https://token-plan-cn.xiaomimimo.com/v1/chat/completions"

# 可选：自定义模型 ID
MIMO_MODEL_MULTIMODAL="mimo-v2.5"
MIMO_MODEL_ASR="mimo-v2.5-asr"
MIMO_MODEL_TTS="mimo-v2.5-tts"
MIMO_MODEL_TTS_VOICE_DESIGN="mimo-v2.5-tts-voicedesign"
MIMO_MODEL_TTS_VOICE_CLONE="mimo-v2.5-tts-voiceclone"
```

## 项目结构

```
mimo-mcp-server/
├── src/
│   ├── services/
│   │   └── mimo-client.ts          # MiMo API 客户端
│   ├── tools/
│   │   ├── audio-understanding.ts   # 音频理解工具
│   │   ├── image-understanding.ts   # 图像理解工具
│   │   ├── speech-recognition.ts    # 语音识别工具
│   │   ├── speech-synthesis.ts      # 语音合成工具
│   │   └── video-understanding.ts   # 视频理解工具
│   ├── constants.ts                 # 常量定义
│   ├── index.ts                     # 主入口
│   └── types.ts                     # 类型定义
├── resources/                       # 示例资源
├── docs/                            # 文档
├── package.json
└── tsconfig.json
```

## 技术栈

- **运行时**: Node.js 22+
- **语言**: TypeScript
- **构建工具**: esbuild
- **MCP SDK**: @modelcontextprotocol/sdk
- **HTTP 客户端**: axios
- **数据验证**: zod

## 开发

- 下载，克隆项目

```
git clone https://github.com/AlionSSS/mimo-mcp-server.git
cd mimo-mcp-server
```

- 安装依赖 `$ npm install`
- 开发模式 `$ npm run dev`
- 构建 `$ npm run build`
- 代码检查 `$ npx tsc --noEmit`

## 许可证

MIT License

## 相关链接

- [Model Context Protocol](https://modelcontextprotocol.io)
- [MiMo 平台文档](https://platform.xiaomimimo.com/docs)
- [图像理解文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/image-understanding)
- [音频理解文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/audio-understanding)
- [视频理解文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/video-understanding)
- [语音识别文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/Speech-Recognition)
- [语音合成文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5)


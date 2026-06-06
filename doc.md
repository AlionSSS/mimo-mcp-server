使用 TypeScript 创建一个 mcp-server，说明如下：
1. 该 mcp-server 用于提供 mimo 模型的多模态能力。用户当前模型不支持多模态能力时或用户说需要下面的多模态能力时调用。
2. 支持的多模态能力：
   - 图片理解（mimo-v2.5），模型可以根据您传入的图片进行回答，支持图片 URL 和 Base64 编码两种传入方式，适用于图片描述、分类等场景。
   - 音频理解（mimo-v2.5），模型可以根据您传入的音频进行回答，支持音频 URL 和 Base64 编码两种传入方式，适用于音频分析等场景。
   - 视频理解（mimo-v2.5），模型可以根据您传入的视频进行回答，支持视频 URL 和 Base64 编码两种传入方式，适用于视频分析等场景。
   - 语音识别（MiMo-V2.5-ASR），支持将输入的音频自动转换为文本输出，适用于会议转写、歌词识别、方言转写、嘈杂环境录音等场景。您可通过指定语种等参数，提升识别准确率。
   - 语音合成（MiMo-V2.5-TTS 系列），支持将输入的文本自动转换为自然流畅的语音输出。您可通过配置发音风格、音色等参数，生成自然生动的语音内容。
3. mimo 模型的文档说明：
  - 图片理解 文档地址 https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/image-understanding
  - 音频理解 文档地址 https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/audio-understanding
  - 视频理解 文档地址 https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/video-understanding
  - 语音识别（MiMo-V2.5-ASR） 文档地址 https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/Speech-Recognition
  - 语音合成（MiMo-V2.5-TTS 系列） 文档地址 https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5
4. 需要用户配置 URL 和 API Key
  - 默认的 URL 为 OpenAPI 兼容地址 https://token-plan-cn.xiaomimimo.com/v1/chat/completions
  - 用户需要在配置文件中指定 API Key，用于调用 mimo 模型的 API。

# Peek — Private On-Device AI

**Five AI modules. One phone. No cloud.**

Peek is a mobile app powered by the [qvac SDK](https://www.npmjs.com/package/@qvac/sdk) that runs vision, voice, writing, and research AI models fully on your device. Your photos, audio, documents, and conversations never leave your phone.

Built for the **[qvac Unleash Edge AI Hackathon](https://dorahacks.io/hackathon/qvac-unleach-edge-ai-i/tracks)**.

---

## Modules

| Module | What it does |
|--------|-------------|
| **Peek Lens** | Point your camera or pick an image — ask anything about what it sees |
| **Peek Voice** | Record or upload audio → live transcript → AI summary |
| **Peek Scribe** | Draft documents, notes, or HTML pages with an on-device writing assistant |
| **Peek Deep** | Load a local file → ask questions about it → fully private RAG |
| **AI Chat** | Open-ended conversations with a local language model, history saved on-device |

---

## Highlights

- **100% on-device inference** — qvac SDK handles model loading, streaming, and cancellation natively
- **Private by design** — no telemetry, no accounts, no data ever sent to a server
- **Model management** — download models once, stored in per-model folders; swap models per session
- **Scribe artifacts** — generates Markdown and interactive HTML files viewable in-app
- **Deep RAG** — embeds local files on-device using qvac's embedding model; no URL fetching
- **Voice pipeline** — chunk-based live transcription → LLM summary with elapsed time display
- **Token stats** — elapsed time and token count shown after every AI response
- **Android notifications** — stop inference from the notification shade while the app is in background
- **Dark and light theme**, conversation history, configurable generation parameters

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React Native, Expo SDK 54 (bare workflow) |
| AI runtime | `@qvac/sdk` — loadModel, completion, transcribeStream, ragIngest, ragSearch |
| Camera | expo-camera |
| Audio | expo-av |
| File system | expo-file-system v2 (File, Directory, Paths) |
| Document picker | expo-document-picker |
| Persistence | @react-native-async-storage/async-storage |
| Navigation | React Navigation (native stack) |

---

## Models

Models are downloaded on first use and stored in per-model folders. Nothing is bundled in the APK.

| Model | Size | Use |
|-------|------|-----|
| Qwen3 1.7B | 1.1 GB | Fast general text — Scribe, Chat, Voice summary |
| MedPsy 4B | 2.7 GB | Medical & mental health specialist — Lens health mode |
| Gemma 4 2B | 2.7 GB | Stronger at HTML, code, and interactive games — Scribe |
| SmolVLM2 500M | 521 MB | On-device image understanding — Peek Lens |

Vision models automatically download a companion `mmproj.gguf` projection file, handled transparently.

---

## Getting Started

### Prerequisites

- Node.js 18+
- EAS CLI (`npm i -g eas-cli`) for device builds

### Development

```bash
npm install
npx expo start
```

### Build APK (Android)

```bash
eas build --platform android --profile preview
```

The APK targets arm64-v8a with R8 minification and resource shrinking enabled.

---

## Project Structure

```
src/
├── components/
│   ├── ConfigSlider.tsx        # Slider for generation params (Settings)
│   ├── CopyButton.tsx
│   ├── HtmlPreviewPanel.tsx    # In-app WebView for generated HTML
│   ├── Icons.tsx
│   ├── MarkdownText.tsx
│   ├── MdPreviewPanel.tsx      # In-app viewer for generated Markdown
│   ├── ModelGalleryPicker.tsx  # Bottom sheet model switcher
│   ├── PeekLoader.tsx          # Animated loading indicator
│   ├── ResultActions.tsx       # Copy / Save / Share row
│   └── TypingDots.tsx          # Animated dots for streaming state
├── navigation/
│   └── AppNavigator.tsx        # Root stack, theme context
├── screens/
│   ├── AboutScreen.tsx
│   ├── AIChatHubScreen.tsx     # Chat history list
│   ├── AIChatScreen.tsx        # AI Chat — streaming conversation
│   ├── ChatScreen.tsx          # Peek Scribe — writing assistant
│   ├── DeepHubScreen.tsx       # Deep session history
│   ├── DeepScreen.tsx          # Peek Deep — file RAG
│   ├── DownloadScreen.tsx      # Model download progress
│   ├── HistoryScreen.tsx       # Lens scan history
│   ├── HomeScreen.tsx          # Module grid
│   ├── LensHubScreen.tsx       # Lens entry — camera vs. gallery
│   ├── LensResultScreen.tsx    # Vision inference result
│   ├── ModelsScreen.tsx        # Download & manage models
│   ├── OnboardingScreen.tsx    # First-launch flow
│   ├── ScanScreen.tsx          # Camera capture + user query
│   ├── ScribeHubScreen.tsx     # Scribe conversation history
│   ├── SettingsScreen.tsx      # Theme, accelerator, generation params
│   ├── SplashScreen.tsx        # Startup model sync
│   └── VoiceScreen.tsx         # Record / upload → transcribe → summarize
├── utils/
│   ├── bgNotification.ts       # Android inference notification + Stop action
│   ├── modelManager.ts         # LLMManager singleton (hot-swap), WhisperManager
│   ├── models.ts               # Model catalogue, system prompts, stream utils
│   ├── ragService.ts           # ragIngest / ragQuery wrappers
│   └── storage.ts              # AsyncStorage helpers, conversation persistence
└── types/
    └── index.ts
```

---

## Privacy

- All inference runs on-device via the qvac native runtime
- No images, audio, text, or results are sent to any server
- Audio recordings are processed from the app's documents directory and never uploaded
- Peek Deep reads files entirely locally — no URL fetching, no external API calls
- Models are downloaded once and cached on-device

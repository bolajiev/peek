# Peek — On-Device AI Visual Scanner

**Point your camera at anything. Get instant AI analysis. Completely private.**

Peek is a mobile app that uses local vision-language models (VLMs) to analyse what your camera sees — food, plants, text, health info, code, and objects — with no internet required and no data ever leaving your device.

Built for the **[qvac Unleash Edge AI Hackathon](https://dorahacks.io/hackathon/qvac-unleach-edge-ai-i/tracks)**.

---

## Features

| Category | What it does |
|----------|-------------|
| 🍎 Food & Nutrition | Calories, macros, health rating, ingredients |
| 🌿 Plant Identifier | Species, care level, toxicity, watering tips |
| 📄 Text & Documents | OCR extraction, summary, translation |
| 💊 Health & Medicine | Medical image analysis with safety disclaimers |
| 💻 Code Reader | Language detection, explanation, bug list, suggestions |
| 🔍 Object Identifier | Name, category, description, estimated value |

- **100% on-device** — powered by [qvac SDK](https://dorahacks.io/hackathon/qvac-unleach-edge-ai-i/tracks), no cloud APIs
- **Streaming chat** — ask follow-up questions about any scan result
- **10 VLM models** to choose from (500MB–6.4GB), including qvac's own MedPsy models
- **Per-category history** with image thumbnails
- **Custom system prompts** — edit the AI's instructions per scan type in Settings
- **First-launch onboarding** with privacy-first messaging
- **Dark & light theme**

---

## Tech Stack

- **React Native** (Expo SDK 54, New Architecture)
- **[@qvac/sdk](https://www.npmjs.com/package/@qvac/sdk)** — on-device LLM inference (loadModel, completion, cancel, streaming)
- **expo-camera** — camera capture
- **expo-file-system** — local model storage
- **AsyncStorage** — settings, history, scan streak
- **React Navigation** — native stack + bottom tabs

---

## Models

All models run locally via the qvac SDK. Recommended starting points:

| Model | Size | Best for |
|-------|------|----------|
| MedPsy-1.7B ⭐ | 2.4 GB | Health & food (qvac's own model) |
| SmolVLM2-500M Lite | 546 MB | Low-end devices, quick tests |
| Qwen3.5-0.8B | 649 MB | Fast all-purpose scanning |
| MedPsy-4B | 4.1 GB | Medical-grade accuracy |
| Gemma 4 (4B) | 6.4 GB | Best overall accuracy |

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [EAS CLI](https://docs.expo.dev/eas/cli/) for builds

### Run locally

```bash
npm install
npx expo start
```

### Build APK (Android)

```bash
npx eas build --platform android --profile preview
```

### Build for iOS

```bash
npx eas build --platform ios --profile preview
```

---

## Project Structure

```
src/
├── components/
│   └── PeekLogo.tsx          # Animated logo component
├── navigation/
│   └── AppNavigator.tsx      # Stack + tab navigation
├── screens/
│   ├── SplashScreen.tsx      # Startup + onboarding check
│   ├── OnboardingScreen.tsx  # First-launch flow
│   ├── HomeScreen.tsx        # Use-case grid
│   ├── CameraScreen.tsx      # Capture + inference
│   ├── ResultScreen.tsx      # Per-category result views
│   ├── ChatScreen.tsx        # Streaming follow-up chat
│   ├── HistoryScreen.tsx     # Per-category scan history
│   ├── ModelsScreen.tsx      # Download & manage models
│   └── SettingsScreen.tsx    # Settings + prompt editor
├── utils/
│   ├── models.ts             # Model list + system prompts
│   ├── storage.ts            # AsyncStorage helpers
│   └── auditLogger.ts        # Inference logging
└── types/
    └── index.ts              # TypeScript types
```

---

## Privacy

- Photos are taken and analysed entirely on your device
- No images, results, or personal data are ever sent to any server
- HuggingFace token (if provided) is stored only in local device storage
- Models are downloaded once and stored locally

---

## Built with qvac

All AI inference in Peek is powered by the **qvac SDK** — a native on-device AI runtime for mobile. The qvac SDK handles model loading, vision-language inference, streaming, and cancellation entirely on-device.

```ts
// Load a vision model
const modelId = await loadModel({
  modelSrc: localModelPath,
  modelType: 'llm',
  modelConfig: { ctx_size: 2048, projectionModelSrc: localMmprojPath },
  onProgress: (p) => console.log(`${p.percentage.toFixed(0)}%`),
});

// Run inference with an image
const run = completion({
  modelId,
  history: [{ role: 'user', content: 'What is this?', attachments: [{ path: imagePath }] }],
  stream: true,
});
for await (const event of run.events) {
  if (event.type === 'contentDelta') process.stdout.write(event.text);
}
```

---

## License

Apache 2.0

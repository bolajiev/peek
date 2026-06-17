# Peek — Private On-Device AI

**Five AI modules. One phone. No cloud.**

Peek is a mobile app powered by the [qvac SDK](https://www.npmjs.com/package/@qvac/sdk) that runs vision, voice, writing, and research AI models fully on your device. No internet required after download. No data ever leaves your phone.

Built for the **[qvac Unleash Edge AI Hackathon](https://dorahacks.io/hackathon/qvac-unleach-edge-ai-i/tracks)**.

---

## Modules

| Module | What it does | Model |
|--------|-------------|-------|
| **Peek Lens** | Point your camera or pick an image — ask anything about what it sees | Vision LLM (SmolVLM2, Qwen3-VL, Gemma 4…) |
| **Peek Voice** | Record or upload audio → instant transcript → optional AI summary | Whisper (built-in) + any LLM |
| **Peek Scribe** | Draft documents or chat with an on-device writing assistant | Any LLM |
| **Peek Deep** | Pick a local file → ask questions about it → fully offline RAG | Embedding model + any LLM |
| **Quick Chat** | Fastest path to a chat session — uses the smallest downloaded model | Any LLM |
| **Peek Relay** | P2P model offload to a nearby device | — *(coming soon)* |

---

## Highlights

- **100% on-device** — qvac SDK handles model loading, inference, streaming, and cancellation natively
- **Per-model folder storage** — each download lives in `peek/models/{id}/` containing `model.gguf` and optional `mmproj.gguf`; vision companion files never appear as separate models in the list
- **Auto-launch flow** — tapping a module with no model routes you to the download screen, which opens the module automatically once the download completes
- **4-state module screens** — every screen handles loading, ready, error, and no-model states; no raw file paths shown to users
- **Voice reliability** — recordings are copied to the documents directory before transcription (prevents Android cache eviction); stop is fully awaited before the file is read (prevents encoder finalize race)
- **Local file RAG** — Peek Deep reads files on-device via the qvac embedding model; no URL fetching, no CORS, no cloud
- **Dark & light theme**, sidebar navigation, scan history, custom system prompts per scan type

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React Native, Expo SDK 54 (New Architecture) |
| AI runtime | `@qvac/sdk` — loadModel, completion, transcribe, ragIngest, ragSearch |
| Camera | expo-camera |
| Audio | expo-av |
| File system | expo-file-system v2 (File, Directory, Paths) |
| Document picker | expo-document-picker |
| Persistence | @react-native-async-storage/async-storage |
| Navigation | React Navigation (native stack) |

---

## Models

Models are downloaded on first use and stored in per-model folders. Nothing is bundled in the APK.

| Model | Size | Type | Best for |
|-------|------|------|----------|
| MedPsy-1.7B ⭐ | 2.4 GB | Text | Health & food (qvac's own) |
| SmolVLM2-500M Lite | 546 MB | Vision | Low-end devices, quick scans |
| Qwen3.5-0.8B | 649 MB | Vision | Fast all-purpose |
| SmolVLM2-500M | 1 GB | Vision | Sharper than Lite |
| Qwen3-VL-2B | 1.5 GB | Vision | Strong scene understanding |
| OCR Specialist | 1.2 GB | Vision | Text & document extraction |
| Qwen3.5-VL-2B | 1.9 GB | Vision | Balanced everyday use |
| Qwen3.5-4B | 3.4 GB | Vision | Best general accuracy |
| MedPsy-4B | 4.1 GB | Text | Medical-grade health analysis |
| Gemma 4 (4B) | 6.4 GB | Vision | Top-tier image understanding |

Vision models automatically download a `mmproj.gguf` companion file into the same folder, handled transparently.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm i -g expo-cli`)
- EAS CLI (`npm i -g eas-cli`) for device builds

### Development

```bash
npm install
npx expo start
```

### Build APK (Android — arm64 sideload)

```bash
eas build --platform android --profile preview
```

The release APK targets **arm64-v8a only**, with R8 minification and resource shrinking enabled. Expected install size ≈ 150 MB (models excluded).

### Build for iOS

```bash
eas build --platform ios --profile preview
```

---

## Project Structure

```
src/
├── components/
│   ├── Icons.tsx               # SVG icon set
│   ├── ModelPickerSheet.tsx    # Bottom sheet for model selection
│   ├── PeekLogo.tsx
│   └── Sidebar.tsx             # Drawer navigation
├── navigation/
│   └── AppNavigator.tsx        # Root stack, theme context, sidebar
├── screens/
│   ├── SplashScreen.tsx        # Startup — syncs model state from disk
│   ├── OnboardingScreen.tsx    # First-launch flow
│   ├── HomeScreen.tsx          # Module grid + draggable Quick Chat FAB
│   ├── LensHubScreen.tsx       # Lens: camera vs. gallery choice
│   ├── ScanScreen.tsx          # Lens: capture + vision inference
│   ├── VoiceScreen.tsx         # Voice: record/upload → transcribe → summarize
│   ├── ScribeHubScreen.tsx     # Scribe: document vs. chat mode choice
│   ├── ChatScreen.tsx          # Scribe chat + document mode
│   ├── DeepScreen.tsx          # Deep: pick file → RAG → offline Q&A
│   ├── RelayScreen.tsx         # Relay: coming soon
│   ├── QuickChatScreen.tsx     # Quick Chat (smallest model, streaming)
│   ├── ResultScreen.tsx        # Scan result + error state (Retry / Manage Models)
│   ├── HistoryScreen.tsx       # Scan history
│   ├── ModelsScreen.tsx        # Download & manage models
│   └── SettingsScreen.tsx      # Theme, accelerator, HF token, prompts
├── utils/
│   ├── models.ts               # AVAILABLE_MODELS catalogue + system prompts
│   ├── modelManager.ts         # LLMManager (hot-swap), DescriptorModelManager (Whisper)
│   ├── storage.ts              # AsyncStorage helpers, toPath(), syncModelsFromDisk()
│   ├── ragService.ts           # ragIngest / ragSearch wrappers
│   └── auditLogger.ts          # Inference timing logs
└── types/
    └── index.ts                # Shared TypeScript types
```

---

## Key Implementation Details

### Model path handling

The qvac SDK's `loadModel` and `transcribe` require bare filesystem paths, not `file://` URIs. All calls go through `toPath()`:

```ts
// storage.ts
export function toPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice(7) : uri;
}

// Applied before every SDK call
modelSrc: toPath(model.modelSrc),
projectionModelSrc: toPath(model.projectionModelSrc),
```

### Voice transcription

```ts
// 1. Await full finalize (prevents encoder race)
await rec.stopAndUnloadAsync();

// 2. Copy to documents dir (prevents cache eviction on Android)
new File(cacheUri).copy(destFile);

// 3. Transcribe with bare path
await transcribe({ modelId: whisperModelId, audioChunk: toPath(destFile.uri) });
```

### Peek Deep — local file RAG

```ts
// Pick file → read locally → embed → store in qvac RAG workspace
const content = await new File(uri).text();
const embedId = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
await ragIngest({ modelId: embedId, documents: [content], workspace: 'peek-memory', chunk: true });

// At query time
const results = await ragSearch({ modelId: embedId, query, topK: 5, workspace: 'peek-memory' });
```

### Auto-launch flow

When a module has no compatible model, Home passes an `autoLaunch` param to the Models screen. After a download completes, Models automatically navigates into the target module:

```ts
// HomeScreen
navigation.navigate('Models', { autoLaunch: { screen: mod.screen, label: mod.title } });

// ModelsScreen — after successful download
if (autoLaunch) {
  setTimeout(() => navigation.navigate(autoLaunch.screen, { modelId: newModel.id }), 400);
}
```

---

## Privacy

- All inference runs on-device via the qvac native runtime
- No images, audio, text, or results are sent to any server
- Recordings are processed from the app's documents directory and never uploaded
- Peek Deep reads files entirely locally — no URL fetching, no external API calls
- HuggingFace token (optional, for gated models) is stored only in device AsyncStorage
- Models are downloaded once and cached in `peek/models/{id}/`

---

## License

Apache 2.0

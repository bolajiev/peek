# Peek — Social Content & Video Proof Guide

Post these as 5 separate threads on X / LinkedIn. Each thread stands alone.

---

## Thread 1 — completion() with streaming

I built Peek for QVAC and here are 4 things that come pre-loaded in the SDK. First: `completion()` with streaming. Pass a model ID, history, and `stream: true`. Tokens stream live to your UI. Nothing leaves the phone.

**Video proof — under 30 seconds:**
1. Open AI Chat
2. Type: `explain quantum computing in 2 lines`
3. Hit send — let it stream
4. Stop recording when response finishes

What to highlight: tokens appearing one by one, the tok/s stat at the bottom of the bubble.

---

## Thread 2 — transcribeStream()

Second: `transcribeStream()`. Peek Voice chunks audio every 8 seconds, runs Whisper on-device, chains context across chunks. Full offline transcription pipeline. No cloud API. Just a file path and an events loop.

**Video proof — under 30 seconds:**
1. Open Voice
2. Tap record — say 2-3 sentences out loud
3. Tap stop — let it transcribe then explain
4. Stop recording when the summary appears

What to highlight: transcript building up live, MedPsy explanation appearing below.

---

## Thread 3 — RAG (ragIngest + ragSearch)

Third: on-device RAG. `ragIngest()` embeds your file locally. `ragSearch()` pulls relevant chunks before each LLM call. Peek Deep lets users ask questions about private documents — nothing ever leaves the device.

**Video proof — under 30 seconds:**
1. Open Deep
2. Load any text or PDF file (a medical report works well)
3. Type: `what is this document about?`
4. Let it answer — stop recording when done

What to highlight: the file loading locally, the answer pulling from the actual document content.

---

## Thread 4 — Tool Calling

Fourth: tool calling. Pass a `tools` array to `completion()`. When the model calls a tool, you get a `toolCall` event with parsed arguments. In Peek, asking "show me Paris" triggers `show_map` and renders a live map in the chat bubble instantly.

**Video proof — under 30 seconds:**
1. Open AI Chat
2. Type: `show me Times Square New York`
3. Hit send — map appears inline in the bubble
4. Scroll or zoom the map slightly to show it's interactive

What to highlight: the map appearing inside the chat message — not opening a new screen, rendered inline as a tool result.

---

## Thread 5 — Useful things in the SDK

Bonus things in the QVAC SDK worth knowing:
`cancel({ requestId })` — stop inference from anywhere
`run.stats` — tokens/sec after every response
`reasoning_budget: 0` — disables chain-of-thought for speed
`llmManager.ensure()` — keeps models hot between calls
`syncModelsFromDisk()` — no server, just what's on the phone

**Video proof — under 30 seconds:**
1. Open AI Chat
2. Type: `write me a long essay about space` — hit send
3. While it streams, swipe down the notification shade
4. Tap **Stop** — inference cancels immediately
5. Then do a short prompt and point at the tok/s number in the response

What to highlight: cancellation working from the Android notification, tok/s stat visible after a response.

---

## Recording Tips

- Use Android built-in screen recorder: swipe down notification shade → Screen Record
- Trim clips in Google Photos before posting
- Landscape format works for YouTube Shorts with captions
- Post each clip as a separate reply in the thread — video in reply 1, text in reply 2

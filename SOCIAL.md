# Peek — Social Content & Video Proof Guide

Post these as 5 separate threads on X / LinkedIn. Each thread stands alone.
All examples use MedPsy — the model Peek defaults to.

---

## Thread 1 — completion() with streaming

I built Peek for QVAC and here are 4 things that come pre-loaded in the SDK. First: `completion()` with streaming. Pass a model ID, history, and `stream: true`. Tokens stream live to your UI. Nothing leaves the phone.

**Video proof — under 30 seconds:**
1. Open AI Chat
2. Type: `explain what anxiety does to the brain in 2 lines`
3. Hit send — let MedPsy stream the answer
4. Stop recording when response finishes

What to highlight: tokens appearing one by one from MedPsy 1.7B, the tok/s stat at the bottom of the bubble.

---

## Thread 2 — transcribeStream()

Second: `transcribeStream()`. Peek Voice chunks audio every 8 seconds, runs Whisper on-device, chains context across chunks. Full offline transcription pipeline. No cloud API. Just a file path and an events loop.

**Video proof — under 30 seconds:**
1. Open Voice
2. Tap record — describe a symptom or health question out loud
3. Tap stop — let it transcribe then explain
4. Stop recording when the MedPsy explanation appears

What to highlight: transcript building up live, MedPsy 1.7B explanation appearing below it.

---

## Thread 3 — RAG (ragIngest + ragSearch)

Third: on-device RAG. `ragIngest()` embeds your file locally. `ragSearch()` pulls relevant chunks before each LLM call. Peek Deep lets users ask questions about private documents — nothing ever leaves the device.

**Video proof — under 30 seconds:**
1. Open Deep
2. Load a medical report or health document
3. Type: `what does this document say about the diagnosis?`
4. Let MedPsy answer — stop recording when done

What to highlight: the file loading locally, MedPsy pulling the answer from the actual document content.

---

## Thread 4 — Tool Calling

Fourth: tool calling. Pass a `tools` array to `completion()`. When the model calls a tool, you get a `toolCall` event with parsed arguments. In Peek, asking "show me the nearest hospital area" triggers `show_map` and renders a live map in the chat bubble instantly — powered by MedPsy.

**Video proof — under 30 seconds:**
1. Open AI Chat
2. Type: `show me Johns Hopkins Hospital Baltimore`
3. Hit send — MedPsy calls show_map, map appears inline
4. Scroll or zoom the map slightly to show it's interactive

What to highlight: the map appearing inside the chat message as a MedPsy tool result — not a separate screen.

---

## Thread 5 — Useful things in the SDK

Bonus things in the QVAC SDK worth knowing:
`cancel({ requestId })` — stop MedPsy inference from anywhere
`run.stats` — tokens/sec after every response
`reasoning_budget: 0` — disables chain-of-thought for speed
`llmManager.ensure()` — keeps MedPsy hot between calls
`syncModelsFromDisk()` — no server, just what's on the phone

**Video proof — under 30 seconds:**
1. Open AI Chat
2. Type: `explain the symptoms of hypertension in detail` — hit send
3. While MedPsy streams, swipe down the notification shade
4. Tap **Stop** — inference cancels immediately
5. Do a short prompt and point at the tok/s number in the response

What to highlight: cancellation working from the Android notification, MedPsy tok/s stat visible after a response.

---

## Recording Tips

- Use Android built-in screen recorder: swipe down notification shade → Screen Record
- Trim clips in Google Photos before posting
- Landscape format works for YouTube Shorts with captions
- Post each clip as a separate reply in the thread — video in reply 1, text in reply 2

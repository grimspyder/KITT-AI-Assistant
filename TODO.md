# TODO — KITT-AI-Assistant

## Done
- [x] Scaffold, repo, CI-relevant gates (build/lint/tsc/test)
- [x] KITT dashboard replica (labels, pills, 3×16-segment modulator, center-out)
- [x] Provider abstractions: LLM (OpenAI/OpenRouter/Anthropic/Gemini/OpenAI-compatible/demo), TTS (ElevenLabs/OpenAI/browser/demo), STT (browser/Whisper)
- [x] Server-side key proxying, encrypted secret storage, masked UI
- [x] Streaming LLM → sentence queue → streaming TTS (first sentence before stream completes)
- [x] State machine + interruption/barge-in
- [x] Demo mode (no API required)
- [x] Unit tests 18/18; E2E scenarios 1–11 (see TESTING.md)
- [x] TEST CONNECTION / TEST VOICE / TEST LEDS
- [x] RESEARCH.md, BUGS.md, TESTING.md, ARCHITECTURE.md

## Open
- [ ] Audio→LED sync latency measurement with audible playback (real browser)
- [ ] Voice-input E2E (mic permission, hands-free end-of-turn, push-to-talk)
- [ ] Wire selected mic deviceId into MicCapture (B-07)
- [ ] Mobile portrait/landscape layout verification
- [ ] Full-screen mode button + wake-lock verification
- [ ] Invalid-key E2E against live providers
- [ ] Conversation summarization for long sessions (currently last-16-turns window)
- [ ] PWA manifest + service worker
- [ ] Optional subtle UI sound cues (system activated/error) via oscillator synthesis
- [ ] Final reviewer pass (§32 checklist)

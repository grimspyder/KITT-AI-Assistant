# BUGS.md — Defect Tracking

Severity: P0 app unusable · P1 critical KITT experience broken · P2 important functionality broken · P3 cosmetic

| ID | Sev | Description | Repro | Expected | Actual | Status |
|----|-----|-------------|-------|----------|--------|--------|
| B-01 | P1 | Conversation stalls in THINKING; TTS never starts | Send any text; reply streams but never speaks | First sentence queues and speaks while streaming | Sentence boundaries forming across stream chunks were consumed by the splitter, so the queue stayed empty | **FIXED** (7742082) — queueFrom rewritten to consume only terminator+whitespace boundaries |
| B-02 | P1 | TEST VOICE hangs 60s+ | Click TEST VOICE in an autoplay-blocked browser | Test resolves or reports error promptly | `el.play()` rejection was swallowed; final wait relied on a 60s timeout | **FIXED** (7435ff0) — play rejection now resolves the wait after 500 ms |
| B-03 | P2 | Mic-permission denial put machine in ERROR, dead-ending text input | Start conversation in a no-mic browser; mic denied | Error shown, text input still usable | Machine entered ERROR; text sends ignored | **FIXED** (7742082) — mic denial reports but keeps engine usable |
| B-04 | P2 | Stale `npm start` servers serve old chunks, mimicking code bugs | Rebuild while a previous prod server still holds port 3000 | New build served | Old build served from orphaned node.exe process | OPEN (environment/tooling — document; kill orphans before verify) |
| B-05 | P2 | Voice-modulator bars untestable without a real audio session | Open app in automation browser; start conversation; no LED motion | Need a way to verify the render path | AnalyserNode gets no samples while AudioContext suspended | **MITIGATED** — TEST LEDS synthetic mode added (drives identical render path without audio) |
| B-06 | P3 | Audio-to-LED sync latency unmeasured in automation | Speak with real TTS audio; compare envelope vs LED frames | <50 ms perceived error | Cannot measure in suspended-context browser | OPEN (needs real-browser verification session) |
| B-07 | P3 | Voice provider dropdown in AUDIO section doesn't persist selection | Select a mic in Settings → AUDIO | Selected mic used | Selection UI only (default mic used); needs deviceId wiring into MicCapture | OPEN (P3 — default mic works) |

## Release gate
No P0 defects. B-04/B-05 are environment notes; B-06 requires a real-browser session. B-07 cosmetic.

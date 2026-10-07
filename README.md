# NOVA — a free AI companion

NOVA is a GitHub Pages-ready futuristic AI companion with two ways to communicate:

- **Talk**: press the microphone, speak, and NOVA listens with the browser Speech Recognition API. Replies are spoken aloud with animated presence, head motion, blinking, and lip-sync cues.
- **Chat**: type messages and receive spoken replies in the same conversation.

## AI model

The site uses **Llama 3.2 3B Instruct** through WebLLM. It runs locally in the browser with WebGPU, so no API key or paid backend is required. The first model initialization downloads model files to the browser cache. If WebGPU is unavailable, the UI remains usable with a lightweight offline fallback.

## Run locally

Serve this folder from a local HTTP server, then open the site in Chrome or another Web Speech-compatible browser:

    python3 -m http.server 8000

The avatar image is embedded in `index.html`, so the exact neural-face reference used by the site is present in the repository source.

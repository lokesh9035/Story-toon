# StoryToon — Free Browser Cartoon Generator

This is a free, browser-only 2D cartoon generator. All animation, text-to-speech, and video recording run in the user's browser — no OpenAI, no paid APIs, and no server-side video generation.

Highlights
- Completely free to use; no API keys required.
- Runs entirely in the browser (HTML Canvas + Web Speech API + MediaRecorder).
- Works on Android Chrome and modern desktop browsers.
- Simple Express server included to host static files and provide a health endpoint.

How it works
- User enters a story on the site.
- The client splits the story into a set of scenes in-browser.
- Each scene is rendered and animated on an HTML Canvas with characters, camera moves, speech bubbles, and transitions.
- The Web Speech API speaks dialogue when available.
- MediaRecorder records the Canvas output to WebM for download.

Deploying
1. Push to GitHub.
2. Deploy to any static/Node host (Render, Vercel, Netlify, your own VPS). For Render, the `render.yaml` provided will run the Express server.
3. No env vars or keys needed.

Local testing
- npm install
- npm start
- Open http://localhost:3000 on your Android device or browser.

License & style
- Original cartoon visuals are used; no imitation of copyrighted shows.

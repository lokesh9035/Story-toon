import express from "express";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";

const exec = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;
const jobs = new Map();

// Parse JSON bodies for API routes
app.use(express.json({ limit: "1mb" }));

// Simple request logging for API routes
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    // Log METHOD PATH STATUS
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
  });
  next();
});

// Serve static frontend
app.use(express.static("public"));

function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function planStory(story) {
  const ai = openai();
  const maxScenes = Number(process.env.MAX_SCENES || 6);
  const response = await ai.responses.create({
    model: "gpt-5.1",
    input: `Create a short animated screenplay from this story.
Return ONLY valid JSON:
{
  "title": "...",
  "style": "original 2D adult sci-fi comedy cartoon, clean bold outlines, flat colors, expressive faces, absurd imaginative environments",
  "scenes": [
    {"title":"...", "prompt":"...", "dialogue":"...", "seconds":8}
  ]
}
Rules:
- Maximum ${maxScenes} scenes.
- Each scene must be visually self-contained.
- Keep the same named characters and describe their appearance consistently.
- Use an ORIGINAL visual identity. Do not imitate or mention any existing TV show, copyrighted character, actor, logo, or exact art style.
- Dialogue should be short enough to fit the scene.
- Make the scenes flow as one story.
Story:
${story}`
  });
  const raw = response.output_text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  return JSON.parse(raw);
}

async function createVideo(prompt, seconds) {
  const ai = openai();
  const model = process.env.VIDEO_MODEL || "sora-2";
  const body = {
    model,
    prompt,
    seconds: String(seconds || Number(process.env.VIDEO_SECONDS || 8)),
    size: "1280x720"
  };

  const v = await ai.videos.create(body);
  let current = v;
  for (let i = 0; i < 60; i++) {
    if (current.status === "completed") break;
    if (current.status === "failed") {
      throw new Error(current.error?.message || "Video generation failed.");
    }
    await new Promise(r => setTimeout(r, 10000));
    current = await ai.videos.retrieve(current.id);
  }
  if (current.status !== "completed") throw new Error("Video generation timed out.");

  const response = await ai.videos.downloadContent(current.id);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function concatVideos(videoPaths, output) {
  const dir = path.dirname(output);
  const list = path.join(dir, "concat.txt");
  const lines = videoPaths.map(p => `file '${p.replaceAll("'", "'\\''")}'`);
  await fs.writeFile(list, lines.join("\n"));
  await exec(ffmpegPath, [
    "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-c", "copy", "-movflags", "+faststart", output
  ]);
}

async function generateJob(jobId, story) {
  const job = jobs.get(jobId);
  try {
    job.status = "planning";
    job.message = "Turning your story into scenes...";
    const plan = await planStory(story);
    job.plan = plan;

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytoon-"));
    const clips = [];

    for (let i = 0; i < plan.scenes.length; i++) {
      job.status = "generating";
      job.progress = Math.round((i / plan.scenes.length) * 90);
      job.message = `Generating scene ${i + 1} of ${plan.scenes.length}...`;

      const scene = plan.scenes[i];
      const prompt = `${plan.style}.
Animated 2D cartoon scene, 16:9 landscape.
Characters must remain visually consistent with earlier scenes.
Scene ${i + 1}: ${scene.title}
Action and camera: ${scene.prompt}
Spoken dialogue / audio: ${scene.dialogue || "No dialogue; use appropriate ambient sound."}
Use original characters and original environments. No logos, no existing franchise characters.`;

      const bytes = await createVideo(prompt, Number(scene.seconds || 8));
      const clip = path.join(dir, `scene-${i}.mp4`);
      await fs.writeFile(clip, bytes);
      clips.push(clip);
      job.progress = Math.round(((i + 1) / plan.scenes.length) * 90);
    }

    job.status = "assembling";
    job.message = "Joining the scenes into one video...";
    const finalPath = path.join(dir, "storytoon.mp4");
    await concatVideos(clips, finalPath);

    job.video = `/video/${jobId}`;
    job.file = finalPath;
    job.progress = 100;
    job.status = "completed";
    job.message = "Your cartoon is ready!";
  } catch (err) {
    console.error(err);
    job.status = "failed";
    job.message = err?.message || "Generation failed.";
  }
}

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'storytoon-ai' });
});

app.post("/api/generate", (req, res) => {
  const story = String(req.body?.story || "").trim();
  if (story.length < 10) return res.status(400).json({ error: "Enter a story of at least 10 characters." });

  const id = crypto.randomUUID();
  jobs.set(id, {
    id, status: "queued", progress: 0, message: "Starting...",
    createdAt: Date.now()
  });

  generateJob(id, story);
  res.json({ jobId: id });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    title: job.plan?.title,
    scenes: job.plan?.scenes,
    video: job.video
  });
});

// Express 5 compatible catch-all for API routes - always return JSON
// This MUST appear AFTER all valid /api routes above
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.originalUrl });
});

// Error handler for API routes to ensure JSON errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.originalUrl && req.originalUrl.startsWith('/api')) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
  next(err);
});

app.get("/video/:id", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.file) return res.status(404).send("Video not ready.");
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `inline; filename="storytoon-${req.params.id}.mp4"`);
  res.sendFile(path.resolve(job.file));
});

app.listen(PORT, () => console.log(`StoryToon AI running on port ${PORT}`));

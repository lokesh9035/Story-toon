import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const TXT2VID_URL = process.env.TXT2VID_URL || "http://localhost:8000";
const TXT2VID_KEY = process.env.TXT2VID_KEY || "";

app.use(express.json());

// Serve static frontend from 'public'
app.use(express.static(path.join(process.cwd(), "public")));

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "storytoon-free" });
});

// Proxy: create a server-side text->video generation job
app.post('/api/server-generate', async (req, res) => {
  try {
    const body = req.body || {};
    // Build microservice request payload
    const payload = {
      prompt: body.story || body.prompt || '',
      width: body.width || 512,
      height: body.height || 288,
      num_frames: body.num_frames || 48,
      fps: body.fps || 12,
      seed: body.seed || null,
      tts: body.tts || false
    };

    const headers = { 'Content-Type': 'application/json' };
    if (TXT2VID_KEY) headers['Authorization'] = `Bearer ${TXT2VID_KEY}`;

    const resp = await fetch(`${TXT2VID_URL.replace(/\/$/, '')}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (err) {
    console.error('server-generate error', err);
    return res.status(500).json({ error: 'server error', message: String(err) });
  }
});

// Proxy: job status
app.get('/api/server-jobs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const headers = {};
    if (TXT2VID_KEY) headers['Authorization'] = `Bearer ${TXT2VID_KEY}`;
    const resp = await fetch(`${TXT2VID_URL.replace(/\/$/, '')}/jobs/${encodeURIComponent(id)}`, { headers });
    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (err) {
    console.error('server-jobs error', err);
    return res.status(500).json({ error: 'server error', message: String(err) });
  }
});

// Proxy: download
app.get('/api/server-jobs/:id/download', async (req, res) => {
  try {
    const id = req.params.id;
    const headers = {};
    if (TXT2VID_KEY) headers['Authorization'] = `Bearer ${TXT2VID_KEY}`;
    const url = `${TXT2VID_URL.replace(/\/$/, '')}/jobs/${encodeURIComponent(id)}/download`;
    // Stream the response
    const upstream = await fetch(url, { headers });
    if (!upstream.ok) {
      const body = await upstream.text().catch(()=>null);
      return res.status(upstream.status).send(body);
    }
    // pipe headers
    upstream.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.status(upstream.status);
    const reader = upstream.body.getReader();
    const stream = new (require('stream').Readable)({ read() {} });
    (async function() {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { stream.push(null); break; }
        stream.push(Buffer.from(value));
      }
    })();
    stream.pipe(res);
  } catch (err) {
    console.error('server-jobs download error', err);
    return res.status(500).json({ error: 'server error', message: String(err) });
  }
});

// API catch-all for unmatched /api routes (Express 5 compatible)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`StoryToon free server running on port ${PORT}`);
});

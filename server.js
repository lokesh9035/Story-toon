import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend from 'public'
app.use(express.static(path.join(process.cwd(), "public")));

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "storytoon-free" });
});

// API catch-all for unmatched /api routes (Express 5 compatible)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.originalUrl });
});

// Note: no general wildcard routes (no '*' or '/*') — static file serving handles the site root

app.listen(PORT, () => {
  console.log(`StoryToon free server running on port ${PORT}`);
});

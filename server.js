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

// SPA fallback — serve index.html for any other route
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`StoryToon free server running on port ${PORT}`);
});

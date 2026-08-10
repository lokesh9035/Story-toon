# txt2vid-poc — FastAPI PoC for StoryToon

This is a minimal proof-of-concept FastAPI microservice used to test StoryToon's server-side integration. It does not run any real model — instead it enqueues a fake job that completes after a few seconds and writes a small text file as the "result".

Files
- app.py — FastAPI application with endpoints:
  - POST /generate -> returns { job_id }
  - GET /jobs/{job_id} -> job status
  - GET /jobs/{job_id}/download -> download info (PoC only)
  - GET /health -> health check
- Dockerfile — simple container to run the app.

Run locally (recommended)

1. Create a virtualenv and install deps

   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt

2. Run the app

   uvicorn app:app --host 0.0.0.0 --port 8000

3. Test

   curl http://localhost:8000/health
   curl -X POST http://localhost:8000/generate -H "Content-Type: application/json" -d '{"prompt":"A tiny robot"}'

Notes
- This PoC is intentionally minimal to allow StoryToon to test the proxy endpoints without GPU/model dependencies.
- When ready to integrate a real model, replace the fake_run() implementation with call to Text2Video-Zero model and save a real video artifact (and update the /jobs/.../download endpoint to stream the binary file).

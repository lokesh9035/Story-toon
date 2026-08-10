from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uuid, asyncio, os

app = FastAPI()
JOBS = {}

class GenerateReq(BaseModel):
    prompt: str
    width: int = 512
    height: int = 288
    num_frames: int = 48
    fps: int = 12
    seed: int | None = None
    tts: bool = False

@app.post("/generate", status_code=202)
async def generate(req: GenerateReq):
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {"job_id": job_id, "status": "queued", "progress": 0}
    # run a background fake job
    asyncio.create_task(fake_run(job_id, req.dict()))
    return {"job_id": job_id, "status": "queued"}

async def fake_run(job_id, opts):
    JOBS[job_id]["status"] = "running"
    for i in range(1, 6):
        await asyncio.sleep(1)
        JOBS[job_id]["progress"] = i * 20
    # create a tiny stub file as result
    out_dir = "./data"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{job_id}.txt")
    with open(out_path, "w") as f:
        f.write("fake video content for job " + job_id)
    JOBS[job_id].update({"status": "completed", "progress": 100, "result_path": out_path})

@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job

@app.get("/jobs/{job_id}/download")
def job_download(job_id: str):
    job = JOBS.get(job_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="not ready")
    return {"message": "In PoC skeleton, download from filesystem", "path": job["result_path"]}

@app.get("/health")
def health():
    return {"ok": True, "service": "txt2vid-poc"}

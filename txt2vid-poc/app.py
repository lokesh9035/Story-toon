from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uuid, asyncio, os, subprocess, shlex, time, re
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI()
JOBS = {}

# Root endpoint for health checks / probes
@app.get("/", include_in_schema=False)
def root():
    return JSONResponse({"ok": True, "service": "txt2vid-poc"}, status_code=200)

# Environment configuration for real model integration
TEXT2VIDEO_CMD = os.environ.get("TEXT2VIDEO_CMD", "")
# Example TEXT2VIDEO_CMD (set in your environment):
# python /opt/text2video/generate.py --prompt "{prompt}" --outdir "{out_dir}" --W {width} --H {height} --n_frames {num_frames} --fps {fps} --seed {seed} --ckpt {checkpoint}
TEXT2VIDEO_CHECKPOINT = os.environ.get("TEXT2VIDEO_CHECKPOINT", "")
OUTPUT_DIR_BASE = os.environ.get("TXT2VID_OUTPUT_DIR", "./data")

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
    # choose appropriate runner: real_run if TEXT2VIDEO_CMD is configured; otherwise fake_run
    if TEXT2VIDEO_CMD:
        asyncio.create_task(real_run(job_id, req.dict()))
    else:
        asyncio.create_task(fake_run(job_id, req.dict()))
    return {"job_id": job_id, "status": "queued"}

async def fake_run(job_id, opts):
    JOBS[job_id]["status"] = "running"
    for i in range(1, 6):
        await asyncio.sleep(1)
        JOBS[job_id]["progress"] = i * 20
    # create a tiny stub file as result
    out_dir = os.path.join(OUTPUT_DIR_BASE, job_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{job_id}.txt")
    with open(out_path, "w") as f:
        f.write("fake video content for job " + job_id)
    JOBS[job_id].update({"status": "completed", "progress": 100, "result_path": out_path})

async def real_run(job_id, opts):
    """Run the configured external text->video command and capture progress.
    The TEXT2VIDEO_CMD environment variable should be a command string containing
    Python-format placeholders: {prompt}, {width}, {height}, {num_frames}, {fps}, {seed}, {out_dir}, {checkpoint}.

    Example:
    TEXT2VIDEO_CMD='python /opt/text2video/generate.py --prompt "{prompt}" --outdir "{out_dir}" --W {width} --H {height} --n_frames {num_frames} --fps {fps} --seed {seed} --ckpt {checkpoint}'
    """
    JOBS[job_id]["status"] = "running"
    JOBS[job_id]["progress"] = 0
    prompt = opts.get("prompt", "")
    width = opts.get("width", 512)
    height = opts.get("height", 288)
    num_frames = opts.get("num_frames", 48)
    fps = opts.get("fps", 12)
    seed = opts.get("seed") if opts.get("seed") is not None else int(time.time() % 100000)

    out_dir = os.path.join(OUTPUT_DIR_BASE, job_id)
    os.makedirs(out_dir, exist_ok=True)

    cmd = TEXT2VIDEO_CMD.format(
        prompt=prompt.replace('"', '\\"'),
        width=width,
        height=height,
        num_frames=num_frames,
        fps=fps,
        seed=seed,
        out_dir=out_dir,
        checkpoint=TEXT2VIDEO_CHECKPOINT
    )

    # Split command for subprocess
    try:
        args = shlex.split(cmd)
    except Exception:
        args = cmd.split()

    # Start process
    try:
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    except Exception as e:
        JOBS[job_id].update({"status": "failed", "message": f"failed to start process: {e}"})
        return

    # Read stdout lines and try to parse progress
    progress = 0
    percent_re = re.compile(r"(\d{1,3})%")
    step_re = re.compile(r"step\s*(\d+)\s*/\s*(\d+)", re.IGNORECASE)
    frame_re = re.compile(r"frame\s*(\d+)\s*/\s*(\d+)", re.IGNORECASE)

    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            # update progress based on patterns
            m = percent_re.search(line)
            if m:
                try:
                    p = int(m.group(1))
                    progress = max(progress, min(100, p))
                    JOBS[job_id]["progress"] = progress
                except:
                    pass
            m = step_re.search(line)
            if m:
                try:
                    cur = int(m.group(1)); tot = int(m.group(2))
                    p = int(cur * 100 / tot)
                    progress = max(progress, p)
                    JOBS[job_id]["progress"] = progress
                except:
                    pass
            m = frame_re.search(line)
            if m:
                try:
                    cur = int(m.group(1)); tot = int(m.group(2))
                    p = int(cur * 100 / tot)
                    progress = max(progress, p)
                    JOBS[job_id]["progress"] = progress
                except:
                    pass
            # store last log line for debugging
            JOBS[job_id]["last_log"] = line
        proc.wait()
    except Exception as e:
        proc.kill()
        JOBS[job_id].update({"status": "failed", "message": f"process failed: {e}"})
        return

    # Check exit code
    if proc.returncode != 0:
        JOBS[job_id].update({"status": "failed", "message": f"process exited with code {proc.returncode}", "progress": progress})
        return

    # Find generated artifact in out_dir: prefer common video extensions
    candidates = []
    for fn in os.listdir(out_dir):
        if fn.lower().endswith(('.mp4', '.webm', '.mkv')):
            candidates.append(os.path.join(out_dir, fn))
    if not candidates:
        # fallback: any file
        for fn in os.listdir(out_dir):
            candidates.append(os.path.join(out_dir, fn))

    if not candidates:
        JOBS[job_id].update({"status": "failed", "message": "no output file found", "progress": progress})
        return

    # pick most recent candidate
    candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    out_path = candidates[0]
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
    path = job.get("result_path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="output not found")
    # Return binary file for download
    return FileResponse(path, media_type='application/octet-stream', filename=os.path.basename(path))

@app.get("/health")
def health():
    return {"ok": True, "service": "txt2vid-poc", "cmd_configured": bool(TEXT2VIDEO_CMD)}

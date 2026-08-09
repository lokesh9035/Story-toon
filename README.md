# StoryToon AI — Android-friendly cloud version

This version is designed so the user can operate the generator entirely from an Android browser.

## What changed

- No Node.js or FFmpeg installation on the phone.
- A long-running Node server handles jobs.
- Uses OpenAI's video generation API (`sora-2` by default).
- Generates multiple short clips from one story.
- Polls the job from the mobile browser.
- Uses FFmpeg on the server to concatenate clips.
- API key stays server-side.

OpenAI's current video API supports `sora-2` and `sora-2-pro`, with 4/8/12 second clips and 16:9 output supported by the API. Sora 2 is described as video generation with synced audio.

## Deploy with Render

1. Create a GitHub repository and upload this project.
2. Create a new Web Service on Render and connect the repository.
3. Render detects `render.yaml`, or use:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variable:
   `OPENAI_API_KEY` = your API key.
5. Deploy.
6. Open the Render URL on Android.
7. Enter a story and tap Generate cartoon.

## Important

Video generation is asynchronous and can take time. The browser polls the server, so you can leave the page open while the job runs.

The server keeps generated files on its local disk and jobs in memory. This is fine for a starter/demo deployment but not for a production service with many users.

For production, add:
- Redis/queue
- Postgres job records
- S3/R2/GCS object storage
- user accounts
- usage limits
- authentication
- automatic cleanup
- moderation
- retry handling
- a worker service

## API access

Your OpenAI project must have access to the video model you select. If `sora-2` is unavailable to your project, change `VIDEO_MODEL` to a model your project can use.

Never put the OpenAI key in browser JavaScript or a `NEXT_PUBLIC_*` variable.

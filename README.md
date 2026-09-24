# Harbour

Harbour is a Windows desktop hub for cutting a video, writing the words, exporting the right shape, and lining posts up as a batch.

Projects stay on this machine as folders. There is no database.

## Run

Install [Rust](https://www.rust-lang.org/tools/install) and [FFmpeg](https://www.gyan.dev/ffmpeg/builds/). FFmpeg is required for thumbnails and export. Then:

```
pnpm install
pnpm tauri dev
```

If Harbour cannot see FFmpeg, set the path to `ffmpeg.exe` in Settings.

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

## Studio workflow

- **Overview:** create, search, and open projects; see project and posting totals.
- **Media library:** import footage and images into the current project.
- **Video editor:** arrange and trim clips, split at the playhead, add text and subtitles, undo/redo, and choose vertical, square, or landscape output. Open **Export & publish** to prepare a release.
- **Writing studio:** maintain platform-specific copy alongside the project.
- **Publish studio:** select destinations, customize captions and aspect ratios per destination, and add a batch of draft posts to the calendar. Apply a caption to all selected channels when useful. Export packs contain rendered media, copy, and schedule files.
- **Content calendar:** review planned posts and manually mark completed posts.

Project edits save automatically. Editing saves are serialized to preserve their order.

## Current boundaries

Harbour is a desktop application; `pnpm dev` serves its UI but native commands require `pnpm tauri dev`. Projects and settings stay on disk.

Publishing is currently manual. Adding posts to the calendar does not send them to a social network. Automatic posting requires platform developer applications, OAuth account connections, secure token storage, upload adapters, and a durable publishing queue. Reminders require Harbour to be open.

The editor currently has a sequential video/image lane plus text and subtitle lanes. Imported audio files are retained in the library but cannot yet be mixed as separate timeline tracks. Layered video, audio mixing, transitions, keyframes, and automatic captions are future work.

Publish-studio caption and format overrides are session-local until added to the calendar or written to an export pack. Save reusable copy in Writing studio.

## Validation

```
npm run build
node --test tests/schedule.test.mjs
```

The scheduling tests cover channel-specific fields, independent IDs, timezone conversion, and invalid input. Full video playback and FFmpeg export should additionally be checked in the desktop app with real media.

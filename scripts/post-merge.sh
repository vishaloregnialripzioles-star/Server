#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push 2>/dev/null || true

# Ensure yt-dlp binary is present (needed for music bot audio streaming)
YTDLP_BIN="$HOME/.local/bin/yt-dlp"
if [ ! -f "$YTDLP_BIN" ]; then
  echo "Downloading yt-dlp..."
  mkdir -p "$HOME/.local/bin"
  curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$YTDLP_BIN"
  chmod +x "$YTDLP_BIN"
  echo "yt-dlp $($YTDLP_BIN --version) installed."
fi

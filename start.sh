#!/bin/bash
cd "$(dirname "$0")"
PORT=8080
echo "Starting Pyongyang Racer at http://localhost:$PORT/racer.html"
echo "Press Ctrl+C to stop."
if command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT/racer.html"
fi
python3 -m http.server "$PORT"

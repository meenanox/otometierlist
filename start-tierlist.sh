#!/bin/sh
# Tier List Studio launcher for macOS / Linux
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Tier List Studio needs Python 3 (free): https://www.python.org/downloads/"
  exit 1
fi
echo "Starting Tier List Studio at http://localhost:9100 (press Ctrl+C to stop)"
( sleep 2; (command -v open >/dev/null 2>&1 && open http://localhost:9100) || (command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:9100) ) &
python3 server.py

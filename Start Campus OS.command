#!/bin/bash
# Double-click to start Campus OS on this Mac (no internet needed).
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is needed. macOS will offer to install the Command Line Tools — accept, then run this again."
  python3 --version
  read -n 1 -s -r -p "Press any key to close"
  exit 1
fi
python3 server.py

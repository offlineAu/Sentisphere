#!/usr/bin/env bash
set -euo pipefail
export ENV=development
uvicorn main:app --reload --port 8010

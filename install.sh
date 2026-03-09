#!/usr/bin/env bash
# install.sh — installs the /recap skill into Claude Code
#
# Usage:
#   bash install.sh

set -e

SKILLS_DIR="$HOME/.claude/skills"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing /recap skill..."
mkdir -p "$SKILLS_DIR/recap"
cp "$SCRIPT_DIR/skill.md" "$SKILLS_DIR/recap/skill.md"
cp "$SCRIPT_DIR/index.ts" "$SKILLS_DIR/recap/index.ts"

echo ""
echo "Done! /recap is installed."
echo ""
echo "To use it, open Claude Code in any directory and type:"
echo "  /recap           → recap today"
echo "  /recap yesterday → recap yesterday"
echo "  /recap week      → recap the past 7 days"
echo "  /recap 2026-03-05 → recap a specific date"

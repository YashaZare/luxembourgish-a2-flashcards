#!/usr/bin/env bash
# One-command deploy of the flashcard app to GitHub Pages.
# The app is already a git repo with an initial commit. This creates a PUBLIC GitHub
# repo under your account, pushes, and enables Pages. Run from inside the app/ folder.
#
#   cd app && bash deploy.sh
#
# Requires: gh (already authenticated as YashaZare).
set -euo pipefail

REPO="${1:-luxembourgish-a2-flashcards}"
echo "→ Creating public repo '$REPO' and pushing…"
gh repo create "$REPO" --public --source=. --push \
  --description "Phone-first flashcards for the Schwätzt Dir Lëtzebuergesch? A2 course book (LOD/CC0 dictionary data)"

OWNER="$(gh api user --jq .login)"
echo "→ Enabling GitHub Pages (branch main, root)…"
gh api -X POST "repos/$OWNER/$REPO/pages" \
  -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null \
  || echo "  (Pages may already be enabled, or enable it in repo Settings → Pages)"

echo
echo "✅ Done. Your site will be live in ~1 minute at:"
echo "   https://$OWNER.github.io/$REPO/"
echo
echo "If it 404s at first, wait for the 'pages-build-deployment' action to finish:"
echo "   gh run watch -R $OWNER/$REPO"

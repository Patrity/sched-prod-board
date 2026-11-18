#!/usr/bin/env bash
# Publishes app/ to the gh-pages branch with the current main commit stamped in as the build (R6).
set -euo pipefail
cd "$(dirname "$0")"
SHA=$(git rev-parse HEAD)
OUT=$(mktemp -d)
cp -R app/. "$OUT/"
sed -i '' "s/__BUILD_SHA__/$SHA/g" "$OUT/index.html"
[ -d media ] && cp -R media "$OUT/media"
touch "$OUT/.nojekyll"
cd "$OUT" && git init -q -b gh-pages && git add -A && git commit -qm "deploy $SHA" \
  && git push -fq "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
echo "deployed $SHA"

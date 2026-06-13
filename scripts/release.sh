#!/usr/bin/env bash
#
# release.sh — bump the project version everywhere, then create and push a git tag.
#
# Usage:
#   scripts/release.sh <version|major|minor|patch>   Bump and release
#   scripts/release.sh <...> --dry-run               Show what would change, do nothing
#   scripts/release.sh <...> --no-push               Commit + tag locally, skip push
#
# Examples:
#   scripts/release.sh patch          # 0.2.0 -> 0.2.1
#   scripts/release.sh minor          # 0.2.0 -> 0.3.0
#   scripts/release.sh 1.0.0          # explicit version
#
# The synced version lives in these files (kept in lock-step with the git tag).
# The internal component packages (packages/annotations, diff-viewer, highlighter,
# plan-viewer, toolbar) carry their own independent versions and are NOT touched.
set -euo pipefail

# Resolve repo root so the script works from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILES=(
  "package.json"
  "apps/ui/package.json"
  "apps/landing-page/package.json"
  "packages/shared/package.json"
  ".claude-plugin/marketplace.json"
)

# ---- args -------------------------------------------------------------------
BUMP=""
DRY_RUN=false
PUSH=true
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --no-push) PUSH=false ;;
    -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) BUMP="$arg" ;;
  esac
done

if [[ -z "$BUMP" ]]; then
  echo "Error: provide a version or one of: major | minor | patch" >&2
  echo "Try: scripts/release.sh --help" >&2
  exit 1
fi

# ---- compute new version ----------------------------------------------------
CURRENT="$(node -p "require('./package.json').version")"

if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW="$BUMP"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP" in
    major) NEW="$((MAJOR + 1)).0.0" ;;
    minor) NEW="${MAJOR}.$((MINOR + 1)).0" ;;
    patch) NEW="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    *) echo "Error: '$BUMP' is not a semver version or major|minor|patch" >&2; exit 1 ;;
  esac
fi

TAG="v$NEW"
echo "Current version: $CURRENT"
echo "New version:     $NEW  (tag: $TAG)"
echo

# ---- safety checks ----------------------------------------------------------
if [[ "$CURRENT" == "$NEW" ]]; then
  echo "Error: new version equals current version ($NEW)." >&2
  exit 1
fi
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag $TAG already exists." >&2
  exit 1
fi
if [[ "$DRY_RUN" == false && -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  git status --short >&2
  exit 1
fi

# ---- apply version bump -----------------------------------------------------
# Replace only the first (top-level) "version": "..." line in each file so that
# JSON formatting and dependency versions are left untouched.
bump_file() {
  local file="$1"
  perl -0pi -e 'BEGIN{$c=0} s/("version":\s*")[^"]+(")/$c++ ? "$1$2" : "${1}'"$NEW"'$2"/e' "$file"
}

if [[ "$DRY_RUN" == true ]]; then
  echo "[dry-run] would set version=$NEW in:"
  printf '  %s\n' "${FILES[@]}"
  echo "[dry-run] would commit, tag $TAG, and $([[ "$PUSH" == true ]] && echo "push" || echo "skip push")"
  exit 0
fi

for f in "${FILES[@]}"; do
  bump_file "$f"
  echo "  updated $f"
done

# ---- commit, tag, push ------------------------------------------------------
git add "${FILES[@]}"
git commit -m "chore: release $TAG"
git tag -a "$TAG" -m "Release $TAG"
echo
echo "Committed and tagged $TAG."

if [[ "$PUSH" == true ]]; then
  BRANCH="$(git branch --show-current)"
  git push origin "$BRANCH"
  git push origin "$TAG"
  echo "Pushed branch $BRANCH and tag $TAG to origin."
else
  echo "Skipped push (--no-push). Push manually with:"
  echo "  git push origin \"\$(git branch --show-current)\" && git push origin $TAG"
fi

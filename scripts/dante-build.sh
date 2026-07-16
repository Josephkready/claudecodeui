#!/usr/bin/env bash
#
# Fail-closed production build for the dante host deploy (see the `cloudcli` service
# entry in Josephkready/dante-config `ansible/host_vars/localhost.yml`).
#
# Why this script exists rather than a plain `npm ci && npm run build`:
#
#   dante-sync (ansible-pull) resets ~/prod/cloudcli to origin/main, runs this as
#   `build_command` when the SHA moves, then restarts cloudcli.service. The restart is
#   gated on that same "SHA moved" condition — NOT on this script's exit code, because
#   the generic build task carries `failed_when: false`. A failed build therefore still
#   gets a restart. Keeping a broken tree off disk is this script's job, not ansible's.
#
#   Both build steps are destructive up front: `vite build` empties dist/, and the
#   `prebuild:server` npm pre-script rm -rf's dist-server/. Building in place would
#   404 the live service's client assets for the whole build AND leave a half-built tree
#   behind on failure — precisely the state a restart would then serve.
#
# So: build into a staging dir, verify the artifacts, and only then swap them in. Any
# failure leaves the previous good build untouched, making the restart a harmless no-op.
#
# This replaces the atomicity the Docker build used to provide for free (a failed
# `docker build` simply left the previous image running).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAGE="$ROOT/.dante-build"

log() { printf '[dante-build] %s\n' "$*"; }
die() { printf '[dante-build] ERROR: %s\n' "$*" >&2; exit 1; }

# Staging is disposable in every exit path; the live dist/ and dist-server/ are not
# touched until the swap below, so bailing out early is always safe.
trap 'rm -rf "$STAGE"' EXIT

rm -rf "$STAGE"
mkdir -p "$STAGE"

# VITE_AUTH_DISABLED is a Vite build-time constant inlined into the client bundle
# (src/constants/config.ts), so it has to be set HERE. The systemd unit's runtime copy
# governs the server only and cannot affect dist/. The default matches the Dockerfile
# ARG this replaces; export VITE_AUTH_DISABLED=false to build with login restored.
export VITE_AUTH_DISABLED="${VITE_AUTH_DISABLED:-true}"

log "installing dependencies (npm ci)"
# devDependencies are required: vite, typescript and tsc-alias all live there.
npm ci --no-audit --no-fund

log "building client -> staging (VITE_AUTH_DISABLED=${VITE_AUTH_DISABLED})"
npx vite build --outDir "$STAGE/dist" --emptyOutDir

log "building server -> staging"
# Invoked directly rather than via `npm run build:server` because that script's
# `prebuild:server` hook hard-codes rm -rf of the LIVE dist-server/, which is exactly
# what staging exists to avoid. tsc and tsc-alias both accept an absolute --outDir
# (tsc-alias documents it as tsconfig-relative, but absolute works and is verified by
# the alias check below).
npx tsc -p server/tsconfig.json --outDir "$STAGE/dist-server"
npx tsc-alias -p server/tsconfig.json --outDir "$STAGE/dist-server"

# --- Verification gate -------------------------------------------------------------
# The steps above duplicate what package.json's build scripts do. If that wiring ever
# changes underneath this script, these checks fail the build instead of letting an
# empty or malformed tree get swapped in and served.

# One artifact per emitted tree: the client bundle's entry, the server entry systemd
# actually execs, and one file from each of the two source roots tsc emits (server/ and
# the repo-level shared/, which land side by side under dist-server/).
for artifact in \
  "$STAGE/dist/index.html" \
  "$STAGE/dist-server/server/index.js" \
  "$STAGE/dist-server/server/shared/utils.js" \
  "$STAGE/dist-server/shared/networkHosts.js"
do
  [ -s "$artifact" ] || die "expected build artifact missing or empty: ${artifact#"$ROOT"/}"
done

# tsc emits the `@/...` path aliases verbatim; node cannot resolve them at runtime, so
# a skipped tsc-alias yields a server that dies on its first aliased import. Catch it
# here rather than at restart.
if grep -rlq --include='*.js' "from '@/" "$STAGE/dist-server" 2>/dev/null; then
  die "unresolved @/ alias imports in staged server build — tsc-alias did not rewrite output"
fi

# --- Swap --------------------------------------------------------------------------
# Same-filesystem renames, so the window where a live path is absent is sub-millisecond
# and the previous build survives until the new one is in place.

swap_in() {
  local staged="$1" live="$2"
  local prev="$STAGE/prev-$(basename "$live")"

  rm -rf "$prev"
  if [ -e "$live" ]; then
    mv "$live" "$prev"
  fi
  mv "$staged" "$live"
  rm -rf "$prev"
}

log "swapping staged build into place"
swap_in "$STAGE/dist" "$ROOT/dist"
swap_in "$STAGE/dist-server" "$ROOT/dist-server"

log "build complete"

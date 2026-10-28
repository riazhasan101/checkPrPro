#!/bin/sh
set -eu
mkdir -p /work
cd /work
for item in package.json package-lock.json index.html license.html src scripts build; do
  cp -R "/source/$item" .
done
npm ci --no-audit --no-fund
npm run build:linux:protected -- --config.directories.output=/output/linux

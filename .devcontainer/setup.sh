#!/usr/bin/env bash
set -e

echo -e '\n=== Updating package lists ==='
sudo apt-get update

echo -e '\n=== Upgrading packages ==='
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo -e '\n=== Installing browser automation system dependencies ==='
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates \
  fonts-liberation \
  xvfb \
  xauth \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcairo-gobject2 \
  libcups2 \
  libdbus-1-3 \
  libdbus-glib-1-2 \
  libdrm2 \
  libfontconfig1 \
  libfreetype6 \
  libgdk-pixbuf-2.0-0 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libharfbuzz0b \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcb-shm0 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxkbcommon0 \
  libxrandr2 \
  libxrender1 \
  libxshmfence1 \
  libxss1 \
  libxtst6 \
  xdg-utils

if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libasound2t64; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libasound2
fi

# nvm may need to be sourced depending on the image
if [ -s "/usr/local/share/nvm/nvm.sh" ]; then
  . /usr/local/share/nvm/nvm.sh
fi

# Switch to Node 22 if nvm is available and Node 22 is installed
if command -v nvm >/dev/null 2>&1; then
  echo -e '\n=== Switching to Node 22 ==='
  nvm use 22
fi

echo -e '\n=== Enabling corepack ==='
if command -v sudo >/dev/null 2>&1; then
  sudo env PATH="$PATH" corepack enable
else
  corepack enable
fi

echo -e '\n=== Installing corepack packages ==='
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack install

echo -e '\n=== Setting up pnpm ==='
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 SHELL=/bin/bash pnpm setup

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"

echo -e '\n=== Installing pnpm packages ==='
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install

echo -e '\n=== Setting up environment ==='
chmod +x scripts/setup-env.sh
node scripts/setup-env.js

echo -e '\n=== Setup complete ==='

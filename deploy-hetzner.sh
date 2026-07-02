#!/bin/bash
# Deploy the static Luxembourgish app to letzebuergesch.special.lu (Hetzner nginx).
# No Cloudflare / wrangler — just rsync the static files to the server.
set -e
cd "$(dirname "$0")"
rsync -az --stats \
  --exclude='.git/' --exclude='node_modules/' --exclude='img/adventure/' \
  --exclude='*.ai' --exclude='.DS_Store' --exclude='.assetsignore' \
  ./ admin@91.98.87.216:/home/admin/letzebuergesch/
echo "✅ deployed to letzebuergesch.special.lu (Hetzner)"

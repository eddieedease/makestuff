#!/bin/sh
# Builds release/makestuff (and a zip): upload its contents to your web host
# and open /install. Development-only files are left out on purpose.
set -e
cd "$(dirname "$0")/.."

(cd frontend && npm ci --silent && npx ng build --base-href ./)

rm -rf release && mkdir -p release/makestuff
cd release/makestuff
cp -R ../../backend/index.php ../../backend/.htaccess ../../backend/src ../../backend/migrations .
mkdir -p config storage/uploads
cp ../../backend/config/.htaccess config/
cp ../../backend/storage/.htaccess storage/
cp -R ../../frontend/dist/frontend/browser/. .
mv index.html app.html

cd ..
if command -v zip >/dev/null; then zip -qr makestuff.zip makestuff; fi
echo "Release ready: release/makestuff"

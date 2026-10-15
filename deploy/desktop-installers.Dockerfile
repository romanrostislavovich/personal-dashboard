# The desktop installers for Windows and Linux, built on Linux, for Settings → Apps of the
# server. deploy/deploy.sh builds them only when they change (Electron, the loader, the icon,
# the version): the code inside an installed app updates itself from the server anyway.
#
#   docker buildx build -f deploy/desktop-installers.Dockerfile --build-arg KEY=… \
#     --build-arg VERSION=… --output type=local,dest=<folder> .
#
# A Windows installer built on Linux needs Wine (electron-builder makes its uninstaller with
# it), 32-bit too: so x86-64 only. macOS installers are built only on a Mac — GitHub Releases.
FROM node:24-bookworm AS build
RUN dpkg --add-architecture i386 \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends wine wine64 wine32:i386 \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/lib/wine/wine64 /usr/local/bin/wine64
WORKDIR /repo
ENV NX_DAEMON=false NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# electron-builder downloads the Electron of each system itself.
RUN npm ci --ignore-scripts

COPY . .
ARG VERSION
RUN npx nx build desktop \
  && npx electron-builder --config apps/desktop/electron-builder.yml --publish never --win --linux \
    -c.extraMetadata.version="$VERSION"
# What the server reads (apps/api core apps/app-files.ts): the files and which system each is for.
# KEY only here: a new key alone does not build the installers again.
ARG KEY
RUN mkdir /out \
  && cp dist/desktop-installers/*.exe dist/desktop-installers/*.AppImage /out/ \
  && node -e " \
    const fs = require('fs'); \
    const files = fs.readdirSync('/out').map((file) => ({ \
      platform: file.endsWith('.exe') ? 'windows' : 'linux', file })); \
    fs.writeFileSync('/out/installers.json', JSON.stringify( \
      { key: process.env.KEY, version: process.env.VERSION, files }, null, 2)); \
  "

FROM scratch
COPY --from=build /out/ /

# The Android app (apps/mobile), built on Linux, for Settings → Apps of the server. deploy/deploy.sh
# builds it only when its native part changes: the interface inside an installed app updates
# itself from the server anyway (MobileUpdateService in web-core).
#
#   docker buildx build -f deploy/mobile-apk.Dockerfile --build-arg BUILD_ID=… \
#     --build-arg VERSION_NAME=… --build-arg VERSION_CODE=… \
#     --secret id=keystore,src=deploy/mobile-release.keystore \
#     --secret id=keystore_password,env=MOBILE_KEYSTORE_PASSWORD \
#     [--secret id=google_services,src=deploy/google-services.json] \
#     --output type=local,dest=<folder> .
#
# The signing key comes as a build secret: it is in no layer of the image. So does the Firebase
# file of push notifications; without it the app is built without push.

# --- 1. The interface packed into the app ---
FROM node:24-bookworm AS web
WORKDIR /repo
ENV NX_DAEMON=false NX_NO_CLOUD=true
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx nx build web && cd apps/mobile && npx cap sync android

# --- 2. The APK ---
FROM eclipse-temurin:21-jdk AS apk
ENV ANDROID_HOME=/opt/android-sdk
# The command-line tools 20.0 (checksum from Google's repository2-3.xml).
ARG TOOLS=commandlinetools-linux-16111833_latest.zip
ARG TOOLS_SHA1=e025545c62a8e64c7559119566a569fb1dec5f60
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL -o /tmp/tools.zip "https://dl.google.com/android/repository/$TOOLS" \
  && echo "$TOOLS_SHA1  /tmp/tools.zip" | sha1sum -c - \
  && mkdir -p "$ANDROID_HOME/cmdline-tools" \
  && unzip -q /tmp/tools.zip -d "$ANDROID_HOME/cmdline-tools" \
  && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" \
  && rm /tmp/tools.zip \
  && yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null \
  && "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platforms;android-36" "build-tools;36.0.0" >/dev/null

# The Android project points at Capacitor's own Android library inside node_modules.
WORKDIR /repo
COPY --from=web /repo/node_modules/@capacitor ./node_modules/@capacitor
COPY --from=web /repo/apps/mobile/android ./apps/mobile/android
WORKDIR /repo/apps/mobile/android
ARG VERSION_NAME=dev
ARG VERSION_CODE=1
RUN --mount=type=secret,id=keystore,required=true \
    --mount=type=secret,id=keystore_password,required=true \
    --mount=type=secret,id=google_services,required=false \
    { [ ! -f /run/secrets/google_services ] || cp /run/secrets/google_services app/google-services.json; } && \
    MOBILE_KEYSTORE_FILE=/run/secrets/keystore \
    MOBILE_KEYSTORE_PASSWORD="$(cat /run/secrets/keystore_password)" \
    MOBILE_VERSION_NAME="$VERSION_NAME" MOBILE_VERSION_CODE="$VERSION_CODE" \
    ./gradlew --no-daemon -q testReleaseUnitTest assembleRelease

# What the server reads (apps/api core apps/app-files.ts): the file and its version.
ARG BUILD_ID
RUN mkdir /out \
  && cp app/build/outputs/apk/release/app-release.apk /out/personal-dashboard.apk \
  && printf '{\n  "key": "%s",\n  "version": "%s",\n  "file": "personal-dashboard.apk"\n}\n' \
    "$BUILD_ID" "$VERSION_NAME" > /out/apk.json

FROM scratch
COPY --from=apk /out/ /

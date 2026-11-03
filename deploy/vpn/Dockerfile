# AmneziaWG for the dashboard's VPN: the userspace daemon (no kernel module — the server's
# kernel is newer than any ready one) and its `awg` tool. Built on the server by
# `docker compose --profile vpn build vpn` (deploy.sh does it). Pinned by commit, not only by
# tag: a tag can be moved, and this code holds the VPN's keys.
FROM golang:1.25.12-alpine3.23 AS daemon
# v3.1.20260828
ARG AWG_GO=b5928efb6ca19f0153958460c3d141f04abc5c2e
RUN apk add --no-cache git build-base && \
    git init -q /src && cd /src && \
    git fetch -q --depth 1 https://github.com/amnezia-vpn/amneziawg-go.git "$AWG_GO" && \
    git checkout -q FETCH_HEAD && test "$(git rev-parse HEAD)" = "$AWG_GO"
WORKDIR /src
RUN go mod download && go mod verify && \
    CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' -o /amneziawg-go

FROM alpine:3.23 AS tools
# v3.1.20260812
ARG AWG_TOOLS=ee0f0a9aa34ff0a0da4b3433b9512781cfe02843
RUN apk add --no-cache git build-base linux-headers && \
    git init -q /src && cd /src && \
    git fetch -q --depth 1 https://github.com/amnezia-vpn/amneziawg-tools.git "$AWG_TOOLS" && \
    git checkout -q FETCH_HEAD && test "$(git rev-parse HEAD)" = "$AWG_TOOLS" && \
    make -C /src/src

FROM alpine:3.23
RUN apk add --no-cache bash iproute2 iptables
COPY --from=daemon /amneziawg-go /usr/bin/amneziawg-go
COPY --from=tools /src/src/wg /usr/bin/awg
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["bash", "/entrypoint.sh"]

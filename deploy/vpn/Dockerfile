# AmneziaWG for the dashboard's VPN: the userspace daemon (no kernel module — the server's
# kernel is newer than any ready one) and its `awg` tool. Built on the server by
# `docker compose --profile vpn build vpn` (deploy.sh does it); the tags are pinned.
FROM golang:1.25.12-alpine3.23 AS daemon
ARG AWG_GO=v3.1.20260828
RUN apk add --no-cache git build-base && \
    git clone --depth 1 --branch "$AWG_GO" https://github.com/amnezia-vpn/amneziawg-go.git /src
WORKDIR /src
RUN go mod download && go mod verify && \
    CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' -o /amneziawg-go

FROM alpine:3.23 AS tools
ARG AWG_TOOLS=v3.1.20260812
RUN apk add --no-cache git build-base linux-headers && \
    git clone --depth 1 --branch "$AWG_TOOLS" https://github.com/amnezia-vpn/amneziawg-tools.git /src && \
    make -C /src/src

FROM alpine:3.23
RUN apk add --no-cache bash iproute2 iptables
COPY --from=daemon /amneziawg-go /usr/bin/amneziawg-go
COPY --from=tools /src/src/wg /usr/bin/awg
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["bash", "/entrypoint.sh"]

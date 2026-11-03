#!/usr/bin/env bash
# The VPN container (see libs/modules/vpn): the dashboard writes the interface and its devices
# into /vpn/awg0.conf; this starts AmneziaWG with it, applies every change within 10 seconds
# and writes /vpn/status.tsv — a line per device, `publicKey endpoint handshake rx tx`, no keys
# but the public ones — which the dashboard reads every minute.
set -euo pipefail

DIR=/vpn
CONF="$DIR/awg0.conf"
STATUS="$DIR/status.tsv"
IFACE=awg0
SUBNET=10.77.0.0/24
ADDRESS=10.77.0.1/24

until [ -s "$CONF" ]; do
  echo "Waiting for $CONF: the dashboard writes it within a minute of its start"
  sleep 10
done

# The userspace daemon, in the foreground of its own; the container ends when it does.
amneziawg-go -f "$IFACE" &
daemon=$!
until ip link show "$IFACE" >/dev/null 2>&1; do sleep 0.2; done
awg setconf "$IFACE" "$CONF"
ip address add "$ADDRESS" dev "$IFACE"
ip link set mtu 1420 up dev "$IFACE"

# Devices reach the internet through this container's address; never the private networks
# around it — the dashboard's database, the host, the other containers.
iptables -t nat -A POSTROUTING -s "$SUBNET" -o eth0 -j MASQUERADE
for private in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
  iptables -A FORWARD -i "$IFACE" -d "$private" -j DROP
done
iptables -A FORWARD -i "$IFACE" -o eth0 -j ACCEPT
iptables -A FORWARD -i eth0 -o "$IFACE" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -P FORWARD DROP
# Nothing of the container itself answers inside the tunnel.
iptables -A INPUT -i "$IFACE" -j DROP
echo "AmneziaWG is up on UDP $(awg show "$IFACE" listen-port)"

applied=$(md5sum <"$CONF")
while kill -0 "$daemon" 2>/dev/null; do
  current=$(md5sum <"$CONF")
  if [ "$current" != "$applied" ]; then
    # Added and deleted devices, without dropping the connected ones.
    awg syncconf "$IFACE" "$CONF" && applied=$current && echo "Devices updated"
  fi
  awg show "$IFACE" dump |
    awk -F'\t' 'NR > 1 { print $1 "\t" $3 "\t" $5 "\t" $6 "\t" $7 }' >"$STATUS.new"
  mv "$STATUS.new" "$STATUS"
  sleep 10
done
echo "AmneziaWG stopped" >&2
exit 1

# Proposal: the owner's own VPN

Status: built (2026-11-03) — not yet run on the real server and devices.

## Why

In Belarus popular VPNs get blocked, and in some periods plain WireGuard and OpenVPN were cut by
DPI whatever the server. A VPN of one's own has an address no list knows; AmneziaWG makes its
packets unlike WireGuard's, so a DPI does not recognise the protocol either.

## The owner's decisions

- **Protocol:** AmneziaWG (WireGuard with junk packets, random prefixes and its own packet
  types), the parameters of version 1.0 — every client app knows them. VLESS + Reality stays an
  idea for a harder day.
- **Where:** the dashboard's server, a container of its own (`deploy/vpn`, `amneziawg-go` in
  userspace — no kernel module for the server's kernel), on its own Docker network: a device in
  the tunnel never reaches the database or the other containers.
- **Address:** devices connect to `vpn.<domain>`, not to the IP: moving to another IP or server
  changes one DNS record. A "home" (residential / ISP) exit IP is a task of its own, later.
- **Devices:** this computer and the phone first, the second laptop and the devices of close
  people later. All traffic goes through the tunnel (IPv6 too, so nothing leaks around it).
- **Kill switch:** on Windows the client blocks traffic outside the tunnel by itself (all of it
  is routed in); on Android it is the system's "Always-on VPN" + "Block connections without VPN",
  which the owner turns on (the setup guide on the page says where).
- **Keys:** kept in the database, encrypted, so the QR code can be shown again any time.
- **DNS inside:** Cloudflare 1.1.1.1.
- **In the dashboard:** a section of its own (VPN): the state, the devices with their QR codes
  and files, online now, the traffic of 30 days, the setup guides; a home widget.
- **Notifications:** the VPN down and back up; a device's first connection; a device from a
  network (IPv4 /16, IPv6 /48) it did not use in 90 days — also a security finding for a day.
- **History of addresses:** 90 days of networks per device.
- **Around it:** Links (hours in the VPN, megabytes through it), achievements (devices, hours,
  gigabytes), the security agent (new networks, the container silent, devices idle for 60 days),
  AI read tools (`vpn_status`, `vpn_days`).

## How it works

- The server's job (every minute, only where `VPN_DIR` is set) makes the owner's keys once,
  writes the interface and its peers into `vpn-data/awg0.conf` when they change, and reads the
  container's `status.tsv` (public key, endpoint, last handshake, bytes) back.
- What the container tells each minute — who is online, the counters, the networks of 90 days,
  "up / down" — lives in the `vpn` schema, which is never synced (like `system` and `auth`): a
  synced row written every minute would keep the sync from ever being idle, and the comparison
  with the server runs only after an idle sync. The bytes and minutes go into the synced
  `vpn_days` every 15 minutes (and at midnight).
- Devices are added, renamed and deleted on the server only: the computer (a sync client) asks
  it through a server action. Two instances never hand out the same address, and a device
  deleted on the computer is not brought back by the server's newer version. On the computer
  the page shows the devices and their QR codes with the state "On the server"; who is online is
  seen on the server's page.
- The container applies a changed `awg0.conf` within 10 seconds (`awg syncconf`: connected
  devices stay connected) and writes its status every 10 seconds.
- The build of AmneziaWG is pinned by commit, not by tag alone.
- The tables are left out of the open export and the archive: the keys would lie in plain files.

## Not verified live

The real server (the build there, the firewall, the DNS record), the phone and the Windows client
— the container itself was tried locally: a handshake with the generated settings, traffic out
through it, the private networks closed, a deleted device cut off.

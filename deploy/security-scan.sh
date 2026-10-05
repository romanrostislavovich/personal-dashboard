#!/usr/bin/env bash
# What the security agent of the dashboard needs to know about the server itself: the dashboard
# runs in a container and cannot see the host's firewall, ports, SSH settings or updates.
#
# deploy.sh installs it to run every hour as root (/etc/cron.d/dashboard-security). It only
# reads — nothing on the server is changed — and writes one file, security/host.json, which
# the dashboard reads (SECURITY_DIR, see libs/api/core/src/lib/security/host-security.rules.ts
# for the format). A thing it cannot tell (a tool is missing) is written as null.
#
#   bash security-scan.sh          write security/host.json next to this script
#   sh security-scan.sh -          print the report instead
set -u
export LC_ALL=C PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

have() { command -v "$1" >/dev/null 2>&1; }
# A string as JSON: quotes and backslashes escaped, control characters dropped.
json() { printf '"%s"' "$(printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')"; }
# true / false / null from the exit status of a command (null when the tool is missing).
flag() { if "$@" >/dev/null 2>&1; then echo true; else echo false; fi; }
number() { case "$1" in '' | *[!0-9]*) echo null ;; *) echo "$1" ;; esac; }

# --- The system ---
os=$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-}")
disk=$(df -P / 2>/dev/null | awk 'NR==2 { gsub("%", "", $5); print $5 }')

# --- SSH: the settings in effect, the failures of a day, the last sign-ins that worked ---
password_auth=null
root_login=null
if have sshd; then
  settings=$(sshd -T 2>/dev/null)
  case "$(echo "$settings" | awk '$1 == "passwordauthentication" { print $2 }')" in
    yes) password_auth=true ;;
    no) password_auth=false ;;
  esac
  value=$(echo "$settings" | awk '$1 == "permitrootlogin" { print $2 }')
  [ -n "$value" ] && root_login=$(json "$value")
fi

failed=null
accepted='[]'
if have journalctl; then
  log=$(journalctl -u ssh -u sshd --since '24 hours ago' --no-pager -o short-iso 2>/dev/null)
  failed=$(echo "$log" | grep -c -E 'Failed password|Invalid user|authentication failure|Connection closed by authenticating user')
  # "2026-10-05T10:00:00+0200 host sshd[1]: Accepted publickey for root from 1.2.3.4 port …"
  accepted=$(echo "$log" | grep ' Accepted ' | tail -10 | awk '
    BEGIN { printf "[" }
    {
      for (i = 1; i <= NF; i++) if ($i == "for") { user = $(i + 1); ip = $(i + 3) }
      gsub(/[^A-Za-z0-9._-]/, "", user); gsub(/[^0-9a-fA-F.:]/, "", ip)
      printf "%s{\"user\":\"%s\",\"ip\":\"%s\",\"at\":\"%s\"}", (NR > 1 ? "," : ""), user, ip, $1
    }
    END { printf "]" }')
fi

# --- The firewall: ufw, or any rules of nftables / iptables ---
firewall=null
tool=null
if have ufw; then
  tool='"ufw"'
  if ufw status 2>/dev/null | grep -q '^Status: active'; then firewall=true; else firewall=false; fi
fi
if [ "$firewall" != true ] && have nft; then
  # Docker adds chains of its own: only an input chain that drops by default is a firewall.
  if nft list ruleset 2>/dev/null | grep -q -E 'hook input .*policy drop'; then
    firewall=true
    tool='"nftables"'
  elif [ "$firewall" = null ]; then
    firewall=false
  fi
fi
if [ "$firewall" != true ] && have iptables; then
  if iptables -S INPUT 2>/dev/null | grep -q -E '^-P INPUT (DROP|REJECT)'; then
    firewall=true
    tool='"iptables"'
  elif [ "$firewall" = null ]; then
    firewall=false
  fi
fi

# --- What listens on other than the loopback address ---
listening='[]'
if have ss; then
  listening=$(ss -H -tulnp 2>/dev/null | awk '
    BEGIN { printf "[" }
    {
      protocol = $1; local = $5
      port = local; sub(/.*:/, "", port)
      address = local; sub(/:[^:]*$/, "", address); gsub(/[\[\]]/, "", address)
      if (address ~ /^127\./ || address == "::1" || address ~ /%lo$/ || port !~ /^[0-9]+$/) next
      process = "null"
      if (match($0, /users:\(\("[^"]+"/)) {
        name = substr($0, RSTART + 9, RLENGTH - 10); gsub(/[^A-Za-z0-9._-]/, "", name)
        process = "\"" name "\""
      }
      key = protocol "/" port "/" address
      if (seen[key]++) next
      gsub(/[^0-9a-fA-F.:*%a-z]/, "", address)
      printf "%s{\"port\":%s,\"protocol\":\"%s\",\"address\":\"%s\",\"process\":%s}", (n++ ? "," : ""), port, protocol, address, process
    }
    END { printf "]" }')
fi

# --- Updates ---
pending=null
security=null
automatic=null
if have apt-get; then
  upgrades=$(apt-get -s -o Debug::NoLocking=true upgrade 2>/dev/null | grep '^Inst ')
  pending=$(echo "$upgrades" | grep -c '^Inst ')
  security=$(echo "$upgrades" | grep -c -i 'security')
  if have systemctl; then automatic=$(flag systemctl is-enabled unattended-upgrades); fi
fi
reboot=false
[ -f /var/run/reboot-required ] && reboot=true

fail2ban=null
if have systemctl; then fail2ban=$(flag systemctl is-active fail2ban); fi

report=$(
  cat <<EOF
{
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "os": $(json "$os"),
  "ssh": {
    "passwordAuthentication": $password_auth,
    "permitRootLogin": $root_login,
    "failed24h": $(number "$failed"),
    "accepted": $accepted
  },
  "firewall": { "active": $firewall, "tool": $tool },
  "listening": $listening,
  "updates": {
    "pending": $(number "$pending"),
    "security": $(number "$security"),
    "rebootRequired": $reboot,
    "automatic": $automatic
  },
  "fail2ban": $fail2ban,
  "diskUsedPercent": $(number "$disk")
}
EOF
)

if [ "${1:-}" = - ]; then
  echo "$report"
  exit 0
fi
folder="$(cd "$(dirname "$0")" && pwd)/security"
mkdir -p "$folder"
# Written whole or not at all: the dashboard never reads half a file.
echo "$report" >"$folder/host.json.tmp" && mv "$folder/host.json.tmp" "$folder/host.json"
chmod 644 "$folder/host.json"

#!/usr/bin/env bash
# Installs DispatchAI on a Linux server that already has Docker with the compose plugin.
#   curl -fsSL https://raw.githubusercontent.com/MAhsaanUllah/DispatchAI/main/scripts/install-vps.sh | bash -s -- --domain bookings.example.com
# Your domain's DNS must already point at this server (Caddy needs it to get the HTTPS certificate).
# Options: --domain NAME (required)  --dir PATH (default /opt/dispatchai)  --repo URL  --with-n8n  --dry-run
# --dry-run only writes the .env file and prints what it would run. An existing .env is never overwritten.
set -eu

domain="" dir="/opt/dispatchai" repo="https://github.com/MAhsaanUllah/DispatchAI.git" with_n8n=0 dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) domain="${2:-}"; shift 2 ;;
    --dir) dir="${2:-}"; shift 2 ;;
    --repo) repo="${2:-}"; shift 2 ;;
    --with-n8n) with_n8n=1; shift ;;
    --dry-run) dry=1; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

die() { echo "Error: $*" >&2; exit 1; }
[ -n "$domain" ] || die "give your domain: --domain bookings.example.com"
echo "$domain" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' || die "\"$domain\" is not a domain name (use something like bookings.example.com, not an IP address)"
echo "$domain" | grep -Eq '^[0-9.]+$' && die "use a domain name, not an IP address"

rand_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
rand_b64() { head -c "$1" /dev/urandom | base64 | tr -d '\n'; }

if [ "$dry" -eq 0 ]; then
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. See https://docs.docker.com/engine/install/ then run this again."
  docker compose version >/dev/null 2>&1 || die "the Docker compose plugin is missing (docker compose version failed)."
  [ -f "$dir/docker-compose.yml" ] || { command -v git >/dev/null 2>&1 || die "git is not installed."; }
fi

if command -v getent >/dev/null 2>&1 && ! getent hosts "$domain" >/dev/null 2>&1; then
  echo "Warning: $domain does not resolve yet. Point its DNS record at this server first, or the HTTPS certificate will fail." >&2
fi

if [ -f "$dir/docker-compose.yml" ]; then
  echo "Using the existing install in $dir"
elif [ "$dry" -eq 1 ]; then
  echo "[dry run] would run: git clone --depth 1 $repo $dir"; mkdir -p "$dir"
else
  git clone --depth 1 "$repo" "$dir"
fi

env="$dir/.env"
if [ -f "$env" ]; then
  echo "Keeping your existing $env (nothing changed). Make sure it has PUBLIC_DOMAIN=$domain and TRUST_PROXY=true."
  setup_code="(see SETUP_TOKEN in $env, or: docker compose logs app)"
else
  setup_code="$(rand_hex 6)"
  umask 077
  {
    echo "SETUP_TOKEN=$setup_code"
    echo "MASTER_KEY=$(rand_b64 32)"
    echo "PUBLIC_DOMAIN=$domain"
    echo "PUBLIC_URL=https://$domain"
    echo "TRUST_PROXY=true"
    echo "SEED_DEMO_DATA=false"
    [ "$with_n8n" -eq 1 ] && echo "N8N_EVENTS_SECRET=$(rand_hex 24)"
  } > "$env"
  chmod 600 "$env"
  echo "Wrote $env with new secrets (mode 600)."
fi

profiles=(--profile vps)
[ "$with_n8n" -eq 1 ] && profiles+=(--profile automation)
if [ "$dry" -eq 1 ]; then
  echo "[dry run] would run in $dir: docker compose ${profiles[*]} up -d --build"
  echo "[dry run] then wait for http://127.0.0.1:8080/health and print https://$domain/app"
  exit 0
fi

(cd "$dir" && docker compose "${profiles[@]}" up -d --build)
printf 'Waiting for the app'
for _ in $(seq 1 60); do
  curl -fsS -m 3 http://127.0.0.1:8080/health >/dev/null 2>&1 && break
  printf '.'; sleep 2
done
echo
curl -fsS -m 3 http://127.0.0.1:8080/health >/dev/null 2>&1 || die "the app did not become healthy. Look at: cd $dir && docker compose logs app"

cat <<EOF

DispatchAI is running.
  Open:        https://$domain/app   (the first HTTPS certificate can take a minute)
  Setup code:  $setup_code
  Then choose your name and PIN, and follow the setup wizard.

Keep $env safe and back it up: it holds MASTER_KEY, which decrypts your saved plugin keys.
Open ports 80 and 443 in your firewall (for example: ufw allow 80,443/tcp).
EOF

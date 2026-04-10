#!/bin/bash

# ─────────────────────────────────────────────
#  UDP Proxy System — One-Click Launcher
# ─────────────────────────────────────────────

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ask() {
  # ask a yes/no question, return 0 for yes, 1 for no
  while true; do
    read -rp "$1 [y/n]: " ans
    case "$ans" in
      [Yy]*) return 0 ;;
      [Nn]*) return 1 ;;
      *) echo "  Please answer y or n." ;;
    esac
  done
}

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   UDP Proxy System — Startup Wizard       ${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
echo ""

# ── Step 1: MySQL database ────────────────────────────────────────────────────

echo -e "${YELLOW}[1/4] One-time setup: MySQL database${NC}"
if ask "    Have you already set up the MySQL database?"; then
  echo -e "    ${GREEN}✓ Skipping DB setup.${NC}"
else
  echo -e "    Setting up MySQL database..."
  sudo mysql -e "
    CREATE DATABASE IF NOT EXISTS udp_proxy_db;
    CREATE USER IF NOT EXISTS 'proxy_user'@'localhost' IDENTIFIED WITH mysql_native_password BY 'proxy_secret';
    GRANT ALL PRIVILEGES ON udp_proxy_db.* TO 'proxy_user'@'localhost';
    FLUSH PRIVILEGES;
  "
  sudo mysql udp_proxy_db < "$PROJECT_DIR/manage_server/db/schema.sql"
  echo -e "    ${GREEN}✓ Database ready.${NC}"
fi
echo ""

# ── Step 2: Python venv ───────────────────────────────────────────────────────

echo -e "${YELLOW}[2/4] One-time setup: Python virtual environment${NC}"
if ask "    Have you already created the Python venv and installed dependencies?"; then
  echo -e "    ${GREEN}✓ Skipping venv setup.${NC}"
else
  echo -e "    Creating venv and installing dependencies..."
  cd "$PROJECT_DIR"
  python3 -m venv venv
  venv/bin/pip install --quiet cryptography requests
  echo -e "    ${GREEN}✓ Python venv ready.${NC}"
fi
echo ""

# ── Step 3: Node.js dependencies ─────────────────────────────────────────────

echo -e "${YELLOW}[3/4] One-time setup: Node.js dependencies${NC}"
if ask "    Have you already run npm install for the server and frontend?"; then
  echo -e "    ${GREEN}✓ Skipping npm install.${NC}"
else
  echo -e "    Installing server dependencies..."
  cd "$PROJECT_DIR/manage_server" && npm install --silent
  echo -e "    Installing frontend dependencies..."
  cd "$PROJECT_DIR/frontend" && npm install --silent
  echo -e "    ${GREEN}✓ Node.js dependencies ready.${NC}"
fi
echo ""

# ── Credentials ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}[4/4] Agent login credentials${NC}"
read -rp "    Username: " PROXY_USER
read -rsp "    Password: " PROXY_PASS
echo ""
echo -e "    ${GREEN}✓ Credentials saved.${NC}"
echo ""

# ── Launch all components ─────────────────────────────────────────────────────

echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Launching all components...${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
echo ""

# Management server
echo -e "  ${GREEN}▶ Starting management server...${NC}"
gnome-terminal --title="Management Server" -- bash -c "
  cd '$PROJECT_DIR/manage_server' && node server.js; exec bash
" 2>/dev/null \
|| xterm -title "Management Server" -e "cd '$PROJECT_DIR/manage_server' && node server.js; bash" &

sleep 1

# Gateway server
echo -e "  ${GREEN}▶ Starting secure gateway...${NC}"
gnome-terminal --title="Secure Gateway" -- bash -c "
  cd '$PROJECT_DIR' && venv/bin/python -m secure_gateway.gateway_server; exec bash
" 2>/dev/null \
|| xterm -title "Secure Gateway" -e "cd '$PROJECT_DIR' && venv/bin/python -m secure_gateway.gateway_server; bash" &

sleep 1

# Client agent / multiplexer
echo -e "  ${GREEN}▶ Starting client agent...${NC}"
gnome-terminal --title="Client Agent" -- bash -c "
  cd '$PROJECT_DIR' && PROXY_USER='$PROXY_USER' PROXY_PASS='$PROXY_PASS' venv/bin/python -m client_agent.multiplexer; exec bash
" 2>/dev/null \
|| xterm -title "Client Agent" -e "cd '$PROJECT_DIR' && PROXY_USER='$PROXY_USER' PROXY_PASS='$PROXY_PASS' venv/bin/python -m client_agent.multiplexer; bash" &

sleep 1

# Frontend
echo -e "  ${GREEN}▶ Starting frontend...${NC}"
gnome-terminal --title="Frontend" -- bash -c "
  cd '$PROJECT_DIR/frontend' && npm run dev; exec bash
" 2>/dev/null \
|| xterm -title "Frontend" -e "cd '$PROJECT_DIR/frontend' && npm run dev; bash" &

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  All systems launched!${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo -e "  Management API: ${CYAN}http://localhost:3001${NC}"
echo -e "  API Docs:       ${CYAN}http://localhost:3001/api-docs${NC}"
echo -e "  Dashboard:      ${CYAN}http://localhost:5173${NC}"
echo -e "  Gateway UDP:    ${CYAN}0.0.0.0:9999${NC}"
echo -e "  SOCKS5 Proxy:   ${CYAN}127.0.0.1:1080${NC}"
echo ""
echo -e "${YELLOW}  Configure Firefox: SOCKS5 → 127.0.0.1:1080, enable Proxy DNS${NC}"
echo ""

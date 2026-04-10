# RUN GUIDE

## step 0: install system dependencies (if needed)

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs mysql-server

sudo systemctl start mysql
sudo systemctl enable mysql
```

## step 1: run

```bash
./start.sh
```

The startup wizard will:
1. Optionally set up the MySQL database (one-time)
2. Optionally create the Python venv and install dependencies (one-time)
3. Optionally install Node.js dependencies (one-time)
4. Prompt for agent login credentials
5. Launch all components in separate terminal windows

Once running:
- Management API: `http://localhost:3001`
- API Docs: `http://localhost:3001/api-docs`
- Dashboard: `http://localhost:5173`
- Gateway UDP: `0.0.0.0:9999`
- SOCKS5 Proxy: `127.0.0.1:1080`

## step 2: configure browser to use SOCKS5 proxy

### firefox (recommended)

1. Open Firefox → **Settings** → search **"proxy"** → click **Settings…**
2. Select **Manual proxy configuration**
3. Set:
   - **SOCKS Host:** `127.0.0.1`
   - **Port:** `1080`
   - **SOCKS v5** selected
4. Check ✅ **Proxy DNS when using SOCKS v5**
5. Click **OK**

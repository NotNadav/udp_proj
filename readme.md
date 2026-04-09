# RUN GUIDE 

## step 0: install system dependencies (if needed)

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv


sudo apt install -y nodejs


sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```


## step 1: initialize MySQL db (one time only)

### create the db and user

```bash
sudo mysql -e "
  CREATE DATABASE IF NOT EXISTS udp_proxy_db;
  CREATE USER IF NOT EXISTS 'proxy_user'@'localhost' IDENTIFIED WITH mysql_native_password BY 'proxy_secret';
  GRANT ALL PRIVILEGES ON udp_proxy_db.* TO 'proxy_user'@'localhost';
  FLUSH PRIVILEGES;
"
```

### load the schema

```bash
sudo mysql udp_proxy_db < /home/client/udp_proj/manage_server/db/schema.sql
```

### verify MySQL is running

```bash
mysqladmin ping -h localhost -u proxy_user -pproxy_secret
```

**expected output:** `mysqld is alive`

### verify tables exist

```bash
mysql -u proxy_user -pproxy_secret udp_proxy_db -e "SHOW TABLES;"
```

**Expected output:**
```
+-------------------------+
| Tables_in_udp_proxy_db  |
+-------------------------+
| policies                |
| traffic_logs            |
| users                   |
+-------------------------+
```

## step 2: install & start the node.js server

```bash
cd /home/client/udp_proj/manage_server

npm install
npm start
```

## step 3: create python venv & install dependencies (one time only)

```bash
cd /home/client/udp_proj

python3 -m venv venv

source venv/bin/activate

pip install cryptography requests
```

## step 4: start the python gateway server

open a **new terminal**:

```bash
cd /home/client/udp_proj

python3 -m secure_gateway.gateway_server
```

## step 5: start the python client agent

open a **new terminal**:

```bash
cd /home/client/udp_proj

python3 -m client_agent.multiplexer
```

## step 6: start the react dashboard

open a **new terminal**:

```bash
cd /home/client/udp_proj/frontend

npm install

npm run dev
```

## step 7: configure browser to use SOCKS5 proxy

### firefox (recommended)

1. Open Firefox → **Settings** → search **"proxy"** → click **Settings…**
2. Select **Manual proxy configuration**
3. Set:
   - **SOCKS Host:** `127.0.0.1`
   - **Port:** `1080`
   - **SOCKS v5** selected
4. Check ✅ **Proxy DNS when using SOCKS v5**
5. Click **OK**


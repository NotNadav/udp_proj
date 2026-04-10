
import asyncio
import socket
import sys
import os
import json
import urllib.request
import urllib.error

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from shared.crypto_manager import CryptoManager
from shared.protocol import ProtocolPacket
from shared.reliab import ReliabilityManager
from client_agent.policy_engine import PolicyEngine


class Multiplexer:

    #management API config 
    API_URL  = os.environ.get("MANAGE_SERVER_URL", "http://127.0.0.1:3001")

    def __init__(self):
        #setup user credentials
        self.api_user = os.environ.get("PROXY_USER")
        self.api_pass = os.environ.get("PROXY_PASS")
        
        if not self.api_user or not self.api_pass:
            print("[?] Proxy Agent Login Required!")
            print("    (Press ENTER to use default 'admin')")
            self.api_user = input("Username: ").strip() or "admin"
            import getpass
            self.api_pass = getpass.getpass(f"Password for {self.api_user}: ").strip() or "admin123"
            print()
        #stream management
        self.active_streams = {}        # stream_id → {writer, action, arq, ...}
        self._stream_send_queues = {}   # stream_id → asyncio.Queue for round-robin scheduler
        self.next_stream_id = 1
        self.session_id = 0             # assigned during ECDHE handshake

        #UDP socket
        self.udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.udp_socket.setblocking(False)
        gw_host = os.environ.get("GATEWAY_HOST", "127.0.0.1")
        gw_port = int(os.environ.get("GATEWAY_PORT", "9999"))
        self.gateway_address = (gw_host, gw_port)

        #auto-login to management API 
        self.api_token = self._login_to_api()

        #policy engine (with API sync if token available) 
        self.policy_engine = PolicyEngine(
            api_url=self.API_URL,
            api_token=self.api_token,
            sync_interval=10,
        )

        #crypto (ECDHE) — key derived after handshake
        self.crypto = CryptoManager()
        self.handshake_done = asyncio.Event()


    # mngmt helpers
    def _login_to_api(self) -> str:
        """Login to the management server and return a JWT token."""
        try:
            payload = json.dumps({"username": self.api_user, "password": self.api_pass}).encode()
            req = urllib.request.Request(
                f"{self.API_URL}/api/auth/login",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                token = data.get("token", "")
                print(f"Logged in to management API as '{self.api_user}'")
                return token
        except urllib.error.HTTPError as e:
            if e.code == 401:
                print(f"ERROR: Invalid username or password for '{self.api_user}'.")
                sys.exit(1)
            print(f"[!] Management API login failed: {e}")
            print("    → Agent will use local rules.json only (no sync, no log reporting).")
            return ""
        except Exception as exc:
            print(f"[!] Management API login failed: {exc}")
            print("    → Agent will use local rules.json only (no sync, no log reporting).")
            return ""

    async def _report_traffic(self, domain: str, bytes_sent: int):
        """Report a traffic log entry to the management API (non-blocking)."""
        if not self.api_token:
            return
        try:
            payload = json.dumps({"domain": domain, "bytes_sent": bytes_sent}).encode()
            req = urllib.request.Request(
                f"{self.API_URL}/api/logs",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_token}",
                },
                method="POST",
            )
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=3))
        except Exception as e:
            print(f"[!] Traffic report failed for {domain}: {e}")

    # ecdhe handshake


    async def perform_handshake(self):
        """
        Three-way ECDHE handshake over UDP:
          Client → Gateway : SYN  + client ECDHE public key
          Gateway → Client : SYN_ACK + gateway ECDHE public key + session_id
          Client → Gateway : ACK  (handshake complete)
        """
        loop = asyncio.get_running_loop()
        pub_key_bytes = self.crypto.get_public_key_bytes()

        print("Starting ECDHE handshake with gateway …")

        # step 1: send syn
        syn_packet = ProtocolPacket.pack(
            session_id=0,
            stream_id=0,
            seq_num=0,
            flags=ProtocolPacket.FLAG_SYN,
            payload=pub_key_bytes,
        )

        for attempt in range(10):
            await loop.sock_sendto(self.udp_socket, syn_packet, self.gateway_address)

            # wait for syn_ack
            try:
                data = await asyncio.wait_for(
                    loop.sock_recv(self.udp_socket, 65535),
                    timeout=3.0,
                )
                pkt = ProtocolPacket.unpack(data)
                if pkt["flags"] == ProtocolPacket.FLAG_SYN_ACK and pkt["stream_id"] == 0:
                    # Extract gateway's public key from payload
                    gateway_pub_key = pkt["payload"]
                    self.session_id = pkt["session_id"]

                    # Derive the shared AES-256-GCM key via ECDHE + HKDF
                    self.crypto.derive_shared_key(gateway_pub_key)
                    print(f"ECDHE key derived — session_id={self.session_id}")

                    # step 3: send ack
                    ack_packet = ProtocolPacket.pack(
                        session_id=self.session_id,
                        stream_id=0,
                        seq_num=0,
                        flags=ProtocolPacket.FLAG_ACK,
                        payload=b"",
                    )
                    await loop.sock_sendto(self.udp_socket, ack_packet, self.gateway_address)
                    print("Handshake complete — tunnel encrypted with AES-256-GCM")
                    self.handshake_done.set()
                    return
            except asyncio.TimeoutError:
                print(f"[!] Handshake attempt {attempt + 1}/10 timed out, retrying …")

        print("FATAL: could not complete ECDHE handshake with gateway.")
        sys.exit(1)

    # keep-alive pings

    async def start_keep_alive(self):
        await self.handshake_done.wait()
        loop = asyncio.get_running_loop()
        while True:
            await asyncio.sleep(30)
            heartbeat = ProtocolPacket.pack(
                session_id=self.session_id,
                stream_id=0, seq_num=0,
                flags=ProtocolPacket.FLAG_SYN,
                payload=b"PING",
            )
            try:
                await loop.sock_sendto(self.udp_socket, heartbeat, self.gateway_address)
            except Exception:
                pass

    # arq retransmission

    async def retransmission_loop(self):
        """Background task: retransmit expired unACKed packets for all streams."""
        await self.handshake_done.wait()
        loop = asyncio.get_running_loop()
        while True:
            await asyncio.sleep(0.5)
            for sid, info in list(self.active_streams.items()):
                arq = info.get("arq")
                if not arq:
                    continue
                expired = arq.get_expired_packets()
                for seq, pkt_bytes in expired:
                    try:
                        await loop.sock_sendto(self.udp_socket, pkt_bytes, self.gateway_address)
                    except Exception:
                        pass

    # round-robin stream scheduler

    async def _packet_sender_loop(self):
        """Round-robin scheduler: sends one DATA packet per active stream per turn.
        Ensures fairness so no single stream starves the others."""
        await self.handshake_done.wait()
        loop = asyncio.get_running_loop()
        while True:
            stream_ids = list(self._stream_send_queues.keys())
            sent_any = False
            for sid in stream_ids:
                q = self._stream_send_queues.get(sid)
                if not q or q.empty():
                    continue
                try:
                    pkt_bytes = q.get_nowait()
                    await loop.sock_sendto(self.udp_socket, pkt_bytes, self.gateway_address)
                    sent_any = True
                except asyncio.QueueEmpty:
                    pass
            if not sent_any:
                await asyncio.sleep(0.001)

    # listen to udp gateway

    async def start_udp_listener(self):
        """Receive packets from the gateway, process ACKs and DATA."""
        await self.handshake_done.wait()
        loop = asyncio.get_running_loop()
        print("UDP Tunnel Listener & Decryptor started.")

        while True:
            try:
                data = await loop.sock_recv(self.udp_socket, 65535)
                if len(data) < ProtocolPacket.HEADER_SIZE:
                    continue

                pkt = ProtocolPacket.unpack(data)
                stream_id = pkt["stream_id"]
                flags     = pkt["flags"]
                seq_num   = pkt["seq_num"]
                payload   = pkt["payload"]

                # Skip handshake packets that arrive late
                if stream_id == 0:
                    continue

                # SYN-ACK: gateway confirmed stream is ready (TCP connection established)
                if flags == ProtocolPacket.FLAG_SYN_ACK:
                    if stream_id in self.active_streams:
                        ready = self.active_streams[stream_id].get("ready")
                        if ready:
                            ready.set()
                    continue

                # ack from gateway
                if flags & ProtocolPacket.FLAG_ACK:
                    if stream_id in self.active_streams:
                        arq = self.active_streams[stream_id].get("arq")
                        if arq:
                            arq.handle_ack(seq_num)
                    continue

                # fin from gateway
                if flags & ProtocolPacket.FLAG_FIN:
                    if stream_id in self.active_streams:
                        writer = self.active_streams[stream_id]["writer"]
                        writer.close()
                        del self.active_streams[stream_id]
                    self._stream_send_queues.pop(stream_id, None)
                    continue

                # data from gateway
                if flags & ProtocolPacket.FLAG_DATA:
                    if stream_id not in self.active_streams:
                        continue

                    stream_info = self.active_streams[stream_id]
                    recv_arq    = stream_info.get("recv_arq")

                    # Send ACK back to gateway
                    ack = ReliabilityManager.build_ack_packet(
                        self.session_id, stream_id, seq_num,
                    )
                    await loop.sock_sendto(self.udp_socket, ack, self.gateway_address)

                    # decrypt if tunnel
                    if stream_info["action"] == "TUNNEL":
                        payload = self.crypto.decrypt(payload)
                        if payload is None:
                            continue

                    # Deliver through reorder buffer
                    if recv_arq:
                        ready_payloads = recv_arq.receive_packet(seq_num, payload)
                    else:
                        ready_payloads = [payload]

                    writer = stream_info["writer"]
                    for p in ready_payloads:
                        writer.write(p)
                    await writer.drain()

            except Exception:
                await asyncio.sleep(0.01)

    # socks5 handshake

    async def extract_socks5_target(self, reader, writer):
        """Complete SOCKS5 handshake and return (domain, port) tuple."""
        try:
            # greeting
            ver_nmethods = await reader.readexactly(2)
            if ver_nmethods[0] != 5:
                return None, None
            nmethods = ver_nmethods[1]
            await reader.readexactly(nmethods)   # consume method list

            # Reply: VER=5, METHOD=0x00 (no auth)
            writer.write(b"\x05\x00")
            await writer.drain()

            # connection request
            req_header = await reader.readexactly(4)   # VER CMD RSV ATYP
            if req_header[0] != 5 or req_header[1] != 1:
                return None, None

            atyp = req_header[3]

            if atyp == 1:       # IPv4
                ip_bytes = await reader.readexactly(4)
                domain = socket.inet_ntoa(ip_bytes)
            elif atyp == 3:     # Domain name
                domain_len = (await reader.readexactly(1))[0]
                domain = (await reader.readexactly(domain_len)).decode()
            elif atyp == 4:     # IPv6
                ip_bytes = await reader.readexactly(16)
                domain = socket.inet_ntop(socket.AF_INET6, ip_bytes)
            else:
                return None, None

            # Port (2 bytes, big-endian)
            port_bytes = await reader.readexactly(2)
            port = int.from_bytes(port_bytes, byteorder="big")

            # Success reply: VER=5 REP=0 RSV=0 ATYP=1 BIND_ADDR=0.0.0.0:0
            writer.write(b"\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00")
            await writer.drain()

            return domain, port

        except Exception as e:
            print(f"SOCKS5 error: {e}")
            return None, None

    # connection handler

    async def handle_local_tcp(self, reader, writer):
        await self.handshake_done.wait()

        domain, port = await self.extract_socks5_target(reader, writer)
        if not domain or port is None:
            writer.close()
            await writer.wait_closed()
            return

        # apply policy
        action = self.policy_engine.evaluate(domain)
        print(f"\n{domain}:{port} → Policy: {action}")

        if action == "BLOCK":
            print(f"[✗] BLOCKED: {domain}")
            asyncio.create_task(self._report_traffic(domain, 0))
            writer.close()
            await writer.wait_closed()
            return

        # direct bypass
        if action == "DIRECT":
            await self._handle_direct(reader, writer, domain, port)
            return

        # tunnel encrypt and send
        stream_id = self.next_stream_id
        self.next_stream_id += 1

        # Create per-stream ARQ managers (sender + receiver)
        send_arq = ReliabilityManager(window_size=32, timeout_seconds=2.0)
        recv_arq = ReliabilityManager(window_size=32, timeout_seconds=2.0)
        stream_ready = asyncio.Event()

        self.active_streams[stream_id] = {
            "writer":    writer,
            "action":    "TUNNEL",
            "arq":       send_arq,
            "recv_arq":  recv_arq,
            "ready":     stream_ready,
        }
        self._stream_send_queues[stream_id] = asyncio.Queue()

        loop = asyncio.get_running_loop()

        # Send SYN and wait for the gateway's SYN-ACK before sending any DATA.
        # The gateway only sends SYN-ACK once the outbound TCP connection to the
        # target host is established, so there is no longer a race where DATA
        # arrives before the stream exists on the gateway side.
        # Retransmit SYN every 2 s in case the packet is lost.
        syn = ProtocolPacket.pack(
            session_id=self.session_id,
            stream_id=stream_id,
            seq_num=0,
            flags=ProtocolPacket.FLAG_SYN,
            payload=f"{domain}:{port}".encode(),
        )
        STREAM_SETUP_TIMEOUT = 10.0
        deadline = loop.time() + STREAM_SETUP_TIMEOUT
        await loop.sock_sendto(self.udp_socket, syn, self.gateway_address)
        while not stream_ready.is_set():
            if stream_id not in self.active_streams:
                # Gateway sent FIN — target host unreachable
                writer.close()
                await writer.wait_closed()
                return
            remaining = deadline - loop.time()
            if remaining <= 0:
                print(f"[!] Stream {stream_id} ({domain}): no SYN-ACK from gateway, aborting.")
                if stream_id in self.active_streams:
                    del self.active_streams[stream_id]
                writer.close()
                await writer.wait_closed()
                return
            try:
                await asyncio.wait_for(stream_ready.wait(), timeout=min(2.0, remaining))
            except asyncio.TimeoutError:
                # Retransmit SYN
                await loop.sock_sendto(self.udp_socket, syn, self.gateway_address)

        bytes_sent = 0
        IDLE_TIMEOUT = 60.0  # close idle stream after 60 s so traffic is reported promptly
        try:
            while True:
                try:
                    data = await asyncio.wait_for(reader.read(4096), timeout=IDLE_TIMEOUT)
                except asyncio.TimeoutError:
                    print(f"[!] Stream {stream_id} idle for {IDLE_TIMEOUT:.0f}s, closing.")
                    break
                if not data:
                    break

                # Wait until the window has room
                while not send_arq.can_send():
                    await asyncio.sleep(0.05)

                seq = send_arq.next_seq_num
                bytes_sent += len(data)

                # Encrypt payload
                payload = self.crypto.encrypt(data)

                # Pack with protocol header
                packet = ProtocolPacket.pack(
                    session_id=self.session_id,
                    stream_id=stream_id,
                    seq_num=seq,
                    flags=ProtocolPacket.FLAG_DATA,
                    payload=payload,
                )

                send_arq.mark_sent(seq, packet)
                await self._stream_send_queues[stream_id].put(packet)

        except Exception as e:
            print(f"[!] Stream {stream_id} error: {e}")
        finally:
            # Send FIN to close the stream
            fin = ProtocolPacket.pack(
                session_id=self.session_id,
                stream_id=stream_id,
                seq_num=0,
                flags=ProtocolPacket.FLAG_FIN,
            )
            try:
                await loop.sock_sendto(self.udp_socket, fin, self.gateway_address)
            except Exception:
                pass
            # Report traffic to dashboard
            await self._report_traffic(domain, max(bytes_sent, 1))
            if stream_id in self.active_streams:
                del self.active_streams[stream_id]
            self._stream_send_queues.pop(stream_id, None)
            writer.close()
            await writer.wait_closed()

    # direct bypass handler

    async def _handle_direct(self, client_reader, client_writer, domain, port):
        """Bypass VPN — relay TCP directly to the target server."""
        try:
            remote_reader, remote_writer = await asyncio.open_connection(domain, port)
        except Exception as e:
            print(f"DIRECT connection to {domain}:{port} failed: {e}")
            client_writer.close()
            await client_writer.wait_closed()
            return

        total_bytes = 0

        async def pipe(r, w, count=False):
            nonlocal total_bytes
            try:
                while True:
                    chunk = await r.read(4096)
                    if not chunk:
                        break
                    if count:
                        total_bytes += len(chunk)
                    w.write(chunk)
                    await w.drain()
            except Exception:
                pass
            finally:
                try:
                    w.close()
                    await w.wait_closed()
                except Exception:
                    pass

        await asyncio.gather(
            pipe(client_reader, remote_writer, count=True),
            pipe(remote_reader, client_writer),
        )
        await self._report_traffic(domain, max(total_bytes, 1))

    # main

    async def run(self):
        # Start ECDHE handshake first
        asyncio.create_task(self.perform_handshake())

        # Background tasks (wait for handshake internally)
        asyncio.create_task(self.start_udp_listener())
        asyncio.create_task(self.retransmission_loop())
        asyncio.create_task(self._packet_sender_loop())
        asyncio.create_task(self.start_keep_alive())

        # Start SOCKS5 server
        tcp_server = await asyncio.start_server(
            self.handle_local_tcp, "127.0.0.1", 1080,
        )
        print("SOCKS5 Agent listening on 127.0.0.1:1080")

        async with tcp_server:
            await tcp_server.serve_forever()


if __name__ == "__main__":
    mux = Multiplexer()
    asyncio.run(mux.run())
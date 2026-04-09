"""
secure gateway — udp server wrapper for encryption
"""

import asyncio
import socket
import struct
import sys
import os
import random

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from shared.crypto_manager import CryptoManager
from shared.protocol import ProtocolPacket
from shared.reliab import ReliabilityManager


class SecureGateway:
    def __init__(self):
        # udp socket
        self.udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.udp_socket.bind(("0.0.0.0", 9999))
        self.udp_socket.setblocking(False)

        # session map
        self.sessions = {}

        # pending handshakes
        self.pending_handshakes = {}

        print("Secure Gateway listening on UDP 0.0.0.0:9999")

    # handshake handler

    async def _handle_syn(self, pkt, client_addr, loop):
        # syn from client
        client_pub_key = pkt["payload"]
        if not client_pub_key:
            return

        # create crypto ctx
        crypto = CryptoManager()
        crypto.derive_shared_key(client_pub_key)

        session_id = random.randint(1, 0xFFFFFFFF)

        # put in pending
        self.pending_handshakes[client_addr] = {
            "crypto":     crypto,
            "session_id": session_id,
        }

        # send syn_ack
        gateway_pub_key = crypto.get_public_key_bytes()
        syn_ack = ProtocolPacket.pack(
            session_id=session_id,
            stream_id=0,
            seq_num=0,
            flags=ProtocolPacket.FLAG_SYN_ACK,
            payload=gateway_pub_key,
        )
        await loop.sock_sendto(self.udp_socket, syn_ack, client_addr)
        print(f"ECDHE SYN_ACK sent to {client_addr} — session_id={session_id}")

    async def _handle_handshake_ack(self, pkt, client_addr):
        # client sent ack
        pending = self.pending_handshakes.pop(client_addr, None)
        if not pending:
            return

        session_id = pending["session_id"]
        self.sessions[session_id] = {
            "crypto":      pending["crypto"],
            "client_addr": client_addr,
            "streams":     {},   # stream_id → {writer, send_arq, recv_arq}
        }
        print(f"ECDHE handshake complete — session {session_id} active from {client_addr}")

    # streams lifecycle

    async def _handle_stream_syn(self, session, session_id, pkt, client_addr, loop):
        # new stream
        stream_id = pkt["stream_id"]
        try:
            target_str = pkt["payload"].decode()
            domain, port_str = target_str.rsplit(":", 1)
            port = int(port_str)
        except Exception as e:
            print(f"Bad stream SYN payload: {e}")
            return

        print(f"Stream {stream_id}: opening → {domain}:{port}")

        try:
            reader, writer = await asyncio.open_connection(domain, port)
        except Exception as e:
            print(f"Failed to connect to {domain}:{port}: {e}")
            # send fin back if fail
            fin = ProtocolPacket.pack(
                session_id=session_id, stream_id=stream_id,
                seq_num=0, flags=ProtocolPacket.FLAG_FIN,
            )
            await loop.sock_sendto(self.udp_socket, fin, client_addr)
            return

        send_arq = ReliabilityManager(window_size=32, timeout_seconds=2.0)
        recv_arq = ReliabilityManager(window_size=32, timeout_seconds=2.0)

        session["streams"][stream_id] = {
            "writer":   writer,
            "reader":   reader,
            "domain":   domain,
            "port":     port,
            "send_arq": send_arq,
            "recv_arq": recv_arq,
        }

        # create a task to send back udp
        asyncio.create_task(
            self._tcp_to_udp(session, session_id, stream_id, reader, client_addr)
        )

    async def _handle_stream_fin(self, session, stream_id):
        # client closed stream
        stream = session["streams"].pop(stream_id, None)
        if stream:
            try:
                stream["writer"].close()
                await stream["writer"].wait_closed()
            except Exception:
                pass
            print(f"Stream {stream_id} closed (FIN received)")

    # tcp to udp forwarding

    async def _tcp_to_udp(self, session, session_id, stream_id, reader, client_addr):
        # read tcp responses from target server
        loop = asyncio.get_running_loop()
        crypto = session["crypto"]
        stream = session["streams"].get(stream_id)
        if not stream:
            return

        send_arq = stream["send_arq"]

        try:
            while True:
                data = await reader.read(4096)
                if not data:
                    break

                # wait for room
                while not send_arq.can_send():
                    await asyncio.sleep(0.05)

                seq = send_arq.next_seq_num

                # encrypt the response
                encrypted = crypto.encrypt(data)

                packet = ProtocolPacket.pack(
                    session_id=session_id,
                    stream_id=stream_id,
                    seq_num=seq,
                    flags=ProtocolPacket.FLAG_DATA,
                    payload=encrypted,
                )

                send_arq.mark_sent(seq, packet)
                await loop.sock_sendto(self.udp_socket, packet, client_addr)

        except Exception:
            pass
        finally:
            # send fin to client
            fin = ProtocolPacket.pack(
                session_id=session_id, stream_id=stream_id,
                seq_num=0, flags=ProtocolPacket.FLAG_FIN,
            )
            try:
                await loop.sock_sendto(self.udp_socket, fin, client_addr)
            except Exception:
                pass
            # clean up
            if stream_id in session["streams"]:
                s = session["streams"].pop(stream_id)
                try:
                    s["writer"].close()
                except Exception:
                    pass
                print(f"Stream {stream_id} closed (TCP EOF)")

    # arq loop

    async def retransmission_loop(self):
        # retry expired unacked packets
        loop = asyncio.get_running_loop()
        while True:
            await asyncio.sleep(0.5)
            for sid, session in list(self.sessions.items()):
                client_addr = session["client_addr"]
                for stream_id, stream in list(session["streams"].items()):
                    arq = stream.get("send_arq")
                    if not arq:
                        continue
                    expired = arq.get_expired_packets()
                    for seq, pkt_bytes in expired:
                        try:
                            await loop.sock_sendto(self.udp_socket, pkt_bytes, client_addr)
                        except Exception:
                            pass

    # udp listener

    async def start_listening(self):
        loop = asyncio.get_running_loop()

        while True:
            try:
                data, addr = await loop.sock_recvfrom(self.udp_socket, 65535)
                if len(data) < ProtocolPacket.HEADER_SIZE:
                    continue

                pkt        = ProtocolPacket.unpack(data)
                session_id = pkt["session_id"]
                stream_id  = pkt["stream_id"]
                flags      = pkt["flags"]
                payload    = pkt["payload"]

                # handshake
                if stream_id == 0:
                    if flags == ProtocolPacket.FLAG_SYN and session_id == 0:
                        # ecdhe syn
                        await self._handle_syn(pkt, addr, loop)
                        continue
                    elif flags == ProtocolPacket.FLAG_ACK:
                        # ecdhe ack
                        await self._handle_handshake_ack(pkt, addr)
                        continue
                    elif payload == b"PING":
                        # ignore keepalive
                        continue
                    continue

                # session lookup
                session = self.sessions.get(session_id)
                if not session:
                    continue

                # stream level syn
                if flags & ProtocolPacket.FLAG_SYN and not (flags & ProtocolPacket.FLAG_ACK):
                    await self._handle_stream_syn(session, session_id, pkt, addr, loop)
                    continue

                # stream fin
                if flags & ProtocolPacket.FLAG_FIN:
                    await self._handle_stream_fin(session, stream_id)
                    continue

                # client acking data
                if flags & ProtocolPacket.FLAG_ACK:
                    stream = session["streams"].get(stream_id)
                    if stream:
                        stream["send_arq"].handle_ack(pkt["seq_num"])
                    continue

                # client sending data
                if flags & ProtocolPacket.FLAG_DATA:
                    stream = session["streams"].get(stream_id)
                    if not stream:
                        continue

                    crypto = session["crypto"]

                    # send ack back
                    ack = ReliabilityManager.build_ack_packet(
                        session_id, stream_id, pkt["seq_num"],
                    )
                    await loop.sock_sendto(self.udp_socket, ack, addr)

                    # decrypt msg
                    plaintext = crypto.decrypt(payload)
                    if plaintext is None:
                        continue

                    # reorder buffer
                    recv_arq = stream["recv_arq"]
                    ready = recv_arq.receive_packet(pkt["seq_num"], plaintext)

                    # forward to server
                    writer = stream["writer"]
                    for chunk in ready:
                        writer.write(chunk)
                    await writer.drain()

            except Exception:
                await asyncio.sleep(0.01)

    # engine run

    async def run(self):
        asyncio.create_task(self.retransmission_loop())
        await self.start_listening()


if __name__ == "__main__":
    gw = SecureGateway()
    asyncio.run(gw.run())
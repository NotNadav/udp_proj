
import time
import heapq
from shared.protocol import ProtocolPacket


class ReliabilityManager:


    def __init__(self, window_size: int = 32, timeout_seconds: float = 2.0):
        # sender state
        self.window_size   = window_size
        self.timeout       = timeout_seconds
        self.send_base     = 0          # SendBase   — lowest unACKed seq
        self.next_seq_num  = 0          # NextSeqNum — next to assign
        self.unacked       = {}         # seq_num → {packet, timestamp}

        # recver state
        self.expected_seq  = 0          # ExpectedSeqNum
        self.recv_buffer   = []         # min-heap of (seq_num, payload)
        
        # stats
        self.retransmissions = 0

    # sender mechanisms

    SEQ_MOD = 1 << 32  # 32-bit unsigned wrap

    def can_send(self) -> bool:
        # true if window has room (wraparound-safe)
        in_flight = (self.next_seq_num - self.send_base) % self.SEQ_MOD
        return in_flight < self.window_size

    def mark_sent(self, seq_num: int, packet_bytes: bytes) -> None:
        # mark sent and advances window
        self.unacked[seq_num] = {
            "packet":    packet_bytes,
            "timestamp": time.time(),
        }
        if seq_num >= self.next_seq_num:
            self.next_seq_num = (seq_num + 1) % self.SEQ_MOD

    def handle_ack(self, acked_seq: int) -> None:
        # handle specific ack sequence
        if acked_seq in self.unacked:
            del self.unacked[acked_seq]

        # slide base forward (wraparound-safe)
        while self.send_base not in self.unacked and self.send_base != self.next_seq_num:
            self.send_base = (self.send_base + 1) % self.SEQ_MOD

    def get_expired_packets(self) -> list[tuple[int, bytes]]:
        # returns list of expired timed out packets
        now = time.time()
        expired = []
        for seq_num, info in self.unacked.items():
            if now - info["timestamp"] > self.timeout:
                expired.append((seq_num, info["packet"]))
                info["timestamp"] = now
        
        if expired:
            self.retransmissions += len(expired)
        return expired

    # recver mechanisms

    def receive_packet(self, seq_num: int, payload: bytes) -> list[bytes]:
        # accept packet
        ready = []

        if seq_num == self.expected_seq:
            ready.append(payload)
            self.expected_seq = (self.expected_seq + 1) % self.SEQ_MOD

            # flush buffer
            while self.recv_buffer and self.recv_buffer[0][0] == self.expected_seq:
                _, buffered_payload = heapq.heappop(self.recv_buffer)
                ready.append(buffered_payload)
                self.expected_seq = (self.expected_seq + 1) % self.SEQ_MOD

        elif seq_num > self.expected_seq:
            heapq.heappush(self.recv_buffer, (seq_num, payload))

        # ignored otherwise

        return ready

    # ack helpers

    @staticmethod
    def build_ack_packet(session_id: int, stream_id: int, acked_seq: int) -> bytes:
        # build 13 byte ack
        return ProtocolPacket.pack(
            session_id=session_id,
            stream_id=stream_id,
            seq_num=acked_seq,
            flags=ProtocolPacket.FLAG_ACK,
            payload=b"",
        )


# tests
if __name__ == "__main__":
    print("testing selective repeat ARQ …")

    mgr = ReliabilityManager(window_size=4, timeout_seconds=0.5)

    # Sender: send 4 packets (window full)
    for i in range(4):
        assert mgr.can_send(), f"Should be able to send seq {i}"
        mgr.mark_sent(i, f"pkt-{i}".encode())
    assert not mgr.can_send(), "Window should be full"
    print("Window limit enforced")

    # ACK seq 0 and 2 (selective)
    mgr.handle_ack(0)
    mgr.handle_ack(2)
    assert mgr.send_base == 1, f"SendBase should be 1, got {mgr.send_base}"
    print(f"Selective ACK OK — SendBase={mgr.send_base}")

    # ACK seq 1 → SendBase should jump to 3
    mgr.handle_ack(1)
    assert mgr.send_base == 3, f"SendBase should be 3, got {mgr.send_base}"
    print(f"SendBase advanced to {mgr.send_base}")

    # Timeout test
    time.sleep(0.6)
    expired = mgr.get_expired_packets()
    assert len(expired) == 1 and expired[0][0] == 3
    print(f"retransmission triggered for seq {expired[0][0]}")

    # Receiver: out-of-order
    recv = ReliabilityManager()
    assert recv.receive_packet(2, b"C") == []        # buffered
    assert recv.receive_packet(1, b"B") == []        # buffered
    assert recv.receive_packet(0, b"A") == [b"A", b"B", b"C"]   # delivered in order
    print("receiver reorder buffer OK")

    print("all ARQ tests passed.")

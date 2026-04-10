

import time
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from shared.reliab import ReliabilityManager


# ── sender side ──────────────────────────────────────────────────────────────

class TestSender:
    def test_can_send_within_window(self):
        mgr = ReliabilityManager(window_size=4)
        for i in range(4):
            assert mgr.can_send()
            mgr.mark_sent(i, f"pkt-{i}".encode())
        assert not mgr.can_send(), "window should be full at size 4"

    def test_window_opens_after_ack(self):
        mgr = ReliabilityManager(window_size=2)
        mgr.mark_sent(0, b"a")
        mgr.mark_sent(1, b"b")
        assert not mgr.can_send()
        mgr.handle_ack(0)
        assert mgr.can_send()

    def test_send_base_advances_on_cumulative_ack(self):
        mgr = ReliabilityManager(window_size=4)
        for i in range(4):
            mgr.mark_sent(i, b"x")
        mgr.handle_ack(0)
        mgr.handle_ack(1)
        mgr.handle_ack(2)
        assert mgr.send_base == 3

    def test_selective_ack_out_of_order(self):
        """ACKing seq 0 and 2 but not 1 — SendBase should stay at 1."""
        mgr = ReliabilityManager(window_size=4)
        for i in range(4):
            mgr.mark_sent(i, b"x")
        mgr.handle_ack(0)
        mgr.handle_ack(2)
        assert mgr.send_base == 1, f"expected SendBase=1, got {mgr.send_base}"
        # now ACK seq 1 → base should jump past 2 to 3
        mgr.handle_ack(1)
        assert mgr.send_base == 3, f"expected SendBase=3, got {mgr.send_base}"

    def test_retransmission_triggered_after_timeout(self):
        mgr = ReliabilityManager(window_size=4, timeout_seconds=0.1)
        mgr.mark_sent(0, b"pkt0")
        time.sleep(0.15)
        expired = mgr.get_expired_packets()
        assert len(expired) == 1
        assert expired[0][0] == 0
        assert expired[0][1] == b"pkt0"

    def test_no_retransmission_before_timeout(self):
        mgr = ReliabilityManager(window_size=4, timeout_seconds=5.0)
        mgr.mark_sent(0, b"pkt0")
        expired = mgr.get_expired_packets()
        assert len(expired) == 0

    def test_retransmission_counter_increments(self):
        mgr = ReliabilityManager(window_size=4, timeout_seconds=0.1)
        mgr.mark_sent(0, b"x")
        mgr.mark_sent(1, b"y")
        time.sleep(0.15)
        mgr.get_expired_packets()
        assert mgr.retransmissions == 2


# ── receiver side ─────────────────────────────────────────────────────────────

class TestReceiver:
    def test_in_order_delivery(self):
        recv = ReliabilityManager()
        assert recv.receive_packet(0, b"A") == [b"A"]
        assert recv.receive_packet(1, b"B") == [b"B"]
        assert recv.receive_packet(2, b"C") == [b"C"]

    def test_out_of_order_buffered_then_flushed(self):
        recv = ReliabilityManager()
        assert recv.receive_packet(2, b"C") == []   # buffered
        assert recv.receive_packet(1, b"B") == []   # buffered
        result = recv.receive_packet(0, b"A")       # triggers flush
        assert result == [b"A", b"B", b"C"]

    def test_gap_in_sequence_partial_flush(self):
        recv = ReliabilityManager()
        recv.receive_packet(3, b"D")  # gap at 0,1,2
        recv.receive_packet(1, b"B")
        result = recv.receive_packet(0, b"A")
        # 0 and 1 delivered; 3 still buffered (gap at 2)
        assert result == [b"A", b"B"]
        result2 = recv.receive_packet(2, b"C")
        assert result2 == [b"C", b"D"]

    def test_duplicate_packet_ignored(self):
        recv = ReliabilityManager()
        recv.receive_packet(0, b"A")
        # seq 0 again — already delivered, expected_seq moved past it
        result = recv.receive_packet(0, b"A_dup")
        assert result == []  # duplicate silently dropped

    def test_past_packet_ignored(self):
        recv = ReliabilityManager()
        recv.receive_packet(0, b"A")
        recv.receive_packet(1, b"B")
        # very old seq — should be silently ignored
        result = recv.receive_packet(0, b"old")
        assert result == []


# ── sequence number wraparound ────────────────────────────────────────────────

class TestWraparound:
    MAX = ReliabilityManager.SEQ_MOD  # 2^32

    def test_seq_mod_constant(self):
        assert ReliabilityManager.SEQ_MOD == (1 << 32)

    def test_mark_sent_wraps(self):
        mgr = ReliabilityManager(window_size=4)
        high = self.MAX - 1
        mgr.mark_sent(high, b"last")
        assert mgr.next_seq_num == 0, "should wrap to 0 after 2^32-1"

    def test_can_send_wraparound_safe(self):
        """Window calculation must not go negative when next_seq < send_base."""
        mgr = ReliabilityManager(window_size=4)
        mgr.send_base    = self.MAX - 2
        mgr.next_seq_num = 1  # wrapped past 0
        # in_flight = (1 - (MAX-2)) % MAX = 3  → within window of 4
        assert mgr.can_send()

    def test_handle_ack_advances_base_across_wrap(self):
        mgr = ReliabilityManager(window_size=4)
        high = self.MAX - 1
        mgr.mark_sent(high, b"x")
        mgr.mark_sent(0,    b"y")   # wrapped
        mgr.handle_ack(high)
        mgr.handle_ack(0)
        assert mgr.send_base == 1

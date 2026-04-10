"""
Unit tests for the binary protocol packet (pack / unpack).
Verifies header size, field round-trips, and flag combinations.
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from shared.protocol import ProtocolPacket


class TestHeaderSize:
    def test_header_is_13_bytes(self):
        assert ProtocolPacket.HEADER_SIZE == 13

    def test_empty_payload_packet_is_13_bytes(self):
        pkt = ProtocolPacket.pack(
            session_id=1, stream_id=2, seq_num=3,
            flags=ProtocolPacket.FLAG_DATA, payload=b"",
        )
        assert len(pkt) == 13


class TestPackUnpack:
    def _roundtrip(self, **kwargs):
        raw = ProtocolPacket.pack(**kwargs)
        return ProtocolPacket.unpack(raw)

    def test_session_id_roundtrip(self):
        p = self._roundtrip(session_id=0xDEADBEEF, stream_id=0, seq_num=0,
                            flags=0, payload=b"")
        assert p["session_id"] == 0xDEADBEEF

    def test_stream_id_roundtrip(self):
        p = self._roundtrip(session_id=1, stream_id=0xABCD, seq_num=0,
                            flags=0, payload=b"")
        assert p["stream_id"] == 0xABCD

    def test_seq_num_roundtrip(self):
        p = self._roundtrip(session_id=1, stream_id=1, seq_num=0xFFFFFFFF,
                            flags=0, payload=b"")
        assert p["seq_num"] == 0xFFFFFFFF

    def test_flags_roundtrip(self):
        flags = ProtocolPacket.FLAG_SYN | ProtocolPacket.FLAG_ACK
        p = self._roundtrip(session_id=1, stream_id=1, seq_num=0,
                            flags=flags, payload=b"")
        assert p["flags"] == flags

    def test_payload_roundtrip(self):
        payload = b"hello world"
        p = self._roundtrip(session_id=1, stream_id=1, seq_num=0,
                            flags=ProtocolPacket.FLAG_DATA, payload=payload)
        assert p["payload"] == payload

    def test_total_length_with_payload(self):
        payload = b"x" * 100
        raw = ProtocolPacket.pack(session_id=1, stream_id=1, seq_num=0,
                                  flags=ProtocolPacket.FLAG_DATA, payload=payload)
        assert len(raw) == 13 + 100


class TestFlags:
    def test_syn_flag_value(self):
        assert ProtocolPacket.FLAG_SYN == 0x01

    def test_ack_flag_value(self):
        assert ProtocolPacket.FLAG_ACK == 0x02

    def test_data_flag_value(self):
        assert ProtocolPacket.FLAG_DATA == 0x04

    def test_fin_flag_value(self):
        assert ProtocolPacket.FLAG_FIN == 0x08

    def test_syn_ack_is_combination(self):
        assert ProtocolPacket.FLAG_SYN_ACK == (ProtocolPacket.FLAG_SYN | ProtocolPacket.FLAG_ACK)

    def test_flags_are_independent_bits(self):
        for f in [ProtocolPacket.FLAG_SYN, ProtocolPacket.FLAG_ACK,
                  ProtocolPacket.FLAG_DATA, ProtocolPacket.FLAG_FIN]:
            assert bin(f).count("1") == 1, f"flag {f:#x} must be a single bit"

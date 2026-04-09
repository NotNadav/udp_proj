

import struct


class ProtocolPacket:
    # header
    HEADER_FORMAT = "! I H I B H"
    HEADER_SIZE   = struct.calcsize(HEADER_FORMAT)   # exactly 13

    # flag constants
    FLAG_SYN  = 0x01    # 00000001 — open stream / initiate handshake
    FLAG_ACK  = 0x02    # 00000010 — acknowledgement
    FLAG_DATA = 0x04    # 00000100 — regular data payload
    FLAG_FIN  = 0x08    # 00001000 — close stream

    # Combined convenience flags
    FLAG_SYN_ACK = FLAG_SYN | FLAG_ACK   # 0x03 — handshake response

    # pack into binary
    @classmethod
    def pack(cls, session_id: int, stream_id: int, seq_num: int,
             flags: int, payload: bytes = b"") -> bytes:
        # returns binary frame
        payload_length = len(payload)
        header = struct.pack(
            cls.HEADER_FORMAT,
            session_id, stream_id, seq_num, flags, payload_length,
        )
        return header + payload

    # unpack binary
    @classmethod
    def unpack(cls, raw_data: bytes) -> dict:
        # returns dictionary format
        if len(raw_data) < cls.HEADER_SIZE:
            raise ValueError("packet too small to contain a valid 13-byte header.")

        header_bytes  = raw_data[:cls.HEADER_SIZE]
        payload_bytes = raw_data[cls.HEADER_SIZE:]

        session_id, stream_id, seq_num, flags, payload_length = struct.unpack(
            cls.HEADER_FORMAT, header_bytes,
        )

        return {
            "session_id":     session_id,
            "stream_id":      stream_id,
            "seq_num":        seq_num,
            "flags":          flags,
            "payload_length": payload_length,
            "payload":        payload_bytes[:payload_length],
        }


# testing
if __name__ == "__main__":
    assert ProtocolPacket.HEADER_SIZE == 13, f"header must be 13 bytes, got {ProtocolPacket.HEADER_SIZE}"

    data = b"Hello, custom protocol!"
    frame = ProtocolPacket.pack(
        session_id=12345, stream_id=1, seq_num=100,
        flags=ProtocolPacket.FLAG_DATA, payload=data,
    )
    print(f"Packed frame: {len(frame)} bytes (header 13 + payload {len(data)})")

    pkt = ProtocolPacket.unpack(frame)
    assert pkt["session_id"] == 12345
    assert pkt["stream_id"] == 1
    assert pkt["seq_num"] == 100
    assert pkt["flags"] == ProtocolPacket.FLAG_DATA
    assert pkt["payload"] == data
    print(f"Unpack OK: {pkt}")
    print("ProtocolPacket tests passed.")
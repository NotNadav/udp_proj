"""
Unit tests for the CryptoManager (ECDHE + HKDF-SHA256 + AES-256-GCM).
Verifies key exchange, encryption round-trip, and tamper detection.
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from shared.crypto_manager import CryptoManager


class TestKeyExchange:
    def test_public_key_bytes_not_empty(self):
        cm = CryptoManager()
        pub = cm.get_public_key_bytes()
        assert isinstance(pub, bytes) and len(pub) > 0

    def test_shared_key_derived_after_exchange(self):
        client  = CryptoManager()
        gateway = CryptoManager()
        gateway.derive_shared_key(client.get_public_key_bytes())
        client.derive_shared_key(gateway.get_public_key_bytes())
        assert client.shared_key == gateway.shared_key

    def test_shared_key_is_32_bytes(self):
        client  = CryptoManager()
        gateway = CryptoManager()
        gateway.derive_shared_key(client.get_public_key_bytes())
        client.derive_shared_key(gateway.get_public_key_bytes())
        assert len(client.shared_key) == 32

    def test_different_sessions_produce_different_keys(self):
        def make_shared_key():
            a, b = CryptoManager(), CryptoManager()
            b.derive_shared_key(a.get_public_key_bytes())
            a.derive_shared_key(b.get_public_key_bytes())
            return a.shared_key

        assert make_shared_key() != make_shared_key()


class TestEncryptDecrypt:
    def _pair(self):
        client  = CryptoManager()
        gateway = CryptoManager()
        gateway.derive_shared_key(client.get_public_key_bytes())
        client.derive_shared_key(gateway.get_public_key_bytes())
        return client, gateway

    def test_encrypt_decrypt_roundtrip(self):
        client, gateway = self._pair()
        plaintext = b"hello secure world"
        ciphertext = client.encrypt(plaintext)
        recovered  = gateway.decrypt(ciphertext)
        assert recovered == plaintext

    def test_ciphertext_differs_from_plaintext(self):
        client, _ = self._pair()
        plaintext  = b"secret data"
        ciphertext = client.encrypt(plaintext)
        assert ciphertext != plaintext

    def test_each_encryption_produces_unique_ciphertext(self):
        client, _ = self._pair()
        plaintext = b"same message"
        ct1 = client.encrypt(plaintext)
        ct2 = client.encrypt(plaintext)
        assert ct1 != ct2, "nonce must be random — ciphertexts must differ"

    def test_tampered_ciphertext_returns_none(self):
        client, gateway = self._pair()
        ciphertext = bytearray(client.encrypt(b"important data"))
        ciphertext[-1] ^= 0xFF  # flip last byte
        assert gateway.decrypt(bytes(ciphertext)) is None

    def test_decrypt_without_key_raises(self):
        cm = CryptoManager()  # no key derived
        with pytest.raises(Exception):
            cm.decrypt(b"\x00" * 28)  # 12-byte nonce + 16-byte tag minimum

"""
crypto manager — ecdhe + aes-256-gcm
key exchange: ecdhe (p-256)
key derivation: hkdf-sha256
encryption: aes-256-gcm
"""

import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CryptoManager:
    """Per-session crypto context using Ephemeral ECDHE + AES-256-GCM."""

    def __init__(self):
        # Generate an ephemeral EC private key on the NIST P-256 curve
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.public_key = self.private_key.public_key()
        self.shared_key = None      # 32-byte derived key
        self.cipher = None          # AESGCM instance

    # serialize public key to send across network
    def get_public_key_bytes(self) -> bytes:
        """Return the ephemeral public key as DER-encoded bytes (compact)."""
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

    # get shared secret from the peers public key
    def derive_shared_key(self, peer_public_key_bytes: bytes) -> None:
        # ecdh key agreement
        peer_public_key = serialization.load_der_public_key(peer_public_key_bytes)
        shared_secret = self.private_key.exchange(ec.ECDH(), peer_public_key)

        self.shared_key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,                      # 256-bit key for AES-256
            salt=None,
            info=b"vpn-session-key",
        ).derive(shared_secret)

        self.cipher = AESGCM(self.shared_key)

    # encrypt / decrypt algorithms
    def encrypt(self, plaintext: bytes, associated_data: bytes = b"") -> bytes:
        # encrypt with aes-gcm
        if not self.cipher:
            raise ValueError("Shared key not derived yet — complete the ECDHE handshake first.")
        nonce = os.urandom(12)
        ciphertext = self.cipher.encrypt(nonce, plaintext, associated_data)
        return nonce + ciphertext

    def decrypt(self, encrypted_data: bytes, associated_data: bytes = b"") -> bytes | None:
        # decrypt aes-gcm
        if not self.cipher:
            raise ValueError("Shared key not derived yet — complete the ECDHE handshake first.")
        nonce = encrypted_data[:12]
        ciphertext = encrypted_data[12:]
        try:
            return self.cipher.decrypt(nonce, ciphertext, associated_data)
        except Exception:
            return None


# tests
if __name__ == "__main__":
    print("Testing ECDHE + AES-256-GCM …")

    alice = CryptoManager()
    bob   = CryptoManager()

    # Exchange public keys
    alice.derive_shared_key(bob.get_public_key_bytes())
    bob.derive_shared_key(alice.get_public_key_bytes())

    assert alice.shared_key == bob.shared_key, "Key mismatch!"
    print(f"Shared key derived (first 8 hex): {alice.shared_key[:8].hex()}")

    msg = b"Hello from ECDHE!"
    enc = alice.encrypt(msg)
    dec = bob.decrypt(enc)
    assert dec == msg, "Decrypt mismatch!"
    print(f"Encrypt → Decrypt OK: {dec}")

    # Tampered data must fail
    bad = enc[:5] + bytes([enc[5] ^ 0xFF]) + enc[6:]
    assert bob.decrypt(bad) is None, "Tampered data should fail!"
    print("Tamper detection OK")

    print("All CryptoManager tests passed.")
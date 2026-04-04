"""Ed25519 keypair generation and challenge signing for Agent ID."""

from __future__ import annotations

import base64
import json
from typing import Tuple, Optional

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        PublicFormat,
        PrivateFormat,
        NoEncryption,
    )
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False


def generate_keypair() -> Tuple[str, str]:
    """
    Generate an Ed25519 keypair.

    Returns:
        Tuple of (private_key_b64, public_key_b64) in base64 encoding.

    Raises:
        ImportError: If the `cryptography` package is not installed.
    """
    if not HAS_CRYPTOGRAPHY:
        raise ImportError(
            "The 'cryptography' package is required for key generation. "
            "Install it with: pip install agentid[crypto]"
        )

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_bytes = private_key.private_bytes(
        encoding=Encoding.Raw,
        format=PrivateFormat.Raw,
        encryption_algorithm=NoEncryption(),
    )
    public_bytes = public_key.public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )

    return (
        base64.b64encode(private_bytes).decode("utf-8"),
        base64.b64encode(public_bytes).decode("utf-8"),
    )


def sign_challenge(challenge: str, private_key_b64: str) -> str:
    """
    Sign a challenge string with an Ed25519 private key.

    Args:
        challenge: The challenge string from the Agent ID API.
        private_key_b64: Base64-encoded Ed25519 private key.

    Returns:
        Base64-encoded signature.

    Raises:
        ImportError: If the `cryptography` package is not installed.
    """
    if not HAS_CRYPTOGRAPHY:
        raise ImportError(
            "The 'cryptography' package is required for signing. "
            "Install it with: pip install agentid[crypto]"
        )

    private_bytes = base64.b64decode(private_key_b64)
    private_key = Ed25519PrivateKey.from_private_bytes(private_bytes)

    signature = private_key.sign(challenge.encode("utf-8"))
    return base64.b64encode(signature).decode("utf-8")


def verify_signature(message: str, signature_b64: str, public_key_b64: str) -> bool:
    """
    Verify an Ed25519 signature.

    Args:
        message: The original message that was signed.
        signature_b64: Base64-encoded signature.
        public_key_b64: Base64-encoded Ed25519 public key.

    Returns:
        True if valid, False otherwise.
    """
    if not HAS_CRYPTOGRAPHY:
        raise ImportError(
            "The 'cryptography' package is required for verification. "
            "Install it with: pip install agentid[crypto]"
        )

    try:
        from cryptography.exceptions import InvalidSignature

        public_bytes = base64.b64decode(public_key_b64)
        signature_bytes = base64.b64decode(signature_b64)

        public_key = Ed25519PublicKey.from_public_bytes(public_bytes)
        public_key.verify(signature_bytes, message.encode("utf-8"))
        return True
    except Exception:
        return False


def public_key_to_jwk(public_key_b64: str, key_id: Optional[str] = None) -> dict:
    """
    Convert a base64-encoded Ed25519 public key to JWK format.

    Args:
        public_key_b64: Base64-encoded Ed25519 public key.
        key_id: Optional key ID for the JWK.

    Returns:
        JWK dictionary.
    """
    public_bytes = base64.b64decode(public_key_b64)
    x = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode("utf-8")

    jwk: dict = {
        "kty": "OKP",
        "crv": "Ed25519",
        "x": x,
    }
    if key_id:
        jwk["kid"] = key_id

    return jwk

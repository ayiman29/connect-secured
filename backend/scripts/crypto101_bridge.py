#!/usr/bin/env python3
"""
Bridge script connecting Node.js backend with the user's custom crypto101 library.
Directly imports:
- rsa.py from crypto101
- utils.py from crypto101
- ecc.py from crypto101
"""
import sys
import os
import json
import secrets
import hashlib

# Locate crypto101 directory
# crypto101 is located at ../crypto101 relative to this script

script_dir = os.path.dirname(os.path.abspath(__file__))
crypto101_dir = os.path.abspath(os.path.join(script_dir, "..", "crypto101"))

if not os.path.exists(crypto101_dir):
    sys.stderr.write(f"Error: crypto101 directory not found at {crypto101_dir}\n")
    sys.exit(1)

if crypto101_dir not in sys.path:
    sys.path.insert(0, crypto101_dir)

try:
    import rsa
    import utils
    from ecc import EllipticCurve, encrypt as ecc_encrypt, decrypt as ecc_decrypt
except ImportError as e:
    sys.stderr.write(f"Error importing crypto101 modules: {e}\n")
    sys.exit(1)

# RSA Parameters
CHUNK_SIZE = 40  # characters per chunk to guarantee message integer < modulus n

# ECC Parameters (secp192k1 from crypto101/ecdsa.py)
ECC_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFEE37
ECC_A = 0
ECC_B = 3
ECC_G = (
    0xDB4FF10EC057E9AE26B07D0280B7F4341DA5D1B1EAE06C7D,
    0x9B2F2F6D9C5628A7844163D015BE86344082AA88D95E2F9D
)
ECC_N = 0xFFFFFFFFFFFFFFFFFFFFFFFE26F2FC170F69466A74DEFD8D

CURVE = EllipticCurve(ECC_A, ECC_B, ECC_P)

# ==================== RSA Functions ====================

def do_generate_keys(bit_length=512):
    pub, priv = rsa.generate_keypair(bit_length)
    return {
        "publicKey": {
            "e": str(pub[0]),
            "n": str(pub[1])
        },
        "privateKey": {
            "d": str(priv[0]),
            "n": str(priv[1])
        }
    }

def do_encrypt(text, public_key):
    e = int(public_key["e"])
    n = int(public_key["n"])
    pub = (e, n)

    if not text:
        return {"ciphertext": ""}

    chunks = [text[i:i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]
    ciphers = []
    for chunk in chunks:
        m = utils.text_to_int(chunk)
        c = rsa.encrypt(m, pub)
        ciphers.append(str(c))

    return {"ciphertext": ":".join(ciphers)}

def do_decrypt(ciphertext, private_key):
    d = int(private_key["d"])
    n = int(private_key["n"])
    priv = (d, n)

    if not ciphertext or not ciphertext.strip():
        return {"plaintext": ""}

    parts = [p.strip() for p in ciphertext.split(":") if p.strip()]
    recovered_chunks = []
    for p in parts:
        c = int(p)
        m = rsa.decrypt(c, priv)
        chunk = utils.int_to_text(m)
        recovered_chunks.append(chunk)

    return {"plaintext": "".join(recovered_chunks)}

# ==================== ECC Functions ====================

def do_ecc_generate_keys():
    """Generates an ECC key pair using crypto101 scalar_mult"""
    d = secrets.randbelow(ECC_N - 1) + 1
    Q = CURVE.scalar_mult(d, ECC_G)
    return {
        "privateKey": str(d),
        "publicKey": {
            "x": str(Q[0]),
            "y": str(Q[1])
        }
    }

def serialize_ecc_ciphertext(cipher_tuple):
    (c1, c2) = cipher_tuple
    return {
        "c1": [str(c1[0]), str(c1[1])],
        "c2": [str(c2[0]), str(c2[1])]
    }

def deserialize_ecc_ciphertext(data):
    return (
        (int(data["c1"][0]), int(data["c1"][1])),
        (int(data["c2"][0]), int(data["c2"][1]))
    )

def do_ecc_create_session_keys(student_pub, advisor_pub):
    """
    Generates a shared session key point M on the curve,
    encrypts M for Student using Student's ECC public key via crypto101 ecc_encrypt,
    encrypts M for Advisor using Advisor's ECC public key via crypto101 ecc_encrypt,
    and returns the derived AES-256 key hex.
    """
    k_rand = secrets.randbelow(ECC_N - 1) + 1
    M = CURVE.scalar_mult(k_rand, ECC_G)
    aes_key_hex = hashlib.sha256(str(M[0]).encode('utf-8')).hexdigest()

    pub_s = (int(student_pub["x"]), int(student_pub["y"]))
    pub_a = (int(advisor_pub["x"]), int(advisor_pub["y"]))

    c_student = ecc_encrypt(CURVE, ECC_G, pub_s, M)
    c_advisor = ecc_encrypt(CURVE, ECC_G, pub_a, M)

    return {
        "studentEncryptedKey": serialize_ecc_ciphertext(c_student),
        "advisorEncryptedKey": serialize_ecc_ciphertext(c_advisor),
        "aesKeyHex": aes_key_hex
    }

def do_ecc_decrypt_session_key(private_key_str, encrypted_key_data):
    """
    Decrypts session key point M using private key scalar via crypto101 ecc_decrypt,
    and returns the derived AES-256 key hex.
    """
    d = int(private_key_str)
    cipher_tuple = deserialize_ecc_ciphertext(encrypted_key_data)
    M = ecc_decrypt(CURVE, d, cipher_tuple)
    aes_key_hex = hashlib.sha256(str(M[0]).encode('utf-8')).hexdigest()
    return {
        "aesKeyHex": aes_key_hex
    }

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: crypto101_bridge.py <command> [args...]\n")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "generate-keys":
        bits = int(sys.argv[2]) if len(sys.argv) > 2 else 512
        res = do_generate_keys(bits)
        print(json.dumps(res))
    elif command in ("encrypt", "decrypt"):
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            sys.stderr.write("Error: Expected JSON input on stdin\n")
            sys.exit(1)
        data = json.loads(raw_input)
        if command == "encrypt":
            res = do_encrypt(data["text"], data["publicKey"])
        else:
            res = do_decrypt(data["ciphertext"], data["privateKey"])
        print(json.dumps(res))
    elif command == "ecc-generate-keys":
        res = do_ecc_generate_keys()
        print(json.dumps(res))
    elif command == "ecc-create-session-keys":
        raw_input = sys.stdin.read()
        data = json.loads(raw_input)
        res = do_ecc_create_session_keys(data["studentPublicKey"], data["advisorPublicKey"])
        print(json.dumps(res))
    elif command == "ecc-decrypt-session-key":
        raw_input = sys.stdin.read()
        data = json.loads(raw_input)
        res = do_ecc_decrypt_session_key(data["privateKey"], data["encryptedKey"])
        print(json.dumps(res))
    else:
        sys.stderr.write(f"Unknown command: {command}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

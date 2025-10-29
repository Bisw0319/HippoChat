/**
 * SecureChat Cryptography Module
 * Implements end-to-end encryption using Web Crypto API
 * Supports AES-GCM encryption for messages and ECDH for key exchange
 */

class SecureCrypto {
    constructor() {
        this.keyPair = null;
        this.sharedSecret = null;
        this.encryptionKey = null;
        this.isReady = false;
    }

    /**
     * Initialize cryptographic keys for the current session
     */
    async initialize() {
        try {
            // Generate ECDH key pair for key exchange
            this.keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "ECDH",
                    namedCurve: "P-384"
                },
                true, // extractable
                ["deriveKey"]
            );

            this.isReady = true;
            console.log('🔐 Cryptographic keys initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize crypto:', error);
            throw new Error('Failed to initialize encryption');
        }
    }

    /**
     * Export public key for sharing with other participants
     */
    async exportPublicKey() {
        if (!this.keyPair) {
            throw new Error('Crypto not initialized');
        }

        try {
            const exported = await window.crypto.subtle.exportKey(
                "raw",
                this.keyPair.publicKey
            );
            
            // Convert to base64 for easy transmission
            return btoa(String.fromCharCode(...new Uint8Array(exported)));
        } catch (error) {
            console.error('❌ Failed to export public key:', error);
            throw new Error('Failed to export public key');
        }
    }

    /**
     * Import public key from another participant and derive shared secret
     */
    async deriveSharedKey(otherPublicKeyB64) {
        if (!this.keyPair) {
            throw new Error('Crypto not initialized');
        }

        try {
            // Convert base64 back to ArrayBuffer
            const otherPublicKeyData = new Uint8Array(
                atob(otherPublicKeyB64).split('').map(char => char.charCodeAt(0))
            );

            // Import the other participant's public key
            const otherPublicKey = await window.crypto.subtle.importKey(
                "raw",
                otherPublicKeyData,
                {
                    name: "ECDH",
                    namedCurve: "P-384"
                },
                false, // not extractable
                []
            );

            // Derive shared secret
            this.sharedSecret = await window.crypto.subtle.deriveKey(
                {
                    name: "ECDH",
                    public: otherPublicKey
                },
                this.keyPair.privateKey,
                {
                    name: "AES-GCM",
                    length: 256
                },
                false, // not extractable
                ["encrypt", "decrypt"]
            );

            this.encryptionKey = this.sharedSecret;
            console.log('🔑 Shared encryption key derived');
            return true;
        } catch (error) {
            console.error('❌ Failed to derive shared key:', error);
            throw new Error('Failed to establish secure connection');
        }
    }

    /**
     * Encrypt a message using AES-GCM
     */
    async encryptMessage(plaintext) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not established');
        }

        try {
            // Generate random IV
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            
            // Convert string to ArrayBuffer
            const encoder = new TextEncoder();
            const data = encoder.encode(plaintext);

            // Encrypt the data
            const encrypted = await window.crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                this.encryptionKey,
                data
            );

            // Combine IV and encrypted data
            const result = new Uint8Array(iv.length + encrypted.byteLength);
            result.set(iv);
            result.set(new Uint8Array(encrypted), iv.length);

            // Convert to base64 for transmission
            return btoa(String.fromCharCode(...result));
        } catch (error) {
            console.error('❌ Failed to encrypt message:', error);
            throw new Error('Failed to encrypt message');
        }
    }

    /**
     * Decrypt a message using AES-GCM
     */
    async decryptMessage(encryptedB64) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not established');
        }

        try {
            // Convert from base64
            const encryptedData = new Uint8Array(
                atob(encryptedB64).split('').map(char => char.charCodeAt(0))
            );

            // Extract IV and encrypted content
            const iv = encryptedData.slice(0, 12);
            const encrypted = encryptedData.slice(12);

            // Decrypt the data
            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                this.encryptionKey,
                encrypted
            );

            // Convert back to string
            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('❌ Failed to decrypt message:', error);
            throw new Error('Failed to decrypt message');
        }
    }

    /**
     * Generate a secure room ID
     */
    static generateRoomId() {
        const bytes = window.crypto.getRandomValues(new Uint8Array(6));
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    /**
     * Generate a secure session token
     */
    static generateSessionToken() {
        const bytes = window.crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Hash a string using SHA-256 (for verification purposes)
     */
    static async hashString(input) {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hash = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash), byte => 
            byte.toString(16).padStart(2, '0')
        ).join('');
    }

    /**
     * Validate that Web Crypto API is supported
     */
    static isSupported() {
        return !!(window.crypto && window.crypto.subtle);
    }

    /**
     * Get crypto status information
     */
    getStatus() {
        return {
            isSupported: SecureCrypto.isSupported(),
            isReady: this.isReady,
            hasKeyPair: !!this.keyPair,
            hasSharedSecret: !!this.sharedSecret,
            canEncrypt: !!this.encryptionKey
        };
    }

    /**
     * Clean up sensitive data (call when leaving room)
     */
    cleanup() {
        this.keyPair = null;
        this.sharedSecret = null;
        this.encryptionKey = null;
        this.isReady = false;
        console.log('🧹 Crypto data cleaned up');
    }
}

// Export for use in other modules
window.SecureCrypto = SecureCrypto;
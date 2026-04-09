export interface Nip46Cipher {
    encrypt(plaintext: string): Promise<string>;
    decrypt(ciphertext: string): Promise<string>;
}

interface CreateNip46CipherInput {
    encrypt: (plaintext: string) => Promise<string> | string;
    decrypt: (ciphertext: string) => Promise<string> | string;
}

export function createNip46Cipher(input: CreateNip46CipherInput): Nip46Cipher {
    return {
        async encrypt(plaintext: string): Promise<string> {
            return input.encrypt(plaintext);
        },

        async decrypt(ciphertext: string): Promise<string> {
            return input.decrypt(ciphertext);
        },
    };
}

const LOCAL_KEY_STORAGE_KEY_PREFIX = 'nostr.overlay.auth.local-key.v1';
const LOCAL_KEY_LAST_PUBKEY_STORAGE_KEY = 'nostr.overlay.auth.local-key.last-pubkey.v1';
const LOCAL_KEY_DEVICE_DB = 'nostr.overlay.auth.local-key.device.v1';
const LOCAL_KEY_DEVICE_STORE = 'keys';
const AES_KEY_ALGORITHM = 'AES-GCM';
const PBKDF2_ALGORITHM = 'PBKDF2';
const PBKDF2_ITERATIONS = 60_000;
const FALLBACK_DEVICE_KEYS = new Map<string, CryptoKey>();

export type LocalKeyProtectionMode = 'device' | 'passphrase';

interface StoredLocalKeyRecord {
    version: 1;
    pubkey: string;
    mode: LocalKeyProtectionMode;
    ciphertextHex: string;
    ivHex: string;
    saltHex?: string;
    createdAt: number;
    updatedAt: number;
}

export type LoadLocalKeyResult =
    | { status: 'missing' }
    | { status: 'locked'; mode: 'passphrase' }
    | { status: 'available'; mode: LocalKeyProtectionMode; secretKey: Uint8Array };

interface DeviceKeyStore {
    get(pubkey: string): Promise<CryptoKey | undefined>;
    getOrCreate(pubkey: string): Promise<CryptoKey>;
    delete(pubkey: string): Promise<void>;
}

interface CryptoDriver {
    subtle: SubtleCrypto;
    getRandomBytes(length: number): Uint8Array;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

interface LocalKeyStorageOptions {
    storage?: StorageLike;
    crypto?: CryptoDriver;
    deviceKeyStore?: DeviceKeyStore;
    now?: () => number;
}

export interface LocalKeyStorage {
    save(input: { pubkey: string; secretKey: Uint8Array; passphrase?: string }): Promise<StoredLocalKeyRecord>;
    load(input: { pubkey: string; passphrase?: string }): Promise<LoadLocalKeyResult>;
    inspect(pubkey: string): Promise<{ mode: LocalKeyProtectionMode } | undefined>;
    inspectSavedAccount(): Promise<{ pubkey: string; mode: LocalKeyProtectionMode } | undefined>;
    clear(pubkey: string): Promise<void>;
}

function getDefaultStorage(): StorageLike | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }

    return window.localStorage;
}

function getDefaultCrypto(): CryptoDriver {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Web Crypto API is not available');
    }

    return {
        subtle: globalThis.crypto.subtle,
        getRandomBytes(length) {
            const bytes = new Uint8Array(length);
            globalThis.crypto.getRandomValues(bytes);
            return bytes;
        },
    };
}

function createIndexedDbDeviceKeyStore(): DeviceKeyStore {
    if (typeof indexedDB === 'undefined') {
        return {
            async get(pubkey: string) {
                return FALLBACK_DEVICE_KEYS.get(pubkey);
            },
            async getOrCreate(pubkey: string) {
                const existing = FALLBACK_DEVICE_KEYS.get(pubkey);
                if (existing) {
                    return existing;
                }

                const created = await getDefaultCrypto().subtle.generateKey(
                    { name: AES_KEY_ALGORITHM, length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );
                FALLBACK_DEVICE_KEYS.set(pubkey, created);
                return created;
            },
            async delete(pubkey: string) {
                FALLBACK_DEVICE_KEYS.delete(pubkey);
            },
        };
    }

    let dbPromise: Promise<IDBDatabase> | undefined;

    const openDb = (): Promise<IDBDatabase> => {
        if (dbPromise) {
            return dbPromise;
        }

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(LOCAL_KEY_DEVICE_DB, 1);
            request.onerror = () => reject(request.error ?? new Error('Could not open local key device store'));
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(LOCAL_KEY_DEVICE_STORE)) {
                    db.createObjectStore(LOCAL_KEY_DEVICE_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
        });

        return dbPromise;
    };

    const withStore = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
        const db = await openDb();

        return new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(LOCAL_KEY_DEVICE_STORE, mode);
            const store = transaction.objectStore(LOCAL_KEY_DEVICE_STORE);
            const request = callback(store);

            request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
            request.onsuccess = () => resolve(request.result);
        });
    };

    return {
        async get(pubkey: string) {
            const result = await withStore('readonly', (store) => store.get(pubkey));
            return result instanceof CryptoKey ? result : undefined;
        },
        async getOrCreate(pubkey: string) {
            const existing = await this.get(pubkey);
            if (existing) {
                return existing;
            }

            const created = await getDefaultCrypto().subtle.generateKey(
                { name: AES_KEY_ALGORITHM, length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            await withStore('readwrite', (store) => store.put(created, pubkey));
            return created;
        },
        async delete(pubkey: string) {
            await withStore('readwrite', (store) => store.delete(pubkey));
        },
    };
}

function buildStorageKey(pubkey: string): string {
    return `${LOCAL_KEY_STORAGE_KEY_PREFIX}.${pubkey}`;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function toBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const buffer = new ArrayBuffer(bytes.byteLength);
    const view = new Uint8Array(buffer);
    view.set(bytes);
    return view;
}

function hexToBytes(value: string): Uint8Array {
    if (value.length % 2 !== 0) {
        throw new Error('Hex value length must be even');
    }

    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < value.length; index += 2) {
        bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
    }
    return bytes;
}

function isStoredLocalKeyRecord(value: unknown): value is StoredLocalKeyRecord {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<StoredLocalKeyRecord>;
    return candidate.version === 1
        && typeof candidate.pubkey === 'string'
        && (candidate.mode === 'device' || candidate.mode === 'passphrase')
        && typeof candidate.ciphertextHex === 'string'
        && typeof candidate.ivHex === 'string'
        && typeof candidate.createdAt === 'number'
        && typeof candidate.updatedAt === 'number'
        && (candidate.saltHex === undefined || typeof candidate.saltHex === 'string');
}

async function derivePassphraseKey(cryptoDriver: CryptoDriver, passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await cryptoDriver.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        PBKDF2_ALGORITHM,
        false,
        ['deriveKey']
    );

    return cryptoDriver.subtle.deriveKey(
        {
            name: PBKDF2_ALGORITHM,
            salt: toBufferView(salt),
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        passwordKey,
        { name: AES_KEY_ALGORITHM, length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptSecretKey(cryptoDriver: CryptoDriver, key: CryptoKey, iv: Uint8Array, secretKey: Uint8Array): Promise<string> {
    const encrypted = await cryptoDriver.subtle.encrypt(
        { name: AES_KEY_ALGORITHM, iv: toBufferView(iv) },
        key,
        toBufferView(secretKey)
    );
    return bytesToHex(new Uint8Array(encrypted));
}

async function decryptSecretKey(cryptoDriver: CryptoDriver, key: CryptoKey, iv: Uint8Array, ciphertextHex: string): Promise<Uint8Array> {
    const decrypted = await cryptoDriver.subtle.decrypt(
        { name: AES_KEY_ALGORITHM, iv: toBufferView(iv) },
        key,
        toBufferView(hexToBytes(ciphertextHex))
    );
    return new Uint8Array(decrypted);
}

export function createLocalKeyStorage(options: LocalKeyStorageOptions = {}): LocalKeyStorage {
    const storage = options.storage ?? getDefaultStorage();
    const cryptoDriver = options.crypto ?? getDefaultCrypto();
    const deviceKeyStore = options.deviceKeyStore ?? createIndexedDbDeviceKeyStore();
    const now = options.now ?? (() => Date.now());

    const readRecord = async (pubkey: string): Promise<StoredLocalKeyRecord | undefined> => {
        if (!storage) {
            return undefined;
        }

        const raw = storage.getItem(buildStorageKey(pubkey));
        if (!raw) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!isStoredLocalKeyRecord(parsed)) {
                storage.removeItem(buildStorageKey(pubkey));
                return undefined;
            }

            return parsed;
        } catch {
            storage.removeItem(buildStorageKey(pubkey));
            return undefined;
        }
    };

    return {
        async save(input) {
            if (!(input.secretKey instanceof Uint8Array) || input.secretKey.length !== 32) {
                throw new Error('Local secret key must be 32 bytes');
            }

            if (!storage) {
                throw new Error('Storage is not available');
            }

            const trimmedPassphrase = input.passphrase?.trim();
            const mode: LocalKeyProtectionMode = trimmedPassphrase ? 'passphrase' : 'device';
            const iv = cryptoDriver.getRandomBytes(12);
            const existing = await readRecord(input.pubkey);
            const createdAt = existing?.createdAt ?? now();

            let key: CryptoKey;
            let saltHex: string | undefined;
            if (trimmedPassphrase) {
                const salt = cryptoDriver.getRandomBytes(16);
                key = await derivePassphraseKey(cryptoDriver, trimmedPassphrase, salt);
                saltHex = bytesToHex(salt);
                await deviceKeyStore.delete(input.pubkey);
            } else {
                key = await deviceKeyStore.getOrCreate(input.pubkey);
            }

            const record: StoredLocalKeyRecord = {
                version: 1,
                pubkey: input.pubkey,
                mode,
                ciphertextHex: await encryptSecretKey(cryptoDriver, key, iv, input.secretKey),
                ivHex: bytesToHex(iv),
                ...(saltHex ? { saltHex } : {}),
                createdAt,
                updatedAt: now(),
            };

            storage.setItem(buildStorageKey(input.pubkey), JSON.stringify(record));
            storage.setItem(LOCAL_KEY_LAST_PUBKEY_STORAGE_KEY, input.pubkey);
            return record;
        },
        async load(input) {
            const record = await readRecord(input.pubkey);
            if (!record) {
                return { status: 'missing' } as const;
            }

            const iv = hexToBytes(record.ivHex);
            if (record.mode === 'passphrase') {
                const trimmedPassphrase = input.passphrase?.trim();
                if (!trimmedPassphrase) {
                    return { status: 'locked', mode: 'passphrase' } as const;
                }

                if (!record.saltHex) {
                    return { status: 'missing' } as const;
                }

                const salt = hexToBytes(record.saltHex);
                const key = await derivePassphraseKey(cryptoDriver, trimmedPassphrase, salt);
                const secretKey = await decryptSecretKey(cryptoDriver, key, iv, record.ciphertextHex);
                return { status: 'available', mode: 'passphrase', secretKey } as const;
            }

            const key = await deviceKeyStore.get(input.pubkey);
            if (!key) {
                return { status: 'missing' } as const;
            }

            const secretKey = await decryptSecretKey(cryptoDriver, key, iv, record.ciphertextHex);
            return { status: 'available', mode: 'device', secretKey } as const;
        },
        async inspect(pubkey) {
            const record = await readRecord(pubkey);
            return record ? { mode: record.mode } : undefined;
        },
        async inspectSavedAccount() {
            if (!storage) {
                return undefined;
            }

            const pubkey = storage.getItem(LOCAL_KEY_LAST_PUBKEY_STORAGE_KEY);
            if (!pubkey) {
                return undefined;
            }

            const record = await readRecord(pubkey);
            if (!record) {
                storage.removeItem(LOCAL_KEY_LAST_PUBKEY_STORAGE_KEY);
                return undefined;
            }

            return {
                pubkey,
                mode: record.mode,
            };
        },
        async clear(pubkey) {
            storage?.removeItem(buildStorageKey(pubkey));
            if (storage?.getItem(LOCAL_KEY_LAST_PUBKEY_STORAGE_KEY) === pubkey) {
                storage.removeItem(LOCAL_KEY_LAST_PUBKEY_STORAGE_KEY);
            }
            await deviceKeyStore.delete(pubkey);
        },
    };
}

export interface WalletCapabilities {
    payInvoice: boolean;
    makeInvoice: boolean;
    notifications: boolean;
}

export type WalletProvider = 'nwc' | 'webln';

export interface WalletActivityItem {
    id: string;
    status: 'pending' | 'succeeded' | 'failed';
    actionType: 'zap-payment' | 'manual-receive';
    amountMsats: number;
    createdAt: number;
    targetType: 'profile' | 'event' | 'invoice' | 'none';
    targetId?: string;
    errorMessage?: string;
    provider: WalletProvider;
    invoice?: string;
    expiresAt?: number;
}

export interface NwcWalletConnection {
    method: 'nwc';
    uri: string;
    walletServicePubkey: string;
    relays: string[];
    secret: string;
    encryption: 'nip44_v2' | 'nip04';
    capabilities: WalletCapabilities;
    restoreState: 'connected' | 'reconnect-required';
}

export interface WebLnWalletConnection {
    method: 'webln';
    capabilities: WalletCapabilities;
    restoreState: 'connected' | 'reconnect-required';
}

export type WalletConnection = NwcWalletConnection | WebLnWalletConnection;

export interface WalletSettingsState {
    activeConnection: WalletConnection | null;
}

export interface WalletActivityState {
    items: WalletActivityItem[];
}

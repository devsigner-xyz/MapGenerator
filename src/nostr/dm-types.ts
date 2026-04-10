export interface DmRelayFailure {
    relay: string;
    reason: string;
}

export interface PublishResult {
    ackedRelays: string[];
    failedRelays: DmRelayFailure[];
    timeoutRelays: string[];
}

export interface DmTransportSubscription {
    unsubscribe: () => void;
}

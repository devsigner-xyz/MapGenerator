import { useState } from 'react';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { AuthSessionState, LoginMethod } from '../../nostr/auth/session';
import { CreateAccountMethodSelector, type CreateAccountMethod } from './CreateAccountMethodSelector';
import { CreateAccountDialog, type CreateLocalAccountInput } from './CreateAccountDialog';
import { LoginMethodSelector } from './LoginMethodSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import loginCover from '../assets/cover.png';

interface LoginGateScreenProps {
    authSession?: AuthSessionState | undefined;
    savedLocalAccount?: { pubkey: string; mode: 'device' | 'passphrase' } | undefined;
    disabled?: boolean;
    mapLoaderText?: string | null;
    restoringSession?: boolean;
    showLogout?: boolean;
    onLogout?: () => Promise<void> | void;
    onStartSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
}

export function LoginGateScreen({
    authSession,
    savedLocalAccount,
    disabled = false,
    mapLoaderText,
    restoringSession = false,
    showLogout = false,
    onLogout,
    onStartSession,
}: LoginGateScreenProps) {
    const [panel, setPanel] = useState<'login' | 'create-account-selector' | 'create-account-flow'>('login');
    const [selectedCreateAccountMethod, setSelectedCreateAccountMethod] = useState<CreateAccountMethod | undefined>(undefined);
    const [unlockPassphrase, setUnlockPassphrase] = useState('');

    const handleCreateAccountMethod = (method: CreateAccountMethod) => {
        setSelectedCreateAccountMethod(method);
        setPanel('create-account-flow');
    };

    const isBusy = disabled;
    const showUnlockLocalAccount = Boolean(authSession && authSession.method === 'local' && authSession.locked);
    const lockedLocalPubkey = authSession?.method === 'local' && authSession.locked ? authSession.pubkey : undefined;
    const [savedLocalPassphrase, setSavedLocalPassphrase] = useState('');

    return (
        <div className="nostr-login-screen nostr-login-screen-dialog" data-testid="login-gate-screen" role="main" aria-label="Pantalla de login">
            <div className="nostr-login-screen-center">
                <Card className="nostr-login-screen-card">
                    <CardContent className="flex flex-col gap-6 nostr-login-screen-content">
                        <div className="nostr-login-cover-wrap">
                            <img src={loginCover} alt="Nostr City cover" className="nostr-login-cover" />
                        </div>

                        {mapLoaderText ? (
                            <div className="nostr-login-loader" role="status" aria-live="polite">
                                <Spinner />
                                <p className="nostr-login-loader-text">{mapLoaderText}</p>
                            </div>
                        ) : null}

                        {restoringSession ? (
                            <div className="nostr-login-loader" role="status" aria-live="polite">
                                <Spinner />
                                <p className="nostr-login-loader-text">Restaurando sesion...</p>
                            </div>
                        ) : showUnlockLocalAccount ? (
                            <form
                                data-testid="unlock-local-account-form"
                                className="flex flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!lockedLocalPubkey) {
                                        return;
                                    }

                                    void onStartSession('local', {
                                        pubkey: lockedLocalPubkey,
                                        passphrase: unlockPassphrase.trim(),
                                    });
                                }}
                            >
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="unlock-passphrase">Passphrase de la cuenta local</Label>
                                    <Input
                                        id="unlock-passphrase"
                                        name="unlock-passphrase"
                                        type="password"
                                        value={unlockPassphrase}
                                        disabled={isBusy}
                                        onChange={(event) => setUnlockPassphrase(event.target.value)}
                                    />
                                </div>
                                <Button type="submit" disabled={isBusy || unlockPassphrase.trim().length === 0}>
                                    Desbloquear cuenta
                                </Button>
                            </form>
                        ) : panel === 'create-account-selector' ? (
                            <>
                                <CreateAccountMethodSelector disabled={disabled} onSelectMethod={handleCreateAccountMethod} />
                                <Button type="button" variant="outline" disabled={disabled} onClick={() => setPanel('login')}>
                                    Volver al login
                                </Button>
                            </>
                        ) : panel === 'create-account-flow' && selectedCreateAccountMethod ? (
                            <CreateAccountDialog
                                disabled={disabled}
                                initialMethod={selectedCreateAccountMethod}
                                hasNip07={Boolean((window as unknown as { nostr?: unknown }).nostr)}
                                onBack={() => {
                                    setPanel('create-account-selector');
                                }}
                                onStartSession={async (method, input) => {
                                    await onStartSession(method, input);
                                }}
                                onCreateLocalAccount={async (input: CreateLocalAccountInput) => {
                                    await onStartSession('local', {
                                        secretKey: input.secretKey,
                                        ...(input.passphrase ? { passphrase: input.passphrase } : {}),
                                        ...(input.profile ? { profile: input.profile } : {}),
                                        relaySettings: input.relaySettings,
                                    } as ProviderResolveInput);
                                }}
                            />
                        ) : (
                            <>
                                <LoginMethodSelector
                                    disabled={disabled}
                                    onStartSession={async (method, input) => {
                                        await onStartSession(method, input);
                                    }}
                                />
                                {savedLocalAccount?.mode === 'device' ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={disabled}
                                        onClick={() => {
                                            void onStartSession('local', { pubkey: savedLocalAccount.pubkey });
                                        }}
                                    >
                                        Continuar con cuenta local guardada
                                    </Button>
                                ) : null}
                                {savedLocalAccount?.mode === 'passphrase' ? (
                                    <form
                                        className="flex flex-col gap-3"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            void onStartSession('local', {
                                                pubkey: savedLocalAccount.pubkey,
                                                passphrase: savedLocalPassphrase.trim(),
                                            });
                                        }}
                                    >
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="saved-local-passphrase">Desbloquear cuenta local guardada</Label>
                                            <Input
                                                id="saved-local-passphrase"
                                                name="saved-local-passphrase"
                                                type="password"
                                                value={savedLocalPassphrase}
                                                disabled={disabled}
                                                onChange={(event) => setSavedLocalPassphrase(event.target.value)}
                                            />
                                        </div>
                                        <Button type="submit" variant="outline" disabled={disabled || savedLocalPassphrase.trim().length === 0}>
                                            Desbloquear cuenta guardada
                                        </Button>
                                    </form>
                                ) : null}
                                <Button type="button" variant="outline" disabled={disabled} onClick={() => setPanel('create-account-selector')}>
                                    Crear cuenta
                                </Button>
                            </>
                        )}

                        {showLogout ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    void onLogout?.();
                                }}
                            >
                                Cerrar sesion
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

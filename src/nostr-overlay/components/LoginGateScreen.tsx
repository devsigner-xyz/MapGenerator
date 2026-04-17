import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { LoginMethod } from '../../nostr/auth/session';
import { LoginMethodSelector } from './LoginMethodSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import loginCover from '../assets/cover.png';

interface LoginGateScreenProps {
    disabled?: boolean;
    mapLoaderText?: string | null;
    restoringSession?: boolean;
    showLogout?: boolean;
    onLogout?: () => Promise<void> | void;
    onStartSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
}

export function LoginGateScreen({
    disabled = false,
    mapLoaderText,
    restoringSession = false,
    showLogout = false,
    onLogout,
    onStartSession,
}: LoginGateScreenProps) {
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
                        ) : (
                            <LoginMethodSelector
                                disabled={disabled}
                                onStartSession={async (method, input) => {
                                    await onStartSession(method, input);
                                }}
                            />
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

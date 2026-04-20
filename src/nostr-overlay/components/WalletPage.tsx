import type { WalletActivityState, WalletSettingsState } from '../../nostr/wallet-types';
import { OverlayPageHeader } from './OverlayPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

interface WalletPageProps {
    walletState: WalletSettingsState;
    walletActivity: WalletActivityState;
    nwcUriInput: string;
    onNwcUriInputChange: (value: string) => void;
    onConnectNwc: () => void;
    onConnectWebLn: () => void;
    onDisconnect: () => void;
    onRefresh: () => void;
}

function formatActivityAmount(amountMsats: number): string {
    return `${Math.round(amountMsats / 1000)} sats`;
}

export function WalletPage({
    walletState,
    walletActivity,
    nwcUriInput,
    onNwcUriInputChange,
    onConnectNwc,
    onConnectWebLn,
    onDisconnect,
    onRefresh,
}: WalletPageProps) {
    const connection = walletState.activeConnection;
    const hasRememberedConnection = connection !== null;
    const isConnected = connection !== null && connection.restoreState === 'connected';
    const statusLabel = connection?.method === 'nwc'
        ? (connection.restoreState === 'connected' ? 'Conectada por NWC' : 'Reconecta NWC')
        : connection?.method === 'webln'
            ? (connection.restoreState === 'connected' ? 'Conectada por WebLN' : 'Reconecta WebLN')
            : 'Sin wallet conectada';
    const reconnectAction = connection?.method === 'webln' ? onConnectWebLn : undefined;

    return (
        <section className="nostr-routed-surface" aria-label="Wallet" data-testid="wallet-page">
            <div className="nostr-routed-surface-content">
                <div className="nostr-routed-surface-panel nostr-page-layout gap-3">
                    <OverlayPageHeader
                        title="Wallet"
                        description="Gestiona la wallet activa usada para pagos y zaps."
                        indicator={<Badge variant={isConnected ? 'secondary' : 'outline'}>{statusLabel}</Badge>}
                    />

                    <div className="grid gap-3">
                        <Card>
                            <CardHeader>
                                <CardTitle>Wallet activa</CardTitle>
                                <CardDescription>{statusLabel}</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-3">
                                {connection?.method === 'nwc' ? (
                                    <div className="grid gap-1 text-sm text-muted-foreground">
                                        <span>{connection.relays[0] || ''}</span>
                                    </div>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                    {isConnected ? (
                                        <>
                                            <Button type="button" variant="outline" onClick={onRefresh}>Refrescar</Button>
                                            <Button type="button" variant="outline" onClick={onDisconnect}>Desconectar</Button>
                                            <Button type="button" onClick={connection?.method === 'nwc' ? onConnectWebLn : onConnectNwc}>Cambiar</Button>
                                        </>
                                    ) : hasRememberedConnection ? (
                                        <>
                                            {reconnectAction ? <Button type="button" onClick={reconnectAction}>Reconectar</Button> : null}
                                            <Button type="button" variant="outline" onClick={onDisconnect}>Desconectar</Button>
                                        </>
                                    ) : (
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyTitle>Sin wallet conectada</EmptyTitle>
                                                <EmptyDescription>Conecta una wallet para habilitar pagos y zaps.</EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Conectar wallet</CardTitle>
                                <CardDescription>Elige el metodo que quieras usar en este dispositivo.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2">
                                <Input
                                    type="text"
                                    aria-label="URI NWC"
                                    placeholder="nostr+walletconnect://..."
                                    value={nwcUriInput}
                                    onChange={(event) => onNwcUriInputChange(event.target.value)}
                                />
                                <p className="w-full text-sm text-muted-foreground">
                                    Guardar esta conexion en este dispositivo almacena datos sensibles de wallet.
                                </p>
                                <Button type="button" onClick={onConnectNwc}>Conectar con NWC</Button>
                                <Button type="button" variant="outline" onClick={onConnectWebLn}>Conectar con WebLN</Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Actividad reciente</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {walletActivity.items.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">Sin actividad reciente</span>
                                ) : (
                                    <ul className="grid gap-2">
                                        {walletActivity.items.map((item) => (
                                            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                                                <span>{formatActivityAmount(item.amountMsats)}</span>
                                                <Badge variant={item.status === 'failed' ? 'destructive' : 'secondary'}>{item.status}</Badge>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </section>
    );
}

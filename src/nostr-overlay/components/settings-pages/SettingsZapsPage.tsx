import type { ZapSettingsState } from '../../../nostr/zap-settings';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SettingsZapsPageProps {
    zapSettings: ZapSettingsState;
    newZapAmountInput: string;
    onNewZapAmountInputChange: (value: string) => void;
    onUpdateZapAmount: (index: number, value: number) => void;
    onRemoveZapAmount: (index: number) => void;
    onAddZapAmount: () => void;
}

export function SettingsZapsPage({
    zapSettings,
    newZapAmountInput,
    onNewZapAmountInputChange,
    onUpdateZapAmount,
    onRemoveZapAmount,
    onAddZapAmount,
}: SettingsZapsPageProps) {
    return (
        <>
            <header className="nostr-page-header">
                <h3 className="nostr-page-header-inline-title">Zaps</h3>
                <p>Define cantidades rapidas para enviar zaps.</p>
            </header>
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-shortcuts-content">
                    <p>Cantidad de zaps</p>

                    <div className="nostr-zap-list">
                        {zapSettings.amounts.map((amount, index) => (
                            <div key={`zap-${index}-${amount}`} className="nostr-zap-item">
                                <span>{amount} sats</span>
                                <div className="nostr-zap-item-actions">
                                    <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className="nostr-input"
                                        aria-label={`Cantidad zap ${index + 1}`}
                                        value={String(amount)}
                                        onChange={(event) => {
                                            const nextValue = Number(event.target.value);
                                            if (!Number.isFinite(nextValue)) {
                                                return;
                                            }
                                            onUpdateZapAmount(index, nextValue);
                                        }}
                                    />

                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => onRemoveZapAmount(index)}
                                    >
                                        Quitar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="nostr-zap-add-row">
                        <Input
                            type="number"
                            min={1}
                            step={1}
                            className="nostr-input"
                            aria-label="Nueva cantidad de zap"
                            placeholder="512"
                            value={newZapAmountInput}
                            onChange={(event) => onNewZapAmountInputChange(event.target.value)}
                        />
                        <Button
                            type="button"
                            className="nostr-submit"
                            onClick={onAddZapAmount}
                        >
                            Agregar cantidad
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}

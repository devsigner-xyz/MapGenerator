import type { ZapSettingsState } from '../../../nostr/zap-settings';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OverlayPageHeader } from '../OverlayPageHeader';

interface SettingsZapsPageProps {
    zapSettings: ZapSettingsState;
    newZapAmountInput: string;
    defaultZapAmountInput: string;
    onNewZapAmountInputChange: (value: string) => void;
    onDefaultZapAmountInputChange: (value: string) => void;
    onUpdateZapAmount: (index: number, value: number) => void;
    onRemoveZapAmount: (index: number) => void;
    onAddZapAmount: () => void;
}

export function SettingsZapsPage({
    zapSettings,
    newZapAmountInput,
    defaultZapAmountInput,
    onNewZapAmountInputChange,
    onDefaultZapAmountInputChange,
    onUpdateZapAmount,
    onRemoveZapAmount,
    onAddZapAmount,
}: SettingsZapsPageProps) {
    return (
        <>
            <OverlayPageHeader
                title="Zaps"
                description="Define cantidades rapidas para enviar zaps."
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <p>Cantidad de zaps</p>

                    <div className="flex items-center gap-2" data-testid="settings-zap-default-row">
                        <Input
                            type="number"
                            min={1}
                            step={1}
                            className="min-w-0 flex-1"
                            aria-label="Cantidad por defecto de zap"
                            value={defaultZapAmountInput}
                            onChange={(event) => onDefaultZapAmountInputChange(event.target.value)}
                        />
                    </div>

                    <div className="nostr-zap-list">
                        {zapSettings.amounts.map((amount, index) => (
                            <div key={`zap-${index}-${amount}`} className="nostr-zap-item">
                                <span>{amount} sats</span>
                                <div className="nostr-zap-item-actions">
                                    <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className="min-w-0 flex-1"
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

                    <div className="flex items-center gap-2" data-testid="settings-zap-add-row">
                        <Input
                            type="number"
                            min={1}
                            step={1}
                            className="min-w-0 flex-1"
                            aria-label="Nueva cantidad de zap"
                            placeholder="512"
                            value={newZapAmountInput}
                            onChange={(event) => onNewZapAmountInputChange(event.target.value)}
                        />
                        <Button
                            type="button"
                            className="whitespace-nowrap"
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

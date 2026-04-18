import { useState } from 'react';
import { addZapAmount, removeZapAmount, updateZapAmount } from '../../../nostr/zap-settings';
import { SettingsZapsPage } from '../settings-pages/SettingsZapsPage';
import { useSettingsRouteContext } from './settings-route-context';
import { useZapSettingsController } from './controllers/useZapSettingsController';

export function SettingsZapsRoute() {
    const { ownerPubkey, zapSettings, onZapSettingsChange } = useSettingsRouteContext();
    const { zapSettingsState, persistZapSettings } = useZapSettingsController({
        ...(ownerPubkey ? { ownerPubkey } : {}),
        ...(zapSettings ? { zapSettings } : {}),
        ...(onZapSettingsChange ? { onZapSettingsChange } : {}),
    });
    const [newZapAmountInput, setNewZapAmountInput] = useState('');

    return (
        <SettingsZapsPage
            zapSettings={zapSettingsState}
            newZapAmountInput={newZapAmountInput}
            onNewZapAmountInputChange={setNewZapAmountInput}
            onUpdateZapAmount={(index, value) => {
                persistZapSettings(updateZapAmount(zapSettingsState, index, value));
            }}
            onRemoveZapAmount={(index) => {
                persistZapSettings(removeZapAmount(zapSettingsState, index));
            }}
            onAddZapAmount={() => {
                const nextValue = Number(newZapAmountInput.trim());
                if (!Number.isFinite(nextValue)) {
                    return;
                }

                persistZapSettings(addZapAmount(zapSettingsState, nextValue));
                setNewZapAmountInput('');
            }}
        />
    );
}

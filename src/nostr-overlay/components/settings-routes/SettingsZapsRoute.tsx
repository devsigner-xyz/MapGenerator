import { useState } from 'react';
import { addZapAmount, removeZapAmount, updateDefaultZapAmount, updateZapAmount } from '../../../nostr/zap-settings';
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
    const [defaultZapAmountInput, setDefaultZapAmountInput] = useState(String(zapSettingsState.defaultAmount));

    return (
        <SettingsZapsPage
            zapSettings={zapSettingsState}
            newZapAmountInput={newZapAmountInput}
            defaultZapAmountInput={defaultZapAmountInput}
            onNewZapAmountInputChange={setNewZapAmountInput}
            onDefaultZapAmountInputChange={(value) => {
                setDefaultZapAmountInput(value);
                const nextValue = Number(value.trim());
                if (!Number.isFinite(nextValue)) {
                    return;
                }

                persistZapSettings(updateDefaultZapAmount(zapSettingsState, nextValue));
            }}
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

import type { EasterEggId } from '../../ts/ui/easter_eggs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EASTER_EGG_MISSIONS } from '../easter-eggs/missions';

interface EasterEggMissionsDialogProps {
    open: boolean;
    discoveredIds: EasterEggId[];
    onClose: () => void;
}

export function EasterEggMissionsDialog({ open, discoveredIds, onClose }: EasterEggMissionsDialogProps) {
    const discoveredSet = new Set(discoveredIds);
    const discoveredCount = EASTER_EGG_MISSIONS.reduce(
        (count, mission) => count + (discoveredSet.has(mission.id) ? 1 : 0),
        0
    );

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!nextOpen) {
                onClose();
            }
        }}>
            <DialogContent
                className="nostr-dialog nostr-easter-egg-missions-dialog"
                showCloseButton={false}
                aria-label="Misiones easter eggs"
            >
                <DialogTitle>Misiones</DialogTitle>
                <DialogDescription>
                    Has descubierto {discoveredCount} de {EASTER_EGG_MISSIONS.length} easter eggs.
                </DialogDescription>

                <Button
                    type="button"
                    variant="ghost"
                    className="nostr-dialog-close"
                    onClick={onClose}
                    aria-label="Cerrar misiones"
                >
                    ×
                </Button>

                <ul className="nostr-easter-egg-missions-list">
                    {EASTER_EGG_MISSIONS.map((mission) => {
                        const discovered = discoveredSet.has(mission.id);
                        return (
                            <li key={mission.id} className="nostr-easter-egg-missions-item">
                                <span className="nostr-easter-egg-missions-label">{mission.label}</span>
                                <span className={`nostr-easter-egg-missions-status${discovered ? ' is-discovered' : ''}`}>
                                    {discovered ? 'Encontrado' : 'Pendiente'}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </DialogContent>
        </Dialog>
    );
}

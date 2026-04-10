import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { EasterEggEntry } from '../easter-eggs/catalog';

interface EasterEggModalProps {
    entry: EasterEggEntry;
    buildingIndex: number;
    onClose: () => void;
}

export function EasterEggModal({ entry, buildingIndex, onClose }: EasterEggModalProps) {
    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent
                className="nostr-modal nostr-easter-egg-modal"
                showCloseButton={false}
                aria-label={`Easter egg ${entry.title}`}
            >
                <DialogTitle className="sr-only">{entry.title}</DialogTitle>
                <DialogDescription className="sr-only">
                    Documento oculto abierto desde edificio vacio {buildingIndex + 1}.
                </DialogDescription>

                <Button
                    type="button"
                    variant="ghost"
                    className="nostr-modal-close"
                    onClick={onClose}
                    aria-label="Cerrar easter egg"
                >
                    ×
                </Button>

                <div className="nostr-easter-egg-body">
                    <header className="nostr-easter-egg-header">
                        <p className="nostr-easter-egg-chip">Edificio #{buildingIndex + 1}</p>
                        <h3>{entry.title}</h3>
                    </header>

                    {entry.kind === 'pdf' ? (
                        <>
                            <div className="nostr-easter-egg-actions">
                                <a href={entry.pdfPath} download={entry.downloadFileName} className="nostr-easter-egg-action">
                                    Descargar PDF
                                </a>
                                <a href={entry.pdfPath} target="_blank" rel="noopener noreferrer" className="nostr-easter-egg-action">
                                    Abrir / Ampliar
                                </a>
                                <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="nostr-easter-egg-action">
                                    Fuente
                                </a>
                            </div>
                            <iframe
                                src={entry.pdfPath}
                                title={entry.title}
                                className="nostr-easter-egg-pdf"
                            />
                        </>
                    ) : (
                        <>
                            <div className="nostr-easter-egg-actions">
                                <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="nostr-easter-egg-action">
                                    Fuente
                                </a>
                            </div>
                            <pre className="nostr-easter-egg-text">{entry.text}</pre>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

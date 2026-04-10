import { ContextMenuItem } from '@/components/ui/context-menu';

interface PersonContextMenuItemsProps {
    onCopyNpub?: () => void | Promise<void>;
    onSendMessage?: () => void | Promise<void>;
    onViewDetails?: () => void | Promise<void>;
    onLocateOnMap?: () => void | Promise<void>;
    closeMenu?: () => void;
    testIdPrefix?: string;
}

function prefixedTestId(prefix: string | undefined, suffix: string): string | undefined {
    if (!prefix) {
        return undefined;
    }

    return `${prefix}-${suffix}`;
}

export function PersonContextMenuItems({
    onCopyNpub,
    onSendMessage,
    onViewDetails,
    onLocateOnMap,
    closeMenu,
    testIdPrefix,
}: PersonContextMenuItemsProps) {
    const run = (action?: () => void | Promise<void>) => {
        if (!action) {
            return;
        }

        void action();
        closeMenu?.();
    };

    return (
        <>
            {onLocateOnMap ? (
                <ContextMenuItem onSelect={() => run(onLocateOnMap)}>
                    Ubicar en el mapa
                </ContextMenuItem>
            ) : null}
            {onCopyNpub ? (
                <ContextMenuItem
                    data-testid={prefixedTestId(testIdPrefix, 'copy-npub')}
                    onSelect={() => run(onCopyNpub)}
                >
                    Copiar npub
                </ContextMenuItem>
            ) : null}
            {onSendMessage ? (
                <ContextMenuItem
                    data-testid={prefixedTestId(testIdPrefix, 'write-dm')}
                    onSelect={() => run(onSendMessage)}
                >
                    Enviar mensaje
                </ContextMenuItem>
            ) : null}
            {onViewDetails ? (
                <ContextMenuItem
                    data-testid={prefixedTestId(testIdPrefix, 'view-details')}
                    onSelect={() => run(onViewDetails)}
                >
                    Ver detalles
                </ContextMenuItem>
            ) : null}
        </>
    );
}

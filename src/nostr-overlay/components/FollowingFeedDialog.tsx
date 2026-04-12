import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';

interface FollowingFeedDialogProps extends FollowingFeedViewProps {
    open: boolean;
    onClose: () => void;
}

export function FollowingFeedDialog({ open, onClose, ...feedProps }: FollowingFeedDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onClose();
                }
            }}
        >
            <DialogContent className="nostr-dialog nostr-following-feed-dialog sm:max-w-none" aria-label="Agora">
                <DialogTitle className="sr-only">Agora</DialogTitle>
                <DialogDescription className="sr-only">Timeline de usuarios seguidos con hilos y acciones sociales.</DialogDescription>
                <FollowingFeedContent {...feedProps} />
            </DialogContent>
        </Dialog>
    );
}

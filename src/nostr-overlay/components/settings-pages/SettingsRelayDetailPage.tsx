import type { ReactElement } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import type { RelayType } from '../../../nostr/relay-settings';
import type { RelayConnectionStatus } from '../../hooks/useRelayConnectionSummary';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemMedia } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';
import type { RelayDetails, RelayFee, RelayInformationDocument, RelayInfoState, RelaySelection } from './types';

interface SettingsRelayDetailPageProps {
    selectedRelay: RelaySelection;
    selectedRelayDetails: RelayDetails;
    selectedRelayInfo?: RelayInfoState;
    selectedRelayDocument?: RelayInformationDocument;
    selectedRelayAdminIdentity: string | null;
    selectedRelayConnectionStatus: RelayConnectionStatus | undefined;
    relayHasNip11Metadata: boolean;
    relayEventLimit?: number;
    relayHasFees: boolean;
    copiedRelayIdentityKey: string | null;
    relayTypeLabels: Record<RelayType, string>;
    relayAvatarFallback: (details: RelayDetails, document?: RelayInformationDocument) => string;
    relayConnectionBadge: (status: RelayConnectionStatus | undefined) => ReactElement;
    formatRelayFee: (fee: RelayFee) => string;
    onCopyRelayIdentity: (value: string, key: string) => Promise<void>;
}

export function SettingsRelayDetailPage({
    selectedRelay,
    selectedRelayDetails,
    selectedRelayInfo,
    selectedRelayDocument,
    selectedRelayAdminIdentity,
    selectedRelayConnectionStatus,
    relayHasNip11Metadata,
    relayEventLimit,
    relayHasFees,
    copiedRelayIdentityKey,
    relayTypeLabels,
    relayAvatarFallback,
    relayConnectionBadge,
    formatRelayFee,
    onCopyRelayIdentity,
}: SettingsRelayDetailPageProps) {
    return (
        <>
            <header className="nostr-page-header">
                <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">Relay details</h4>
                <p className="text-sm text-muted-foreground">Metadata y capacidades tecnicas del relay seleccionado.</p>
            </header>
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-relays-content">
                    {selectedRelayInfo?.status === 'loading' ? (
                        <p className="nostr-relay-meta-loading"><Spinner /> Cargando metadata NIP-11...</p>
                    ) : null}

                    <div className="nostr-relay-detail-header">
                <Avatar className="size-10">
                    {selectedRelayDocument?.icon ? <AvatarImage src={selectedRelayDocument.icon} alt={selectedRelayDocument.name || selectedRelayDetails.host} /> : null}
                    <AvatarFallback>{relayAvatarFallback(selectedRelayDetails, selectedRelayDocument)}</AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                    <p className="nostr-relay-summary-primary">{selectedRelayDocument?.name || selectedRelayDetails.relayUrl}</p>
                    <p className="nostr-relay-summary-sub">
                        {relayTypeLabels[selectedRelay.relayType]}
                    </p>
                </div>
            </div>

                    {selectedRelayInfo?.status === 'error' ? (
                <Item variant="outline" size="sm" className="nostr-relay-meta-item">
                    <ItemMedia variant="icon">
                        <AlertTriangleIcon />
                    </ItemMedia>
                    <ItemContent>
                        <ItemDescription>No se pudo obtener metadata remota del relay.</ItemDescription>
                    </ItemContent>
                </Item>
                    ) : null}

                    {selectedRelayInfo?.status === 'ready' && !relayHasNip11Metadata ? (
                <Item variant="outline" size="sm" className="nostr-relay-meta-item">
                    <ItemMedia variant="icon">
                        <AlertTriangleIcon />
                    </ItemMedia>
                    <ItemContent>
                        <ItemDescription>Este relay no publica metadata NIP-11 util.</ItemDescription>
                    </ItemContent>
                </Item>
                    ) : null}

                    <div className="nostr-relay-detail-table-wrap">
                <Table className="nostr-relay-detail-table">
                    <TableBody>
                        <TableRow>
                            <TableHead className="nostr-relay-detail-key">URL</TableHead>
                            <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.relayUrl}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableHead className="nostr-relay-detail-key">Category</TableHead>
                            <TableCell className="nostr-relay-detail-value">{relayTypeLabels[selectedRelay.relayType]}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableHead className="nostr-relay-detail-key">Connection</TableHead>
                            <TableCell className="nostr-relay-detail-value">{relayConnectionBadge(selectedRelayConnectionStatus)}</TableCell>
                        </TableRow>
                        {selectedRelayDocument?.description ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Description</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.description}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayAdminIdentity ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Admin pubkey</TableHead>
                                <TableCell className="nostr-relay-detail-value">
                                    <div className="nostr-relay-detail-value-group">
                                        <span className="nostr-relay-detail-mono">{selectedRelayAdminIdentity}</span>
                                        <div className="nostr-relay-detail-actions-inline">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="nostr-relay-copy-button"
                                                onClick={() => {
                                                    void onCopyRelayIdentity(selectedRelayAdminIdentity, 'relay-admin-npub');
                                                }}
                                            >
                                                {copiedRelayIdentityKey === 'relay-admin-npub' ? 'Copiado npub' : 'Copiar npub'}
                                            </Button>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.self ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Relay pubkey</TableHead>
                                <TableCell className="nostr-relay-detail-value">
                                    <span className="nostr-relay-detail-mono">{selectedRelayDocument.self}</span>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.contact ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Contact</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.contact}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.software ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Software</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.version ? `${selectedRelayDocument.software} (${selectedRelayDocument.version})` : selectedRelayDocument.software}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.supported_nips && selectedRelayDocument.supported_nips.length > 0 ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Supported NIPs</TableHead>
                                <TableCell className="nostr-relay-detail-value">
                                    <div className="nostr-relay-nip-badges">
                                        {selectedRelayDocument.supported_nips.slice(0, 24).map((nip) => (
                                            <Badge key={`nip-${nip}`} variant="outline">NIP-{nip}</Badge>
                                        ))}
                                        {selectedRelayDocument.supported_nips.length > 24 ? (
                                            <Badge variant="secondary">+{selectedRelayDocument.supported_nips.length - 24}</Badge>
                                        ) : null}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {typeof selectedRelayDocument?.limitation?.auth_required === 'boolean' ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Auth required</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.limitation.auth_required ? 'Required' : 'Not required'}</TableCell>
                            </TableRow>
                        ) : null}
                        {typeof selectedRelayDocument?.limitation?.payment_required === 'boolean' ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Payment required</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.limitation.payment_required ? 'Required' : 'Not required'}</TableCell>
                            </TableRow>
                        ) : null}
                        {typeof selectedRelayDocument?.limitation?.restricted_writes === 'boolean' ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Write policy</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.limitation.restricted_writes ? 'Restricted' : 'Open'}</TableCell>
                            </TableRow>
                        ) : null}
                        {typeof relayEventLimit === 'number' ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Event limit</TableHead>
                                <TableCell className="nostr-relay-detail-value">{relayEventLimit}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.payments_url ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Payments URL</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.payments_url}</TableCell>
                            </TableRow>
                        ) : null}
                        {relayHasFees && selectedRelayDocument?.fees ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Fees</TableHead>
                                <TableCell className="nostr-relay-detail-value">
                                    <div className="nostr-relay-detail-inline-list">
                                        {selectedRelayDocument.fees.admission?.map((fee, index) => (
                                            <span key={`admission-${index}`}>Admission: {formatRelayFee(fee)}</span>
                                        ))}
                                        {selectedRelayDocument.fees.subscription?.map((fee, index) => (
                                            <span key={`subscription-${index}`}>Subscription: {formatRelayFee(fee)}</span>
                                        ))}
                                        {selectedRelayDocument.fees.publication?.map((fee, index) => (
                                            <span key={`publication-${index}`}>Publication: {formatRelayFee(fee)}</span>
                                        ))}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.terms_of_service ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Terms of Service</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.terms_of_service}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.privacy_policy ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">Privacy Policy</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.privacy_policy}</TableCell>
                            </TableRow>
                        ) : null}
                    </TableBody>
                </Table>
                    </div>
                </div>
            </div>
        </>
    );
}

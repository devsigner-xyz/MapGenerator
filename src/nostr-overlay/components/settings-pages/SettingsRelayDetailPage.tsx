import type { ReactElement } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { RELAY_TYPES, type RelayType } from '../../../nostr/relay-settings';
import type { RelayConnectionStatus } from '../../hooks/useRelayConnectionSummary';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/i18n/useI18n';
import { Item, ItemContent, ItemDescription, ItemMedia } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { OverlayPageHeader } from '../OverlayPageHeader';
import type { RelayDetails, RelayFee, RelayInformationDocument, RelayInfoState, RelaySelection } from './types';

interface SettingsRelayDetailPageProps {
    selectedRelay: RelaySelection;
    activeRelayTypes: RelayType[];
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
    activeRelayTypes,
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
    const { t } = useI18n();
    const orderedActiveRelayTypes = RELAY_TYPES.filter((relayType) => activeRelayTypes.includes(relayType));

    return (
        <>
            <OverlayPageHeader
                title={t('settings.relayDetail.title')}
                description={t('settings.relayDetail.description')}
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-relays-content">
                    {selectedRelayInfo?.status === 'loading' ? (
                        <p className="nostr-relay-meta-loading"><Spinner /> {t('settings.relayDetail.loadingMetadata')}</p>
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
                        <ItemDescription>{t('settings.relayDetail.fetchError')}</ItemDescription>
                    </ItemContent>
                </Item>
                    ) : null}

                    {selectedRelayInfo?.status === 'ready' && !relayHasNip11Metadata ? (
                <Item variant="outline" size="sm" className="nostr-relay-meta-item">
                    <ItemMedia variant="icon">
                        <AlertTriangleIcon />
                    </ItemMedia>
                    <ItemContent>
                        <ItemDescription>{t('settings.relayDetail.noNip11')}</ItemDescription>
                    </ItemContent>
                </Item>
                    ) : null}

                    <Card variant="elevated" size="sm" className="nostr-relay-detail-table-wrap gap-0 py-0">
                        <CardHeader className="border-b px-3 py-3">
                            <CardTitle>{t('settings.relayDetail.technicalDetails')}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-0 py-0">
                <Table className="nostr-relay-detail-table">
                    <TableBody>
                        <TableRow>
                            <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.url')}</TableHead>
                            <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.relayUrl}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableHead className="nostr-relay-detail-key">{selectedRelay.source === 'configured' ? t('settings.relayDetail.activeUses') : t('settings.relayDetail.category')}</TableHead>
                            <TableCell className="nostr-relay-detail-value">
                                {selectedRelay.source === 'configured' ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {orderedActiveRelayTypes.map((relayType) => (
                                            <Badge key={relayType} variant="secondary">{relayTypeLabels[relayType]}</Badge>
                                        ))}
                                    </div>
                                ) : relayTypeLabels[selectedRelay.relayType]}
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.connection')}</TableHead>
                            <TableCell className="nostr-relay-detail-value">{relayConnectionBadge(selectedRelayConnectionStatus)}</TableCell>
                        </TableRow>
                        {selectedRelayDocument?.description ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.descriptionLabel')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.description}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayAdminIdentity ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.adminPubkey')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">
                                    <div className="nostr-relay-detail-value-group">
                                        <span className="nostr-relay-detail-mono">{selectedRelayAdminIdentity}</span>
                                        <div className="flex flex-wrap gap-1.5" data-testid="relay-detail-admin-actions">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="nostr-relay-copy-button"
                                                onClick={() => {
                                                    void onCopyRelayIdentity(selectedRelayAdminIdentity, 'relay-admin-npub');
                                                }}
                                            >
                                                {copiedRelayIdentityKey === 'relay-admin-npub' ? t('settings.relayDetail.copiedNpub') : t('settings.relayDetail.copyNpub')}
                                            </Button>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.self ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.relayPubkey')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">
                                    <span className="nostr-relay-detail-mono">{selectedRelayDocument.self}</span>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.contact ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.contact')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.contact}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.software ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.software')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.version ? `${selectedRelayDocument.software} (${selectedRelayDocument.version})` : selectedRelayDocument.software}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.supported_nips && selectedRelayDocument.supported_nips.length > 0 ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.supportedNips')}</TableHead>
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
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.authRequired')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.limitation.auth_required ? t('settings.relayDetail.required') : t('settings.relayDetail.notRequired')}</TableCell>
                            </TableRow>
                        ) : null}
                        {typeof selectedRelayDocument?.limitation?.payment_required === 'boolean' ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.paymentRequired')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.limitation.payment_required ? t('settings.relayDetail.required') : t('settings.relayDetail.notRequired')}</TableCell>
                            </TableRow>
                        ) : null}
                        {typeof selectedRelayDocument?.limitation?.restricted_writes === 'boolean' ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.writePolicy')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.limitation.restricted_writes ? t('settings.relayDetail.restricted') : t('settings.relayDetail.open')}</TableCell>
                            </TableRow>
                        ) : null}
                        {typeof relayEventLimit === 'number' ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.eventLimit')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{relayEventLimit}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.payments_url ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.paymentsUrl')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.payments_url}</TableCell>
                            </TableRow>
                        ) : null}
                        {relayHasFees && selectedRelayDocument?.fees ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.fees')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">
                                    <div className="nostr-relay-detail-inline-list">
                                        {selectedRelayDocument.fees.admission?.map((fee, index) => (
                                            <span key={`admission-${index}`}>{t('settings.relayDetail.feeAdmission', { fee: formatRelayFee(fee) })}</span>
                                        ))}
                                        {selectedRelayDocument.fees.subscription?.map((fee, index) => (
                                            <span key={`subscription-${index}`}>{t('settings.relayDetail.feeSubscription', { fee: formatRelayFee(fee) })}</span>
                                        ))}
                                        {selectedRelayDocument.fees.publication?.map((fee, index) => (
                                            <span key={`publication-${index}`}>{t('settings.relayDetail.feePublication', { fee: formatRelayFee(fee) })}</span>
                                        ))}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.terms_of_service ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.termsOfService')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.terms_of_service}</TableCell>
                            </TableRow>
                        ) : null}
                        {selectedRelayDocument?.privacy_policy ? (
                            <TableRow>
                                <TableHead className="nostr-relay-detail-key">{t('settings.relayDetail.privacyPolicy')}</TableHead>
                                <TableCell className="nostr-relay-detail-value">{selectedRelayDocument.privacy_policy}</TableCell>
                            </TableRow>
                        ) : null}
                    </TableBody>
                </Table>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

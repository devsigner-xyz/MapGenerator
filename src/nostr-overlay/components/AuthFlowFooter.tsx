import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';

interface AuthFlowFooterProps {
    align?: 'start' | 'between';
    children: ReactNode;
}

export function AuthFlowFooter({ align = 'between', children }: AuthFlowFooterProps) {
    return (
        <div className="-mx-[1.35rem] mt-2" data-testid="auth-flow-footer">
            <Separator />
            <div className={`flex gap-2 px-[1.35rem] pt-4 ${align === 'start' ? 'justify-start' : 'justify-between'}`}>
                {children}
            </div>
        </div>
    );
}

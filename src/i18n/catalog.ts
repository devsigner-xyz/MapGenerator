import type { AppLocale } from './types';
import { enMessages } from './messages/en';
import { esMessages } from './messages/es';

export type AppMessageKey = keyof typeof esMessages;

export const messagesByLocale = {
    en: enMessages,
    es: esMessages,
} satisfies Record<AppLocale, Record<AppMessageKey, string>>;

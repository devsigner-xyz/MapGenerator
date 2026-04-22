import { messagesByLocale, type AppMessageKey } from './catalog';
import type { AppLocale, MessageParams } from './types';

function formatMessage(template: string, params?: MessageParams): string {
    if (!params) {
        return template;
    }

    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
        const value = params[key];
        return value === undefined ? '' : String(value);
    });
}

export function translate(locale: AppLocale, key: AppMessageKey, params?: MessageParams): string {
    const catalog = messagesByLocale[locale] ?? messagesByLocale.es;
    const template = catalog[key] ?? messagesByLocale.es[key] ?? key;
    return formatMessage(template, params);
}

import { Pipe, PipeTransform, signal } from '@angular/core';
import { formatDate, registerLocaleData } from '@angular/common';
import localeNl from '@angular/common/locales/nl';
import { NL } from './nl';

/**
 * Gettext-style translation at runtime: the English text is the key, and a
 * missing entry shows the English. A runtime switch (rather than Angular's
 * one-build-per-language i18n) keeps one upload for shared hosting, and lets
 * an LMS decide the player's language per launch.
 *
 * To add a language: add a dictionary here and to backend/src/Lang.
 */
export type Locale = 'en' | 'nl';

const STORAGE_KEY = 'makestuff.locale';
const DICTIONARIES: Record<Locale, Record<string, string>> = { en: {}, nl: NL };
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
];

registerLocaleData(localeNl);

function normalize(value: string | null | undefined): Locale | null {
  const code = (value ?? '').slice(0, 2).toLowerCase();
  return code === 'en' || code === 'nl' ? code : null;
}

function initial(): Locale {
  try {
    const stored = normalize(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Storage can be blocked inside an LMS iframe.
  }
  return (navigator.languages ?? []).map(normalize).find(Boolean) ?? 'en';
}

export const locale = signal<Locale>(initial());
document.documentElement.lang = locale();

/** `remember` is off for LMS launches: that choice belongs to the launch. */
export function setLocale(value: string | null | undefined, remember = true): void {
  const next = normalize(value);
  if (!next) return;
  locale.set(next);
  document.documentElement.lang = next;
  if (!remember) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice then lasts until the page closes.
  }
}

export function t(text: string, params?: Record<string, string | number>): string {
  let result = DICTIONARIES[locale()][text] ?? text;
  for (const [key, value] of Object.entries(params ?? {})) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

export function formatNumber(value: number): string {
  return value.toLocaleString(locale() === 'nl' ? 'nl-NL' : 'en-GB', { maximumFractionDigits: 1 });
}

/** Impure so that switching language updates what is on screen. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  transform(text: string, params?: Record<string, string | number>): string {
    return t(text, params);
  }
}

/** Server times are UTC without a zone marker. */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  transform(value: string | null | undefined, format = 'd MMM y'): string {
    return value ? formatDate(`${value}Z`, format, locale() === 'nl' ? 'nl' : 'en-US') : '';
  }
}

@Pipe({ name: 'num', pure: false })
export class NumPipe implements PipeTransform {
  transform(value: number): string {
    return formatNumber(value);
  }
}

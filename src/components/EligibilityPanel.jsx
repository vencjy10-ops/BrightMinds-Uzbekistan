import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import useEligibility from '@/hooks/useEligibility';
import EligibilityBadge from '@/components/EligibilityBadge';

function Reason({ kind, item }) {
  const { t, lang } = useI18n();
  const params = { ...item };
  if (item.date) {
    try { params.date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${item.date}T00:00:00Z`)); } catch { /* keep the ISO date */ }
  }
  const mark = kind === 'm' ? '+' : kind === 'c' ? '-' : '?';
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className="w-3 shrink-0 text-muted-foreground">{mark}</span>
      <span>{t(`eligibility.reason.${kind}.${item.code}`, params)}</span>
    </li>
  );
}

export default function EligibilityPanel({ item }) {
  const { t } = useI18n();
  const result = useEligibility(item);

  if (!result) {
    return (
      <div className="mt-6 rounded-xl border border-border p-4 text-sm">
        <p className="font-medium">{t('eligibility.title')}</p>
        <p className="mt-1 text-muted-foreground">{t('eligibility.signIn')}</p>
        <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`} className="mt-2 inline-block text-primary underline">{t('nav.login')}</Link>
      </div>
    );
  }
  if (!result.status) {
    return (
      <div className="mt-6 rounded-xl border border-border p-4 text-sm">
        <p className="font-medium">{t('eligibility.title')}</p>
        <p className="mt-1 text-muted-foreground">{t('eligibility.profileNeeded')}</p>
        <Link to="/dashboard" className="mt-2 inline-block text-primary underline">{t('nav.cabinet')}</Link>
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-xl border border-border p-4 text-sm" aria-live="polite">
      <p className="font-medium">{t('eligibility.title')}</p>
      <div className="mt-2"><EligibilityBadge result={result} /></div>
      <ul className="mt-3 space-y-1.5 text-muted-foreground">
        {result.conflicts.map((r, i) => <Reason key={`c${i}`} kind="c" item={r} />)}
        {result.unconfirmed.map((r, i) => <Reason key={`u${i}`} kind="u" item={r} />)}
        {result.matched.map((r, i) => <Reason key={`m${i}`} kind="m" item={r} />)}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t('eligibility.disclaimer')}</p>
    </div>
  );
}

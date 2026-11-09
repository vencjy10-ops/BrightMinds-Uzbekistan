import React from 'react';
import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const STYLES = {
  eligible: { key: 'eligibility.eligible', Icon: CheckCircle2, tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  potential: { key: 'eligibility.potential', Icon: HelpCircle, tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  not_eligible: { key: 'eligibility.not', Icon: XCircle, tone: 'bg-destructive/10 text-destructive' },
};

// The label is always text, never color alone.
export default function EligibilityBadge({ result, className }) {
  const { t } = useI18n();
  const style = result?.status ? STYLES[result.status] : null;
  if (!style) return null;
  const { Icon } = style;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', style.tone, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(style.key)}
    </span>
  );
}

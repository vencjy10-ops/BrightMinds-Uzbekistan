import React from 'react';
import { Button } from '@/components/ui/button';
import ProfileField from '@/components/dashboard/ProfileField';
import useProfileForm from '@/hooks/useProfileForm';
import { LANGUAGES, useI18n } from '@/lib/i18n';

const AGE_OPTIONS = ['under_13', '13_15', '16_17', '18_plus'];
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
const SELECT = 'h-10 w-full rounded-md border border-input bg-card px-3';

export default function ProfilePanel() {
  const { t } = useI18n();
  const { form, status, save, change } = useProfileForm();
  return <section className="mt-8 rounded-2xl border border-border bg-card p-6">
    <h2 className="font-display text-xl">{t('profile.title')}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{t('profile.optionalNote')}</p>
    <form onSubmit={save} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">{['first_name', 'last_name', 'country', 'region', 'city'].map((name) => <ProfileField key={name} name={name} value={form[name]} onChange={change} />)}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm" htmlFor="profile-age"><span>{t('profile.age_range')}</span>
          <select id="profile-age" className={SELECT} value={form.age_range || ''} onChange={(event) => change('age_range', event.target.value)}>
            <option value="">{t('profile.preferNot')}</option>
            {AGE_OPTIONS.map((value) => <option key={value} value={value}>{t(`profile.age.${value}`)}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-sm" htmlFor="profile-grade"><span>{t('profile.grade')}</span>
          <select id="profile-grade" className={SELECT} value={form.grade || ''} onChange={(event) => change('grade', event.target.value)}>
            <option value="">{t('profile.preferNot')}</option>
            {GRADES.map((value) => <option key={value} value={value}>{value}</option>)}
            <option value="13">{t('profile.afterSchool')}</option>
          </select>
        </label>
      </div>
      <label className="block space-y-2 text-sm" htmlFor="profile-language"><span>{t('profile.preferred_language')}</span><select id="profile-language" className={SELECT} value={form.preferred_language || 'en'} onChange={(event) => change('preferred_language', event.target.value)}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.native}</option>)}</select></label>
      <ProfileField name="educational_interests" value={form.educational_interests} onChange={change} />
      <Button disabled={status === 'saving'} type="submit">{status === 'saving' ? t('catalog.loading') : t('profile.save')}</Button>
      {status === 'saved' && <p role="status" className="text-sm text-primary">{t('profile.saved')}</p>}
      {status === 'error' && <p role="alert" className="text-sm text-destructive">{t('profile.error')}</p>}
    </form>
  </section>;
}

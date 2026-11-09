import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

export default function useProfileForm() {
  const { user, refreshUser } = useAuth();
  const { lang, setLang } = useI18n();
  const [form, setForm] = useState({});
  const [status, setStatus] = useState('idle');
  useEffect(() => {
    setForm({
      first_name: user?.first_name || user?.full_name?.split(' ')[0] || '',
      last_name: user?.last_name || '',
      city: user?.city || '',
      region: user?.region || '',
      country: user?.country || '',
      age_range: user?.age_range || '',
      grade: user?.grade ? String(user.grade) : '',
      preferred_language: user?.preferred_language || lang,
      educational_interests: (user?.educational_interests || []).join(', '),
    });
  }, [user?.id]);
  const save = async (event) => {
    event.preventDefault();
    if (!user || status === 'saving' || !form.first_name?.trim()) return;
    setStatus('saving');
    try {
      await base44.auth.updateMe({
        first_name: form.first_name.trim().slice(0, 80), last_name: form.last_name.trim().slice(0, 80),
        region: form.region.trim().slice(0, 80), city: form.city.trim().slice(0, 80),
        country: (form.country || '').trim().slice(0, 80),
        age_range: form.age_range || '',
        grade: form.grade ? Number(form.grade) : null,
        preferred_language: form.preferred_language,
        educational_interests: [...new Set(form.educational_interests.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 10),
      });
      await refreshUser();
      setLang(form.preferred_language);
      setStatus('saved');
    } catch { setStatus('error'); }
  };
  return { form, status, save, change: (key, value) => { setForm((old) => ({ ...old, [key]: value })); setStatus('idle'); } };
}

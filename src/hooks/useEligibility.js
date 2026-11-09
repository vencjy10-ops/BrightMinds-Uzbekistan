import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { evaluateEligibility, profileFrom } from '@/lib/eligibility';

// Returns null for signed-out visitors; { status: null } when the profile is still empty.
export default function useEligibility(item) {
  const { user } = useAuth();
  return useMemo(
    () => (user && item ? evaluateEligibility(item, profileFrom(user)) : null),
    [user, item]
  );
}

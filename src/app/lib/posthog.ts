import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

if (typeof window !== 'undefined' && posthogKey) {
  posthog.init(posthogKey, {
    api_host: (posthogHost || 'https://us.i.posthog.com').replace(/['"]/g, '').trim(),
    person_profiles: 'identified_only',
    loaded: (posthog) => {
      if (import.meta.env.DEV) {
        posthog.debug();
      }
    }
  });
}

export { posthog };

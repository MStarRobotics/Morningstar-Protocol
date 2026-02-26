import React, { useEffect, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-api-script';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileLoadPromise: Promise<void> | null = null;

function ensureTurnstileLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile requires a browser environment.'));
  }

  if (window.turnstile && typeof window.turnstile.render === 'function') {
    return Promise.resolve();
  }

  if (turnstileLoadPromise) {
    return turnstileLoadPromise;
  }

  turnstileLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile script.'));
    document.head.appendChild(script);
  }).finally(() => {
    // Keep promise if script loaded successfully. Clear on rejection path.
    if (!window.turnstile) {
      turnstileLoadPromise = null;
    }
  });

  return turnstileLoadPromise;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onTokenChange: (token: string) => void;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'compact';
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  siteKey,
  onTokenChange,
  theme = 'dark',
  size = 'compact',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!siteKey.trim()) {
      setWidgetError('Turnstile site key is missing.');
      onTokenChange('');
      return () => {
        cancelled = true;
      };
    }

    void ensureTurnstileLoaded()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) {
          return;
        }

        setWidgetError(null);
        onTokenChange('');
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey.trim(),
          theme,
          size,
          callback: (token: string) => {
            onTokenChange(token);
          },
          'expired-callback': () => {
            onTokenChange('');
          },
          'error-callback': () => {
            onTokenChange('');
            setWidgetError('CAPTCHA challenge failed. Please retry.');
          },
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to initialize CAPTCHA.';
        setWidgetError(message);
        onTokenChange('');
      });

    return () => {
      cancelled = true;
      onTokenChange('');
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore cleanup failures from underlying widget runtime.
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onTokenChange, theme, size]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} />
      {widgetError && (
        <p className="text-[10px] text-red-400 font-mono">
          {widgetError}
        </p>
      )}
    </div>
  );
};

export default TurnstileWidget;

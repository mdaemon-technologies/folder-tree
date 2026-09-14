import type { AjaxConfig } from './types';

/** Whether a config value is jstree's ajax form: an object with a `url`. */
export function isAjaxConfig(value: unknown): value is AjaxConfig {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Boolean((value as { url?: unknown }).url)
  );
}

/**
 * jQuery's `$.param` (not `traditional`), as jQuery 3 serializes: arrays as
 * `key[]=v` — `key[i]` for objects inside them — and nested objects as
 * `key[sub]=v`. A string passes through; an array of `{ name, value }`
 * pairs serializes as a form would.
 */
export function param(data: unknown): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  const parts: string[] = [];
  const add = (key: string, raw: unknown): void => {
    const value = typeof raw === 'function' ? (raw as () => unknown)() : raw;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value === null || value === undefined ? '' : String(value))}`);
  };
  const build = (prefix: string, value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (/\[\]$/.test(prefix)) add(prefix, item);
        else build(`${prefix}[${typeof item === 'object' && item !== null ? i : ''}]`, item);
      });
    } else if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) build(`${prefix}[${key}]`, item);
    } else {
      add(prefix, value);
    }
  };
  if (Array.isArray(data)) {
    for (const pair of data as Array<{ name: string; value: unknown }>) add(pair.name, pair.value);
  } else {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) build(key, value);
  }
  return parts.join('&');
}

export interface AjaxHandlers {
  /** The response: parsed JSON, or the text for any other content. */
  success(payload: unknown): void;
  fail(info: { status?: number; message?: string }): void;
}

const ACCEPT: Record<string, string> = {
  json: 'application/json, text/javascript, */*; q=0.01',
  html: 'text/html, */*; q=0.01',
  text: 'text/plain, */*; q=0.01',
};

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Send a jstree ajax config with `fetch`, as `$.ajax` would: `data` as a
 * query string for GET and HEAD, otherwise as a form body; `cache: false`
 * adds a timestamp; `xhrFields.withCredentials` sends credentials across
 * origins. The response is parsed as JSON when `dataType` or the content type
 * says so, and handed back as text otherwise.
 */
export function sendAjax(
  config: AjaxConfig,
  url: string,
  data: unknown,
  handlers: AjaxHandlers,
  signal?: AbortSignal,
): void {
  const method = String(config.type ?? config.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(config.headers ?? {}) };
  const has = (name: string) => Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
  const query = param(data);

  let target = url;
  let body: string | undefined;
  if (method === 'GET' || method === 'HEAD') {
    const extra = [query, config.cache === false ? `_=${Date.now()}` : ''].filter(Boolean).join('&');
    if (extra) target += (target.includes('?') ? '&' : '?') + extra;
  } else {
    body = query;
    if (config.contentType !== false && !has('Content-Type')) {
      headers['Content-Type'] = config.contentType || 'application/x-www-form-urlencoded; charset=UTF-8';
    }
  }
  if (!has('Accept')) headers.Accept = ACCEPT[config.dataType ?? ''] ?? '*/*';
  if (!has('X-Requested-With') && sameOrigin(target)) headers['X-Requested-With'] = 'XMLHttpRequest';

  fetch(target, {
    method,
    headers,
    body,
    credentials: config.xhrFields?.withCredentials ? 'include' : 'same-origin',
    signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        handlers.fail({ status: response.status });
        return;
      }
      const type = response.headers.get('Content-Type') ?? '';
      const text = await response.text();
      const asJson = config.dataType === 'json' || (!config.dataType && type.includes('json'));
      if (!asJson) {
        handlers.success(text);
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        handlers.fail({ status: response.status, message: 'parsererror' });
        return;
      }
      handlers.success(payload);
    })
    .catch((cause: unknown) => {
      if ((cause as { name?: string } | null)?.name === 'AbortError') return;
      handlers.fail({ message: String(cause) });
    });
}

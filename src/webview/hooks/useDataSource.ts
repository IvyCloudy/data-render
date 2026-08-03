import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import type { FormItemDataSource, FormOption } from '../views/formConfigTypes';
import type { HttpRequestOptions, HttpResponseResult } from './useVSCodeBridge';
import { appendQuery, buildQueryString, interpolate } from '../views/SubmitBar';
import { getByPath, parsePathExpr } from '../views/viewUtils';
import { jsonPath } from '../../common/jsonPath';

const cache = new Map<string, { expiresAt: number; options: FormOption[]; value: unknown }>();
const SELECT_COMPONENTS = new Set([
  'Select', 'TreeSelect', 'Cascader', 'Transfer', 'Checkbox.Group', 'Radio.Group',
]);

function extract(body: unknown, path?: string): unknown {
  if (!path) return body;
  const values = jsonPath(body, path.startsWith('$') ? path : `$.${path}`);
  return values.length === 1 ? values[0] : values;
}

function transformOptions(body: unknown, source: FormItemDataSource): FormOption[] {
  const transform = source.transform;
  const rows = extract(body, transform?.path);
  if (!Array.isArray(rows)) return [];
  const labelField = transform?.labelField ?? 'label';
  const valueField = transform?.valueField ?? 'value';
  const disabledField = transform?.disabledField;
  const childrenField = transform?.childrenField;
  const mapRows = (items: unknown[]): FormOption[] => items.map((entry) => {
    const item = entry as Record<string, unknown>;
    return {
      label: String(item?.[labelField] ?? ''),
      value: item?.[valueField],
      ...(disabledField ? { disabled: Boolean(item?.[disabledField]) } : {}),
      ...(childrenField && Array.isArray(item?.[childrenField])
        ? { children: mapRows(item[childrenField] as unknown[]) }
        : {}),
    };
  });
  return mapRows(rows);
}

function conditionEnabled(condition: string | undefined, values: Record<string, unknown>): boolean {
  if (!condition) return true;
  const result = interpolate(condition, values);
  return !['', '0', 'false', 'null', 'undefined'].includes(String(result).trim());
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function useDataSource(
  source: FormItemDataSource | undefined,
  form: FormInstance,
  httpRequest: (request: HttpRequestOptions) => Promise<HttpResponseResult>,
  component: string,
  searchText = '',
  watchPrefix: Array<string | number> = [],
) {
  const watchNames = source?.watch ?? [];
  const watched = Form.useWatch(
    (values: Record<string, unknown>) => watchNames.map((name) =>
      getByPath(values, [...watchPrefix, ...parsePathExpr(name)])),
    form,
  );
  const [options, setOptions] = useState<FormOption[]>([]);
  const [value, setValue] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);
  const mode = source?.mode ?? (SELECT_COMPONENTS.has(component) ? 'options' : 'value');
  const dependencyKey = useMemo(() => JSON.stringify(watched), [watched]);
  const search = source?.search;

  const fetchData = useCallback(async () => {
    if (!source?.http?.url) return;
    const trimmedSearch = searchText.trim();
    if (search && trimmedSearch.length < (search.minLength ?? 0)) {
      setOptions([]);
      setValue(undefined);
      setError(undefined);
      return;
    }
    const values = form.getFieldsValue(true);
    if (!conditionEnabled(source.condition, values)) {
      setOptions(source.fallback ?? []);
      setValue(undefined);
      setError(undefined);
      return;
    }

    const http = source.http;
    const query = {
      ...(interpolate(http.query, values) as Record<string, unknown> | undefined),
      ...(search?.queryKey ? { [search.queryKey]: trimmedSearch } : {}),
    };
    const url = appendQuery(String(interpolate(http.url, values) ?? ''), buildQueryString(query));
    const headers = interpolate(http.headers, values) as Record<string, string> | undefined;
    const body = http.method === 'GET' ? undefined : interpolate(http.body, values);
    const cacheKey = source.cache?.key ?? stableStringify({
      url,
      method: http.method ?? 'GET',
      headers,
      body,
      mode,
      transform: source.transform,
    });
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setOptions(cached.options);
      setValue(cached.value);
      setError(undefined);
      return;
    }

    const currentId = ++requestId.current;
    setLoading(true);
    setError(undefined);
    try {
      const configuredDelays = source.retry?.delays ?? [500, 1500, 3000];
      const attempts = Math.max(1, (source.retry?.count ?? 2) + 1);
      let response: HttpResponseResult | undefined;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) {
          await delay(configuredDelays[Math.min(attempt - 1, configuredDelays.length - 1)] ?? 0);
        }
        if (currentId !== requestId.current) return;
        response = await httpRequest({
          url,
          method: http.method ?? 'GET',
          headers,
          body,
          timeoutMs: http.timeoutMs,
        });
        if (response.ok) break;
      }
      if (currentId !== requestId.current || !response) return;
      if (!response.ok) {
        setOptions(source.fallback ?? []);
        setValue(undefined);
        setError(response.error ?? `HTTP ${response.status ?? '请求失败'}`);
        return;
      }
      const nextOptions = mode === 'options' ? transformOptions(response.body, source) : [];
      const nextValue = mode === 'value' ? extract(response.body, source.transform?.path) : undefined;
      setOptions(nextOptions);
      setValue(nextValue);
      setError(undefined);
      cache.set(cacheKey, {
        options: nextOptions,
        value: nextValue,
        expiresAt: Date.now() + (source.cache?.ttl ?? 30_000),
      });
    } catch (requestError: any) {
      if (currentId === requestId.current) {
        setOptions(source.fallback ?? []);
        setValue(undefined);
        setError(requestError?.message ?? String(requestError));
      }
    } finally {
      if (currentId === requestId.current) setLoading(false);
    }
  }, [source, form, httpRequest, mode, dependencyKey, searchText, reloadToken]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchData(), source?.search?.debounce ?? 0);
    return () => {
      clearTimeout(timer);
      requestId.current += 1;
    };
  }, [fetchData, source?.search?.debounce]);

  return {
    options,
    value,
    loading,
    error,
    reload: () => setReloadToken((token) => token + 1),
  };
}

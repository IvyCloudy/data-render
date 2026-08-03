export const FORM_CONFIG_KEY = 'formConfig';
export const FORM_DATA_KEY = 'formData';
export const FORM_META_KEY = '__form';

export type AntdComponentName =
  | 'Input'
  | 'Input.TextArea'
  | 'InputNumber'
  | 'Select'
  | 'DatePicker'
  | 'Switch'
  | 'Radio.Group'
  | 'Checkbox'
  | 'Checkbox.Group'
  | 'TimePicker'
  | 'Cascader'
  | 'TreeSelect'
  | 'Upload'
  | 'Slider'
  | 'ColorPicker'
  | 'Rate'
  | 'Mentions'
  | 'Transfer'
  | 'Tree';

export type FormComponentName =
  | AntdComponentName
  | 'HttpUpload'
  | 'Form.List'
  | 'Group'
  | 'Collapse'
  | 'Tabs';

export interface FormCondition {
  path: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
  truthy?: boolean;
}

export interface FormOption {
  label: string;
  value: unknown;
  disabled?: boolean;
  children?: FormOption[];
}

export interface DataSourceHttpConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  timeoutMs?: number;
}

export interface FormItemDataSource {
  http: DataSourceHttpConfig;
  transform?: {
    path?: string;
    labelField?: string;
    valueField?: string;
    disabledField?: string;
    childrenField?: string;
  };
  mode?: 'options' | 'value';
  fallback?: FormOption[];
  cache?: { ttl: number; key?: string };
  search?: { debounce?: number; minLength?: number; queryKey?: string };
  retry?: { count?: number; delays?: number[] };
  watch?: string[];
  condition?: string;
  clearOnWatchChange?: boolean;
}

export interface FormUploadResponseMapping {
  from: string;
  /**
   * Omit to write to this HttpUpload field.
   * In Form.List a plain path is row-relative; "$.path" is formData-root-relative.
   */
  to?: string;
  all?: boolean;
  /**
   * "replace" keeps the legacy behavior. "append" stores one mapped value
   * per uploaded file in an array, preserving file selection order.
   */
  mode?: 'replace' | 'append';
}

export interface FormUploadConfig {
  auth?: {
    /**
     * Static/form-interpolated token, or a JSONPath into tokenRequest's response body.
     * The renderer adds the "Bearer " prefix.
     */
    bearer?: string;
    tokenRequest?: DataSourceHttpConfig;
  };
  http: {
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    timeoutMs?: number;
  };
  fieldName?: string;
  fields?: Record<string, unknown>;
  responseMappings: FormUploadResponseMapping[];
  maxSizeMB?: number;
  clearOnRemove?: boolean;
}

export interface FormConfigItem {
  label: string;
  keyName?: string;
  component: FormComponentName;
  col?: { span: number; offset?: number };
  tooltip?: string;
  rules?: Array<Record<string, unknown>>;
  options?: FormOption[];
  props?: Record<string, unknown>;
  valuePropName?: string;
  defaultValue?: unknown;
  dataSource?: FormItemDataSource;
  upload?: FormUploadConfig;
  children?: FormConfigItem[];
  visibleWhen?: FormCondition;
  disabledWhen?: FormCondition;
  requiredWhen?: FormCondition;
  computed?: { template: unknown; watch?: string[] };
  list?: { addText?: string; min?: number; max?: number };
}

export interface DynamicFormDocument {
  formConfig: FormConfigItem[];
  formData: Record<string, unknown>;
  __form?: Record<string, unknown>;
}

const ALLOWED_ROOT_KEYS = new Set([FORM_CONFIG_KEY, FORM_DATA_KEY, FORM_META_KEY]);

/** Modern AntD templates contain only formConfig, formData and optional __form. */
export function isDynamicFormDocument(value: unknown): value is DynamicFormDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).every((key) => ALLOWED_ROOT_KEYS.has(key))
    && Array.isArray(obj[FORM_CONFIG_KEY])
    && !!obj[FORM_DATA_KEY]
    && typeof obj[FORM_DATA_KEY] === 'object'
    && !Array.isArray(obj[FORM_DATA_KEY])
    && (obj[FORM_META_KEY] === undefined
      || (!!obj[FORM_META_KEY]
        && typeof obj[FORM_META_KEY] === 'object'
        && !Array.isArray(obj[FORM_META_KEY])));
}

export function hasFormConfig(value: unknown): boolean {
  return isDynamicFormDocument(value);
}

/** No root-field or keyValue fallback is supported. */
export function getFormData(value: unknown): Record<string, unknown> {
  return isDynamicFormDocument(value) ? value.formData : {};
}

export function readInitialValues(data: DynamicFormDocument): Record<string, unknown> {
  const values = structuredClone(data.formData);
  const applyDefaults = (items: FormConfigItem[]) => {
    for (const item of items) {
      if (item.keyName && item.defaultValue !== undefined && getNestedValue(values, item.keyName) === undefined) {
        setNestedValue(values, item.keyName, item.defaultValue);
      }
      if (item.children) applyDefaults(item.children);
    }
  };
  applyDefaults(data.formConfig);
  return values;
}

export function updateFormData(
  data: DynamicFormDocument,
  values: Record<string, unknown>,
): DynamicFormDocument {
  return { ...data, formData: structuredClone(values) };
}

export const SUPPORTED_FORM_COMPONENTS = new Set<FormComponentName>([
  'Input', 'Input.TextArea', 'InputNumber', 'Select', 'DatePicker', 'Switch',
  'Radio.Group', 'Checkbox', 'Checkbox.Group', 'TimePicker', 'Cascader',
  'TreeSelect', 'Upload', 'Slider', 'ColorPicker', 'Rate', 'Mentions',
  'Transfer', 'Tree', 'HttpUpload', 'Form.List', 'Group', 'Collapse', 'Tabs',
]);

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const CONTAINER_COMPONENTS = new Set<FormComponentName>(['Group', 'Collapse', 'Tabs']);

export function validateDynamicFormDocument(value: unknown): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isDynamicFormDocument(value)) {
    return {
      valid: false,
      errors: ['AntD 动态表单根对象只能包含 formConfig、formData 和可选的 __form。'],
      warnings,
    };
  }

  const seenPaths = new Set<string>();
  const visit = (items: unknown[], location: string, insideList = false) => {
    items.forEach((raw, index) => {
      const itemPath = `${location}[${index}]`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push(`${itemPath} 必须是对象。`);
        return;
      }
      const item = raw as Partial<FormConfigItem>;
      if (!item.component || !SUPPORTED_FORM_COMPONENTS.has(item.component)) {
        errors.push(`${itemPath}.component 不受支持：${String(item.component ?? '(缺失)')}。`);
        return;
      }
      const isContainer = CONTAINER_COMPONENTS.has(item.component);
      if (!isContainer && (!item.keyName || typeof item.keyName !== 'string')) {
        errors.push(`${itemPath}.keyName 必须是非空字符串。`);
      }
      if (item.keyName && !insideList) {
        if (pathSegments(item.keyName).length === 0) errors.push(`${itemPath}.keyName 不是合法字段路径。`);
        if (seenPaths.has(item.keyName)) errors.push(`字段路径重复：${item.keyName}。`);
        seenPaths.add(item.keyName);
      }
      if (item.props !== undefined
        && (!item.props || typeof item.props !== 'object' || Array.isArray(item.props))) {
        errors.push(`${itemPath}.props 必须是对象。`);
      }
      if (item.rules !== undefined && !Array.isArray(item.rules)) {
        errors.push(`${itemPath}.rules 必须是数组。`);
      }
      if (item.col?.span !== undefined
        && (!Number.isInteger(item.col.span) || item.col.span < 1 || item.col.span > 24)) {
        errors.push(`${itemPath}.col.span 必须是 1 到 24 之间的整数。`);
      }
      if (item.dataSource !== undefined
        && (!item.dataSource.http || typeof item.dataSource.http.url !== 'string' || !item.dataSource.http.url)) {
        errors.push(`${itemPath}.dataSource.http.url 必须是非空字符串。`);
      }
      if (item.upload !== undefined) {
        if (item.component !== 'HttpUpload') errors.push(`${itemPath}.upload 只能用于 HttpUpload 组件。`);
        if (!item.upload.http || typeof item.upload.http.url !== 'string' || !item.upload.http.url) {
          errors.push(`${itemPath}.upload.http.url 必须是非空字符串。`);
        }
        if (!Array.isArray(item.upload.responseMappings) || item.upload.responseMappings.length === 0) {
          errors.push(`${itemPath}.upload.responseMappings 必须是非空数组。`);
        } else {
          item.upload.responseMappings.forEach((mapping, mappingIndex) => {
            if (!mapping || typeof mapping.from !== 'string' || !mapping.from.startsWith('$')) {
              errors.push(`${itemPath}.upload.responseMappings[${mappingIndex}].from 必须是以 $ 开头的 JSONPath。`);
            }
            if (mapping?.to !== undefined && typeof mapping.to !== 'string') {
              errors.push(`${itemPath}.upload.responseMappings[${mappingIndex}].to 必须是字符串。`);
            }
            if (mapping?.mode !== undefined
              && mapping.mode !== 'replace'
              && mapping.mode !== 'append') {
              errors.push(`${itemPath}.upload.responseMappings[${mappingIndex}].mode 只能是 replace 或 append。`);
            }
          });
        }
        if (item.upload.auth?.tokenRequest !== undefined
          && (!item.upload.auth.tokenRequest.url
            || typeof item.upload.auth.tokenRequest.url !== 'string')) {
          errors.push(`${itemPath}.upload.auth.tokenRequest.url 必须是非空字符串。`);
        }
      } else if (item.component === 'HttpUpload') {
        warnings.push(`${itemPath} 未配置 upload，选择文件不会调用 HTTP 接口。`);
      }
      if (item.component === 'Form.List' || isContainer) {
        if (!Array.isArray(item.children) || item.children.length === 0) {
          errors.push(`${itemPath}.children 必须是非空数组。`);
        } else {
          visit(item.children, `${itemPath}.children`, insideList || item.component === 'Form.List');
        }
      } else if (item.children !== undefined) {
        warnings.push(`${itemPath}.children 会被忽略，因为 ${item.component} 不是容器组件。`);
      }
    });
  };
  visit(value.formConfig, 'formConfig');

  const submits = (value.__form as any)?.submit;
  if (submits !== undefined && !Array.isArray(submits)) {
    errors.push('__form.submit 必须是数组。');
  }
  return { valid: errors.length === 0, errors, warnings };
}

function pathSegments(path: string): (string | number)[] {
  const result: (string | number)[] = [];
  const matcher = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(path)) !== null) {
    result.push(match[2] === undefined ? match[1] : Number(match[2]));
  }
  return result;
}

function getNestedValue(root: unknown, path: string): unknown {
  let current: any = root;
  for (const segment of pathSegments(path)) {
    if (current === undefined || current === null) return undefined;
    current = current[segment as any];
  }
  return current;
}

function setNestedValue(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = pathSegments(path);
  let current: any = root;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment as any] = value;
      return;
    }
    current[segment as any] ??= typeof segments[index + 1] === 'number' ? [] : {};
    current = current[segment as any];
  });
}

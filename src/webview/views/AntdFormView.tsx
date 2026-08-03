import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Cascader,
  Checkbox,
  Col,
  Collapse,
  ColorPicker,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Mentions,
  Popover,
  Radio,
  Rate,
  Row,
  Select,
  Slider,
  Space,
  Switch,
  Tabs,
  TimePicker,
  Tooltip,
  Transfer,
  Tree,
  TreeSelect,
  Upload,
} from 'antd';
import type { FormInstance } from 'antd';
import type { Rule } from 'antd/es/form';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { jsonPath } from '../../common/jsonPath';
import { useVSCodeBridge } from '../hooks/useVSCodeBridge';
import type { HttpRequestOptions, HttpResponseResult } from '../hooks/useVSCodeBridge';
import { useDataSource } from '../hooks/useDataSource';
import { SubmitBar, interpolate } from './SubmitBar';
import { getByPath, parsePathExpr } from './viewUtils';
import type {
  DynamicFormDocument,
  FormCondition,
  FormConfigItem,
} from './formConfigTypes';
import {
  readInitialValues,
  updateFormData,
  validateDynamicFormDocument,
} from './formConfigTypes';

interface Props {
  data: DynamicFormDocument;
  onChange: (next: unknown) => void;
}

type NamePath = Array<string | number>;

const COMPONENTS: Record<string, React.ComponentType<any>> = {
  Input,
  'Input.TextArea': Input.TextArea,
  InputNumber,
  Select,
  DatePicker,
  Switch,
  'Radio.Group': Radio.Group,
  Checkbox,
  'Checkbox.Group': Checkbox.Group,
  TimePicker,
  Cascader,
  TreeSelect,
  Upload,
  Slider,
  ColorPicker,
  Rate,
  Mentions,
  Transfer,
  Tree,
  HttpUpload: Upload,
};

function namePath(path: string | undefined, prefix: NamePath = []): NamePath {
  return [...prefix, ...parsePathExpr(path ?? '')];
}

function evaluateCondition(condition: FormCondition | undefined, values: unknown): boolean {
  if (!condition) return true;
  const actual = getByPath(values, condition.path);
  if (condition.in) return condition.in.some((candidate) => Object.is(candidate, actual));
  if ('equals' in condition) return Object.is(actual, condition.equals);
  if ('notEquals' in condition) return !Object.is(actual, condition.notEquals);
  if (condition.truthy === false) return !actual;
  return Boolean(actual);
}

function setMutable(root: any, path: NamePath, value: unknown): void {
  let current = root;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      current[segment as any] = value;
      return;
    }
    current[segment as any] ??= typeof path[index + 1] === 'number' ? [] : {};
    current = current[segment as any];
  });
}

function flattenChangedPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const nested = flattenChangedPaths(child, path);
    return nested.length ? nested : [path];
  });
}

function allItems(items: FormConfigItem[]): FormConfigItem[] {
  return items.flatMap((item) => [item, ...(item.children ? allItems(item.children) : [])]);
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return btoa(chunks.join(''));
}

function multipartFieldValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function normalizeFormValues(
  values: Record<string, unknown>,
  config: FormConfigItem[],
): Record<string, unknown> {
  const clone = (value: any): any => {
    if (dayjs.isDayjs(value)) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    }
    return value;
  };
  const converted = clone(values);
  const visit = (items: FormConfigItem[], prefix: NamePath) => {
    for (const item of items) {
      if (['Group', 'Collapse', 'Tabs'].includes(item.component)) {
        visit(item.children ?? [], prefix);
        continue;
      }
      const path = namePath(item.keyName, prefix);
      if (item.component === 'Form.List') {
        const list = getByPath(converted, path);
        if (Array.isArray(list)) {
          list.forEach((_entry, index) => visit(item.children ?? [], [...path, index]));
        }
        continue;
      }
      const value: any = getByPath(converted, path);
      if (value === undefined || value === null) continue;
      if (item.component === 'DatePicker' && dayjs.isDayjs(value)) {
        setMutable(converted, path, value.format('YYYY-MM-DD'));
      } else if (item.component === 'TimePicker' && dayjs.isDayjs(value)) {
        setMutable(converted, path, value.format('HH:mm:ss'));
      } else if (item.component === 'ColorPicker' && typeof value !== 'string') {
        setMutable(converted, path, value?.toHexString?.() ?? String(value));
      }
    }
  };
  visit(config, []);
  return converted;
}

const DynamicField: React.FC<{
  item: FormConfigItem;
  prefix: NamePath;
  absolutePrefix: NamePath;
  form: FormInstance;
  httpRequest: (request: HttpRequestOptions) => Promise<HttpResponseResult>;
  onFormMutated: () => void;
}> = ({ item, prefix, absolutePrefix, form, httpRequest, onFormMutated }) => {
  const [searchText, setSearchText] = useState('');
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [uploadError, setUploadError] = useState<string>();
  const values = Form.useWatch((current) => current, form) ?? form.getFieldsValue(true);
  const Component = COMPONENTS[item.component];
  const dataSource = useDataSource(
    item.dataSource,
    form,
    httpRequest,
    item.component,
    searchText,
    absolutePrefix,
  );
  const fieldPath = namePath(item.keyName, prefix);
  const absoluteFieldPath = namePath(item.keyName, absolutePrefix);
  const visible = evaluateCondition(item.visibleWhen, values);
  const disabled = item.disabledWhen ? evaluateCondition(item.disabledWhen, values) : false;
  const dynamicallyRequired = item.requiredWhen
    ? evaluateCondition(item.requiredWhen, values)
    : false;

  useEffect(() => {
    if (item.dataSource?.mode === 'value' && dataSource.value !== undefined) {
      form.setFieldValue(absoluteFieldPath, dataSource.value);
      onFormMutated();
    }
  }, [dataSource.value, form, item.dataSource?.mode, JSON.stringify(absoluteFieldPath)]);

  useEffect(() => {
    if (!item.computed) return;
    const computed = interpolate(item.computed.template, values);
    if (JSON.stringify(form.getFieldValue(absoluteFieldPath)) !== JSON.stringify(computed)) {
      form.setFieldValue(absoluteFieldPath, computed);
      onFormMutated();
    }
  }, [
    item.computed,
    form,
    JSON.stringify(absoluteFieldPath),
    JSON.stringify((item.computed?.watch ?? []).map((path) => getByPath(values, path))),
  ]);

  if (!visible) return null;
  if (!Component) return <Alert type="error" message={`不支持的组件：${item.component}`} />;

  const label = (
    <span>
      {item.label}
      {item.tooltip && (
        <Tooltip title={item.tooltip}>
          <QuestionCircleOutlined className="dynamic-form-help" />
        </Tooltip>
      )}
    </span>
  );
  const props: Record<string, any> = {
    ...(item.props ?? {}),
    disabled: Boolean(item.props?.disabled) || disabled,
  };
  const options = item.dataSource
    ? (dataSource.options.length ? dataSource.options : item.options)
    : item.options;
  if (dataSource.loading) props.loading = true;
  if (item.component === 'TreeSelect') props.treeData = options;
  else if (item.component === 'Tree') props.treeData ??= options;
  else if (options) props.options = options;
  if (item.dataSource?.search) {
    props.showSearch = true;
    props.filterOption = false;
    props.onSearch = setSearchText;
  }

  const rules: Rule[] = [
    ...((item.rules ?? []) as Rule[]),
    ...(dynamicallyRequired ? [{ required: true, message: `${item.label}为必填项` }] : []),
  ];
  const booleanComponent = item.component === 'Switch' || item.component === 'Checkbox';
  const common = {
    name: fieldPath,
    label,
    rules,
    valuePropName: item.valuePropName ?? (booleanComponent ? 'checked' : undefined),
    help: dataSource.error
      ? (
          <span className="dynamic-form-source-error">
            {dataSource.error}{' '}
            <Button type="link" size="small" icon={<ReloadOutlined />} onClick={dataSource.reload}>
              重试
            </Button>
          </span>
        )
      : undefined,
    validateStatus: dataSource.error ? 'warning' as const : undefined,
  };

  if (item.component === 'HttpUpload') {
    const upload = item.upload;
    const mappingTarget = (target: string | undefined): NamePath => {
      if (!target) return absoluteFieldPath;
      if (target === '$') return [];
      if (target.startsWith('$.')) return parsePathExpr(target.slice(2));
      return namePath(target, absolutePrefix);
    };
    const applyResponse = (body: unknown) => {
      for (const mapping of upload?.responseMappings ?? []) {
        const matches = jsonPath(body, mapping.from);
        if (!matches.length) throw new Error(`响应中未找到 ${mapping.from}`);
        form.setFieldValue(mappingTarget(mapping.to), mapping.all ? matches : matches[0]);
      }
      onFormMutated();
    };
    const customRequest = upload
      ? async (options: any) => {
          const file = options.file as File;
          let rawResponse: HttpResponseResult | undefined;
          const uploadFile: UploadFile = {
            uid: (file as any).uid ?? `${Date.now()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'uploading',
            percent: 0,
            originFileObj: file as any,
          };
          setUploadError(undefined);
          setUploadFiles((current) => [
            ...current.filter((entry) => entry.uid !== uploadFile.uid),
            uploadFile,
          ]);
          try {
            if (upload.maxSizeMB && file.size > upload.maxSizeMB * 1024 * 1024) {
              throw new Error(`文件不能超过 ${upload.maxSizeMB} MB`);
            }
            const currentValues = form.getFieldsValue(true);
            let tokenResponse: unknown;
            const uploadAuth = upload.auth;
            if (uploadAuth?.tokenRequest?.url) {
              const tokenRequest = uploadAuth.tokenRequest;
              const tokenHttpResponse = await httpRequest({
                url: String(interpolate(tokenRequest.url, currentValues) ?? ''),
                method: tokenRequest.method ?? 'POST',
                headers: interpolate(tokenRequest.headers, currentValues) as Record<string, string> | undefined,
                body: interpolate(tokenRequest.body, currentValues),
                timeoutMs: tokenRequest.timeoutMs,
              });
              rawResponse = tokenHttpResponse;
              if (!tokenHttpResponse.ok) {
                throw new Error(tokenHttpResponse.error ?? `Token HTTP ${tokenHttpResponse.status ?? '请求失败'}`);
              }
              tokenResponse = tokenHttpResponse.body;
            }
            const headers = interpolate(upload.http.headers ?? {}, currentValues) as Record<string, unknown>;
            if (uploadAuth?.bearer
              && !Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
              const bearerConfig = String(interpolate(uploadAuth.bearer, currentValues) ?? '').trim();
              let token: unknown = bearerConfig;
              if (tokenResponse !== undefined && bearerConfig.startsWith('$')) {
                const tokenMatches = jsonPath(tokenResponse, bearerConfig);
                if (!tokenMatches.length) {
                  throw new Error(`Token 响应中未找到 ${bearerConfig}`);
                }
                token = tokenMatches[0];
              }
              if (token !== undefined && token !== null && String(token).trim()) {
                headers.Authorization = `Bearer ${String(token).trim()}`;
              }
            }
            const fields = interpolate(upload.fields ?? {}, currentValues) as Record<string, unknown>;
            const response = await httpRequest({
              url: String(interpolate(upload.http.url, currentValues)),
              method: upload.http.method ?? 'POST',
              headers: Object.fromEntries(
                Object.entries(headers).map(([key, value]) => [key, String(value)]),
              ),
              timeoutMs: upload.http.timeoutMs,
              multipart: {
                fields: Object.fromEntries(
                  Object.entries(fields).map(([key, value]) => [key, multipartFieldValue(value)]),
                ),
                files: [{
                  field: upload.fieldName ?? 'file',
                  contentBase64: await fileToBase64(file),
                  filename: file.name,
                  contentType: file.type || 'application/octet-stream',
                }],
              },
            });
            rawResponse = response;
            if (!response.ok) {
              throw new Error(response.error ?? `HTTP ${response.status ?? '请求失败'}`);
            }
            applyResponse(response.body);
            setUploadFiles((current) => current.map((entry) => (
              entry.uid === uploadFile.uid
                ? { ...entry, status: 'done', percent: 100, response }
                : entry
            )));
            options.onSuccess?.(response.body);
          } catch (error: any) {
            setUploadError(error?.message ?? String(error));
            setUploadFiles((current) => current.map((entry) => (
              entry.uid === uploadFile.uid
                ? { ...entry, status: 'error', error, response: rawResponse }
                : entry
            )));
            options.onError?.(error);
          }
        }
      : undefined;

    return (
      <Form.Item
        label={label}
        required={rules.some((rule: any) => rule.required)}
        help={uploadError ?? (!upload ? '请配置 upload.http 和 upload.responseMappings' : undefined)}
        validateStatus={uploadError ? 'error' : (!upload ? 'warning' : undefined)}
      >
        <Upload
          {...props}
          fileList={uploadFiles}
          customRequest={customRequest}
          beforeUpload={upload ? undefined : () => false}
          itemRender={(_originNode, file, _fileList, actions) => (
            <div className={`dynamic-http-upload-item dynamic-http-upload-item-${file.status ?? 'ready'}`}>
              <PaperClipOutlined className="dynamic-http-upload-paperclip" />
              <span className="dynamic-http-upload-name" title={file.name}>{file.name}</span>
              {file.status === 'uploading' && <LoadingOutlined className="dynamic-http-upload-loading" />}
              {file.response !== undefined && (
                <Popover
                  placement="topRight"
                  trigger="hover"
                  title="HTTP 原始响应"
                  content={(
                    <pre className="dynamic-http-upload-response">
                      {JSON.stringify(file.response, null, 2)}
                    </pre>
                  )}
                >
                  <Button
                    type="text"
                    size="small"
                    className="dynamic-http-upload-result"
                    aria-label="查看 HTTP 原始响应"
                    icon={file.status === 'done'
                      ? <CheckCircleOutlined />
                      : <ExclamationCircleOutlined />}
                  />
                </Popover>
              )}
              <Button
                type="text"
                size="small"
                danger
                className="dynamic-http-upload-remove"
                aria-label={`删除 ${file.name}`}
                icon={<DeleteOutlined />}
                onClick={() => actions.remove()}
              />
            </div>
          )}
          onRemove={(file) => {
            setUploadFiles((current) => current.filter((entry) => entry.uid !== file.uid));
            if (upload && upload.clearOnRemove !== false) {
              for (const mapping of upload.responseMappings) {
                form.setFieldValue(mappingTarget(mapping.to), undefined);
              }
              onFormMutated();
            }
            return true;
          }}
        >
          <Button icon={<UploadOutlined />} disabled={props.disabled || !upload}>选择并上传</Button>
        </Upload>
      </Form.Item>
    );
  }

  if (item.component === 'Upload') {
    return (
      <Form.Item
        {...common}
        valuePropName="fileList"
        getValueFromEvent={(event: any) => (event?.fileList ?? []).map((file: any) => ({
          uid: file.uid,
          name: file.name,
          size: file.size,
          type: file.type,
          status: file.status,
        }))}
      >
        <Upload {...props} beforeUpload={() => false}>
          <Button icon={<UploadOutlined />} disabled={props.disabled}>选择文件</Button>
        </Upload>
      </Form.Item>
    );
  }
  if (item.component === 'Transfer') {
    const transferData = (options ?? []).map((option) => ({
      key: String(option.value),
      title: option.label,
    }));
    return (
      <Form.Item {...common} valuePropName="targetKeys">
        <Transfer dataSource={transferData} render={(entry) => String(entry.title ?? entry.key)} {...props} />
      </Form.Item>
    );
  }
  if (item.component === 'Tree') {
    return (
      <Form.Item {...common} valuePropName={item.valuePropName ?? 'checkedKeys'}>
        <Tree checkable {...props} />
      </Form.Item>
    );
  }
  if (item.component === 'DatePicker' || item.component === 'TimePicker') {
    return (
      <Form.Item
        {...common}
        getValueProps={(value: unknown) => ({
          value: typeof value === 'string'
            ? dayjs(value, item.component === 'TimePicker' ? 'HH:mm:ss' : undefined)
            : value,
        })}
      >
        <Component {...props} />
      </Form.Item>
    );
  }
  if (item.component === 'ColorPicker') {
    return (
      <Form.Item {...common} getValueFromEvent={(color: any) => color?.toHexString?.() ?? color}>
        <ColorPicker {...props} />
      </Form.Item>
    );
  }
  return <Form.Item {...common}><Component {...props} /></Form.Item>;
};

const ConfigRenderer: React.FC<{
  items: FormConfigItem[];
  prefix?: NamePath;
  absolutePrefix?: NamePath;
  form: FormInstance;
  httpRequest: (request: HttpRequestOptions) => Promise<HttpResponseResult>;
  onFormMutated: () => void;
}> = ({ items, prefix = [], absolutePrefix = [], form, httpRequest, onFormMutated }) => (
  <Row gutter={[16, 4]} className="dynamic-form-grid">
    {items.map((item, index) => {
      const key = `${item.component}:${item.keyName ?? item.label}:${index}`;
      if (item.component === 'Group') {
        return (
          <Col span={24} key={key}>
            <Card size="small" title={item.label} className="dynamic-form-container">
              <ConfigRenderer
                items={item.children ?? []}
                prefix={prefix}
                absolutePrefix={absolutePrefix}
                form={form}
                httpRequest={httpRequest}
                onFormMutated={onFormMutated}
              />
            </Card>
          </Col>
        );
      }
      if (item.component === 'Collapse') {
        return (
          <Col span={24} key={key}>
            <Collapse
              className="dynamic-form-container"
              items={[{
                key: 'content',
                label: item.label,
                children: (
                  <ConfigRenderer
                    items={item.children ?? []}
                    prefix={prefix}
                    absolutePrefix={absolutePrefix}
                    form={form}
                    httpRequest={httpRequest}
                    onFormMutated={onFormMutated}
                  />
                ),
              }]}
            />
          </Col>
        );
      }
      if (item.component === 'Tabs') {
        return (
          <Col span={24} key={key}>
            <Tabs
              items={(item.children ?? []).map((tab, tabIndex) => ({
                key: `${tab.label}:${tabIndex}`,
                label: tab.label,
                children: (
                  <ConfigRenderer
                    items={tab.children ?? [tab]}
                    prefix={prefix}
                    absolutePrefix={absolutePrefix}
                    form={form}
                    httpRequest={httpRequest}
                    onFormMutated={onFormMutated}
                  />
                ),
              }))}
            />
          </Col>
        );
      }
      if (item.component === 'Form.List' && item.keyName) {
        return (
          <Col span={24} key={key}>
            <Card size="small" title={item.label} className="dynamic-form-container">
              <Form.List name={namePath(item.keyName, prefix)}>
                {(fields, { add, remove }) => (
                  <Space direction="vertical" className="dynamic-form-list">
                    {fields.map((field, fieldIndex) => (
                      <Card
                        key={field.key}
                        size="small"
                        title={`${item.label} ${fieldIndex + 1}`}
                        extra={(
                          <Button
                            danger
                            type="text"
                            icon={<DeleteOutlined />}
                            disabled={fields.length <= (item.list?.min ?? 0)}
                            onClick={() => remove(field.name)}
                          />
                        )}
                      >
                        <ConfigRenderer
                          items={item.children ?? []}
                          prefix={[field.name]}
                          absolutePrefix={[...namePath(item.keyName, absolutePrefix), field.name]}
                          form={form}
                          httpRequest={httpRequest}
                          onFormMutated={onFormMutated}
                        />
                      </Card>
                    ))}
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      disabled={fields.length >= (item.list?.max ?? Number.POSITIVE_INFINITY)}
                      onClick={() => add()}
                      block
                    >
                      {item.list?.addText ?? `添加${item.label}`}
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Card>
          </Col>
        );
      }
      const span = Math.min(24, Math.max(1, item.col?.span ?? 8));
      return (
        <Col
          key={key}
          xs={24}
          sm={Math.max(12, span)}
          md={span}
          lg={span}
          xl={span}
          offset={item.col?.offset ?? 0}
        >
          <DynamicField
            item={item}
            prefix={prefix}
            absolutePrefix={absolutePrefix}
            form={form}
            httpRequest={httpRequest}
            onFormMutated={onFormMutated}
          />
        </Col>
      );
    })}
  </Row>
);

export const AntdFormView: React.FC<Props> = ({ data, onChange }) => {
  const [form] = Form.useForm();
  const { httpRequest } = useVSCodeBridge();
  const initialValues = useMemo(() => readInitialValues(data), [data]);
  const initialSnapshot = useRef(structuredClone(data));
  const validation = useMemo(() => validateDynamicFormDocument(data), [data]);

  useEffect(() => {
    form.setFieldsValue(initialValues);
  }, [form, initialValues]);

  if (!validation.valid) {
    return (
      <Alert
        type="error"
        showIcon
        message="动态表单模板不可用"
        description={validation.errors.join('\n')}
      />
    );
  }

  const persist = () => {
    const normalized = normalizeFormValues(form.getFieldsValue(true), data.formConfig);
    onChange(updateFormData(data, normalized));
  };
  const onValuesChange = (changed: Record<string, unknown>) => {
    const changedPaths = flattenChangedPaths(changed);
    for (const item of allItems(data.formConfig)) {
      if (!item.keyName || !item.dataSource?.clearOnWatchChange) continue;
      if (item.dataSource.watch?.some((watched) => changedPaths.includes(watched))) {
        form.setFieldValue(namePath(item.keyName), undefined);
      }
    }
    const currentValues = form.getFieldsValue(true);
    for (const item of allItems(data.formConfig)) {
      if (!item.keyName || !item.computed) continue;
      const computed = interpolate(item.computed.template, currentValues);
      form.setFieldValue(namePath(item.keyName), computed);
      setMutable(currentValues, namePath(item.keyName), computed);
    }
    onChange(updateFormData(data, normalizeFormValues(currentValues, data.formConfig)));
  };

  return (
    <div className="dynamic-form-shell">
      {validation.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="模板警告"
          description={validation.warnings.join('\n')}
          className="dynamic-form-template-alert"
        />
      )}
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ flex: '0 0 110px' }}
        wrapperCol={{ flex: 1 }}
        initialValues={initialValues}
        onValuesChange={onValuesChange}
        className="dynamic-form-content"
      >
        <ConfigRenderer
          items={data.formConfig}
          form={form}
          httpRequest={httpRequest}
          onFormMutated={persist}
        />
      </Form>
      {Array.isArray((data.__form as any)?.submit) && (data.__form as any).submit.length > 0 && (
        <SubmitBar
          data={data}
          onChange={onChange}
          initialSnapshot={initialSnapshot.current}
          onReset={() => {
            form.setFieldsValue(readInitialValues(initialSnapshot.current));
            form.resetFields();
          }}
        />
      )}
    </div>
  );
};

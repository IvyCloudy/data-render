# json2AntDForm 配置指引

本文说明 Data Render 中 JSON → Ant Design 动态表单的现代配置协议。

完整复杂示例：[`examples/22-antd-form-modern-complex-http-upload.json`](../examples/22-antd-form-modern-complex-http-upload.json)

## 1. 根结构

动态表单根对象只能包含 `formData`、`formConfig` 和可选的 `__form`：

```json
{
  "formData": {},
  "formConfig": [],
  "__form": {}
}
```

| 字段 | 必填 | 类型 | 用途 |
| --- | --- | --- | --- |
| `formData` | 是 | `object` | 业务数据及编辑结果 |
| `formConfig` | 是 | `array` | 字段、组件、布局和联动 |
| `__form` | 否 | `object` | 整表鉴权、提交和重置 |

不支持根级业务字段、缺少 `formData`、`keyValue`、单对象 `__form.submit` 或其他根字段。

## 2. 最小模板

```json
{
  "formData": {
    "user": { "name": "Alice", "active": true }
  },
  "formConfig": [
    {
      "label": "姓名",
      "keyName": "user.name",
      "component": "Input",
      "rules": [{ "required": true, "message": "请输入姓名" }]
    },
    {
      "label": "启用",
      "keyName": "user.active",
      "component": "Switch"
    }
  ]
}
```

## 3. 复杂数据路径

`formData` 支持任意层级的对象和数组。字段通过 `keyName` 绑定：

- 点路径：`user.address.city`
- 数组下标：`orders[0].name`
- 对象数组：使用 `Form.List`

```json
{
  "label": "操作人",
  "keyName": "requestContext.operator.name",
  "component": "Input"
}
```

## 4. FormConfigItem

```json
{
  "label": "项目名称",
  "keyName": "project.name",
  "component": "Input",
  "col": { "span": 12, "offset": 0 },
  "tooltip": "项目显示名称",
  "rules": [],
  "props": {},
  "defaultValue": ""
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `label` | 是 | 字段或容器标题 |
| `keyName` | 普通字段、`Form.List` 必填 | `formData` 路径 |
| `component` | 是 | 组件名称 |
| `col` | 否 | 24 栅格，默认 `span: 8` |
| `tooltip` | 否 | 标签提示 |
| `rules` | 否 | Ant Design 校验规则 |
| `options` | 否 | 静态选项 |
| `props` | 否 | 透传组件属性 |
| `valuePropName` | 否 | 自定义值属性 |
| `defaultValue` | 否 | 数据路径无值时使用 |
| `dataSource` | 否 | HTTP 远程选项或值 |
| `visibleWhen` | 否 | 条件显示 |
| `disabledWhen` | 否 | 条件禁用 |
| `requiredWhen` | 否 | 条件必填 |
| `computed` | 否 | 计算字段 |
| `children` | 容器必填 | 子字段 |
| `list` | 否 | `Form.List` 增删限制 |
| `upload` | `HttpUpload` 必填 | 字段级 HTTP 上传 |

## 5. 支持组件

基础字段：

- `Input`、`Input.TextArea`、`InputNumber`
- `Select`、`Radio.Group`、`Checkbox`、`Checkbox.Group`
- `DatePicker`、`TimePicker`
- `Switch`、`Cascader`、`TreeSelect`、`Tree`
- `Slider`、`ColorPicker`、`Rate`、`Mentions`、`Transfer`
- `Upload`、`HttpUpload`

容器：

- `Group`：卡片分组
- `Collapse`：折叠区域
- `Tabs`：标签页
- `Form.List`：动态对象数组

`Group`、`Collapse`、`Tabs` 不需要 `keyName`，但必须有非空 `children`。

## 6. 静态选项

```json
{
  "label": "发布通道",
  "keyName": "release.channel",
  "component": "Select",
  "options": [
    { "label": "开发", "value": "development" },
    { "label": "预发布", "value": "staging" },
    { "label": "生产", "value": "production", "disabled": true }
  ]
}
```

树形选项可继续配置 `children`。

## 7. 容器布局

```json
{
  "label": "项目信息",
  "component": "Group",
  "children": [
    { "label": "项目编码", "keyName": "project.code", "component": "Input", "col": { "span": 12 } },
    { "label": "项目名称", "keyName": "project.name", "component": "Input", "col": { "span": 12 } }
  ]
}
```

`Tabs.children` 的每个元素代表一个标签页，其 `label` 是页签标题：

```json
{
  "label": "配置",
  "component": "Tabs",
  "children": [
    {
      "label": "基础信息",
      "component": "Group",
      "children": [{ "label": "名称", "keyName": "basic.name", "component": "Input" }]
    },
    {
      "label": "发布信息",
      "component": "Group",
      "children": [{ "label": "版本", "keyName": "release.version", "component": "Input" }]
    }
  ]
}
```

## 8. 对象数组 Form.List

`Form.List.keyName` 指向数组；子字段 `keyName` 相对于当前数组元素。

```json
{
  "label": "联系人",
  "keyName": "project.contacts",
  "component": "Form.List",
  "list": { "addText": "添加联系人", "min": 1, "max": 10 },
  "children": [
    { "label": "姓名", "keyName": "name", "component": "Input" },
    { "label": "城市", "keyName": "address.city", "component": "Input" }
  ]
}
```

对应数据：

```json
{
  "project": {
    "contacts": [{ "name": "张三", "address": { "city": "深圳" } }]
  }
}
```

## 9. 条件联动

条件支持 `equals`、`notEquals`、`in`、`truthy`：

```json
{
  "label": "审批人",
  "keyName": "approval.approver",
  "component": "Input",
  "visibleWhen": { "path": "approval.required", "equals": true },
  "requiredWhen": { "path": "approval.required", "equals": true }
}
```

动态禁用：

```json
{
  "disabledWhen": { "path": "project.enabled", "equals": false }
}
```

## 10. 计算字段

```json
{
  "label": "发布标识",
  "keyName": "derived.releaseIdentity",
  "component": "Input",
  "computed": {
    "template": "{{project.code}}-{{release.version}}",
    "watch": ["project.code", "release.version"]
  },
  "props": { "disabled": true }
}
```

纯模板表达式保留原始类型；和文本混用时转换成字符串。

## 11. HTTP 远程数据源

```json
{
  "label": "用户",
  "keyName": "user.id",
  "component": "Select",
  "dataSource": {
    "http": {
      "url": "https://api.example.test/users",
      "method": "GET",
      "headers": { "Authorization": "Bearer {{auth.token}}" },
      "query": { "tenant": "{{tenant.id}}" },
      "timeoutMs": 10000
    },
    "mode": "options",
    "transform": {
      "path": "$.data.items",
      "labelField": "name",
      "valueField": "id",
      "disabledField": "disabled",
      "childrenField": "children"
    },
    "fallback": [{ "label": "加载失败", "value": "", "disabled": true }],
    "cache": { "ttl": 30000 },
    "search": { "queryKey": "keyword", "debounce": 300, "minLength": 2 },
    "retry": { "count": 2, "delays": [500, 1500] },
    "watch": ["tenant.id"],
    "clearOnWatchChange": true
  }
}
```

`mode: options` 将响应转换为选项；`mode: value` 将 `transform.path` 的结果写入字段。

## 12. Upload

`Upload` 不调用字段级接口，只将文件元数据写入 `formData`：

```json
{
  "label": "附件信息",
  "keyName": "attachments",
  "component": "Upload",
  "props": { "accept": ".txt,.json", "multiple": true, "maxCount": 3 }
}
```

普通 `Upload` 不包含文件二进制内容。需要真实文件上传时使用 `HttpUpload`。

## 13. HttpUpload

```json
{
  "label": "部署包",
  "keyName": "attachment.content",
  "component": "HttpUpload",
  "props": { "accept": ".txt,.json,.zip", "maxCount": 1 },
  "upload": {
    "http": {
      "url": "http://127.0.0.1/post",
      "method": "POST",
      "headers": { "X-Trace-Id": "{{requestContext.traceId}}" },
      "timeoutMs": 30000
    },
    "fieldName": "file",
    "fields": {
      "projectCode": "{{project.code}}",
      "operator": "{{requestContext.operator}}"
    },
    "responseMappings": [
      { "from": "$.files.file" },
      { "from": "$.form.projectCode", "to": "$.attachment.projectCode" }
    ],
    "maxSizeMB": 20,
    "clearOnRemove": true
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `upload.http.url` | 上传接口，必填 |
| `upload.http.method` | `POST`、`PUT`、`PATCH`，默认 `POST` |
| `upload.http.headers` | 请求头，支持插值 |
| `upload.http.timeoutMs` | 超时时间 |
| `upload.fieldName` | multipart 文件字段名，默认 `file` |
| `upload.fields` | multipart 普通字段，支持插值 |
| `upload.responseMappings` | 响应体到 `formData` 的映射，必填 |
| `upload.maxSizeMB` | 文件大小限制 |
| `upload.clearOnRemove` | 删除时清空映射字段，默认 `true` |

响应映射规则：

- `from` 必须是 JSONPath。
- 省略 `to` 时写入当前 `keyName`。
- `to` 以 `$.` 开头时从 `formData` 根写入。
- `Form.List` 内普通 `to` 相对于当前行。
- `all: true` 保存全部匹配，否则保存第一项。
- 任意映射无匹配时上传显示失败。

上传完成后，删除按钮左侧显示结果图标；悬浮可查看完整 HTTP 响应。

## 14. HttpUpload 独立 Token

```json
{
  "upload": {
    "auth": {
      "tokenRequest": {
        "url": "http://127.0.0.1/post",
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "body": {
          "access_token": "upload-{{requestContext.operator.tokenSeed}}"
        },
        "timeoutMs": 10000
      },
      "bearer": "$.json.access_token"
    },
    "http": {
      "url": "http://127.0.0.1/post",
      "method": "POST"
    },
    "responseMappings": [{ "from": "$.files.file" }]
  }
}
```

执行顺序：Token 请求 → JSONPath 提取 Token → 自动设置 `Authorization: Bearer <token>` → multipart 上传 → 响应映射。

`upload.auth.bearer` 支持固定 Token、表单插值或 Token 响应 JSONPath。不要写 `Bearer ` 前缀。如果上传 Header 已显式配置 `Authorization`，显式值优先。

## 15. 整表提交 __form

`__form.submit` 必须是数组：

```json
{
  "__form": {
    "submit": [
      {
        "type": "http",
        "label": "提交",
        "url": "http://127.0.0.1/post",
        "method": "POST"
      },
      { "type": "reset", "label": "重置" }
    ]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `type` | `http` 或 `reset`，默认 `http` |
| `url` | HTTP 地址，支持插值 |
| `method` | HTTP 方法 |
| `headers` | 请求头 |
| `query` | 查询参数 |
| `body` | 显式请求体，优先级最高 |
| `bodyPath` | 从作用域选取请求体 |
| `requiredPaths` | 必填的 `formData` 路径 |
| `responsePath` | 成功后写入完整响应体的模板路径 |
| `label` | 按钮文本 |
| `confirm` | 操作前确认文案 |
| `timeoutMs` | 超时时间 |
| `variant` | `primary`、`secondary`、`danger` |
| `openUrl` | 成功后打开 URL |

请求体优先级：`body` > `bodyPath` > 完整 `formData`。

```json
{
  "body": {
    "requestContext": "{{requestContext}}",
    "business": "{{business}}",
    "attachments": "{{attachments}}",
    "approval": "{{approval}}"
  },
  "requiredPaths": [
    "business.project.code",
    "attachments.deploymentPackage.content"
  ],
  "responsePath": "formData.submission.response"
}
```

`body` 任意层级可用 `{ "$formConfig": true }` 展开完整 `formData`。标记名称虽然是 `$formConfig`，值来源仍严格是现代协议的 `formData`。

## 16. 外层表单 Token

外层提交使用 `__form.auth.tokenRequest`，与 `HttpUpload.upload.auth` 独立：

```json
{
  "__form": {
    "auth": {
      "tokenRequest": {
        "url": "http://127.0.0.1/post",
        "method": "POST",
        "body": {
          "access_token": "form-{{requestContext.operator.tokenSeed}}"
        }
      }
    },
    "submit": [
      {
        "type": "http",
        "label": "提交",
        "url": "http://127.0.0.1/post",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer $.json.access_token"
        }
      }
    ]
  }
}
```

`submit.headers` 中的 JSONPath 从 Token 响应读取。特殊 key `$tokenResponse` 可将响应对象合并为多个 Header：

```json
{
  "$tokenResponse": "$.data.headers"
}
```

不请求 Token 接口时可使用 `__form.auth.bearer: "{{auth.formToken}}"`。显式 `Authorization` Header 优先。

## 17. 插值和 JSONPath

插值语法：`{{path.to.value}}`。

- 纯表达式保留原始类型。
- 混合文本转换为字符串。
- 对象和数组递归插值。
- 找不到路径时，行内插值为空字符串。

JSONPath 支持：

- `$`、`$.data.url`、`$['data-key']`
- `$.items[0]`、负数下标、`$.items[*]`
- `$..id`
- `$.items[?(@.enabled==true)]`
- 过滤运算符 `==`、`!=`、`>`、`>=`、`<`、`<=`、`=~`

## 18. 本地 httpbin Mock

Token、multipart 上传和整表提交均可使用：

```text
POST http://127.0.0.1/post
```

典型上传响应：

```json
{
  "files": { "file": "文件文本内容" },
  "form": { "projectCode": "P001" },
  "headers": { "Authorization": "Bearer mock-token" }
}
```

## 19. 常见问题

### 模板不可用

- 检查 `formConfig`、`formData` 和根字段限制。
- 检查 `__form.submit` 是否为数组。
- 普通字段和 `Form.List` 必须有 `keyName`。
- 容器必须有非空 `children`。

### HttpUpload 不请求

- `component` 必须是 `HttpUpload`。
- 检查 `upload.http.url` 和非空 `responseMappings`。
- 检查 `maxSizeMB`。

### HTTP 成功但显示失败

通常是响应 JSONPath 无匹配。悬浮结果图标查看原始响应并修正 `responseMappings`。

### Token 未加入 Header

- 检查 `upload.auth.bearer` 的 JSONPath。
- `upload.auth.bearer` 不要带 `Bearer ` 前缀。
- 检查显式 `Authorization` 是否覆盖自动 Bearer。

### 两套 Token 混淆

- 字段上传使用 `upload.auth`。
- 整表提交使用 `__form.auth`。
- 两者互不共享，需分别配置。

## 20. 使用和调试

1. 打开 JSON 文件。
2. 运行 `Data Render: Preview Current File`。
3. 修改扩展源码后执行：

```bash
npm run compile
npm run build
```

4. 重启 Extension Development Host，或运行 `Developer: Reload Window`。

建议从完整示例复制后逐步删减：[`examples/22-antd-form-modern-complex-http-upload.json`](../examples/22-antd-form-modern-complex-http-upload.json)

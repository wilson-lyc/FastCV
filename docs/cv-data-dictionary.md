# FastCV CV 数据字典

## 1. 文档地位

本文档是 FastCV CV 数据模型的**唯一真源（Single Source of Truth）**。

所有前端表单、浏览器存储、IndexedDB 快照、职位档案、JSON 备份恢复、网页字段映射和 Jev 决策工作流都必须遵守本文档。实现中不得自行增加、重命名、改变类型或改变含义。字段变化必须先修改本文档；仅当变更不兼容旧快照时提升 `schemaVersion`。本次基础信息扩展均为可选字段，旧快照读取时会补齐默认空值，因此继续使用 `schemaVersion: 1`。

本文档定义的是 FastCV 内部的结构化个人资料，不定义招聘网站的字段名。招聘网站字段必须映射到本文档中的标准路径后才能参与填写。

## 2. 产品边界

- 数据只能由用户在 FastCV 内手动创建、编辑和确认。
- 支持导出和导入 FastCV 自有格式的 JSON 备份。
- 不支持上传 PDF/DOCX 简历、OCR、文本粘贴解析或任意 JSON 自动转换成 CV。
- JSON 备份恢复不是简历解析；备份文件必须包含 FastCV 格式标识和版本信息。
- 本字典中的事实值不能由 Jev 或其他模型凭空生成。
- 缺少值使用 `null` 或空数组，不使用模型猜测、不使用无意义的占位字符串。
- V1 中所有用户可见、用户维护的 CV 字段均为可选；界面不显示逐字段的“可选”标签，也不会因为字段为空阻止保存。表格中的“系统必填”只用于标记系统生成的结构字段（例如 UUID、版本指针）。
- 页面不得因为档案不完整阻止保存、导出或创建版本；招聘网站的必填校验留给招聘网站处理。

## 3. 规范性约定

### 3.1 字段路径

字段路径使用 JSON 风格的 `camelCase`，数组元素使用 `[]` 表示。例如：

```text
basics.fullName
experience[].companyName
experience[].achievements[]
application.workAuthorization.status
```

字段路径一旦发布即不可复用。字段废弃后保留旧路径的迁移说明，不得把新含义写入旧路径。

### 3.2 类型

| 类型 | 规范 |
| --- | --- |
| `string` | UTF-8 字符串，除非另有说明不得包含 HTML 或脚本 |
| `boolean` | `true` 或 `false`；未回答使用 `null` |
| `integer` | 十进制整数，不得使用字符串保存数字 |
| `number` | 十进制数，必须定义取值范围或单位 |
| `date` | `YYYY-MM-DD` |
| `yearMonth` | `YYYY-MM`，适合只有年月的经历 |
| `enum` | 只能取本文档规定的枚举值 |
| `object` | 固定结构对象，不允许任意动态键 |
| `array<T>` | 有顺序的 `T` 数组；是否允许重复由字段定义 |
| `url` | `https://` 或 `http://` URL；禁止保存 JavaScript URL |
| `email` | 合法邮箱格式，最长 320 字符 |
| `phone` | 用户输入的国际或本地电话号码字符串，最长 32 字符 |
| `countryCode` | ISO 3166-1 alpha-2 大写代码，例如 `CN`、`US` |
| `languageCode` | BCP 47 语言代码，例如 `zh-CN`、`en-US` |
| `currency` | ISO 4217 大写代码，例如 `CNY`、`USD` |

### 3.3 日期区间

所有经历区间都使用以下结构：

```json
{
  "startDate": "2021-07",
  "endDate": null,
  "isCurrent": true
}
```

规则：

- `startDate` 如填写，允许 `yearMonth` 或 `date`；
- `endDate` 在 `isCurrent=true` 时必须为 `null`；
- `isCurrent=true` 时展示为“至今”；
- `isCurrent=false` 时，如同时填写 `startDate` 和 `endDate`，`endDate` 不得早于 `startDate`；
- 不允许使用自由文本填写“目前”“待定”“约三年”等日期值。

### 3.4 字段元数据

业务对象中的用户字段不额外包裹 `value` 对象，字段本身直接保存值。版本、来源和变更信息由档案版本层保存：

```text
profileVersions[].versionId
profileVersions[].createdAt
profileVersions[].createdBy
profileVersions[].snapshot
```

因此不得把 `fullName` 保存成 `{ value, updatedAt, source }`，除非未来单独修订本字典。

## 4. 敏感级别与填写策略

### 4.1 敏感级别

| 级别 | 含义 | 示例 |
| --- | --- | --- |
| `public` | 可在公开简历或公开主页出现 | 职位、技能、作品链接 |
| `personal` | 个人联系方式或可识别信息 | 邮箱、电话、所在地 |
| `sensitive` | 不应默认发送给模型或填入网站 | 薪资、身份证明、签证 |
| `restricted` | 高度敏感，默认不自动填写 | 健康、残障、种族、犯罪记录、家庭关系 |

### 4.2 默认填写策略

| 策略 | 含义 |
| --- | --- |
| `auto` | 用户确认本次填写后，可自动写入 |
| `confirm` | 必须在预览中逐项确认后才能写入 |
| `never` | FastCV 不自动写入，用户只能手工处理 |

敏感级别和填写策略都是产品安全约束，不得因为 Jev 置信度高而降低。

## 5. 顶层档案结构

一个基础档案或职位档案的 `snapshot` 结构如下：

```text
snapshot
├── basics
├── contact
├── location
├── objective
├── jobContext
├── experience[]
├── education[]
├── projects[]
├── skills[]
├── certifications[]
├── languages[]
├── publications[]
├── awards[]
├── volunteering[]
├── links[]
└── application
```

未使用的信息域保存为空数组或 `null`。不得删除必需的顶层对象后由读取方自行猜测。

## 6. 基础身份与联系方式

### 6.1 `basics`

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `basics.fullName` | `string` | 否 | `personal` | `confirm` | 用户正式姓名，最长 200 字符 |
| `basics.givenName` | `string` | 否 | `personal` | `confirm` | 名；网站要求拆分姓名时使用 |
| `basics.familyName` | `string` | 否 | `personal` | `confirm` | 姓；网站要求拆分姓名时使用 |
| `basics.preferredName` | `string` | 否 | `personal` | `confirm` | 希望招聘方称呼的姓名 |
| `basics.nameLatin` | `string` | 否 | `personal` | `confirm` | 姓名拼音或英文姓名；不能由模型音译生成 |
| `basics.headline` | `string` | 否 | `public` | `auto` | 职业标题，最长 160 字符 |
| `basics.summary` | `string` | 否 | `public` | `confirm` | 用户手动维护的个人简介或自我评价，最长 5000 字符；沿用原字段路径以兼容既有快照 |
| `basics.gender` | `enum` | 否 | `restricted` | `never` | 见 `gender` 枚举；默认不展示 |
| `basics.genderSelfDescription` | `string` | 否 | `restricted` | `never` | 兼容旧数据的补充说明；当前界面不再提供“自定义”性别选项 |
| `basics.birthDate` | `date` | 否 | `restricted` | `never` | 出生日期，默认不填写 |
| `basics.politicalStatus` | `string` | 否 | `restricted` | `never` | 政治面貌；用户手工填写，不自动写入网站 |
| `basics.idNumber` | `string` | 否 | `sensitive` | `never` | 身份证件号码；默认不填写、不自动发送 |
| `basics.maritalHistory` | `string` | 否 | `restricted` | `never` | 婚史；用户手工填写，不自动写入网站 |
| `basics.ethnicity` | `string` | 否 | `restricted` | `never` | 民族；用户手工填写，不自动写入网站 |
| `basics.nativePlace` | `string` | 否 | `personal` | `never` | 籍贯 |
| `basics.birthplace` | `string` | 否 | `personal` | `never` | 出生地 |
| `basics.studentSourcePlace` | `string` | 否 | `personal` | `never` | 生源地 |

### 6.2 `contact`

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `contact.primaryEmail` | `email` | 否 | `personal` | `confirm` | 主邮箱 |
| `contact.secondaryEmail` | `email` | 否 | `personal` | `confirm` | 备用邮箱 |
| `contact.primaryPhone` | `phone` | 否 | `personal` | `confirm` | 主电话 |
| `contact.secondaryPhone` | `phone` | 否 | `personal` | `confirm` | 备用电话 |
| `contact.preferredChannel` | `enum` | 否 | `personal` | `auto` | `email`、`phone`、`other` |

## 7. 所在地与求职意向

### 7.1 `location`

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `location.currentCountry` | `countryCode` | 否 | `personal` | `confirm` | 当前所在国家/地区 |
| `location.currentCity` | `string` | 否 | `personal` | `confirm` | 当前城市，最长 120 字符 |
| `location.currentRegion` | `string` | 否 | `personal` | `confirm` | 州、省或地区 |
| `location.postalCode` | `string` | 否 | `sensitive` | `never` | 邮政编码 |
| `location.address` | `string` | 否 | `sensitive` | `never` | 详细地址，默认不填写 |

### 7.2 `objective`

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `objective.targetTitles[]` | `array<string>` | 否 | `public` | `auto` | 目标职位名称，最多 10 个 |
| `objective.targetIndustries[]` | `array<string>` | 否 | `public` | `auto` | 目标行业，最多 10 个 |
| `objective.targetLocations[]` | `array<string>` | 否 | `personal` | `confirm` | 期望工作地点，最多 20 个 |
| `objective.employmentTypes[]` | `array<enum>` | 否 | `public` | `auto` | 见 `employmentType` |
| `objective.remotePreference` | `enum` | 否 | `public` | `auto` | 见 `remotePreference` |
| `objective.availableFrom` | `date` | 否 | `personal` | `confirm` | 最早可到岗日期 |
| `objective.willingToRelocate` | `boolean` | 否 | `personal` | `confirm` | 是否愿意搬迁；未回答为 `null` |
| `objective.willingToTravel` | `enum` | 否 | `personal` | `confirm` | 见 `travelPreference` |
| `objective.expectedSalary` | `object` | 否 | `sensitive` | `confirm` | 见薪资对象定义 |

`objective.expectedSalary`：

```text
expectedSalary
├── min: number | null
├── max: number | null
├── currency: currency
├── period: enum(year/month/week/day)
└── negotiable: boolean | null
```

薪资对象中的所有字段均可为空；如果同时填写 `min` 和 `max`，则 `max >= min`。填写薪资时尽量同时填写 `currency` 和 `period`，但产品不得因此阻止保存。

### 7.3 `jobContext`

该信息域只用于 `job_specific` 档案。基础档案中必须保存为 `null`；职位档案中所有字段均由用户手动维护。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `jobContext.targetCompany` | `string` | 否 | `public` | `auto` | 目标公司名称 |
| `jobContext.targetRole` | `string` | 否 | `public` | `auto` | 目标职位名称 |
| `jobContext.targetLocation` | `string` | 否 | `personal` | `confirm` | 目标工作地点 |
| `jobContext.jobUrl` | `url` | 否 | `personal` | `confirm` | 职位页面链接 |
| `jobContext.notes` | `string` | 否 | `personal` | `never` | 用户自己的准备备注，最长 5000 字符，不自动填写 |

## 8. 工作经历

`experience[]` 最多 20 条，按用户指定顺序保存。每条记录必须有稳定的 `id`，不得使用数组下标作为引用。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `experience[].id` | `string` | 是 | `personal` | `never` | UUID；系统字段，不展示给招聘网站 |
| `experience[].companyName` | `string` | 否 | `public` | `auto` | 公司名称，最长 200 字符 |
| `experience[].jobTitle` | `string` | 否 | `public` | `auto` | 职位名称，最长 200 字符 |
| `experience[].employmentType` | `enum` | 否 | `public` | `auto` | 见 `employmentType` |
| `experience[].employmentTypeOther` | `string` | 否 | `public` | `confirm` | 仅当 `employmentType=other` 时允许填写 |
| `experience[].country` | `countryCode` | 否 | `personal` | `confirm` | 工作国家/地区 |
| `experience[].city` | `string` | 否 | `personal` | `confirm` | 工作城市 |
| `experience[].startDate` | `yearMonth/date` | 否 | `public` | `auto` | 开始时间 |
| `experience[].endDate` | `yearMonth/date/null` | 否 | `public` | `auto` | 与 `isCurrent` 联动 |
| `experience[].isCurrent` | `boolean` | 否 | `public` | `auto` | 是否为当前工作 |
| `experience[].description` | `string` | 否 | `public` | `confirm` | 职责概述，最长 5000 字符 |
| `experience[].achievements[]` | `array<object>` | 否 | `public` | `confirm` | 成果列表，最多 20 条 |
| `experience[].skillsUsed[]` | `array<string>` | 否 | `public` | `auto` | 引用 `skills[].name` 的标准名称 |
| `experience[].companyUrl` | `url` | 否 | `public` | `auto` | 公司公开主页 |

`experience[].achievements[]`：

```text
achievement
├── id: string
├── text: string
├── metric: string | null
└── featured: boolean
```

`text` 最长 1200 字符。`metric` 只能记录用户提供的数字或结果，不由模型补全。`featured=true` 表示该成果可优先展示，但不改变事实内容。

## 9. 教育经历

`education[]` 最多 15 条，按用户指定顺序保存。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `education[].id` | `string` | 是 | `personal` | `never` | UUID |
| `education[].institutionName` | `string` | 否 | `public` | `auto` | 学校或教育机构 |
| `education[].degreeLevel` | `enum` | 否 | `public` | `auto` | 见 `degreeLevel` |
| `education[].degreeLevelOther` | `string` | 否 | `public` | `confirm` | 仅当 `degreeLevel=other` 时允许填写 |
| `education[].degreeName` | `string` | 否 | `public` | `auto` | 学位名称 |
| `education[].fieldOfStudy` | `string` | 否 | `public` | `auto` | 专业或研究方向 |
| `education[].country` | `countryCode` | 否 | `personal` | `confirm` | 学校国家/地区 |
| `education[].city` | `string` | 否 | `personal` | `confirm` | 学校城市 |
| `education[].startDate` | `yearMonth/date` | 否 | `public` | `auto` | 开始时间 |
| `education[].endDate` | `yearMonth/date/null` | 否 | `public` | `auto` | 结束时间 |
| `education[].isCurrent` | `boolean` | 否 | `public` | `auto` | 是否在读 |
| `education[].grade` | `string` | 否 | `public` | `confirm` | 成绩或 GPA，按原始表达保存 |
| `education[].gradeScale` | `string` | 否 | `public` | `confirm` | 成绩满分制 |
| `education[].description` | `string` | 否 | `public` | `confirm` | 课程、研究或活动说明 |

## 10. 项目经历

`projects[]` 最多 30 条，适合记录独立项目、开源项目、课程项目或作品。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `projects[].id` | `string` | 是 | `personal` | `never` | UUID |
| `projects[].name` | `string` | 否 | `public` | `auto` | 项目名称 |
| `projects[].role` | `string` | 否 | `public` | `auto` | 项目角色 |
| `projects[].organization` | `string` | 否 | `public` | `auto` | 所属组织 |
| `projects[].startDate` | `yearMonth/date` | 否 | `public` | `auto` | 开始时间 |
| `projects[].endDate` | `yearMonth/date/null` | 否 | `public` | `auto` | 结束时间 |
| `projects[].isCurrent` | `boolean` | 否 | `public` | `auto` | 是否仍在进行 |
| `projects[].summary` | `string` | 否 | `public` | `confirm` | 项目背景和目标 |
| `projects[].responsibilities[]` | `array<string>` | 否 | `public` | `confirm` | 职责列表，最多 20 条 |
| `projects[].achievements[]` | `array<object>` | 否 | `public` | `confirm` | 复用成果对象，最多 20 条 |
| `projects[].technologies[]` | `array<string>` | 否 | `public` | `auto` | 技术栈 |
| `projects[].url` | `url` | 否 | `public` | `auto` | 项目公开链接 |

## 11. 技能

`skills[]` 最多 100 条。技能名称是用户维护的事实，Jev 可以帮助进行网页字段匹配，但不能新增用户未确认的技能。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `skills[].id` | `string` | 是 | `personal` | `never` | UUID |
| `skills[].name` | `string` | 否 | `public` | `auto` | 标准展示名称 |
| `skills[].category` | `enum` | 否 | `public` | `auto` | 见 `skillCategory` |
| `skills[].categoryOther` | `string` | 否 | `public` | `confirm` | 仅当 `category=other` 时允许填写 |
| `skills[].proficiency` | `enum` | 否 | `public` | `confirm` | 见 `proficiency` |
| `skills[].yearsOfExperience` | `number` | 否 | `public` | `confirm` | 0 至 80，最多 1 位小数 |
| `skills[].lastUsedDate` | `yearMonth/date` | 否 | `public` | `confirm` | 最近使用时间 |
| `skills[].aliases[]` | `array<string>` | 否 | `public` | `auto` | 同义词或网站常用写法 |
| `skills[].evidenceRefs[]` | `array<object>` | 否 | `public` | `never` | 关联经历/项目引用 |

`skills[].evidenceRefs[]` 只能引用 `experience[].id` 或 `projects[].id`，不能保存任意路径。

## 12. 证书、语言和其他经历

### 12.1 `certifications[]`

最多 30 条。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `certifications[].id` | `string` | 是 | `personal` | `never` | UUID |
| `certifications[].name` | `string` | 否 | `public` | `auto` | 证书名称 |
| `certifications[].issuer` | `string` | 否 | `public` | `auto` | 颁发机构 |
| `certifications[].issueDate` | `date/yearMonth` | 否 | `public` | `auto` | 获得日期 |
| `certifications[].expiryDate` | `date/yearMonth/null` | 否 | `sensitive` | `confirm` | 失效日期 |
| `certifications[].credentialId` | `string` | 否 | `sensitive` | `confirm` | 证书编号 |
| `certifications[].credentialUrl` | `url` | 否 | `sensitive` | `confirm` | 验证链接 |

### 12.2 `languages[]`

最多 20 条。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `languages[].id` | `string` | 是 | `personal` | `never` | UUID |
| `languages[].language` | `string` | 否 | `public` | `auto` | 语言名称 |
| `languages[].languageCode` | `string` | 否 | `public` | `auto` | BCP 47 或 ISO 639 代码 |
| `languages[].proficiency` | `enum` | 否 | `public` | `auto` | 见 `languageProficiency` |
| `languages[].testName` | `string` | 否 | `public` | `confirm` | 语言考试名称 |
| `languages[].score` | `string` | 否 | `public` | `confirm` | 考试成绩，按原始格式保存 |
| `languages[].testDate` | `date/yearMonth` | 否 | `public` | `confirm` | 考试日期 |

### 12.3 `publications[]`

最多 30 条。字段为 `id`、`title`、`authors`、`publisher`、`publicationDate`、`description`、`url`、`doi`。

所有字段均可选；`doi` 最长 200 字符。

### 12.4 `awards[]`

最多 30 条。字段为 `id`、`name`、`issuer`、`date`、`description`、`url`。

所有字段均可选。

### 12.5 `volunteering[]`

最多 20 条，结构与工作经历相近：`id`、`organization`、`role`、`startDate`、`endDate`、`isCurrent`、`description`、`achievements[]`、`url`。

所有字段均可选。

## 13. 公开链接

`links[]` 最多 30 条，用于保存与个人公开身份相关的链接。

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `links[].id` | `string` | 是 | `personal` | `never` | UUID |
| `links[].type` | `enum` | 否 | `public` | `auto` | 见 `linkType` |
| `links[].typeOther` | `string` | 否 | `public` | `confirm` | 仅当 `type=other` 时允许填写 |
| `links[].label` | `string` | 否 | `public` | `auto` | 用户自定义展示名称 |
| `links[].url` | `url` | 否 | `public` | `auto` | 公开链接 |
| `links[].isPublic` | `boolean` | 否 | `public` | `confirm` | 是否允许出现在职位档案 |

## 14. 招聘表单附加数据

以下字段不是公开 CV 内容，但属于 FastCV 为了填写招聘申请表而维护的用户事实。它们必须与 CV 内容分开管理，默认不自动填写。

### 14.1 `application`

| 字段路径 | 类型 | 系统必填 | 敏感级别 | 默认策略 | 说明与约束 |
| --- | --- | --- | --- | --- | --- |
| `application.workAuthorization.country` | `countryCode` | 否 | `sensitive` | `confirm` | 授权所属国家/地区 |
| `application.workAuthorization.status` | `enum` | 否 | `sensitive` | `confirm` | 见 `workAuthorizationStatus` |
| `application.workAuthorization.visaType` | `string` | 否 | `sensitive` | `never` | 签证或许可类型 |
| `application.workAuthorization.expiryDate` | `date` | 否 | `sensitive` | `never` | 许可失效日期 |
| `application.sponsorshipRequired` | `boolean` | 否 | `sensitive` | `confirm` | 是否需要雇主担保；未回答为 `null` |
| `application.noticePeriodDays` | `integer` | 否 | `personal` | `confirm` | 0 至 365 天 |
| `application.availableDate` | `date` | 否 | `personal` | `confirm` | 可开始工作的日期 |
| `application.expectedSalary` | `object` | 否 | `sensitive` | `confirm` | 复用 `objective.expectedSalary` 结构 |
| `application.remotePreference` | `enum` | 否 | `personal` | `confirm` | 复用 `remotePreference` |
| `application.relocationPreference` | `enum` | 否 | `personal` | `confirm` | 见 `relocationPreference` |
| `application.travelPreference` | `enum` | 否 | `personal` | `confirm` | 见 `travelPreference` |

健康、残障、宗教、性取向、犯罪记录、家庭关系等受保护或高风险问卷字段不纳入当前数据字典，不能由模型代答或自动保存。民族字段仅用于用户在基础资料中自行维护，敏感级别为 `restricted`、默认策略为 `never`；其他网站问卷中的种族或民族字段仍只能提示用户手工处理。

## 15. 枚举字典

### 15.1 `gender`

```text
male
female
prefer_not_to_say
```

当前界面只提供“男、女、保密”三个选项；旧数据中的 `non_binary` 和 `self_described` 值仍可读取，但不再作为新选项提供。

### 15.2 `employmentType`

```text
full_time
part_time
contract
freelance
internship
apprenticeship
temporary
volunteer
other
```

### 15.3 `remotePreference`

```text
onsite
hybrid
remote
flexible
unknown
```

### 15.4 `travelPreference`

```text
none
occasional
frequent
fully_flexible
unknown
```

### 15.5 `relocationPreference`

```text
willing
not_willing
case_by_case
unknown
```

### 15.6 `workAuthorizationStatus`

```text
authorized
requires_sponsorship
not_authorized
unknown
```

`unknown` 表示用户尚未确认，不表示“否”。插件不得将 `unknown` 映射成任何肯定或否定选项。

### 15.7 `degreeLevel`

```text
high_school
associate
bachelor
master
doctorate
professional
certificate
bootcamp
other
```

### 15.8 `proficiency`

```text
beginner
elementary
intermediate
upper_intermediate
advanced
expert
unknown
```

### 15.9 `languageProficiency`

```text
basic
conversational
professional
fluent
native
unknown
```

### 15.10 `skillCategory`

```text
programming_language
framework
library
database
cloud
devops
tool
methodology
domain
soft_skill
other
```

### 15.11 `linkType`

```text
personal_website
portfolio
github
gitlab
linkedin
blog
publication
demo
other
```

## 16. 档案类型、版本和备份

### 16.1 档案类型

```text
base
job_specific
```

`base` 是用户的事实档案；`job_specific` 基于某个基础档案版本，并允许覆盖展示顺序、目标职位、摘要、技能选择和经历选择。

### 16.1.1 `profiles[]` 档案对象

```text
profile
├── profileId: string
├── profileType: enum(base/job_specific)
├── displayName: string
├── baseProfileId: string | null
├── currentVersionId: string
├── createdAt: ISO 8601 datetime
├── updatedAt: ISO 8601 datetime
└── archived: boolean
```

`baseProfileId` 仅在 `profileType=job_specific` 时必填；基础档案的 `baseProfileId` 必须为 `null`。`currentVersionId` 必须指向同一 `profileId` 的有效版本。

### 16.1.2 `profileVersions[]` 版本对象

```text
profileVersion
├── versionId: string
├── profileId: string
├── profileType: enum(base/job_specific)
├── baseProfileId: string | null
├── baseVersionId: string | null
├── schemaVersion: integer
├── createdAt: ISO 8601 datetime
├── createdBy: enum(user/backup_restore/system_migration)
├── note: string | null
└── snapshot: object
```

`snapshot` 必须符合本文档第 5 节定义的顶层档案结构。`createdBy=system_migration` 只能用于数据迁移，不表示模型生成了档案内容。

### 16.1.3 `profileDrafts[]` 草稿对象

```text
profileDraft
├── profileId: string
├── updatedAt: ISO 8601 datetime
└── snapshot: object
```

草稿用于自动保存用户正在编辑的内容，不属于正式历史版本。导出备份时必须包含草稿；导入草稿时需要经过用户确认，并恢复到对应档案的编辑状态。

### 16.2 JSON 备份外层格式

FastCV 本地备份必须使用以下外层结构：

```json
{
  "format": "fastcv-backup",
  "formatVersion": 1,
  "exportedAt": "2026-09-22T12:00:00Z",
  "profiles": [],
  "profileVersions": [],
  "profileDrafts": [],
  "siteRules": [],
  "metadata": {
    "appVersion": "0.1.0"
  }
}
```

约束：

- `format` 必须精确为 `fastcv-backup`；
- `formatVersion` 用于备份格式迁移；
- `profiles`、`profileVersions` 和 `profileDrafts` 必须符合本文档定义；
- 备份不得包含模型会话、原始网页 DOM、页面截图、访问令牌或密码；
- 导入前必须校验结构、枚举、日期、引用关系和完整性；
- 导入恢复生成新的本地版本，不覆盖现有历史版本。

### 16.3 数据库 Schema 版本

IndexedDB 的数据库版本用于对象存储和索引迁移；`formatVersion` 用于 JSON 备份格式迁移；`profileVersions[].schemaVersion` 用于 CV 字段迁移。三者不可混用。

## 17. 与表单填写的关系

### 17.1 映射原则

- 招聘网站字段必须映射到本文档的标准路径。
- 一个网站字段可以有多个候选来源，但只有用户确认的一个来源能进入填写计划。
- 一个 CV 字段可以映射到多个网站字段，但每个目标字段都要独立校验。
- 网站字段没有对应标准路径时，进入人工处理，不新增临时字段写入档案。
- 网站的展示文本、选择值和内部值必须通过转换器映射，不能直接把网站字符串写回 CV。

### 17.2 Jev 的边界

Jev 只能在本文档允许的字段路径和枚举集合中进行 `Choice`、`Score` 或 `Noul` 决策。它可以：

- 判断网页字段对应哪个标准字段；
- 对候选 CV 字段进行匹配评分；
- 判断网页选项与标准枚举的对应关系；
- 判断是否需要人工确认。

Jev 不得：

- 创建本文档不存在的字段；
- 创造用户没有手动维护的事实；
- 把 `unknown` 转换成 `yes` 或 `no`；
- 直接生成网页脚本、CSS 选择器或提交动作；
- 改变字段的敏感级别或默认填写策略。

## 18. 变更规则

任何数据字段变更必须同时说明：

1. 字段路径是否新增、修改或废弃；
2. 类型、必填性、敏感级别和默认填写策略是否变化；
3. 旧数据如何迁移；
4. JSON 备份如何兼容；
5. 网页映射和 Jev 问题定义是否需要更新；
6. 是否提升 `schemaVersion` 或 `formatVersion`。

仅新增可选字段且读取方可为旧快照补齐默认空值时，允许保持 `schemaVersion` 不变，但必须在本文档列出字段并说明旧数据兼容方式。移除字段、改变类型或含义、改变必填性，或无法兼容读取旧快照时，必须提升 `schemaVersion` 并定义迁移。未经本文档更新和评审，禁止在代码中增加未定义的 CV 字段、枚举值或隐式字段。

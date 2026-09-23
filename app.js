const DB_NAME = "fastcv-v1";
const DB_VERSION = 1;
const SCHEMA_VERSION = 1;

let db;
let state = {
  profiles: [],
  activeProfileId: null,
  profile: null,
  snapshot: null,
  activeSection: "basics",
};
let saveTimer;
let saveStatusTimer;
let toastTimer;
let profileEditorMode = "create";
let profileEditorId = null;
let confirmResolver = null;

const SELECTS = {
  gender: ["male", "female", "prefer_not_to_say"],
  preferredChannel: ["email", "phone", "other"],
  employmentType: ["full_time", "part_time", "contract", "freelance", "internship", "apprenticeship", "temporary", "volunteer", "other"],
  remotePreference: ["onsite", "hybrid", "remote", "flexible", "unknown"],
  travelPreference: ["none", "occasional", "frequent", "fully_flexible", "unknown"],
  relocationPreference: ["willing", "not_willing", "case_by_case", "unknown"],
  workAuthorizationStatus: ["authorized", "requires_sponsorship", "not_authorized", "unknown"],
  degreeLevel: ["high_school", "associate", "bachelor", "master", "doctorate", "professional", "certificate", "bootcamp", "other"],
  proficiency: ["beginner", "elementary", "intermediate", "upper_intermediate", "advanced", "expert", "unknown"],
  languageProficiency: ["basic", "conversational", "professional", "fluent", "native", "unknown"],
  skillCategory: ["programming_language", "framework", "library", "database", "cloud", "devops", "tool", "methodology", "domain", "soft_skill", "other"],
  linkType: ["personal_website", "portfolio", "github", "gitlab", "linkedin", "blog", "publication", "demo", "other"],
  salaryPeriod: ["year", "month", "week", "day"],
};

const LABELS = {
  female: "女", male: "男", prefer_not_to_say: "保密",
  email: "邮箱", phone: "电话", other: "其他", full_time: "全职", part_time: "兼职", contract: "合同制", freelance: "自由职业", internship: "实习", apprenticeship: "学徒", temporary: "临时", volunteer: "志愿",
  onsite: "现场办公", hybrid: "混合办公", remote: "远程办公", flexible: "均可", none: "不出差", occasional: "偶尔出差", frequent: "经常出差", fully_flexible: "完全灵活",
  willing: "愿意", not_willing: "不愿意", case_by_case: "视情况而定", authorized: "已获得授权", requires_sponsorship: "需要担保", not_authorized: "未获得授权", unknown: "尚未确认",
  high_school: "高中", associate: "专科", bachelor: "本科", master: "硕士", doctorate: "博士", professional: "职业学位", certificate: "证书", bootcamp: "训练营",
  beginner: "入门", elementary: "基础", intermediate: "中等", upper_intermediate: "中高级", advanced: "高级", expert: "专家",
  basic: "基础", conversational: "日常交流", professional: "工作熟练", fluent: "流利", native: "母语",
  programming_language: "编程语言", framework: "框架", library: "库", database: "数据库", cloud: "云平台", devops: "DevOps", tool: "工具", methodology: "方法论", domain: "领域知识", soft_skill: "软技能",
  year: "年", month: "月", week: "周", day: "日",
  personal_website: "个人网站", portfolio: "作品集", github: "GitHub", gitlab: "GitLab", linkedin: "LinkedIn", blog: "博客", publication: "出版物", demo: "演示",
};

function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, source) {
  if (source === null) return null;
  if (Array.isArray(base)) return Array.isArray(source) ? source : base;
  if (base && typeof base === "object") {
    const result = { ...base };
    if (source && typeof source === "object") {
      Object.keys(source).forEach((key) => { result[key] = key in base ? deepMerge(base[key], source[key]) : source[key]; });
    }
    return result;
  }
  return source === undefined ? base : source;
}

function emptySnapshot() {
  return {
    basics: { fullName: "", givenName: "", familyName: "", preferredName: "", nameLatin: "", headline: "", summary: "", gender: null, genderSelfDescription: "", birthDate: null },
    contact: { primaryEmail: "", secondaryEmail: "", primaryPhone: "", secondaryPhone: "", preferredChannel: null },
    location: { currentCountry: "", currentCity: "", currentRegion: "", postalCode: "", address: "" },
    objective: { targetTitles: [], targetIndustries: [], targetLocations: [], employmentTypes: [], remotePreference: null, availableFrom: null, willingToRelocate: null, willingToTravel: null, expectedSalary: { min: null, max: null, currency: "", period: null, negotiable: null } },
    jobContext: null,
    experience: [], education: [], projects: [], skills: [], certifications: [], languages: [], publications: [], awards: [], volunteering: [], links: [],
    application: { workAuthorization: { country: "", status: null, visaType: "", expiryDate: null }, sponsorshipRequired: null, noticePeriodDays: null, availableDate: null, expectedSalary: { min: null, max: null, currency: "", period: null, negotiable: null }, remotePreference: null, relocationPreference: null, travelPreference: null },
  };
}

function normalizeSnapshot(snapshot) {
  return deepMerge(emptySnapshot(), snapshot || {});
}

function parsePath(path) {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

function getPath(object, path) {
  return parsePath(path).reduce((value, key) => value == null ? undefined : value[key], object);
}

function setPath(object, path, value) {
  const keys = parsePath(path);
  let cursor = object;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) cursor[key] = value;
    else {
      if (cursor[key] == null) cursor[key] = /^\d+$/.test(keys[index + 1]) ? [] : {};
      cursor = cursor[key];
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function displayOption(value) {
  return LABELS[value] || String(value).replaceAll("_", " ");
}

function inputValue(value, kind) {
  if (kind === "arrayText") return Array.isArray(value) ? value.join(", ") : "";
  if (kind === "lines") return Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : item.text || "").join("\n") : "";
  if (kind === "refs") return Array.isArray(value) ? value.map((item) => item.id || "").join("\n") : "";
  if (value === null || value === undefined) return "";
  return value;
}

function selectLabel(value, kind) {
  if (value === "") return "未设置";
  if (kind === "boolean") return value === "true" ? "是" : "否";
  return displayOption(value);
}

const DATE_PICKER_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const DATE_PICKER_MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

function padDatePart(value) { return String(value).padStart(2, "0"); }

function parsePickerValue(value, kind) {
  const match = String(value || "").match(kind === "date" ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: kind === "date" ? Number(match[3]) : null };
}

function pickerValue({ year, month, day }, kind) {
  return `${year}-${padDatePart(month + 1)}${kind === "date" ? `-${padDatePart(day)}` : ""}`;
}

function formatPickerValue(value, kind) {
  const parsed = parsePickerValue(value, kind);
  if (!parsed) return kind === "date" ? "请选择日期" : "请选择月份";
  return kind === "date" ? `${parsed.year}年${parsed.month + 1}月${parsed.day}日` : `${parsed.year}年${parsed.month + 1}月`;
}

function customDateHtml({ path, kind, value }) {
  const selectedValue = value == null ? "" : String(value);
  const placeholder = kind === "date" ? "请选择日期" : "请选择月份";
  return `<div class="custom-date" data-date-root data-value="${escapeHtml(selectedValue)}">
    <button class="custom-date-trigger${selectedValue ? " has-value" : ""}" type="button" aria-haspopup="dialog" aria-expanded="false" data-date-trigger data-path="${path}" data-kind="${kind}" data-value="${escapeHtml(selectedValue)}">
      <span class="custom-date-leading" aria-hidden="true"><span class="custom-date-icon"></span></span>
      <span data-date-label>${escapeHtml(selectedValue ? formatPickerValue(selectedValue, kind) : placeholder)}</span>
      <span class="custom-select-chevron" aria-hidden="true"></span>
    </button>
    <div class="custom-date-popover" role="dialog" aria-label="${kind === "date" ? "选择日期" : "选择月份"}" hidden></div>
  </div>`;
}

function datePickerToday(kind) {
  const today = new Date();
  return pickerValue({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() }, kind);
}

function renderDatePicker(root) {
  const kind = root.querySelector("[data-date-trigger]")?.dataset.kind || "date";
  const trigger = root.querySelector("[data-date-trigger]");
  const selectedValue = trigger?.dataset.value || "";
  const viewYear = Number(root.dataset.viewYear);
  const viewMonth = Number(root.dataset.viewMonth);
  const todayValue = datePickerToday(kind);
  const editingPeriod = root.dataset.datePickerEditing || "";
  const yearPageStart = Number(root.dataset.datePickerYearStart || viewYear - 4);
  const yearControl = editingPeriod === "year"
    ? `<strong>请选择年份</strong>`
    : `<button class="date-picker-period-button" type="button" data-date-edit-year aria-label="选择年份">${viewYear}年</button>`;
  const monthControl = kind === "date" && !editingPeriod
    ? `<button class="date-picker-period-button" type="button" data-date-edit-month aria-label="选择月份" aria-expanded="${editingPeriod === "month"}">${viewMonth + 1}月</button>`
    : "";
  const previousLabel = editingPeriod === "year" ? "上一组年份" : editingPeriod === "month" || kind === "month" ? "上一年" : "上一个月";
  const nextLabel = editingPeriod === "year" ? "下一组年份" : editingPeriod === "month" || kind === "month" ? "下一年" : "下一个月";
  const navigation = kind === "date"
    ? `<button class="date-picker-nav" type="button" data-date-nav="-1" aria-label="${previousLabel}">‹</button><div class="date-picker-heading"><div class="date-picker-period">${yearControl}${monthControl}</div></div><button class="date-picker-nav" type="button" data-date-nav="1" aria-label="${nextLabel}">›</button>`
    : `<button class="date-picker-nav" type="button" data-date-nav="-1" aria-label="${previousLabel}">‹</button><div class="date-picker-heading">${yearControl}</div><button class="date-picker-nav" type="button" data-date-nav="1" aria-label="${nextLabel}">›</button>`;

  let body;
  if (editingPeriod === "year") {
    const selectedValueYear = parsePickerValue(selectedValue, kind)?.year;
    const todayYear = parsePickerValue(todayValue, kind)?.year;
    body = `<div class="date-picker-year-grid">${Array.from({ length: 9 }, (_, index) => {
      const year = yearPageStart + index;
      const selected = year === selectedValueYear;
      const today = year === todayYear;
      return `<button class="date-picker-year-option${selected ? " selected" : ""}${today ? " today" : ""}" type="button" data-date-view-year="${year}"${selected ? " aria-current=\"date\"" : ""}>${year}年</button>`;
    }).join("")}</div>`;
  } else if (kind === "date" && editingPeriod !== "month") {
    const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cellCount = firstWeekday + daysInMonth > 35 ? 42 : 35;
    const cells = Array.from({ length: cellCount }, (_, index) => {
      const dayOffset = index - firstWeekday + 1;
      const cellDate = new Date(viewYear, viewMonth, dayOffset);
      const outside = dayOffset < 1 || dayOffset > daysInMonth;
      const value = pickerValue({ year: cellDate.getFullYear(), month: cellDate.getMonth(), day: cellDate.getDate() }, kind);
      const selected = value === selectedValue;
      const today = value === todayValue;
      return `<button class="date-picker-day${outside ? " outside" : ""}${selected ? " selected" : ""}${today ? " today" : ""}" type="button" data-date-option data-value="${value}" aria-label="${formatPickerValue(value, kind)}"${selected ? " aria-current=\"date\"" : ""}>${cellDate.getDate()}</button>`;
    });
    body = `<div class="date-picker-weekdays">${DATE_PICKER_WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div><div class="date-picker-grid">${cells.join("")}</div>`;
  } else {
    const selectedMonthValue = parsePickerValue(selectedValue, kind);
    const todayMonthValue = parsePickerValue(todayValue, kind);
    const choosingDateMonth = kind === "date";
    body = `<div class="date-picker-month-grid">${DATE_PICKER_MONTHS.map((label, index) => {
      const value = pickerValue({ year: viewYear, month: index, day: 1 }, kind);
      const selected = choosingDateMonth
        ? selectedMonthValue?.year === viewYear && selectedMonthValue.month === index
        : value === selectedValue;
      const today = todayMonthValue?.year === viewYear && todayMonthValue.month === index;
      const optionAttributes = choosingDateMonth
        ? `data-date-view-month data-month="${index}"`
        : `data-date-option data-value="${value}"`;
      return `<button class="date-picker-month${selected ? " selected" : ""}${today ? " today" : ""}" type="button" ${optionAttributes}${selected ? " aria-current=\"date\"" : ""}>${choosingDateMonth ? `${index + 1}月` : label}</button>`;
    }).join("")}</div>`;
  }

  root.querySelector(".custom-date-popover").innerHTML = `<div class="date-picker-header">${navigation}</div>${body}<div class="date-picker-footer"><button class="date-picker-text-button" type="button" data-date-clear${selectedValue ? "" : " disabled"}>清除</button><button class="date-picker-today" type="button" data-date-today>${kind === "date" ? "今天" : "本月"}</button></div>`;
}

function closeDatePickers() {
  document.querySelectorAll("[data-date-root].open").forEach((root) => {
    root.classList.remove("open", "opens-up");
    delete root.dataset.datePickerEditing;
    delete root.dataset.datePickerYearStart;
    const trigger = root.querySelector("[data-date-trigger]");
    const popover = root.querySelector(".custom-date-popover");
    trigger?.setAttribute("aria-expanded", "false");
    if (popover) popover.hidden = true;
  });
}

function openDatePicker(root) {
  const trigger = root.querySelector("[data-date-trigger]");
  const kind = trigger?.dataset.kind || "date";
  const selected = parsePickerValue(trigger?.dataset.value, kind);
  const today = new Date();
  const year = selected?.year || today.getFullYear();
  const month = selected?.month ?? today.getMonth();
  root.dataset.viewYear = String(year);
  root.dataset.viewMonth = String(month);
  root.classList.remove("opens-up");
  root.classList.add("open");
  trigger?.setAttribute("aria-expanded", "true");
  const popover = root.querySelector(".custom-date-popover");
  if (popover) popover.hidden = false;
  renderDatePicker(root);

  if (popover && trigger) {
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverHeight = popover.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const fitsBelow = spaceBelow >= popoverHeight + gap;
    const fitsAbove = spaceAbove >= popoverHeight + gap;
    root.classList.toggle("opens-up", !fitsBelow && (fitsAbove || spaceAbove > spaceBelow));
  }
}

function setDatePickerValue(root, value, closeAfterUpdate = false) {
  const trigger = root.querySelector("[data-date-trigger]");
  if (!trigger) return;
  const kind = trigger.dataset.kind || "date";
  trigger.dataset.value = value;
  root.dataset.value = value;
  trigger.classList.toggle("has-value", Boolean(value));
  root.querySelector("[data-date-label]").textContent = formatPickerValue(value, kind);
  updateFromElement(trigger);
  if (closeAfterUpdate) {
    closeDatePickers();
    trigger.focus();
  } else {
    renderDatePicker(root);
  }
}

function customSelectHtml({ path, kind, options = [], value }) {
  const selectedValue = value == null ? "" : String(value);
  const items = ["", ...options];
  const menu = items.map((item) => {
    const selected = String(item) === selectedValue;
    return `<button class="custom-select-option${selected ? " selected" : ""}" type="button" role="option" aria-selected="${selected}" data-select-option data-value="${escapeHtml(item)}">${escapeHtml(selectLabel(item, kind))}</button>`;
  }).join("");
  return `<div class="custom-select" data-select-root><button class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" data-select-trigger data-path="${path}" data-kind="${kind}" data-value="${escapeHtml(selectedValue)}"><span data-select-label>${escapeHtml(selectLabel(selectedValue, kind))}</span><span class="custom-select-chevron" aria-hidden="true"></span></button><div class="custom-select-menu" role="listbox">${menu}</div></div>`;
}

function fieldHtml({ path, label, kind = "text", options = [], value, span = 1 }) {
  const safeValue = inputValue(value, kind);
  const data = `data-path="${path}" data-kind="${kind}"`;
  let control;
  if (kind === "textarea" || kind === "arrayText" || kind === "lines" || kind === "refs") {
    control = `<textarea ${data}>${escapeHtml(safeValue)}</textarea>`;
  } else if (kind === "select" || kind === "boolean") {
    control = customSelectHtml({ path, kind, options: kind === "boolean" ? ["true", "false"] : options, value });
  } else if (kind === "date" || kind === "month") {
    control = customDateHtml({ path, kind, value });
  } else {
    const type = ["email", "url", "number", "date", "month", "tel"].includes(kind) ? kind : "text";
    control = `<input ${data} type="${type}" value="${escapeHtml(safeValue)}" />`;
  }
  return `<div class="field ${span === 2 ? "span-2" : ""}"><label>${escapeHtml(label)}</label>${control}</div>`;
}

function formField(path, label, kind, options = [], span = 1) {
  return fieldHtml({ path, label, kind, options, value: getPath(state.snapshot, path), span });
}

function renderStaticForms() {
  const jobContextFields = state.profile?.profileType === "job_specific" ? [
    formField("jobContext.targetCompany", "目标公司", "text"),
    formField("jobContext.targetRole", "目标职位（职位档案）", "text"),
    formField("jobContext.targetLocation", "目标地点（职位档案）", "text"),
    formField("jobContext.jobUrl", "职位链接", "url"),
    formField("jobContext.notes", "准备备注", "textarea", [], 2),
  ].join("") : "";

  document.querySelector("#basics-form").innerHTML = [
    formField("basics.fullName", "姓名", "text"),
    formField("basics.nameLatin", "姓名拼音", "text"),
    formField("basics.summary", "个人简介", "textarea", [], 2),
    formField("basics.gender", "性别", "select", SELECTS.gender),
    formField("basics.birthDate", "出生日期", "date"),
  ].join("");

  document.querySelector("#contact-form").innerHTML = [
    formField("contact.primaryEmail", "主邮箱", "email"),
    formField("contact.secondaryEmail", "备用邮箱", "email"),
    formField("contact.primaryPhone", "主电话", "tel"),
    formField("contact.secondaryPhone", "备用电话", "tel"),
    formField("contact.preferredChannel", "首选联系渠道", "select", SELECTS.preferredChannel),
  ].join("");

  document.querySelector("#objective-form").innerHTML = [
    formField("objective.targetTitles", "目标职位", "arrayText"),
    formField("objective.targetIndustries", "目标行业", "arrayText"),
    formField("objective.targetLocations", "目标地点", "arrayText"),
    formField("objective.employmentTypes", "工作类型", "arrayText"),
    formField("objective.remotePreference", "远程偏好", "select", SELECTS.remotePreference),
    formField("objective.availableFrom", "最早到岗日期", "date"),
    formField("objective.willingToRelocate", "是否愿意搬迁", "boolean"),
    formField("objective.willingToTravel", "出差意愿", "select", SELECTS.travelPreference),
    formField("objective.expectedSalary.min", "期望薪资下限", "number"),
    formField("objective.expectedSalary.max", "期望薪资上限", "number"),
    formField("objective.expectedSalary.currency", "薪资币种", "text"),
    formField("objective.expectedSalary.period", "薪资周期", "select", SELECTS.salaryPeriod),
    formField("objective.expectedSalary.negotiable", "薪资可协商", "boolean"),
  ].join("") + jobContextFields;

  document.querySelector("#authorization-form").innerHTML = [
    formField("application.workAuthorization.country", "授权国家/地区", "text"),
    formField("application.workAuthorization.status", "工作授权状态", "select", SELECTS.workAuthorizationStatus),
    formField("application.workAuthorization.visaType", "签证或许可类型", "text"),
    formField("application.workAuthorization.expiryDate", "许可失效日期", "date"),
    formField("application.sponsorshipRequired", "是否需要雇主担保", "boolean"),
  ].join("");

  document.querySelector("#application-form").innerHTML = [
    formField("application.noticePeriodDays", "离职通知期（天）", "number"),
    formField("application.availableDate", "可开始工作日期", "date"),
    formField("application.remotePreference", "申请时的远程偏好", "select", SELECTS.remotePreference),
    formField("application.relocationPreference", "申请时的搬迁意愿", "select", SELECTS.relocationPreference),
    formField("application.travelPreference", "申请时的出差意愿", "select", SELECTS.travelPreference),
    formField("application.expectedSalary.min", "申请薪资下限", "number"),
    formField("application.expectedSalary.max", "申请薪资上限", "number"),
    formField("application.expectedSalary.currency", "申请薪资币种", "text"),
    formField("application.expectedSalary.period", "申请薪资周期", "select", SELECTS.salaryPeriod),
    formField("application.expectedSalary.negotiable", "申请薪资可协商", "boolean"),
  ].join("");
}

const repeatConfigs = {
  experience: {
    empty: "还没有工作经历，先添加一条吧。",
    title: (item) => item.jobTitle || item.companyName || "未命名工作经历",
    create: () => ({ id: uid("exp"), companyName: "", jobTitle: "", employmentType: null, employmentTypeOther: "", country: "", city: "", startDate: null, endDate: null, isCurrent: false, description: "", achievements: [], skillsUsed: [], companyUrl: "" }),
    fields: [
      ["companyName", "公司名称", "text"], ["jobTitle", "职位名称", "text"], ["employmentType", "工作类型", "select", SELECTS.employmentType], ["employmentTypeOther", "工作类型补充", "text"],
      ["country", "国家/地区", "text"], ["city", "城市", "text"], ["startDate", "开始时间", "month"], ["endDate", "结束时间", "month"], ["isCurrent", "当前工作", "boolean"],
      ["description", "职责概述", "textarea", [], 2], ["achievements", "工作成果（每行一条）", "lines", [], 2], ["skillsUsed", "使用的技能", "arrayText"], ["companyUrl", "公司主页", "url"],
    ],
  },
  education: {
    empty: "还没有教育经历。",
    title: (item) => item.institutionName || "未命名教育经历",
    create: () => ({ id: uid("edu"), institutionName: "", degreeLevel: null, degreeLevelOther: "", degreeName: "", fieldOfStudy: "", country: "", city: "", startDate: null, endDate: null, isCurrent: false, grade: "", gradeScale: "", description: "" }),
    fields: [
      ["institutionName", "学校/机构", "text"], ["degreeLevel", "学位层级", "select", SELECTS.degreeLevel], ["degreeLevelOther", "学位层级补充", "text"], ["degreeName", "学位名称", "text"],
      ["fieldOfStudy", "专业/研究方向", "text"], ["country", "国家/地区", "text"], ["city", "城市", "text"], ["startDate", "开始时间", "month"], ["endDate", "结束时间", "month"], ["isCurrent", "在读", "boolean"],
      ["grade", "成绩/GPA", "text"], ["gradeScale", "成绩满分制", "text"], ["description", "补充说明", "textarea", [], 2],
    ],
  },
  projects: {
    empty: "还没有项目经历。",
    title: (item) => item.name || "未命名项目",
    create: () => ({ id: uid("project"), name: "", role: "", organization: "", startDate: null, endDate: null, isCurrent: false, summary: "", responsibilities: [], achievements: [], technologies: [], url: "" }),
    fields: [
      ["name", "项目名称", "text"], ["role", "项目角色", "text"], ["organization", "所属组织", "text"], ["startDate", "开始时间", "month"], ["endDate", "结束时间", "month"], ["isCurrent", "进行中", "boolean"],
      ["summary", "项目概述", "textarea", [], 2], ["responsibilities", "职责（每行一条）", "lines", [], 2], ["achievements", "成果（每行一条）", "lines", [], 2], ["technologies", "技术栈", "arrayText"], ["url", "项目链接", "url"],
    ],
  },
  skills: {
    empty: "还没有技能。",
    title: (item) => item.name || "未命名技能",
    create: () => ({ id: uid("skill"), name: "", category: null, categoryOther: "", proficiency: null, yearsOfExperience: null, lastUsedDate: null, aliases: [], evidenceRefs: [] }),
    fields: [
      ["name", "技能名称", "text"], ["category", "技能类别", "select", SELECTS.skillCategory], ["categoryOther", "技能类别补充", "text"], ["proficiency", "熟练程度", "select", SELECTS.proficiency],
      ["yearsOfExperience", "使用年限", "number"], ["lastUsedDate", "最近使用时间", "month"], ["aliases", "同义词/常见写法", "arrayText"], ["evidenceRefs", "关联经历/项目 ID", "refs", [], 2],
    ],
  },
  certifications: {
    empty: "还没有证书。",
    title: (item) => item.name || "未命名证书",
    create: () => ({ id: uid("cert"), name: "", issuer: "", issueDate: null, expiryDate: null, credentialId: "", credentialUrl: "" }),
    fields: [["name", "证书名称", "text"], ["issuer", "颁发机构", "text"], ["issueDate", "获得日期", "month"], ["expiryDate", "失效日期", "month"], ["credentialId", "证书编号", "text"], ["credentialUrl", "验证链接", "url"]],
  },
  languages: {
    empty: "还没有语言能力记录。",
    title: (item) => item.language || "未命名语言",
    create: () => ({ id: uid("lang"), language: "", languageCode: "", proficiency: null, testName: "", score: "", testDate: null }),
    fields: [["language", "语言", "text"], ["languageCode", "语言代码", "text"], ["proficiency", "熟练程度", "select", SELECTS.languageProficiency], ["testName", "考试名称", "text"], ["score", "考试成绩", "text"], ["testDate", "考试日期", "month"]],
  },
  publications: {
    empty: "还没有出版物。",
    title: (item) => item.title || "未命名出版物",
    create: () => ({ id: uid("pub"), title: "", authors: "", publisher: "", publicationDate: null, description: "", url: "", doi: "" }),
    fields: [["title", "标题", "text"], ["authors", "作者", "text"], ["publisher", "出版方", "text"], ["publicationDate", "发表日期", "month"], ["description", "说明", "textarea", [], 2], ["url", "链接", "url"], ["doi", "DOI", "text"]],
  },
  awards: {
    empty: "还没有奖项。",
    title: (item) => item.name || "未命名奖项",
    create: () => ({ id: uid("award"), name: "", issuer: "", date: null, description: "", url: "" }),
    fields: [["name", "奖项名称", "text"], ["issuer", "颁发方", "text"], ["date", "日期", "month"], ["description", "说明", "textarea", [], 2], ["url", "链接", "url"]],
  },
  volunteering: {
    empty: "还没有志愿经历。",
    title: (item) => item.organization || "未命名志愿经历",
    create: () => ({ id: uid("vol"), organization: "", role: "", startDate: null, endDate: null, isCurrent: false, description: "", achievements: [], url: "" }),
    fields: [["organization", "组织名称", "text"], ["role", "角色", "text"], ["startDate", "开始时间", "month"], ["endDate", "结束时间", "month"], ["isCurrent", "进行中", "boolean"], ["description", "说明", "textarea", [], 2], ["achievements", "成果（每行一条）", "lines", [], 2], ["url", "链接", "url"]],
  },
  links: {
    empty: "还没有公开链接。",
    title: (item) => item.label || item.url || "未命名链接",
    create: () => ({ id: uid("link"), type: null, typeOther: "", label: "", url: "", isPublic: true }),
    fields: [["type", "链接类型", "select", SELECTS.linkType], ["typeOther", "链接类型补充", "text"], ["label", "展示名称", "text"], ["url", "URL", "url"], ["isPublic", "允许出现在职位档案", "boolean"]],
  },
};

function renderRepeatField(section, index, item, spec) {
  const [path, label, kind, options = [], span = 1] = spec;
  const fullPath = `${section}[${index}].${path}`;
  return fieldHtml({ path: fullPath, label, kind, options, value: getPath(state.snapshot, fullPath), span });
}

function renderRepeatList(section) {
  const config = repeatConfigs[section];
  const list = state.snapshot[section] || [];
  const container = document.querySelector(`#${section}-list`);
  if (!container) return;
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">${config.empty}</div>`;
    return;
  }
  container.innerHTML = list.map((item, index) => `<article class="repeat-card" data-section="${section}" data-index="${index}"><div class="repeat-card-header"><div class="repeat-card-title"><span class="repeat-index">${index + 1}</span>${escapeHtml(config.title(item))}</div><button class="remove-button" data-remove="${section}" data-index="${index}" type="button">删除</button></div><div class="form-grid">${config.fields.map((spec) => renderRepeatField(section, index, item, spec)).join("")}</div></article>`).join("");
}

function renderAll() {
  renderStaticForms();
  Object.keys(repeatConfigs).forEach(renderRepeatList);
  updateProfileSwitcher();
  updateCounts();
  showSection(state.activeSection, false);
}

function updateCounts() {
  const counts = { ...Object.fromEntries(Object.keys(repeatConfigs).map((key) => [key, (state.snapshot[key] || []).length])) };
  counts.other = counts.publications + counts.awards + counts.volunteering;
  Object.entries(counts).forEach(([key, value]) => { const node = document.querySelector(`[data-count="${key}"]`); if (node) node.textContent = value; });
}

function updateProfileSwitcher() {
  const name = document.querySelector("#profile-name");
  const activeProfile = state.profiles.find((profile) => profile.profileId === state.activeProfileId);
  if (!name || !activeProfile) return;
  name.textContent = activeProfile.displayName;
}

function renderProfileVersionList() {
  const list = document.querySelector("#profile-version-list");
  if (!list) return;
  list.innerHTML = state.profiles.map((profile) => {
    const active = profile.profileId === state.activeProfileId;
    return `<div class="profile-version-item${active ? " active" : ""}"><button class="profile-version-main" type="button" data-profile-switch="${escapeHtml(profile.profileId)}"><span class="profile-version-copy"><span class="profile-version-title"><span class="profile-version-name">${escapeHtml(profile.displayName)}</span>${active ? '<span class="profile-version-tag">使用中</span>' : ""}</span></span></button><div class="profile-version-actions"><button class="text-button" type="button" data-profile-rename="${escapeHtml(profile.profileId)}">重命名</button><button class="text-button danger" type="button" data-profile-delete="${escapeHtml(profile.profileId)}">删除</button></div></div>`;
  }).join("");
}

function openModal(id) {
  const modal = document.querySelector(`#${id}`);
  if (!modal) return;
  modal.hidden = false;
}

function closeModal(id) {
  const modal = document.querySelector(`#${id}`);
  if (modal) modal.hidden = true;
}

function requestConfirm(message, title = "确认操作", confirmText = "确认") {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    document.querySelector("#confirm-title").textContent = title;
    document.querySelector("#confirm-message").textContent = message;
    document.querySelector("#confirm-submit").textContent = confirmText;
    openModal("confirm-modal");
  });
}

function finishConfirm(result) {
  const resolve = confirmResolver;
  confirmResolver = null;
  closeModal("confirm-modal");
  resolve?.(result);
}

function openProfileListModal() {
  renderProfileVersionList();
  openModal("profile-list-modal");
}

function openProfileEditor(mode = "create", profileId = null) {
  profileEditorMode = mode;
  profileEditorId = profileId;
  const profile = state.profiles.find((item) => item.profileId === profileId);
  document.querySelector("#profile-editor-title").textContent = mode === "rename" ? "重命名版本" : "新建版本";
  document.querySelector("#profile-name-input").value = profile?.displayName || "";
  openModal("profile-editor-modal");
  requestAnimationFrame(() => document.querySelector("#profile-name-input")?.focus());
}

async function saveProfileEditor(event) {
  event.preventDefault();
  const input = document.querySelector("#profile-name-input");
  const name = input.value.trim();
  if (!name) {
    input.focus();
    showToast("请输入版本名称");
    return;
  }

  if (profileEditorMode === "rename") {
    const profile = state.profiles.find((item) => item.profileId === profileEditorId);
    if (!profile) return;
    profile.displayName = name;
    profile.updatedAt = new Date().toISOString();
    await writeTransaction(["profiles"], (transaction) => transaction.objectStore("profiles").put(profile));
    state.profiles = await getAll("profiles");
    renderAll();
    renderProfileVersionList();
    closeModal("profile-editor-modal");
    showToast("版本名称已更新");
    return;
  }

  const profileType = state.profile?.profileType || "base";
  const created = newProfile(name, profileType);
  if (profileType === "job_specific") created.profile.baseProfileId = state.profile?.baseProfileId || state.profile?.profileId || null;
  await writeTransaction(["profiles", "profileDrafts"], (transaction) => {
    transaction.objectStore("profiles").put(created.profile);
    transaction.objectStore("profileDrafts").put(created.draft);
  });
  state.profiles = await getAll("profiles");
  state.activeProfileId = created.profile.profileId;
  await loadActiveProfile();
  renderAll();
  closeModal("profile-editor-modal");
  closeModal("profile-list-modal");
  showToast("已创建新版本");
}

async function switchProfile(profileId) {
  if (!profileId) return;
  if (profileId === state.activeProfileId) {
    closeModal("profile-list-modal");
    return;
  }
  await saveDraftNow();
  state.activeProfileId = profileId;
  await loadActiveProfile();
  renderAll();
  renderProfileVersionList();
  closeModal("profile-list-modal");
}

async function deleteProfile(profileId) {
  if (state.profiles.length <= 1) {
    showToast("至少保留一个版本");
    return;
  }
  const profile = state.profiles.find((item) => item.profileId === profileId);
  if (!profile || !(await requestConfirm(`删除“${profile.displayName}”？此操作不可撤销。`, "删除版本", "删除"))) return;
  const versions = await getAll("profileVersions");
  await writeTransaction(["profiles", "profileDrafts", "profileVersions"], (transaction) => {
    transaction.objectStore("profiles").delete(profileId);
    transaction.objectStore("profileDrafts").delete(profileId);
    versions.filter((version) => version.profileId === profileId).forEach((version) => transaction.objectStore("profileVersions").delete(version.versionId));
  });
  state.profiles = await getAll("profiles");
  if (state.activeProfileId === profileId) state.activeProfileId = state.profiles[0].profileId;
  await loadActiveProfile();
  renderAll();
  renderProfileVersionList();
  showToast("版本已删除");
}

/* Keep the list markup in sync when a modal is already open. */
function refreshProfileVersionList() {
  if (!document.querySelector("#profile-list-modal")?.hidden) renderProfileVersionList();
}

function setActiveNav(section) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
}

function showSection(section, shouldScroll = true) {
  state.activeSection = section;
  setActiveNav(section);
  if (shouldScroll) {
    const container = document.querySelector("#content-scroll");
    const panel = document.querySelector(`[data-panel="${section}"]`);
    if (container && panel) {
      const panelTop = panel.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      if (container.scrollHeight > container.clientHeight) {
        container.scrollTo({ top: Math.max(0, panelTop - 24), behavior: "instant" });
      } else {
        panel.scrollIntoView({ behavior: "instant", block: "start" });
      }
    }
  }
}

function syncActiveSection() {
  const container = document.querySelector("#content-scroll");
  if (!container) return;
  const marker = container.getBoundingClientRect().top + 56;
  let current = document.querySelector(".content-section");
  document.querySelectorAll(".content-section").forEach((panel) => {
    if (panel.getBoundingClientRect().top <= marker) current = panel;
  });
  if (current && current.dataset.panel !== state.activeSection) {
    state.activeSection = current.dataset.panel;
    setActiveNav(state.activeSection);
  }
}

function newProfile(name, profileType = "base") {
  const profileId = uid("profile");
  const profile = { profileId, profileType, displayName: name, baseProfileId: null, currentVersionId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false };
  const snapshot = emptySnapshot();
  if (profileType === "job_specific") snapshot.jobContext = { targetCompany: "", targetRole: "", targetLocation: "", jobUrl: "", notes: "" };
  return { profile, draft: { profileId, snapshot, updatedAt: new Date().toISOString() } };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "profileId" });
      if (!database.objectStoreNames.contains("profileVersions")) database.createObjectStore("profileVersions", { keyPath: "versionId" });
      if (!database.objectStoreNames.contains("profileDrafts")) database.createObjectStore("profileDrafts", { keyPath: "profileId" });
      if (!database.objectStoreNames.contains("siteRules")) database.createObjectStore("siteRules", { keyPath: "ruleId" });
      if (!database.objectStoreNames.contains("fillTransactions")) database.createObjectStore("fillTransactions", { keyPath: "transactionId" });
      if (!database.objectStoreNames.contains("metadata")) database.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getOne(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeTransaction(storeNames, callback) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, "readwrite");
    callback(transaction);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("事务已回滚"));
  });
}

async function ensureInitialProfile() {
  const profiles = await getAll("profiles");
  if (profiles.length) return profiles;
  const initial = newProfile("我的基础档案");
  await writeTransaction(["profiles", "profileDrafts"], (transaction) => {
    transaction.objectStore("profiles").put(initial.profile);
    transaction.objectStore("profileDrafts").put(initial.draft);
  });
  return [initial.profile];
}

async function loadActiveProfile() {
  const profile = await getOne("profiles", state.activeProfileId);
  if (!profile) return;
  const draft = await getOne("profileDrafts", profile.profileId);
  let snapshot = draft?.snapshot;
  if (!snapshot && profile.currentVersionId) snapshot = (await getOne("profileVersions", profile.currentVersionId))?.snapshot;
  state.profile = profile;
  state.snapshot = normalizeSnapshot(snapshot);
}

async function saveDraftNow(showMessage = false) {
  if (!state.profile || !state.snapshot) return;
  const now = new Date().toISOString();
  state.profile.updatedAt = now;
  await writeTransaction(["profiles", "profileDrafts"], (transaction) => {
    transaction.objectStore("profiles").put(state.profile);
    transaction.objectStore("profileDrafts").put({ profileId: state.profile.profileId, snapshot: clone(state.snapshot), updatedAt: now });
  });
  if (showMessage) showToast("已保存");
  setStorageStatus("本地已保存");
}

function scheduleDraftSave() {
  clearTimeout(saveTimer);
  setStorageStatus("保存中…");
  saveTimer = setTimeout(() => saveDraftNow().catch(() => {
    setStorageStatus("保存失败");
    showToast("保存失败");
  }), 450);
}

async function saveVersion() {
  await saveDraftNow();
  const version = { versionId: uid("version"), profileId: state.profile.profileId, profileType: state.profile.profileType, baseProfileId: state.profile.baseProfileId, baseVersionId: null, schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), createdBy: "user", note: "手动保存", snapshot: clone(state.snapshot) };
  state.profile.currentVersionId = version.versionId;
  await writeTransaction(["profiles", "profileVersions"], (transaction) => {
    transaction.objectStore("profileVersions").put(version);
    transaction.objectStore("profiles").put(state.profile);
  });
  showToast("已保存为新版本");
}

function setStorageStatus(text) {
  const status = document.querySelector("#save-button");
  if (!status) return;
  clearTimeout(saveStatusTimer);
  if (text.includes("失败")) {
    status.dataset.state = "error";
    status.setAttribute("aria-label", text);
  } else if (text.includes("保存中")) {
    status.dataset.state = "saving";
    status.setAttribute("aria-label", "保存中");
  } else {
    status.dataset.state = "success";
    status.setAttribute("aria-label", "保存成功");
    saveStatusTimer = setTimeout(() => {
      if (status.dataset.state !== "success") return;
      status.dataset.state = "saved";
      status.setAttribute("aria-label", "已保存");
    }, 1000);
  }
}

function openSettings() {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    try {
      const result = chrome.runtime.openOptionsPage();
      if (result && typeof result.catch === "function") result.catch(() => window.open(chrome.runtime.getURL("settings.html"), "_blank"));
      return;
    } catch { /* 非扩展页面中回退到设置页 */ }
    window.open(chrome.runtime.getURL("settings.html"), "_blank");
    return;
  }
  window.open("settings.html", "_blank");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function parseArrayText(value) { return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean); }

function updateFromElement(element) {
  const path = element.dataset.path;
  const kind = element.dataset.kind;
  if (!path) return;
  let value = element.matches("[data-select-trigger], [data-date-trigger]") ? element.dataset.value || "" : element.value;
  if (kind === "select") value = value || null;
  if (kind === "boolean") value = value === "" ? null : value === "true";
  if (kind === "arrayText") value = parseArrayText(value);
  if (kind === "lines") value = value.split("\n").map((text) => text.trim()).filter(Boolean).map((text) => ({ id: uid("achievement"), text, metric: null, featured: false }));
  if (kind === "refs") value = value.split("\n").map((id) => id.trim()).filter(Boolean).map((id) => ({ type: id.startsWith("project_") ? "project" : "experience", id }));
  if (kind === "number") value = value === "" ? null : Number(value);
  if (["date", "month"].includes(kind)) value = value || null;
  setPath(state.snapshot, path, value);
  scheduleDraftSave();
}

function renderAfterCollectionChange() {
  renderAll();
  scheduleDraftSave();
}

async function createNewProfile() {
  openProfileEditor();
}

async function exportBackup() {
  await saveDraftNow();
  const [profiles, profileVersions, profileDrafts, siteRules] = await Promise.all([getAll("profiles"), getAll("profileVersions"), getAll("profileDrafts"), getAll("siteRules")]);
  const backup = { format: "fastcv-backup", formatVersion: 1, exportedAt: new Date().toISOString(), profiles, profileVersions, profileDrafts, siteRules, metadata: { appVersion: "0.1.0", schemaVersion: SCHEMA_VERSION } };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fastcv-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("JSON 备份已导出");
}

function isValidBackup(backup) {
  return backup && backup.format === "fastcv-backup" && Number(backup.formatVersion) === 1 && Array.isArray(backup.profiles) && Array.isArray(backup.profileVersions);
}

async function importBackup(file) {
  try {
    const backup = JSON.parse(await file.text());
    if (!isValidBackup(backup)) throw new Error("不是有效的 FastCV v1 备份文件");
    if (!(await requestConfirm(`将导入 ${backup.profiles.length} 个档案及其历史版本。\n现有数据不会被覆盖，导入内容会创建为新的档案副本。继续吗？`, "导入备份", "继续导入"))) return;

    const profileIdMap = new Map(backup.profiles.map((profile) => [profile.profileId, uid("profile")]));
    const versionIdMap = new Map(backup.profileVersions.map((version) => [version.versionId, uid("version")]));
    const importedProfiles = backup.profiles.map((profile) => ({
      ...profile,
      profileId: profileIdMap.get(profile.profileId),
      displayName: `${profile.displayName || "未命名档案"}（导入）`,
      baseProfileId: profile.baseProfileId ? profileIdMap.get(profile.baseProfileId) || null : null,
      currentVersionId: profile.currentVersionId ? versionIdMap.get(profile.currentVersionId) || null : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const importedVersions = backup.profileVersions.map((version) => ({
      ...version,
      versionId: versionIdMap.get(version.versionId),
      profileId: profileIdMap.get(version.profileId),
      baseProfileId: version.baseProfileId ? profileIdMap.get(version.baseProfileId) || null : null,
      baseVersionId: version.baseVersionId ? versionIdMap.get(version.baseVersionId) || null : null,
      createdBy: "backup_restore",
      snapshot: normalizeSnapshot(version.snapshot),
    }));
    const importedDrafts = (backup.profileDrafts || []).map((draft) => ({ profileId: profileIdMap.get(draft.profileId), snapshot: normalizeSnapshot(draft.snapshot), updatedAt: new Date().toISOString() })).filter((draft) => draft.profileId);
    await writeTransaction(["profiles", "profileVersions", "profileDrafts"], (transaction) => {
      const profilesStore = transaction.objectStore("profiles");
      const versionsStore = transaction.objectStore("profileVersions");
      const draftsStore = transaction.objectStore("profileDrafts");
      importedProfiles.forEach((profile) => profilesStore.put(profile));
      importedVersions.forEach((version) => versionsStore.put(version));
      importedDrafts.forEach((draft) => draftsStore.put(draft));
    });
    state.profiles = await getAll("profiles");
    state.activeProfileId = importedProfiles[0]?.profileId || state.activeProfileId;
    await loadActiveProfile();
    renderAll();
    showToast("备份已导入为新的档案副本");
  } catch (error) {
    showToast(error.message || "备份导入失败");
  }
}

async function init() {
  db = await openDb();
  state.profiles = await ensureInitialProfile();
  state.activeProfileId = state.profiles[0].profileId;
  await loadActiveProfile();
  renderAll();
  bindEvents();
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* 浏览器可能不允许持久化请求，仍使用正常扩展存储。 */ }
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-confirm-cancel]")) {
      finishConfirm(false);
      return;
    }

    if (event.target.closest("#confirm-submit")) {
      finishConfirm(true);
      return;
    }

    const closeButton = event.target.closest("[data-modal-close]");
    if (closeButton) {
      closeModal(closeButton.dataset.modalClose);
      return;
    }

    if (event.target.classList.contains("modal-backdrop")) {
      if (event.target.id === "confirm-modal") finishConfirm(false);
      else event.target.hidden = true;
      return;
    }

    const profileSwitchButton = event.target.closest("#profile-switch-button");
    if (profileSwitchButton) {
      openProfileListModal();
      return;
    }

    const profileSwitch = event.target.closest("[data-profile-switch]");
    if (profileSwitch) {
      await switchProfile(profileSwitch.dataset.profileSwitch);
      return;
    }

    const profileRename = event.target.closest("[data-profile-rename]");
    if (profileRename) {
      openProfileEditor("rename", profileRename.dataset.profileRename);
      return;
    }

    const profileDelete = event.target.closest("[data-profile-delete]");
    if (profileDelete) {
      await deleteProfile(profileDelete.dataset.profileDelete);
      return;
    }

    const option = event.target.closest("[data-select-option]");
    if (option) {
      const root = option.closest("[data-select-root]");
      const trigger = root?.querySelector("[data-select-trigger]");
      if (!root || !trigger) return;
      trigger.dataset.value = option.dataset.value || "";
      root.querySelector("[data-select-label]").textContent = option.textContent;
      root.querySelectorAll("[data-select-option]").forEach((item) => {
        const selected = item === option;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      root.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
      updateFromElement(trigger);
      return;
    }

    const dateViewMonth = event.target.closest("[data-date-view-month]");
    if (dateViewMonth) {
      const root = dateViewMonth.closest("[data-date-root]");
      if (!root) return;
      root.dataset.viewMonth = dateViewMonth.dataset.month;
      delete root.dataset.datePickerEditing;
      renderDatePicker(root);
      return;
    }

    const dateViewYear = event.target.closest("[data-date-view-year]");
    if (dateViewYear) {
      const root = dateViewYear.closest("[data-date-root]");
      if (!root) return;
      root.dataset.viewYear = dateViewYear.dataset.dateViewYear;
      delete root.dataset.datePickerYearStart;
      if (root.querySelector("[data-date-trigger]")?.dataset.kind === "date") {
        root.dataset.datePickerEditing = "month";
      } else {
        delete root.dataset.datePickerEditing;
      }
      renderDatePicker(root);
      return;
    }

    const dateOption = event.target.closest("[data-date-option]");
    if (dateOption) {
      const root = dateOption.closest("[data-date-root]");
      const kind = root?.querySelector("[data-date-trigger]")?.dataset.kind;
      if (root) setDatePickerValue(root, dateOption.dataset.value || "", kind === "date");
      return;
    }

    const dateClear = event.target.closest("[data-date-clear]");
    if (dateClear) {
      const root = dateClear.closest("[data-date-root]");
      if (root) setDatePickerValue(root, "");
      return;
    }

    const dateToday = event.target.closest("[data-date-today]");
    if (dateToday) {
      const root = dateToday.closest("[data-date-root]");
      const kind = root?.querySelector("[data-date-trigger]")?.dataset.kind || "date";
      if (root) setDatePickerValue(root, datePickerToday(kind));
      return;
    }

    const editYear = event.target.closest("[data-date-edit-year]");
    if (editYear) {
      const root = editYear.closest("[data-date-root]");
      if (!root) return;
      root.dataset.datePickerEditing = "year";
      root.dataset.datePickerYearStart = String(Number(root.dataset.viewYear) - 4);
      renderDatePicker(root);
      return;
    }

    const editMonth = event.target.closest("[data-date-edit-month]");
    if (editMonth) {
      const root = editMonth.closest("[data-date-root]");
      if (!root) return;
      if (root.dataset.datePickerEditing === "month") delete root.dataset.datePickerEditing;
      else {
        delete root.dataset.datePickerYearStart;
        root.dataset.datePickerEditing = "month";
      }
      renderDatePicker(root);
      return;
    }

    const dateNav = event.target.closest("[data-date-nav]");
    if (dateNav) {
      const root = dateNav.closest("[data-date-root]");
      const trigger = root?.querySelector("[data-date-trigger]");
      if (!root || !trigger) return;
      const kind = trigger.dataset.kind || "date";
      let year = Number(root.dataset.viewYear);
      let month = Number(root.dataset.viewMonth);
      const delta = Number(dateNav.dataset.dateNav);
      if (root.dataset.datePickerEditing === "year") {
        const yearPageStart = Number(root.dataset.datePickerYearStart || year - 4);
        root.dataset.datePickerYearStart = String(yearPageStart + delta * 9);
      } else if (kind === "date" && root.dataset.datePickerEditing !== "month") {
        const next = new Date(year, month + delta, 1);
        year = next.getFullYear();
        month = next.getMonth();
      } else {
        year += delta;
      }
      if (root.dataset.datePickerEditing !== "year") {
        root.dataset.viewYear = String(year);
        root.dataset.viewMonth = String(month);
      }
      renderDatePicker(root);
      return;
    }

    const dateTrigger = event.target.closest("[data-date-trigger]");
    if (dateTrigger) {
      const root = dateTrigger.closest("[data-date-root]");
      if (!root) return;
      const wasOpen = root.classList.contains("open");
      closeDatePickers();
      if (!wasOpen) openDatePicker(root);
      return;
    }

    if (event.target.closest(".custom-date-popover")) return;

    const trigger = event.target.closest("[data-select-trigger]");
    if (trigger) {
      const root = trigger.closest("[data-select-root]");
      document.querySelectorAll("[data-select-root].open").forEach((item) => {
        if (item !== root) {
          item.classList.remove("open");
          item.querySelector("[data-select-trigger]")?.setAttribute("aria-expanded", "false");
        }
      });
      const isOpen = root.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
      return;
    }

    document.querySelectorAll("[data-select-root].open").forEach((root) => {
      root.classList.remove("open");
      root.querySelector("[data-select-trigger]")?.setAttribute("aria-expanded", "false");
    });
    closeDatePickers();

    const nav = event.target.closest("[data-section]");
    if (nav) showSection(nav.dataset.section);

    const add = event.target.closest("[data-add]");
    if (add) {
      const section = add.dataset.add;
      state.snapshot[section].push(repeatConfigs[section].create());
      renderAfterCollectionChange();
      return;
    }

    const remove = event.target.closest("[data-remove]");
    if (remove) {
      const section = remove.dataset.remove;
      const index = Number(remove.dataset.index);
      if (await requestConfirm("删除这条记录？", "删除记录", "删除")) {
        state.snapshot[section].splice(index, 1);
        renderAfterCollectionChange();
      }
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-path]")) updateFromElement(event.target);
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-path]")) updateFromElement(event.target);
  });
  document.querySelector("#new-profile-button").addEventListener("click", createNewProfile);
  document.querySelector("#save-button")?.addEventListener("click", async () => {
    clearTimeout(saveTimer);
    setStorageStatus("保存中…");
    try {
      await saveDraftNow(true);
    } catch {
      setStorageStatus("保存失败");
      showToast("保存失败");
    }
  });
  document.querySelector("#settings-button")?.addEventListener("click", openSettings);
  document.querySelector("#profile-editor-form").addEventListener("submit", saveProfileEditor);
  document.querySelector("#save-version-button")?.addEventListener("click", saveVersion);
  document.querySelector("#export-button")?.addEventListener("click", exportBackup);
  document.querySelector("#import-button")?.addEventListener("click", () => document.querySelector("#import-file")?.click());
  document.querySelector("#import-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importBackup(file);
    event.target.value = "";
  });
  document.querySelector("#content-scroll").addEventListener("scroll", syncActiveSection, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.querySelector("[data-date-root].open")) {
        closeDatePickers();
        return;
      }
      if (!document.querySelector("#confirm-modal")?.hidden) finishConfirm(false);
      closeModal("profile-list-modal");
      closeModal("profile-editor-modal");
    }
  });
}

init().catch((error) => {
  console.error(error);
  setStorageStatus("初始化失败");
  showToast("页面初始化失败，请刷新重试");
});

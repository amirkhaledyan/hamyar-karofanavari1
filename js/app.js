import { EVIDENCE_TYPES, MONTHS, NOTE_PRESETS, RUBRIC_LEVELS, RUBRIC_LIBRARY, RUBRIC_VERSION } from './rubrics.js';
import { clearAll, exportDatabase, getAllByIndex, importDatabase, put, remove, requestPersistentStorage, storageInfo } from './db.js';
import { APP_VERSION, CURRENT_USER_ID, ensureSeed, readModel, ROLE_FLOW, roleLabel, saveProfile, saveSettings, STATUS_LABELS, uuid } from './data.js';

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const modalRoot = document.querySelector('#modal-root');
const fileImport = document.querySelector('#file-import');
let installPrompt = null;
let model;
const state = {
  route: 'home', communityTab: 'feed', assessment: null, modal: null,
  selectedSchoolId: null, selectedClassId: null, semester: 'first',
  installAvailable: false, online: navigator.onLine,
};

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fa = v => String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const today = () => new Date().toISOString().slice(0,10);
const fmtBytes = n => n ? `${(n / 1024 / 1024).toFixed(n > 10*1024*1024 ? 0 : 1)} مگابایت` : '۰ مگابایت';
const classById = id => model.classes.find(c => c.id === id);
const schoolById = id => model.schools.find(s => s.id === id);
const currentClass = () => classById(state.selectedClassId) || model.classes[0];
const currentSchool = () => schoolById(state.selectedSchoolId) || schoolById(currentClass()?.schoolId) || model.schools[0];
const students = () => model.students.filter(s => s.classId === currentClass()?.id && s.active !== false);
const profile = () => model.profile;
const getRubricCriterion = (cat, crit) => RUBRIC_LIBRARY[cat]?.criteria?.[crit];
const levelInfo = level => RUBRIC_LEVELS.find(l => l.level === Number(level));

function showToast(message, type = 'normal') {
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function refresh() {
  model = await readModel();
  state.selectedSchoolId ||= model.settings?.selectedSchoolId || model.schools[0]?.id;
  const schoolClasses = model.classes.filter(c => c.schoolId === state.selectedSchoolId);
  state.selectedClassId ||= model.settings?.selectedClassId || schoolClasses[0]?.id;
  if (!schoolClasses.some(c => c.id === state.selectedClassId)) state.selectedClassId = schoolClasses[0]?.id;
  state.semester = model.settings?.semester || state.semester;
  applyDeviceMode();
  render();
}

function applyDeviceMode() {
  const autoLite = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  const queryLite = new URLSearchParams(location.search).get('lite') === '1';
  const setting = model?.settings?.liteMode || 'auto';
  const lite = queryLite || setting === 'on' || (setting === 'auto' && autoLite);
  document.documentElement.classList.toggle('lite', Boolean(lite));
  document.documentElement.dataset.power = lite ? 'lite' : 'standard';
  document.documentElement.dataset.theme = model?.settings?.theme || 'system';
}

function icon(name) {
  const icons = {
    home:'<path d="M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z"/>',
    class:'<path d="M4 5.5h16v13H4z"/><path d="M8 9h8M8 13h8"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    users:'<path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 11a3 3 0 1 0 0-6M21 20v-2a4 4 0 0 0-3-3.87"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', camera:'<path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
    upload:'<path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14"/>', download:'<path d="M12 4v12m0 0 5-5m-5 5-5-5M5 20h14"/>',
    share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4m-7.5 6.8 7.5 4.4"/>',
    arrow:'<path d="m9 18 6-6-6-6"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>',
    star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    shield:'<path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    wifi:'<path d="M4 9a13 13 0 0 1 16 0M7 13a8 8 0 0 1 10 0M10 17a3 3 0 0 1 4 0M12 20h.01"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name] || icons.info}</svg>`;
}

function contextBar() {
  const school = currentSchool(); const cls = currentClass();
  return `<button class="context-pill" data-action="context" aria-label="تغییر مدرسه و کلاس">
    <span><b>${esc(school?.name || 'مدرسه')}</b><small>پایه ${esc(cls?.grade || '')} · کلاس ${esc(cls?.title || '')} · ${state.semester === 'first' ? 'نیمسال اول' : 'نیمسال دوم'}</small></span>${icon('arrow')}
  </button>`;
}

function render() {
  if (!model) return;
  app.innerHTML = `<div class="app-shell">
    <header class="topbar"><div class="brand"><img src="assets/icon-96.png" alt=""><span><b>همیار کاروفناوری</b><small>${state.online ? 'آماده ثبت آفلاین' : 'آفلاین؛ اطلاعات روی گوشی ذخیره می‌شود'}</small></span></div><button class="icon-button" data-action="open-help" aria-label="راهنما">${icon('info')}</button></header>
    <main id="main-content" tabindex="-1">${contextBar()}${routeView()}</main>${bottomNav()}</div>${modalView()}`;
  bindDynamicMedia();
}

function bottomNav() {
  const items = [['home','home','خانه'],['class','class','کلاس'],['assessment','check','ثبت'],['community','users','هم‌افزایی'],['settings','more','بیشتر']];
  return `<nav class="bottom-nav" aria-label="ناوبری اصلی">${items.map(([route,ic,label]) => `<button data-action="navigate" data-route="${route}" class="${state.route===route?'active':''}" aria-current="${state.route===route?'page':'false'}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>`;
}

function routeView() {
  if (state.route === 'class') return classView();
  if (state.route === 'assessment') return assessmentView();
  if (state.route === 'community') return communityView();
  if (state.route === 'settings') return settingsView();
  return homeView();
}

function homeView() {
  const cls = currentClass(); const ss = students();
  const records = model.assessments.filter(a => a.classId === cls.id && a.semester === state.semester);
  const todayRecords = records.filter(a => a.date === today()).length;
  const lacking = ss.filter(s => records.filter(a => a.studentId === s.id).length < 3).length;
  const pending = model.content.filter(c => c.authorId === CURRENT_USER_ID && c.status !== 'published' && c.status !== 'draft').length;
  return `<section class="hero-card"><div><span class="eyebrow">امروز چه کاری داری؟</span><h1>ثبت واقعی، بدون فرم‌های فرساینده</h1><p>سامانه ابتدا رفتار قابل مشاهده را می‌پرسد و سطح روبریک را از روی همان ثبت می‌کند.</p></div><button class="primary-button" data-action="start-assessment" data-mode="individual">${icon('plus')} ثبت یک مشاهده</button></section>
  <section class="stat-grid"><article><b>${fa(ss.length)}</b><span>دانش‌آموز</span></article><article><b>${fa(todayRecords)}</b><span>ثبت امروز</span></article><article><b>${fa(lacking)}</b><span>نیازمند شاهد بیشتر</span></article><article><b>${fa(pending)}</b><span>محتوای در بررسی</span></article></section>
  <section class="section"><div class="section-head"><div><span class="eyebrow">میان‌بُرها</span><h2>کمترین لمس، بیشترین سند</h2></div></div><div class="action-grid">
    <button data-action="attendance"><span class="action-icon">ح</span><b>حضور امروز</b><small>پیش‌فرض همه حاضر</small></button>
    <button data-action="start-assessment" data-mode="group"><span class="action-icon">گ</span><b>ثبت گروهی</b><small>فقط استثناها جدا</small></button>
    <button data-action="start-assessment" data-mode="individual"><span class="action-icon">ف</span><b>ثبت فردی</b><small>بر اساس روبریک</small></button>
    <button data-action="new-content"><span class="action-icon">ت</span><b>تجربه آموزشی</b><small>عکس، ویدیو یا متن</small></button>
  </div></section>
  ${attentionList(records, ss)}
  <section class="section"><div class="section-head"><div><span class="eyebrow">پیشنهاد همکاران</span><h2>قابل استفاده در همین کلاس</h2></div><button class="text-button" data-action="navigate" data-route="community">همه</button></div>${contentCards(model.content.filter(c=>c.status==='published').slice(0,2))}</section>`;
}

function attentionList(records, ss) {
  const items = ss.map(s => ({ s, count: records.filter(a=>a.studentId===s.id).length })).sort((a,b)=>a.count-b.count).slice(0,4);
  return `<section class="section"><div class="section-head"><div><span class="eyebrow">پوشش سنجش</span><h2>این دانش‌آموزان را از قلم نینداز</h2></div></div><div class="student-list">${items.map(({s,count})=>`<button class="student-row" data-action="assess-student" data-id="${s.id}"><span class="avatar">${esc(s.name.trim().charAt(0))}</span><span><b>${esc(s.name)}</b><small>${esc(s.group)} · ${fa(count)} شاهد</small></span><span class="status ${count>=3?'ok':'warn'}">${count>=3?'کافی':'نیازمند ثبت'}</span></button>`).join('')}</div></section>`;
}

function classView() {
  const ss = students(); const cls = currentClass();
  const recs = model.assessments.filter(a => a.classId === cls.id && a.semester === state.semester);
  return `<section class="page-head"><span class="eyebrow">کلاس جاری</span><h1>${esc(cls.grade)} · ${esc(cls.title)}</h1><p>${fa(ss.length)} دانش‌آموز؛ اطلاعات این کلاس مستقل از مدرسه‌های دیگر ذخیره می‌شود.</p></section>
  <div class="segmented"><button class="active">دانش‌آموزان</button><button data-action="attendance">حضور</button><button data-action="class-report">نمرات</button></div>
  <div class="search-wrap"><input id="student-search" type="search" placeholder="جست‌وجوی نام دانش‌آموز" aria-label="جست‌وجوی دانش‌آموز"><button class="clear-search" data-action="clear-search" aria-label="پاک کردن">×</button></div>
  <div class="student-list" id="student-list">${ss.map(s => { const own=recs.filter(a=>a.studentId===s.id); const avg=own.length?own.reduce((x,a)=>x+a.score,0)/own.length:null; return `<button class="student-row" data-action="student-detail" data-id="${s.id}" data-name="${esc(s.name)}"><span class="avatar">${esc(s.name.charAt(0))}</span><span><b>${esc(s.name)}</b><small>${esc(s.group)} · ${fa(own.length)} شاهد</small></span><span class="score-badge">${avg?fa(avg.toFixed(1)):'—'}</span></button>`; }).join('')}</div>`;
}

function assessmentView() {
  const recent = model.assessments.filter(a => a.classId === currentClass().id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,12);
  return `<section class="page-head"><span class="eyebrow">ثبت هدایت‌شده</span><h1>اول شاهد، بعد سطح</h1><p>عدد مستقیم انتخاب نمی‌شود؛ معلم توصیف رفتار واقعی را انتخاب می‌کند.</p></section>
  <div class="assessment-mode-grid"><button data-action="start-assessment" data-mode="individual"><span>ف</span><b>دانش‌آموز</b><small>یک مشاهده کوتاه</small></button><button data-action="start-assessment" data-mode="group"><span>گ</span><b>گروه</b><small>سطح مشترک + استثنا</small></button><button data-action="start-assessment" data-mode="class"><span>ک</span><b>کل کلاس</b><small>ثبت سریع یک معیار</small></button></div>
  <section class="section"><div class="section-head"><div><span class="eyebrow">آخرین ثبت‌ها</span><h2>قابل پیگیری و دفاع</h2></div></div><div class="timeline">${recent.length?recent.map(a=>{const s=model.students.find(x=>x.id===a.studentId);return `<button data-action="assessment-detail" data-id="${a.id}"><span>${esc(a.date)}</span><div><b>${esc(s?.name||'دانش‌آموز')} · ${esc(a.criterion)}</b><small>${esc(a.descriptor)}</small></div><strong>${fa(a.score)}</strong></button>`}).join(''):'<div class="empty">هنوز ثبتی وجود ندارد.</div>'}</div></section>`;
}

function communityView() {
  const tabs = [['feed','برای من'],['mine','محتوای من'],['review','صف بررسی'],['saved','ذخیره‌شده']];
  return `<section class="community-hero"><div><span class="eyebrow">شبکه حرفه‌ای معلمان</span><h1>چیزی که فردا در کلاس به کار می‌آید</h1><p>اعتبار از اجرای واقعی و تأیید مرحله‌ای می‌آید، نه هیجان کوتاه‌مدت شبکه‌های اجتماعی.</p></div><button class="primary-button" data-action="new-content">${icon('plus')} انتشار تجربه</button></section>
  <div class="tab-strip" role="tablist">${tabs.map(([id,label])=>`<button role="tab" aria-selected="${state.communityTab===id}" class="${state.communityTab===id?'active':''}" data-action="community-tab" data-tab="${id}">${label}</button>`).join('')}</div>
  ${communityTabView()}`;
}

function communityTabView() {
  if (state.communityTab === 'mine') return contentCards(model.content.filter(c=>c.authorId===CURRENT_USER_ID), true);
  if (state.communityTab === 'review') {
    const flow = ROLE_FLOW.find(x=>x.role===profile().role);
    const queue = flow ? model.content.filter(c=>c.status===flow.status) : [];
    return `<div class="notice"><b>نقش فعلی: ${esc(roleLabel(profile().role))}</b><span>${flow ? `محتوای مرحله «${esc(STATUS_LABELS[flow.status])}» نمایش داده می‌شود.` : 'برای معلم، صف رسمی بررسی وجود ندارد.'}</span></div>${contentCards(queue, true)}`;
  }
  if (state.communityTab === 'saved') {
    const ids = new Set(model.favorites.map(f=>f.contentId));
    return contentCards(model.content.filter(c=>ids.has(c.id)));
  }
  const cls=currentClass(), school=currentSchool();
  const sorted=model.content.filter(c=>c.status==='published').sort((a,b)=>scoreContent(b,cls,school)-scoreContent(a,cls,school));
  return `<section class="mission-card"><span>${icon('star')}</span><div><b>مأموریت حرفه‌ای هفته</b><p>یک تجربه را در کلاس اجرا کن و فقط سه جمله درباره نتیجه بنویس.</p></div><button data-action="new-content">شروع</button></section>${contentCards(sorted)}`;
}

function scoreContent(c, cls, school) { return (c.grade===cls.grade?5:0)+(c.resources===school.resources?3:0)+(c.approvalLevel==='national'?3:c.approvalLevel==='province'?2:0)+(c.reports||0)/20; }
function contentCards(list, showStatus=false) {
  if (!list.length) return '<div class="empty">موردی برای نمایش وجود ندارد.</div>';
  return `<div class="content-feed">${list.map(c=>`<article class="content-card"><button class="content-main" data-action="content-detail" data-id="${c.id}"><div class="content-meta"><span>${esc(c.grade||'همه پایه‌ها')}</span><span>${esc(c.skill||'عمومی')}</span>${showStatus?`<span class="workflow ${esc(c.status)}">${esc(STATUS_LABELS[c.status]||c.status)}</span>`:`<span class="verified">${c.approvalLevel==='national'?'تأیید کشوری':c.approvalLevel==='province'?'بررسی استانی':'منتشرشده'}</span>`}</div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><div class="content-stats"><span>${fa(c.uses||0)} بار استفاده</span><span>${fa(c.reports||0)} گزارش اجرا</span><span>${esc(c.authorName||'معلم')}</span></div></button><div class="content-actions"><button data-action="favorite-content" data-id="${c.id}">${icon('star')} ذخیره</button><button data-action="use-content" data-id="${c.id}">${icon('plus')} استفاده در کلاس</button></div></article>`).join('')}</div>`;
}

function settingsView() {
  return `<section class="page-head"><span class="eyebrow">تنظیمات و داده</span><h1>کنترل کامل روی اطلاعات گوشی</h1><p>در این نسخه هیچ داده‌ای خودکار به سرور ارسال نمی‌شود.</p></section>
  <section class="settings-list">
    <button data-action="install"><span>${icon('download')}</span><div><b>نصب روی صفحه اصلی</b><small>${state.installAvailable?'آماده نصب است':'پس از میزبانی HTTPS فعال می‌شود'}</small></div>${icon('arrow')}</button>
    <button data-action="export-lite"><span>${icon('share')}</span><div><b>اشتراک پشتیبان سبک</b><small>نمره‌ها و محتوا، بدون فایل‌های رسانه‌ای</small></div>${icon('arrow')}</button>
    <button data-action="export-full"><span>${icon('upload')}</span><div><b>پشتیبان کامل</b><small>شامل عکس و ویدیو؛ ممکن است حجیم باشد</small></div>${icon('arrow')}</button>
    <button data-action="import"><span>${icon('download')}</span><div><b>ورود پشتیبان یا بسته محتوا</b><small>ادغام با اطلاعات فعلی</small></div>${icon('arrow')}</button>
    <button data-action="storage"><span>${icon('shield')}</span><div><b>فضای ذخیره و ماندگاری</b><small>بررسی فضای مصرفی و درخواست حفاظت از داده</small></div>${icon('arrow')}</button>
    <button data-action="role"><span>${icon('users')}</span><div><b>نقش آزمایشی</b><small>${esc(roleLabel(profile().role))}؛ برای آزمون گردش تأیید</small></div>${icon('arrow')}</button>
    <button data-action="appearance"><span>${icon('star')}</span><div><b>ظاهر و عملکرد</b><small>حالت سبک، استاندارد و تم دستگاه</small></div>${icon('arrow')}</button>
    <button class="danger-row" data-action="reset"><span>${icon('trash')}</span><div><b>پاک‌کردن داده‌های آزمایشی</b><small>فقط پس از گرفتن پشتیبان</small></div>${icon('arrow')}</button>
  </section><div class="version">نسخه ${APP_VERSION} · موتور روبریک ${RUBRIC_VERSION}</div>`;
}

function modalView() {
  if (!state.modal) return '<div id="modal-root"></div>';
  const { type, payload } = state.modal;
  let title=''; let body='';
  if (type==='context') { title='مدرسه و کلاس'; body=contextModal(); }
  if (type==='assessment') { title=assessmentTitle(); body=assessmentModal(); }
  if (type==='attendance') { title='حضور و غیاب امروز'; body=attendanceModal(); }
  if (type==='content-editor') { title=payload?.id?'ویرایش محتوا':'انتشار تجربه آموزشی'; body=contentEditor(payload?.id); }
  if (type==='content-detail') { title='جزئیات محتوا'; body=contentDetail(payload.id); }
  if (type==='assessment-detail') { title='چرا این سطح ثبت شد؟'; body=assessmentDetail(payload.id); }
  if (type==='student-detail') { title='پرونده شواهد دانش‌آموز'; body=studentDetail(payload.id); }
  if (type==='storage') { title='فضای ذخیره'; body='<div id="storage-info" class="loading">در حال محاسبه…</div>'; setTimeout(loadStorageModal,0); }
  if (type==='role') { title='انتخاب نقش آزمایشی'; body=roleModal(); }
  if (type==='appearance') { title='ظاهر و عملکرد'; body=appearanceModal(); }
  if (type==='help') { title='راهنمای نسخه آزمایشی'; body=helpModal(); }
  if (type==='class-report') { title='گزارش نمرات کلاس'; body=classReportModal(); }
  return `<div id="modal-root"><div class="modal-backdrop" data-action="close-modal"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="sheet-handle"></div><header><h2 id="modal-title">${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="بستن">${icon('close')}</button></header><div class="sheet-body">${body}</div></section></div>`;
}

function openModal(type,payload={}) { state.modal={type,payload}; render(); }
function closeModal(){state.modal=null;state.assessment=null;render();}

function contextModal() {
  return `<div class="field"><label for="school-select">مدرسه</label><select id="school-select">${model.schools.map(s=>`<option value="${s.id}" ${s.id===state.selectedSchoolId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
  <div class="field"><label for="class-select">پایه و کلاس</label><select id="class-select">${model.classes.filter(c=>c.schoolId===state.selectedSchoolId).map(c=>`<option value="${c.id}" ${c.id===state.selectedClassId?'selected':''}>پایه ${esc(c.grade)} · ${esc(c.title)}</option>`).join('')}</select></div>
  <div class="field"><label>نیمسال</label><div class="radio-cards"><label><input type="radio" name="semester" value="first" ${state.semester==='first'?'checked':''}><span>نیمسال اول</span></label><label><input type="radio" name="semester" value="second" ${state.semester==='second'?'checked':''}><span>نیمسال دوم</span></label></div></div>
  <button class="primary-button wide" data-action="save-context">تأیید کلاس</button>`;
}

function startAssessment(mode, targetId=null) {
  const groups=[...new Set(students().map(s=>s.group))];
  state.assessment={ mode, step:1, startedAt:Date.now(), targetId:targetId||(mode==='individual'?students()[0]?.id:mode==='group'?groups[0]:'all'), date:today(), month:MONTHS[state.semester][0], activity:'', categoryKey:'analysis', criterionKey:'problemAnalysis', level:null, evidenceType:'direct', notePreset:'', note:'', exceptions:{}};
  openModal('assessment');
}
function assessmentTitle(){return state.assessment?.mode==='group'?'ثبت گروهی هدایت‌شده':state.assessment?.mode==='class'?'ثبت سریع کل کلاس':'ثبت فردی هدایت‌شده';}
function assessmentModal(){ const d=state.assessment; if(!d)return''; return `<div class="stepper"><span class="${d.step>=1?'done':''}">۱</span><i></i><span class="${d.step>=2?'done':''}">۲</span><i></i><span class="${d.step>=3?'done':''}">۳</span></div>${d.step===1?assessmentStep1():d.step===2?assessmentStep2():assessmentStep3()}`; }
function assessmentStep1(){const d=state.assessment;const groups=[...new Set(students().map(s=>s.group))];let target='';if(d.mode==='individual')target=`<div class="field"><label>دانش‌آموز</label><select id="assess-target" aria-label="انتخاب دانش‌آموز یا گروه">${students().map(s=>`<option value="${s.id}" ${s.id===d.targetId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>`;if(d.mode==='group')target=`<div class="field"><label>گروه</label><select id="assess-target" aria-label="انتخاب دانش‌آموز یا گروه">${groups.map(g=>`<option ${g===d.targetId?'selected':''}>${esc(g)}</option>`).join('')}</select></div>`;
  const recent=[...new Set(model.assessments.filter(a=>a.classId===currentClass().id).map(a=>a.activity))].slice(-4);
  const suggested=[...new Set([...recent,...Object.values(RUBRIC_LIBRARY).flatMap(x=>x.activities)])].slice(0,12);
  return `${target}<div class="two-col"><div class="field"><label>تاریخ</label><input id="assess-date" aria-label="تاریخ مشاهده" type="date" value="${d.date}"></div><div class="field"><label>ماه آموزشی</label><select id="assess-month" aria-label="ماه آموزشی">${MONTHS[state.semester].map(m=>`<option ${m===d.month?'selected':''}>${m}</option>`).join('')}</select></div></div><div class="field"><label>الان چه فعالیتی را دیدی؟</label><div class="choice-grid">${suggested.map(x=>`<button data-action="choose-activity" data-value="${esc(x)}" class="${d.activity===x?'active':''}">${esc(x)}</button>`).join('')}</div><input id="custom-activity" aria-label="عنوان فعالیت مشاهده‌شده" placeholder="یا عنوان کوتاه دیگری بنویس" value="${!suggested.includes(d.activity)?esc(d.activity):''}"></div><div class="modal-actions"><span></span><button class="primary-button" data-action="assessment-next">ادامه</button></div>`;}
function assessmentStep2(){const d=state.assessment;const cat=RUBRIC_LIBRARY[d.categoryKey];return `<div class="prompt"><small>فعالیت</small><b>${esc(d.activity)}</b></div><h3 class="question-title">هدف اصلی این مشاهده چیست؟</h3><div class="category-grid">${Object.entries(RUBRIC_LIBRARY).map(([k,v])=>`<button data-action="choose-category" data-value="${k}" class="${k===d.categoryKey?'active':''}"><span>${v.icon}</span><b>${esc(v.title)}</b><small>${esc(v.question)}</small></button>`).join('')}</div><h3 class="question-title">دقیقاً چه چیزی را سنجیدی؟</h3><div class="criterion-grid">${Object.entries(cat.criteria).map(([k,v])=>`<button data-action="choose-criterion" data-value="${k}" class="${k===d.criterionKey?'active':''}"><b>${esc(v.title)}</b><small>${esc(v.question)}</small><em>${esc(v.tips[0])}</em></button>`).join('')}</div><div class="modal-actions"><button class="ghost-button" data-action="assessment-back">بازگشت</button><button class="primary-button" data-action="assessment-next">دیدن رفتارها</button></div>`;}
function assessmentStep3(){const d=state.assessment;const criterion=getRubricCriterion(d.categoryKey,d.criterionKey);const base=Number(d.level);const exceptionStudents=d.mode==='group'?students().filter(s=>s.group===d.targetId):d.mode==='class'?students():[];
  return `<div class="prompt"><small>${esc(criterion.title)}</small><b>${esc(criterion.question)}</b></div><div class="behavior-grid">${RUBRIC_LEVELS.map(l=>`<button data-action="choose-level" data-value="${l.level}" class="level-card level-${l.level} ${base===l.level?'active':''}"><span>${fa(l.level)}</span><div><b>${esc(l.title)}</b><p>${esc(criterion.levels[l.level])}</p><small>نمره میانی ${fa(l.score)}</small></div></button>`).join('')}</div><h3 class="question-title">این قضاوت بر چه شاهدی است؟</h3><div class="evidence-grid">${EVIDENCE_TYPES.map(e=>`<button data-action="choose-evidence" data-value="${e.id}" class="${d.evidenceType===e.id?'active':''}"><span>${e.icon}</span><b>${esc(e.title)}</b><small>${esc(e.hint)}</small></button>`).join('')}</div><div class="field"><label>یادداشت آماده، اختیاری</label><div class="choice-grid compact">${NOTE_PRESETS.map(n=>`<button data-action="choose-note" data-value="${esc(n)}" class="${d.notePreset===n?'active':''}">${esc(n)}</button>`).join('')}</div></div><div class="field"><label>توضیح تکمیلی، اختیاری</label><textarea id="assess-note" aria-label="توضیح تکمیلی" maxlength="240" placeholder="فقط نکته‌ای که در توصیف روبریک نیست">${esc(d.note)}</textarea></div>${base&&d.mode!=='individual'?exceptionsEditor(exceptionStudents,base):''}<div class="reason-preview"><small>مبنای ثبت</small><p>${base?esc(buildRationale(d,criterion,base)):'پس از انتخاب رفتار قابل مشاهده، دلیل ثبت اینجا ساخته می‌شود.'}</p></div><div class="modal-actions"><button class="ghost-button" data-action="assessment-back">بازگشت</button><button class="primary-button" data-action="save-assessment" ${base?'':'disabled'}>ثبت با دلیل</button></div>`;}
function exceptionsEditor(ss,base){const d=state.assessment;return `<details class="exceptions"><summary>آیا عملکرد فردی با گروه متفاوت بود؟ <span>${fa(Object.keys(d.exceptions).length)}</span></summary><p>فقط افراد متفاوت را تغییر بده. بقیه سطح ${fa(base)} می‌گیرند.</p>${ss.map(s=>`<div class="exception-row"><span>${esc(s.name)}</span><select data-exception="${s.id}"><option value="">همان گروه</option>${RUBRIC_LEVELS.filter(l=>l.level!==base).map(l=>`<option value="${l.level}" ${Number(d.exceptions[s.id])===l.level?'selected':''}>سطح ${fa(l.level)} · ${esc(l.title)}</option>`).join('')}</select></div>`).join('')}</details>`;}
function buildRationale(d,criterion,level){const li=levelInfo(level),ev=EVIDENCE_TYPES.find(e=>e.id===d.evidenceType);return `${criterion.title}: «${criterion.levels[level]}»؛ بر پایه ${ev?.title||'شاهد ثبت‌شده'}${d.notePreset?`، ${d.notePreset}`:''}. سطح ${level} (${li.title}) طبق ${RUBRIC_VERSION}.`;}

function attendanceModal(){const prior=model.attendance.find(a=>a.classId===currentClass().id&&a.date===today());const absent=new Set(prior?.absentIds||[]);const late=new Set(prior?.lateIds||[]);return `<div class="notice"><b>پیش‌فرض همه حاضرند</b><span>فقط غایب‌ها و تأخیرها را مشخص کن.</span></div><div class="attendance-list">${students().map(s=>`<div><span>${esc(s.name)}</span><div class="mini-segment"><label><input type="radio" name="att-${s.id}" value="present" ${!absent.has(s.id)&&!late.has(s.id)?'checked':''}><span>حاضر</span></label><label><input type="radio" name="att-${s.id}" value="late" ${late.has(s.id)?'checked':''}><span>تأخیر</span></label><label><input type="radio" name="att-${s.id}" value="absent" ${absent.has(s.id)?'checked':''}><span>غایب</span></label></div></div>`).join('')}</div><button class="primary-button wide" data-action="save-attendance">ذخیره حضور امروز</button>`;}

function contentEditor(id){const c=model.content.find(x=>x.id===id)||{title:'',summary:'',body:'',grade:currentClass().grade,skill:'',resources:currentSchool().resources,type:'experience',status:'draft',mediaIds:[]};return `<form id="content-form"><input type="hidden" name="id" value="${esc(c.id||'')}"><div class="field"><label>نوع محتوا</label><div class="radio-cards"><label><input type="radio" name="type" value="experience" ${c.type==='experience'?'checked':''}><span>تجربه اجرایی</span></label><label><input type="radio" name="type" value="learning" ${c.type==='learning'?'checked':''}><span>محتوای آموزشی</span></label></div></div><div class="field"><label>عنوان روشن و کاربردی</label><input id="content-title" name="title" aria-label="عنوان محتوا" required maxlength="100" value="${esc(c.title)}" placeholder="مثلاً آموزش ایمنی برق با چهار ایستگاه"></div><div class="field"><label>خلاصه یک‌خطی</label><textarea id="content-summary" name="summary" aria-label="خلاصه محتوا" required maxlength="220" placeholder="این محتوا دقیقاً چه مشکلی را حل می‌کند؟">${esc(c.summary)}</textarea></div><div class="two-col"><div class="field"><label>پایه</label><select id="content-grade" name="grade" aria-label="پایه">${['هفتم','هشتم','نهم','همه'].map(x=>`<option ${x===c.grade?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>سطح امکانات</label><select id="content-resources" name="resources" aria-label="سطح امکانات">${['کم‌برخوردار','متوسط','برخوردار','همه'].map(x=>`<option ${x===c.resources?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field"><label>مهارت یا موضوع</label><input id="content-skill" name="skill" aria-label="مهارت یا موضوع" required maxlength="80" value="${esc(c.skill)}" placeholder="مثلاً طراحی وب"></div><div class="field"><label>شرح کاربردی</label><textarea id="content-body" name="body" aria-label="شرح کاربردی" required maxlength="1500" rows="6" placeholder="مسئله، روش اجرا، نتیجه و نکته‌ای که جواب نداد را کوتاه و واقعی بنویس.">${esc(c.body)}</textarea></div><div class="media-uploader"><div><b>عکس یا ویدیو آموزشی</b><small>عکس خودکار سبک می‌شود. ویدیو حداکثر ۲۵ مگابایت.</small></div><label class="upload-button">${icon('camera')} انتخاب فایل<input id="content-media" type="file" accept="image/*,video/mp4,video/webm" multiple></label><div id="pending-media" class="pending-media"></div></div><label class="privacy-check"><input type="checkbox" name="privacy" required><span>تأیید می‌کنم نام، نمره یا تصویر بدون رضایت دانش‌آموز در فایل‌ها وجود ندارد.</span></label><div class="workflow-note">پس از ارسال، محتوا به ترتیب مدرسه ← منطقه ← استان ← کشوری بررسی می‌شود. در نسخه محلی، بسته را دستی برای بررسی به مسئول مربوط می‌فرستید.</div><div class="modal-actions"><button type="button" class="ghost-button" data-action="save-content-draft">ذخیره پیش‌نویس</button><button type="button" class="primary-button" data-action="submit-content">ارسال برای بررسی</button></div></form>`;}

function contentDetail(id){const c=model.content.find(x=>x.id===id);if(!c)return'<div class="empty">محتوا پیدا نشد.</div>';const media=model.media.filter(m=>m.contentId===id);const approvals=model.approvals.filter(a=>a.contentId===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));const flow=ROLE_FLOW.find(x=>x.role===profile().role);const canReview=flow&&flow.status===c.status;return `<div class="content-detail"><div class="content-meta"><span>${esc(c.grade)}</span><span>${esc(c.skill)}</span><span class="workflow ${esc(c.status)}">${esc(STATUS_LABELS[c.status])}</span></div><h2>${esc(c.title)}</h2><p class="lead">${esc(c.summary)}</p>${media.length?`<div class="media-gallery">${media.map(m=>m.type.startsWith('image/')?`<button data-action="open-media" data-id="${m.id}"><img data-media-id="${m.id}" alt="تصویر محتوای آموزشی" loading="lazy"></button>`:`<video data-media-id="${m.id}" controls preload="metadata"></video>`).join('')}</div>`:''}<div class="rich-text">${esc(c.body).replace(/\n/g,'<br>')}</div><div class="audit-flow"><h3>مسیر تأیید</h3>${approvals.length?approvals.map(a=>`<div><span>${esc(roleLabel(a.role))}</span><b>${a.action==='approve'?'تأیید':a.action==='changes'?'درخواست اصلاح':'رد'}</b><small>${esc(a.comment||'بدون توضیح')}</small></div>`).join(''):'<p>هنوز بررسی ثبت نشده است.</p>'}</div>${c.authorId===CURRENT_USER_ID&&c.status==='draft'?`<button class="primary-button wide" data-action="edit-content" data-id="${c.id}">ادامه و ارسال</button>`:''}${canReview?`<div class="review-box"><textarea id="review-comment" aria-label="توضیح بررسی" placeholder="توضیح بررسی، کوتاه و مشخص"></textarea><div><button class="danger-button" data-action="review-content" data-id="${c.id}" data-decision="changes">نیازمند اصلاح</button><button class="primary-button" data-action="review-content" data-id="${c.id}" data-decision="approve">تأیید این مرحله</button></div></div>`:''}<div class="content-actions full"><button data-action="share-content-package" data-id="${c.id}">${icon('share')} اشتراک بسته برای بررسی</button><button data-action="use-content" data-id="${c.id}">${icon('plus')} استفاده در کلاس</button></div></div>`;}

function assessmentDetail(id){const a=model.assessments.find(x=>x.id===id);if(!a)return'<div class="empty">ثبت پیدا نشد.</div>';const s=model.students.find(x=>x.id===a.studentId);return `<div class="evidence-detail"><div class="score-circle">${fa(a.score)}</div><h3>${esc(s?.name||'دانش‌آموز')}</h3><p>${esc(a.rationale)}</p><dl><dt>فعالیت</dt><dd>${esc(a.activity)}</dd><dt>معیار</dt><dd>${esc(a.criterion)}</dd><dt>رفتار مشاهده‌شده</dt><dd>${esc(a.descriptor)}</dd><dt>نوع شاهد</dt><dd>${esc(a.evidenceTitle)}</dd><dt>ثبت‌کننده</dt><dd>${esc(profile().name)} · ${esc(a.date)}</dd><dt>نسخه روبریک</dt><dd>${esc(a.rubricVersion)}</dd></dl></div>`;}
function studentDetail(id){const s=model.students.find(x=>x.id===id);const recs=model.assessments.filter(a=>a.studentId===id&&a.classId===currentClass().id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return `<div class="student-profile"><span class="avatar big">${esc(s?.name.charAt(0))}</span><h3>${esc(s?.name||'')}</h3><p>${esc(s?.group||'')} · ${fa(recs.length)} شاهد</p></div><button class="primary-button wide" data-action="assess-student" data-id="${id}">${icon('plus')} ثبت مشاهده جدید</button><div class="timeline">${recs.map(a=>`<button data-action="assessment-detail" data-id="${a.id}"><span>${esc(a.date)}</span><div><b>${esc(a.criterion)}</b><small>${esc(a.descriptor)}</small></div><strong>${fa(a.score)}</strong></button>`).join('')||'<div class="empty">هنوز شاهدی ثبت نشده است.</div>'}</div>`;}

function classReportModal(){
  const months=MONTHS[state.semester];
  const rows=students().map(s=>{const recs=model.assessments.filter(a=>a.studentId===s.id&&a.classId===currentClass().id&&a.semester===state.semester);const scores=months.map(m=>{const x=recs.filter(a=>a.month===m);return x.length?x.reduce((t,a)=>t+a.score,0)/x.length:null});const valid=scores.filter(Number.isFinite);const final=valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;return {s,scores,final,count:recs.length};});
  return `<div class="notice"><b>قاعده محاسبه</b><span>نمره نیمسال میانگین ماه‌های دارای شاهد است؛ ماه بدون ثبت وارد میانگین نمی‌شود.</span></div><div class="report-table-wrap"><table class="report-table"><thead><tr><th>نام</th>${months.map(m=>`<th>${m}</th>`).join('')}<th>نیمسال</th><th>شاهد</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.s.name)}</td>${r.scores.map(x=>`<td>${x?fa(x.toFixed(1)):'—'}</td>`).join('')}<td><b>${r.final?fa(r.final.toFixed(1)):'—'}</b></td><td>${fa(r.count)}</td></tr>`).join('')}</tbody></table></div><button class="primary-button wide" data-action="export-class-csv">خروجی CSV نمرات</button>`;
}
async function exportClassCsv(){const months=MONTHS[state.semester];const lines=[['نام دانش‌آموز',...months,'نمره نیمسال','تعداد شواهد']];for(const s of students()){const recs=model.assessments.filter(a=>a.studentId===s.id&&a.classId===currentClass().id&&a.semester===state.semester);const scores=months.map(m=>{const x=recs.filter(a=>a.month===m);return x.length?x.reduce((t,a)=>t+a.score,0)/x.length:''});const valid=scores.filter(Number.isFinite);const final=valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:'';lines.push([s.name,...scores.map(x=>x===''?'':x.toFixed(2)),final===''?'':final.toFixed(2),recs.length]);}const csv='\uFEFF'+lines.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`نمرات-${currentClass().title}-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('فایل نمرات ساخته شد.','success');}

function roleModal(){const roles=['teacher','school_reviewer','district_reviewer','province_reviewer','national_reviewer'];return `<div class="radio-list">${roles.map(r=>`<label><input type="radio" name="role" value="${r}" ${profile().role===r?'checked':''}><span><b>${esc(roleLabel(r))}</b><small>${r==='teacher'?'تولید و ارسال محتوا':'بررسی مرحله مربوط و ثبت سابقه'}</small></span></label>`).join('')}</div><div class="notice warn"><b>فقط برای پایلوت محلی</b><span>این تغییر نقش احراز هویت واقعی نیست و صرفاً برای آزمودن گردش کار است.</span></div><button class="primary-button wide" data-action="save-role">ذخیره نقش</button>`;}
function appearanceModal(){const s=model.settings;return `<div class="field"><label>حالت نمایش</label><select id="theme-select" aria-label="حالت نمایش"><option value="system" ${s.theme==='system'?'selected':''}>مطابق گوشی</option><option value="light" ${s.theme==='light'?'selected':''}>روشن</option><option value="dark" ${s.theme==='dark'?'selected':''}>تیره</option></select></div><div class="field"><label>عملکرد</label><select id="lite-select" aria-label="حالت عملکرد"><option value="auto" ${s.liteMode==='auto'?'selected':''}>خودکار بر اساس گوشی</option><option value="off" ${s.liteMode==='off'?'selected':''}>استاندارد</option><option value="on" ${s.liteMode==='on'?'selected':''}>سبک برای گوشی ضعیف</option></select></div><button class="primary-button wide" data-action="save-appearance">اعمال تنظیمات</button>`;}
function helpModal(){return `<div class="help-steps"><div><span>۱</span><p><b>کلاس را بررسی کن</b>نام مدرسه و کلاس همیشه بالای صفحه دیده می‌شود.</p></div><div><span>۲</span><p><b>رفتار واقعی را انتخاب کن</b>سامانه از روی توصیف استاندارد، سطح و دلیل را می‌سازد.</p></div><div><span>۳</span><p><b>پشتیبان دستی بگیر</b>اطلاعات فقط روی همین گوشی است؛ مرتب فایل پشتیبان را به فضای امن منتقل کن.</p></div><div><span>۴</span><p><b>محتوا را مرحله‌ای ارسال کن</b>برای بررسی، بسته محتوا را با مسئول مدرسه یا منطقه به اشتراک بگذار.</p></div></div>`;}

async function bindDynamicMedia(){for(const el of document.querySelectorAll('[data-media-id]')){const m=model.media.find(x=>x.id===el.dataset.mediaId);if(m?.blob&&!el.src){const url=URL.createObjectURL(m.blob);el.src=url;el.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});}}}

async function saveContext(){const schoolId=document.querySelector('#school-select').value;const schoolClasses=model.classes.filter(c=>c.schoolId===schoolId);const selected=document.querySelector('#class-select').value;state.selectedSchoolId=schoolId;state.selectedClassId=schoolClasses.some(c=>c.id===selected)?selected:schoolClasses[0]?.id;state.semester=document.querySelector('input[name=semester]:checked').value;model.settings={...model.settings,selectedSchoolId:state.selectedSchoolId,selectedClassId:state.selectedClassId,semester:state.semester};await saveSettings(model.settings);closeModal();showToast('کلاس جاری تغییر کرد.');}

async function saveAssessment(){const d=state.assessment;if(!d.level)return;d.note=document.querySelector('#assess-note')?.value.trim()||d.note;document.querySelectorAll('[data-exception]').forEach(x=>{if(x.value)d.exceptions[x.dataset.exception]=Number(x.value);else delete d.exceptions[x.dataset.exception];});const criterion=getRubricCriterion(d.categoryKey,d.criterionKey);const targetStudents=d.mode==='individual'?students().filter(s=>s.id===d.targetId):d.mode==='group'?students().filter(s=>s.group===d.targetId):students();const now=new Date().toISOString();for(const s of targetStudents){const level=Number(d.exceptions[s.id]||d.level);const li=levelInfo(level);await put('assessments',{id:uuid(),studentId:s.id,classId:currentClass().id,schoolId:currentSchool().id,semester:state.semester,date:d.date,month:d.month,activity:d.activity,categoryKey:d.categoryKey,criterionKey:d.criterionKey,criterion:criterion.title,descriptor:criterion.levels[level],level,score:li.score,evidenceType:d.evidenceType,evidenceTitle:EVIDENCE_TYPES.find(e=>e.id===d.evidenceType)?.title,notePreset:d.notePreset,note:d.note,rationale:buildRationale({...d,level},criterion,level),rubricVersion:RUBRIC_VERSION,createdAt:now,entryDurationSec:Math.round((Date.now()-d.startedAt)/1000)});}await put('audit',{id:uuid(),type:'assessment_saved',actorId:CURRENT_USER_ID,classId:currentClass().id,count:targetStudents.length,createdAt:now});closeModal();await refresh();showToast(`${fa(targetStudents.length)} ثبت مستند ذخیره شد.`,'success');}

async function saveAttendance(){const absentIds=[],lateIds=[];for(const s of students()){const value=document.querySelector(`input[name="att-${s.id}"]:checked`)?.value;if(value==='absent')absentIds.push(s.id);if(value==='late')lateIds.push(s.id);}const existing=model.attendance.find(a=>a.classId===currentClass().id&&a.date===today());await put('attendance',{id:existing?.id||uuid(),classId:currentClass().id,schoolId:currentSchool().id,date:today(),absentIds,lateIds,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});closeModal();await refresh();showToast('حضور امروز ذخیره شد.','success');}

async function compressImage(file){if(!file.type.startsWith('image/'))return file;try{const bitmap=await createImageBitmap(file);const max=1600;const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||file),'image/jpeg',0.78));}catch{return file;}}
let pendingMedia=[];
async function mediaSelected(input){pendingMedia=[];const holder=document.querySelector('#pending-media');holder.innerHTML='';for(const file of [...input.files].slice(0,4)){if(file.type.startsWith('video/')&&file.size>25*1024*1024){showToast(`ویدیوی ${file.name} بیشتر از ۲۵ مگابایت است.`,'error');continue;}if(file.type.startsWith('image/')&&file.size>12*1024*1024){showToast(`تصویر ${file.name} بیش از حد بزرگ است.`,'error');continue;}const blob=await compressImage(file);pendingMedia.push({id:uuid(),name:file.name,type:blob.type||file.type,size:blob.size,blob});holder.insertAdjacentHTML('beforeend',`<span>${file.type.startsWith('image/')?'تصویر':'ویدیو'} · ${esc(file.name)} · ${fmtBytes(blob.size)}</span>`);}input.value='';}

async function saveContent(submit){const form=document.querySelector('#content-form');if(submit&&!form.reportValidity())return;const fd=new FormData(form);const id=fd.get('id')||uuid();const old=model.content.find(c=>c.id===id);const now=new Date().toISOString();const mediaIds=[...(old?.mediaIds||[])];for(const item of pendingMedia){await put('media',{...item,contentId:id,createdAt:now});mediaIds.push(item.id);}const content={...old,id,authorId:CURRENT_USER_ID,authorName:profile().name,title:String(fd.get('title')||'').trim(),summary:String(fd.get('summary')||'').trim(),body:String(fd.get('body')||'').trim(),grade:fd.get('grade'),skill:String(fd.get('skill')||'').trim(),resources:fd.get('resources'),type:fd.get('type'),status:submit?'school_pending':'draft',approvalLevel:'teacher',mediaIds,uses:old?.uses||0,reports:old?.reports||0,createdAt:old?.createdAt||now,updatedAt:now};if(!content.title){showToast('عنوان را وارد کن.','error');return;}await put('content',content);await put('audit',{id:uuid(),type:submit?'content_submitted':'content_draft_saved',contentId:id,actorId:CURRENT_USER_ID,createdAt:now});pendingMedia=[];closeModal();await refresh();state.route='community';state.communityTab='mine';render();showToast(submit?'برای بررسی مدرسه آماده شد.':'پیش‌نویس روی گوشی ذخیره شد.','success');}

async function reviewContent(id,decision){const c=model.content.find(x=>x.id===id);const flow=ROLE_FLOW.find(x=>x.role===profile().role);if(!flow||c.status!==flow.status){showToast('این محتوا در مرحله مربوط به نقش شما نیست.','error');return;}const comment=document.querySelector('#review-comment')?.value.trim()||'';const action=decision==='approve'?'approve':'changes';c.status=decision==='approve'?flow.next:'changes_requested';c.approvalLevel=decision==='approve'?profile().role.replace('_reviewer',''):c.approvalLevel;c.updatedAt=new Date().toISOString();await put('content',c);await put('approvals',{id:uuid(),contentId:id,role:profile().role,reviewerId:CURRENT_USER_ID,reviewerName:profile().name,action,comment,createdAt:new Date().toISOString()});closeModal();await refresh();showToast(decision==='approve'?'مرحله بررسی تأیید شد.':'برای اصلاح به معلم برگشت.','success');}

async function favoriteContent(id){const existing=model.favorites.find(f=>f.contentId===id&&f.userId===CURRENT_USER_ID);if(existing)await remove('favorites',existing.id);else await put('favorites',{id:uuid(),contentId:id,userId:CURRENT_USER_ID,createdAt:new Date().toISOString()});await refresh();showToast(existing?'از ذخیره‌شده‌ها حذف شد.':'برای بعد ذخیره شد.');}
async function useContent(id){const c=model.content.find(x=>x.id===id);c.uses=(c.uses||0)+1;await put('content',c);await put('audit',{id:uuid(),type:'content_used',contentId:id,classId:currentClass().id,actorId:CURRENT_USER_ID,createdAt:new Date().toISOString()});await refresh();showToast('به برنامه کلاس جاری افزوده شد.','success');}

async function exportFile({includeMedia=false,contentId=null}={}){showToast('در حال ساخت فایل…');const payload=await exportDatabase({includeMedia,selectedContentId:contentId});const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});const name=contentId?`بسته-محتوا-${contentId}.karo.json`:`پشتیبان-همیار-${today()}${includeMedia?'-کامل':''}.karo.json`;const file=new File([blob],name,{type:'application/json'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({title:'همیار کاروفناوری',text:contentId?'بسته محتوا برای بررسی مرحله‌ای':'پشتیبان اطلاعات سامانه',files:[file]});showToast('فایل به اشتراک گذاشته شد.','success');return;}catch(e){if(e.name==='AbortError')return;}}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('فایل ذخیره شد.','success');}
async function importFile(file){try{const payload=JSON.parse(await file.text());await importDatabase(payload,{mode:'merge'});await refresh();showToast('اطلاعات با موفقیت ادغام شد.','success');}catch(e){console.error(e);showToast(e.message||'ورود فایل ناموفق بود.','error');}}

async function loadStorageModal(){const info=await storageInfo();const pct=info.quota?Math.min(100,Math.round(info.usage/info.quota*100)):0;const el=document.querySelector('#storage-info');if(!el)return;el.innerHTML=`<div class="storage-meter"><div style="width:${pct}%"></div></div><dl><dt>فضای مصرفی</dt><dd>${fmtBytes(info.usage)}</dd><dt>سقف تقریبی مرورگر</dt><dd>${fmtBytes(info.quota)}</dd><dt>حفاظت از پاک‌سازی خودکار</dt><dd>${info.persisted?'فعال':'فعال نیست'}</dd></dl><button class="primary-button wide" data-action="persist-storage">درخواست ماندگاری داده</button><div class="notice warn"><b>پشتیبان همچنان ضروری است</b><span>حذف مرورگر یا پاک‌کردن داده سایت می‌تواند اطلاعات محلی را از بین ببرد.</span></div>`;}

async function handleAction(el){const action=el.dataset.action;
  if(action==='navigate'){state.route=el.dataset.route;state.modal=null;render();document.querySelector('#main-content')?.focus();}
  else if(action==='context')openModal('context'); else if(action==='close-modal')closeModal(); else if(action==='open-help')openModal('help');
  else if(action==='save-context')await saveContext(); else if(action==='start-assessment')startAssessment(el.dataset.mode); else if(action==='assess-student')startAssessment('individual',el.dataset.id);
  else if(action==='attendance')openModal('attendance'); else if(action==='save-attendance')await saveAttendance(); else if(action==='class-report')openModal('class-report'); else if(action==='export-class-csv')await exportClassCsv();
  else if(action==='assessment-next')assessmentNext(); else if(action==='assessment-back'){state.assessment.step--;render();}
  else if(action==='choose-activity'){state.assessment.activity=el.dataset.value;render();}
  else if(action==='choose-category'){state.assessment.categoryKey=el.dataset.value;state.assessment.criterionKey=Object.keys(RUBRIC_LIBRARY[el.dataset.value].criteria)[0];state.assessment.level=null;render();}
  else if(action==='choose-criterion'){state.assessment.criterionKey=el.dataset.value;state.assessment.level=null;render();}
  else if(action==='choose-level'){state.assessment.level=Number(el.dataset.value);render();}
  else if(action==='choose-evidence'){state.assessment.evidenceType=el.dataset.value;render();}
  else if(action==='choose-note'){state.assessment.notePreset=state.assessment.notePreset===el.dataset.value?'':el.dataset.value;render();}
  else if(action==='save-assessment')await saveAssessment(); else if(action==='assessment-detail')openModal('assessment-detail',{id:el.dataset.id});
  else if(action==='student-detail')openModal('student-detail',{id:el.dataset.id}); else if(action==='clear-search'){document.querySelector('#student-search').value='';filterStudents('');}
  else if(action==='community-tab'){state.communityTab=el.dataset.tab;render();} else if(action==='new-content'){pendingMedia=[];openModal('content-editor');}
  else if(action==='edit-content'){pendingMedia=[];openModal('content-editor',{id:el.dataset.id});} else if(action==='save-content-draft')await saveContent(false); else if(action==='submit-content')await saveContent(true);
  else if(action==='content-detail')openModal('content-detail',{id:el.dataset.id}); else if(action==='review-content')await reviewContent(el.dataset.id,el.dataset.decision);
  else if(action==='favorite-content')await favoriteContent(el.dataset.id); else if(action==='use-content')await useContent(el.dataset.id);
  else if(action==='share-content-package')await exportFile({includeMedia:true,contentId:el.dataset.id}); else if(action==='open-media'){const m=model.media.find(x=>x.id===el.dataset.id);if(m?.blob){const url=URL.createObjectURL(m.blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}}
  else if(action==='export-lite')await exportFile(); else if(action==='export-full'){if(confirm('فایل کامل ممکن است حجیم باشد. ادامه می‌دهید؟'))await exportFile({includeMedia:true});}
  else if(action==='import')fileImport.click(); else if(action==='storage')openModal('storage'); else if(action==='persist-storage'){const ok=await requestPersistentStorage();showToast(ok?'ماندگاری داده فعال شد.':'مرورگر این درخواست را نپذیرفت.');await loadStorageModal();}
  else if(action==='role')openModal('role'); else if(action==='save-role'){const role=document.querySelector('input[name=role]:checked').value;model.profile={...profile(),role,roleLabel:roleLabel(role)};await saveProfile(model.profile);closeModal();await refresh();showToast('نقش آزمایشی تغییر کرد.');}
  else if(action==='appearance')openModal('appearance'); else if(action==='save-appearance'){model.settings={...model.settings,theme:document.querySelector('#theme-select').value,liteMode:document.querySelector('#lite-select').value};await saveSettings(model.settings);closeModal();await refresh();}
  else if(action==='install'){if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;state.installAvailable=false;render();}else showToast('برای نصب، سامانه باید روی HTTPS باز شود.');}
  else if(action==='reset'){if(confirm('همه داده‌های آزمایشی این گوشی پاک شود؟')){await clearAll();location.reload();}}
}
function assessmentNext(){const d=state.assessment;if(d.step===1){d.targetId=document.querySelector('#assess-target')?.value||d.targetId;d.date=document.querySelector('#assess-date').value;d.month=document.querySelector('#assess-month').value;const custom=document.querySelector('#custom-activity').value.trim();if(custom)d.activity=custom;if(!d.activity){showToast('فعالیت مشاهده‌شده را انتخاب یا وارد کن.','error');return;}}if(d.step<3)d.step++;render();}
function filterStudents(query){const q=query.trim();document.querySelectorAll('#student-list .student-row').forEach(row=>row.hidden=q&&!row.dataset.name.includes(q));}

app.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el){e.preventDefault();handleAction(el);}});
app.addEventListener('input',e=>{if(e.target.id==='student-search')filterStudents(e.target.value);});
app.addEventListener('change',async e=>{if(e.target.id==='school-select'){state.selectedSchoolId=e.target.value;state.selectedClassId=model.classes.find(c=>c.schoolId===state.selectedSchoolId)?.id;render();openModal('context');}if(e.target.id==='content-media')await mediaSelected(e.target);});
app.addEventListener('submit',async e=>{if(e.target.id==='content-form'){e.preventDefault();await saveContent(true);}});
fileImport.addEventListener('change',async()=>{if(fileImport.files[0])await importFile(fileImport.files[0]);fileImport.value='';});
window.addEventListener('online',()=>{state.online=true;render();showToast('اینترنت برقرار شد؛ داده‌ها همچنان محلی‌اند.');});
window.addEventListener('offline',()=>{state.online=false;render();showToast('آفلاین هستید؛ ثبت ادامه دارد.');});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;state.installAvailable=true;render();});
window.addEventListener('appinstalled',()=>{installPrompt=null;state.installAvailable=false;showToast('سامانه نصب شد.','success');});

async function init(){await ensureSeed();await refresh();if(!model.settings.onboardingDone){model.settings={...model.settings,onboardingDone:true};await saveSettings(model.settings);state.modal={type:'help',payload:{}};render();}if('serviceWorker'in navigator){try{const reg=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)showToast('نسخه تازه آماده است؛ برنامه را دوباره باز کن.');});});}catch(e){console.warn('SW',e);}}}
init();

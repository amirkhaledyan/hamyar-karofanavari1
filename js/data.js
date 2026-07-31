import { bulkPut, get, getAll, put } from './db.js';

export const APP_VERSION = '1.0.0-mobile-pilot';
export const CURRENT_USER_ID = 'teacher-1';

function uuid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
export { uuid };

function makeStudents(classId, count, groupCount = 7) {
  const first = ['آرمان','آوا','امیرعلی','باران','پارسا','ترانه','سارا','سامان','علی','محمد','نگین','هلیا','یاسین','روناک','متین','نیایش','رضا','آیدا','شایان','مریم'];
  const last = ['احمدی','محمدی','مرادی','کریمی','حسینی','صادقی','عباسی','محمودی','کاظمی','رحیمی','قادری','عزیزی'];
  return Array.from({ length: count }, (_, i) => ({
    id: `${classId}-s-${i + 1}`,
    classId,
    code: String(i + 1).padStart(2, '0'),
    name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`,
    group: `گروه ${Math.floor(i / Math.ceil(count / groupCount)) + 1}`,
    active: true,
  }));
}

export async function ensureSeed() {
  const seeded = await get('meta', 'seeded');
  if (seeded) return;
  const schools = [
    { id: 'school-1', name: 'دبیرستان دوره اول اندیشه', province: 'کردستان', district: 'دهگلان', resources: 'متوسط' },
    { id: 'school-2', name: 'دبیرستان دوره اول فرهنگ', province: 'کردستان', district: 'دهگلان', resources: 'برخوردار' },
    { id: 'school-3', name: 'مدرسه روستایی امید', province: 'کردستان', district: 'دهگلان', resources: 'کم‌برخوردار' },
  ];
  const classes = [
    { id: 'class-701', schoolId: 'school-1', grade: 'هفتم', title: '۷۰۱', semester: 'first' },
    { id: 'class-802', schoolId: 'school-1', grade: 'هشتم', title: '۸۰۲', semester: 'first' },
    { id: 'class-801', schoolId: 'school-2', grade: 'هشتم', title: '۸۰۱', semester: 'first' },
    { id: 'class-903', schoolId: 'school-2', grade: 'نهم', title: '۹۰۳', semester: 'first' },
    { id: 'class-702', schoolId: 'school-3', grade: 'هفتم', title: '۷۰۲', semester: 'first' },
  ];
  const students = classes.flatMap((c, i) => makeStudents(c.id, [35, 34, 31, 33, 24][i]));
  const content = [
    {
      id: 'content-1', authorId: 'teacher-demo-2', authorName: 'مریم احمدی', title: 'گلخانه هوشمند کم‌هزینه با بطری بازیافتی',
      summary: 'اجرای مرحله‌ای مفهوم ورودی، پردازش و خروجی در مدرسه کم‌برخوردار.', body: 'گروه‌ها ابتدا مدل دستی آبیاری را ساختند و سپس یک نمونه حسگردار را مشاهده کردند.',
      grade: 'هشتم', skill: 'ریزکنترل‌کننده‌ها', resources: 'کم‌برخوردار', type: 'experience', status: 'published', approvalLevel: 'province',
      tags: ['هوشمندسازی','کم‌هزینه','پروژه'], mediaIds: [], uses: 48, reports: 17, createdAt: '2026-07-12T08:00:00Z', updatedAt: '2026-07-12T08:00:00Z'
    },
    {
      id: 'content-2', authorId: 'teacher-demo-3', authorName: 'رضا عباسی', title: 'دفاع ۹۰ ثانیه‌ای برای سنجش سهم فردی در طراحی وب',
      summary: 'دو سؤال ثابت و یک اصلاح کوچک کد، بدون اتلاف زمان کلاس.', body: 'برای هر عضو گروه یک دفاع کوتاه و اصلاح کوچک در کد تعیین شد تا سهم واقعی مشخص شود.',
      grade: 'نهم', skill: 'طراحی وب', resources: 'متوسط', type: 'learning', status: 'published', approvalLevel: 'national',
      tags: ['طراحی وب','ارزشیابی','کار گروهی'], mediaIds: [], uses: 75, reports: 39, createdAt: '2026-07-20T08:00:00Z', updatedAt: '2026-07-20T08:00:00Z'
    },
  ];
  await bulkPut('schools', schools);
  await bulkPut('classes', classes);
  await bulkPut('students', students);
  await bulkPut('content', content);
  await put('meta', { key: 'profile', value: { id: CURRENT_USER_ID, name: 'امیر خالدیان', role: 'teacher', roleLabel: 'دبیر کاروفناوری' } });
  await put('meta', { key: 'settings', value: { selectedSchoolId: 'school-1', selectedClassId: 'class-701', semester: 'first', theme: 'system', liteMode: 'auto', onboardingDone: false } });
  await put('meta', { key: 'seeded', value: true, version: APP_VERSION, createdAt: new Date().toISOString() });
}

export async function readModel() {
  const [schools, classes, students, sessions, attendance, assessments, content, media, approvals, audit, favorites, profileMeta, settingsMeta] = await Promise.all([
    getAll('schools'), getAll('classes'), getAll('students'), getAll('sessions'), getAll('attendance'), getAll('assessments'), getAll('content'), getAll('media'), getAll('approvals'), getAll('audit'), getAll('favorites'), get('meta','profile'), get('meta','settings')
  ]);
  return { schools, classes, students, sessions, attendance, assessments, content, media, approvals, audit, favorites, profile: profileMeta?.value, settings: settingsMeta?.value };
}

export async function saveSettings(settings) { await put('meta', { key: 'settings', value: settings }); }
export async function saveProfile(profile) { await put('meta', { key: 'profile', value: profile }); }

export const ROLE_FLOW = [
  { role: 'teacher', status: 'draft', next: 'school_pending', label: 'پیش‌نویس معلم' },
  { role: 'school_reviewer', status: 'school_pending', next: 'district_pending', label: 'بررسی مدرسه' },
  { role: 'district_reviewer', status: 'district_pending', next: 'province_pending', label: 'بررسی منطقه' },
  { role: 'province_reviewer', status: 'province_pending', next: 'national_pending', label: 'بررسی استان' },
  { role: 'national_reviewer', status: 'national_pending', next: 'published', label: 'تأیید کشوری' },
];

export const STATUS_LABELS = {
  draft: 'پیش‌نویس', school_pending: 'در انتظار مدرسه', district_pending: 'در انتظار منطقه', province_pending: 'در انتظار استان',
  national_pending: 'در انتظار کشوری', published: 'منتشرشده', changes_requested: 'نیازمند اصلاح', rejected: 'ردشده'
};

export function roleLabel(role) {
  return ({ teacher: 'دبیر', school_reviewer: 'بررسی‌کننده مدرسه', district_reviewer: 'راهبر منطقه', province_reviewer: 'راهبر استان', national_reviewer: 'راهبر کشوری' })[role] || role;
}

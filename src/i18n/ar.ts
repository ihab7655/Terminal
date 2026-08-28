import {fill, type Catalogue, type Plural} from './catalogue.js';

// ── العربية ─────────────────────────────────────────────────────────────────
//
// Six forms, and this file owns the rule that chooses between them. That is the
// point of the shape: `n === 1 ? a : b` is correct English and wrong here, and
// no code outside this file needs to learn why.
//
//   zero  none            few   3–10, and 103–110, and so on
//   one   exactly one     many  11–99, and 111–199, …
//   two   exactly two     other everything else — 100, 101, 200 …
const forms = (f: Plural, n: number): string => {
  if (n === 0) return f.zero ?? f.other;
  if (n === 1) return f.one;
  if (n === 2) return f.two ?? f.other;
  const hundred = n % 100;
  if (hundred >= 3 && hundred <= 10) return f.few ?? f.other;
  if (hundred >= 11 && hundred <= 99) return f.many ?? f.other;
  return f.other;
};

export const ar: Catalogue = {
  id: 'ar',
  name: 'العربية',
  plural: (f: Plural, n: number) => fill(forms(f, n), {n}),

  rail: {
    idle: 'ساكن',
    ready: 'جاهز',
    working: 'يعمل',
    noEngine: 'لا محرّك',
    waiting: {
      zero: 'لا شيء ينتظرك', one: 'طلب واحد ينتظرك', two: 'طلبان ينتظرانك',
      few: '{n} طلبات تنتظرك', many: '{n} طلباً ينتظرك', other: '{n} طلب ينتظرك'
    }
  },
  composer: {
    placeholder: 'قل شيئاً للمحرّك',
    whileWorking: 'أو قل شيئاً وهو يعمل',
    keysHint: '؟ المفاتيح'
  },
  keys: {
    stops: 'Esc يوقف',
    unfolds: 'Tab يفتح',
    folds: 'Tab يطوي',
    rowsBelow: {
      one: 'سطر واحد تحت · PgDn', two: 'سطران تحت · PgDn',
      few: '{n} أسطر تحت · PgDn', many: '{n} سطراً تحت · PgDn',
      other: '{n} سطر تحت · PgDn'
    }
  },
  engine: {
    waking: 'يوقظ المحرّك',
    none: 'لا محرّك — لا شيء يُشغَّل عليه',
    stopping: 'يتوقّف — المحرّك يُنهي ما هو في الطريق أولاً'
  },
  did: {
    shell: {
      one: 'نفّذ أمراً واحداً', two: 'نفّذ أمرين',
      few: 'نفّذ {n} أوامر', many: 'نفّذ {n} أمراً', other: 'نفّذ {n} أمر'
    },
    wrote: {
      one: 'كتب ملفاً واحداً', two: 'كتب ملفين',
      few: 'كتب {n} ملفات', many: 'كتب {n} ملفاً', other: 'كتب {n} ملف'
    },
    edited: {
      one: 'عدّل ملفاً واحداً', two: 'عدّل ملفين',
      few: 'عدّل {n} ملفات', many: 'عدّل {n} ملفاً', other: 'عدّل {n} ملف'
    },
    read: {
      one: 'قرأ ملفاً واحداً', two: 'قرأ ملفين',
      few: 'قرأ {n} ملفات', many: 'قرأ {n} ملفاً', other: 'قرأ {n} ملف'
    },
    listed: {
      one: 'سرد مجلّداً واحداً', two: 'سرد مجلّدين',
      few: 'سرد {n} مجلّدات', many: 'سرد {n} مجلّداً', other: 'سرد {n} مجلّد'
    },
    ranProject: {one: 'شغّل المشروع', two: 'شغّل المشروع مرّتين', few: 'شغّل المشروع {n} مرات',
                 many: 'شغّل المشروع {n} مرّة', other: 'شغّل المشروع {n} مرّة'},
    ranTests: {one: 'شغّل الاختبارات', two: 'شغّل الاختبارات مرّتين', few: 'شغّل الاختبارات {n} مرات',
               many: 'شغّل الاختبارات {n} مرّة', other: 'شغّل الاختبارات {n} مرّة'},
    snippet: {one: 'نفّذ مقطعاً', two: 'نفّذ مقطعين', few: 'نفّذ {n} مقاطع',
              many: 'نفّذ {n} مقطعاً', other: 'نفّذ {n} مقطع'},
    searched: {one: 'بحث في الويب', two: 'بحث في الويب مرّتين', few: 'بحث في الويب {n} مرات',
               many: 'بحث في الويب {n} مرّة', other: 'بحث في الويب {n} مرّة'},
    // The tool's own name is an identifier and stays as it is.
    other: {one: 'استدعى {tool}', two: 'استدعى {tool} مرّتين', few: 'استدعى {tool} {n} مرات',
            many: 'استدعى {tool} {n} مرّة', other: 'استدعى {tool} {n} مرّة'},
    failed: 'أخفق',
    someFailed: {one: 'واحد أخفق', two: 'اثنان أخفقا', few: '{n} أخفقت',
                 many: '{n} أخفق', other: '{n} أخفق'}
  },
  changes: {
    added: {one: '+سطر واحد', two: '+سطران', few: '+{n} أسطر',
            many: '+{n} سطراً', other: '+{n} سطر'},
    removed: {one: '-سطر واحد', two: '-سطران', few: '-{n} أسطر',
              many: '-{n} سطراً', other: '-{n} سطر'}
  }
};

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
    keysHint: '؟ المساعدة'
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
  session: 'الجلسة',
  profile: {
    adjusted: 'معدَّل',
    appliesAll: 'اختيار واحد يضبط الثلاثة · وما تغيّره بعدها يبقى',
    confirmHead: 'هذا يجعل التشغيل تلقائياً وكل صفّ مسموحاً',
    confirmBody: 'الشِل وأيّ أمر · الكتابة والتعديل والحذف · الشبكة · git',
    confirmDoesNot: 'لا يمنح شيئاً لا يستطيعه هذا الحساب أصلاً · كل مكالمة تبقى في الشريط · وEsc ما زال يوقف',
    confirmType: 'اكتب الاسم لتشغيله',
    cancel: 'Esc يلغي'
  },
  record: {
    status: 'الحالة', attempts: 'المحاولات', took: 'استغرق', plan: 'الخطّة',
    proved: 'أثبت', workers: 'العمّال', retries: 'الإعادات',
    guardian: 'الحارس', nothing: 'لا شيء مسجَّل'
  },
  help: {
    title: 'OVERYOS / المساعدة',
    subtitle: 'اختصارات لوحة المفاتيح وأدوات التحكّم',
    sections: [
      {name: 'التنقّل', entries: [
        {key: '↑ ↓', does: 'التنقّل بين العناصر'},
        {key: 'Enter', does: 'فتح العنصر الذي عليه المؤشّر أو اختياره'},
        {key: 'Esc', does: 'رجوع، أو إغلاق ما هو مفتوح'},
        {key: '^K', does: 'فتح قائمة الأماكن'},
        {key: '/', does: 'فتح القائمة نفسها، مرشّحةً بما يليها'}
      ]},
      {name: 'التنفيذ', entries: [
        {key: 'Enter', does: 'إرسال ما كتبتَه إلى المحرّك'},
        {key: 'y', does: 'السماح بمكالمة محتجَزة، هذه المرّة'},
        {key: 'c', does: 'السماح بهذا الأمر بعينه من الآن'},
        {key: 'r', does: 'السماح بكل ما في هذا الصفّ، في هذه المساحة'},
        {key: 'n', does: 'رفض المكالمة المحتجَزة'},
        {key: 'Esc', does: 'إيقاف الهدف الجاري'}
      ]},
      {name: 'القراءة', entries: [
        {key: 'Tab', does: 'فتح كل المخرجات الملتقَطة، أو طيّها'},
        {key: 'click', does: 'فتح الصفّ الذي تحت المؤشّر وحده'},
        {key: 'PgUp PgDn', does: 'التمرير صفحةً صفحة'},
        {key: 'Home End', does: 'القفز إلى البداية، أو العودة للمتابعة'}
      ]},
      {name: 'الكتابة', entries: [
        {key: '↑ ↓', does: 'استرجاع ما كتبتَه سابقاً'},
        {key: '← →', does: 'تحريك المؤشّر'},
        {key: '^A ^E', does: 'القفز إلى أوّل السطر أو آخره'},
        {key: '^U', does: 'مسح السطر'}
      ]},
      {name: 'الكونسول', entries: [
        {key: '?', does: 'فتح هذه الصفحة'},
        {key: '^P', does: 'فتح ما المسموح للمحرّك هنا'},
        {key: '^C', does: 'الخروج — يُخبَر المحرّك، ويُسجَّل ما هو في الطريق'}
      ]}
    ]
  },
  keySheet: [
    ['Enter', 'أرسل · أو افتح المكان المختار'],
    ['↑ ↓', 'ما كتبتَه قبلاً · أو اختر مكاناً'],
    ['Tab', 'افتح كل المخرجات'],
    ['click', 'افتح صفّاً واحداً'],
    ['^K', 'الأماكن'],
    ['/', 'الأماكن، مرشّحةً بما يليها'],
    ['y c r n', 'أجب عن طلب محتجَز'],
    ['Esc', 'أغلق المفتوح، ثم أوقف الهدف'],
    ['^C', 'اخرج']
  ],
  modes: {
    automatic: 'لا يسأل. يمضي.',
    approval: 'يتوقّف حيث تقول السياسة',
    plan: 'يعرض الخطّة. لا تُستدعى أداة.',
    separate: 'ما المسموح له جدول منفصل، وهذا لا يمسّه',
    forbiddenHolds: 'الممنوع ممنوع في كل الأوضاع',
    inUse: 'المستعمل',
    enterCycles: '↑↓ تحرّك · Enter يغيّرها · مسموح ← يحتاج موافقة ← ممنوع'
  },

  steer: {
    received: 'سُمِع',
    scoped: 'قُرِئ',
    delivered: 'وصل العامل',
    admitted: 'يدخل الخطّة',
    superseded: 'حلّ محلّه ما قلتَه بعده',
    not_delivered: 'انتهى الهدف قبل أن يصل'
  },

  phases: {
    starting: 'يبدأ',
    reading: 'يقرأ الطلب',
    planning: 'يخطّط',
    planned: 'خطّط',
    executing: 'ينفّذ',
    waveFinished: 'انتهت الموجة',
    working: 'يعمل',
    checkpoint: 'حفظ نقطة'
  },
  outcome: {
    completed: 'اكتمل',
    finished: 'انتهى',
    failed: 'أخفق الهدف',
    verificationFailed: 'أخفق التحقّق',
    retrying: 'يعيد المحاولة',
    stopping: 'يتوقّف — المحرّك يُنهي ما هو في الطريق أولاً',
    buildingCapability: 'يبني قدرة لا يملكها',
    judgesUnreliable: 'المحرّك يرى {tool} غير موثوقة — من سجلّها، لا من هذا الهدف',
    repairing: 'يُصلح {tool}',
    repaired: 'أصلح {tool}',
    noEngineHere: 'لا محرّك — لا شيء يُشغَّل عليه',
    endedBadly: 'انتهى الهدف بسوء',
    replanned: 'تغيّرت الخطّة للمحاولة التالية',
    couldNotBuild: 'لم يستطع بناءها',
    missingCapability: 'تنقصه قدرة'
  },

  places: {
    title: 'الأماكن',
    help: 'المساعدة', helpHint: 'اختصارات لوحة المفاتيح وأدوات التحكّم',
    mode: 'كيف يعمل', modeHint: 'هل يتوقّف ويرجع إليك',
    policy: 'ما المسموح له', policyHint: 'تضبطه أنت، ويُقرأ في كل وضع',
    language: 'اللغة', languageHint: 'كل كلمة يكتبها هذا الكونسول',
    workspace: 'مساحة العمل', workspaceHint: 'أين يقع العمل، وهذه الجلسة',
    engine: 'المحرّك', engineHint: 'بماذا زُوِّد، وهل أجاب',
    history: 'السجلّ', historyHint: 'كل هدف نفّذه هذا المحرّك',
    inspector: 'المفتّش', inspectorHint: 'تنفيذ واحد، مقروءاً كاملاً',
    capabilities: 'القدرات', capabilitiesHint: 'ما يستطيع المحرّك أن يمدّ يده إليه',
    profiles: 'الملفّات', profilesHint: 'كيف يبدو، وكيف يعمل، وما المسموح له',
    settings: 'الإعدادات', settingsHint: 'بماذا زُوِّد المحرّك · للقراءة فقط',
    conversations: 'المحادثات', conversationsHint: 'أين جرى العمل، وما قيل هناك',
    thisSession: 'هذه',
    resume: '↑↓ تحرّك · Enter افتح · Esc رجوع إلى الأماكن',
    whereWorked: 'الأماكن التي جرى فيها العمل',
    conversationsHere: {zero: 'لا محادثات', one: 'محادثة واحدة', two: 'محادثتان', few: '{n} محادثات', many: '{n} محادثة', other: '{n} محادثة'},
    openLocation: '↑↓ تحرّك · Enter اعرض محادثات هذا المكان · Esc رجوع',
    newConversation: 'محادثة جديدة',
    startNew: 'ابدأ محادثة جديدة هنا',
    startedNew: 'محادثة جديدة',
    pickAGoal: 'افتح السجلّ واضغط Enter على هدف',
    openARow: '↑↓ تحرّك · Enter افحص · Esc رجوع',
    loading: 'يقرأ السجلّ…',
    nothingYet: 'لا شيء في السجلّ بعد',
    choose: '↑↓ اختر · Enter افتح · Esc أغلق',
    nothingMatches: 'لا شيء بهذا الاسم'
  },

  planned: {
    heading: 'الخطّة التي أنتجها',
    nothingRan: 'لم تُستدعَ أيّ أداة',
    judgedAgainst: 'يُحكَم عليها بـ:',
    howToRun: 'حوّل إلى تلقائي واطلبها ثانيةً لتُنفَّذ'
  },

  asked: {
    hint: 'يقول إن هذا ما سيفعله',
    once: 'اسمح مرّة',
    thisCommand: 'اسمح لهذا الأمر دائماً',
    wholeRow: 'اسمح لهذا هنا دائماً',
    refuse: 'ارفض',
    askedBy: 'طلبها'
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

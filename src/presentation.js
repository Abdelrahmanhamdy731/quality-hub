// Local, editable snapshot export. No AI claims or remote model calls.
export async function createProjectDeck(snapshot, { language = "en" } = {}) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "QualityHub";
  pptx.subject = "Project quality reporting snapshot";
  pptx.title = snapshot.project.code + " | Project status";
  pptx.company = "QualityHub";
  pptx.lang = language === "ar" ? "ar-AE" : "en-GB";
  const isAr = language === "ar",
    tr = (en, ar) => (isAr ? ar : en),
    p = snapshot.project;
  const C = {
    ink: "33415E",
    muted: "687995",
    paper: "F7F8FC",
    blue: "E5EBFA",
    mint: "E1F1EA",
    rose: "F6E5EB",
    amber: "F8EED8",
    line: "E4E8F0",
  };
  const labels = {
    site_rfi: ["Site RFIs", "طلبات الفحص"],
    vendor_rfi: ["Vendor RFIs", "فحص الموردين"],
    findings: ["NCR / CAR", "عدم المطابقة"],
    smr: ["SMRs", "تقارير المواد"],
    docs: ["Documents", "المستندات"],
    punch: ["Punch items", "الملاحظات"],
    test_pack: ["Test packs", "حزم الاختبار"],
    dossier: ["Dossiers", "الملفات"],
    wps: ["WPS", "إجراءات اللحام"],
    welders: ["Welders", "اللحامون"],
    summary: ["Summary", "الملخص"],
    actions: ["Actions", "الإجراءات"],
    regsum: ["Register summary", "ملخص السجلات"],
    vdocs: ["Vendor documents", "مستندات الموردين"],
  };
  const name = (k) => labels[k]?.[isAr ? 1 : 0] || k,
    short = (s, max = 105) => {
      s = String(s ?? "");
      return s.length > max ? s.slice(0, max - 1) + "…" : s;
    },
    num = (v) => Number(v || 0).toLocaleString("en-GB"),
    pc = (v) =>
      v == null ? tr("Not recorded", "غير مسجل") : Number(v).toFixed(1) + "%";
  let idx = 0;
  function text(sl, t, x, y, w, h, size = 18, options = {}) {
    sl.addText(String(t), {
      x,
      y,
      w,
      h,
      fontFace: "Arial",
      fontSize: size,
      color: C.ink,
      margin: 0,
      breakLine: false,
      rtlMode: isAr && /[\u0600-\u06ff]/.test(String(t)),
      align: isAr ? "right" : "left",
      ...options,
    });
  }
  function base(title, kicker = "QUALITYHUB / " + p.code) {
    const s = pptx.addSlide();
    idx++;
    s.background = { color: C.paper };
    text(s, kicker, 0.55, 0.35, 12.2, 0.25, 10, {
      color: C.muted,
      charSpacing: 1.8,
    });
    text(s, title, 0.55, 0.95, 12.2, 0.65, 30, { bold: true });
    s.addShape(pptx.ShapeType.line, {
      x: 0.55,
      y: 6.91,
      w: 12.2,
      h: 0,
      line: { color: C.line, width: 1 },
    });
    text(
      s,
      p.code + " · " + tr("Snapshot", "لقطة") + " " + snapshot.generatedAt,
      0.55,
      7.05,
      11.3,
      0.18,
      9,
      { color: C.muted },
    );
    text(s, String(idx), 12.1, 7.02, 0.65, 0.25, 10, {
      align: "right",
      color: C.muted,
    });
    return s;
  }
  function card(s, label, value, sub, x, y, w = 3.85, fill = C.blue) {
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h: 1.65,
      rectRadius: 0.16,
      fill: { color: fill },
      line: { color: fill },
      radius: 0.16,
    });
    text(s, label, x + 0.23, y + 0.2, w - 0.46, 0.35, 15, { color: C.muted });
    text(s, value, x + 0.23, y + 0.65, w - 0.46, 0.55, 31, {
      bold: true,
      rtlMode: false,
    });
    text(s, sub, x + 0.23, y + 1.27, w - 0.46, 0.22, 11, { color: C.muted });
  }
  function table(s, headers, rows, { y = 2, w = 12.2, widths } = {}) {
    s.addTable(
      [
        headers.map((text) => ({
          text,
          options: { bold: true, color: C.ink, fill: C.blue },
        })),
        ...rows,
      ],
      {
        x: 0.55,
        y,
        w,
        border: { type: "solid", pt: 0.5, color: C.line },
        fontFace: "Arial",
        fontSize: 13,
        color: C.ink,
        fill: "FFFFFF",
        margin: 0.12,
        rowH: 0.46,
        colW: widths,
        autoPage: false,
        rtlMode: isAr,
        align: isAr ? "right" : "left",
        valign: "mid",
      },
    );
  }
  let s = base(tr("Project status", "حالة المشروع"));
  text(s, short(p.code, 30), 0.55, 1.95, 12, 0.8, 48, {
    bold: true,
    color: "758AC2",
  });
  text(s, short(p.name, 145), 0.55, 2.95, 12.1, 1.35, 29, { bold: true });
  text(
    s,
    short(
      p.contractor || tr("Contractor not recorded", "المقاول غير مسجل"),
      130,
    ),
    0.55,
    4.6,
    12.1,
    0.55,
    18,
    { color: C.muted },
  );
  text(
    s,
    tr(
      "Latest saved records, not a live contractor feed",
      "أحدث السجلات المحفوظة، وليست تغذية مباشرة من المقاول",
    ),
    0.55,
    5.75,
    12,
    0.45,
    16,
  );
  s.addNotes(
    "Project name: " +
      p.name +
      "\nSource: permission-scoped QualityHub project and registers. No model-generated claims.",
  );
  s = base(tr("Progress at the reporting date", "التقدم في تاريخ التقرير"));
  card(
    s,
    tr("Actual", "الفعلي"),
    pc(p.actual),
    tr("Progress as of ", "التقدم بتاريخ ") +
      (p.as_of || tr("not recorded", "غير مسجل")),
    0.55,
    2.0,
  );
  card(
    s,
    tr("Planned", "المخطط"),
    pc(p.planned),
    tr("Saved project baseline", "القيمة المحفوظة للمشروع"),
    4.75,
    2.0,
    3.85,
    C.mint,
  );
  card(
    s,
    tr("Variance", "الفرق"),
    p.actual == null || p.planned == null
      ? tr("Not available", "غير متاح")
      : (Number(p.actual) - Number(p.planned)).toFixed(1) + " pp",
    tr("Actual minus planned", "الفعلي ناقص المخطط"),
    8.95,
    2.0,
    3.85,
    C.rose,
  );
  text(
    s,
    tr("Saved project note", "ملاحظة المشروع المحفوظة"),
    0.55,
    4.2,
    12,
    0.4,
    20,
    { bold: true },
  );
  text(
    s,
    tr(
      "May reflect an earlier reporting cut-off, not current register counts.",
      "قد تعكس تاريخ تقرير سابقا، وليست أعداد السجلات الحالية.",
    ),
    0.55,
    4.68,
    12,
    0.3,
    11,
    { color: C.muted },
  );
  text(
    s,
    short(
      p.note || tr("No project note recorded.", "لم تسجل ملاحظة للمشروع."),
      350,
    ),
    0.55,
    5.15,
    12,
    1.15,
    19,
  );
  s.addNotes(
    "Progress values are from the latest saved project state. Percentage point variance is not a forecast.\nFull note: " +
      (p.note || ""),
  );
  const all = Object.keys(labels).map(
    (category) =>
      snapshot.stats.find((r) => r.category === category) || {
        category,
        total: 0,
        open: 0,
        review: 0,
        closed: 0,
        overdue: 0,
      },
  );
  for (let off = 0; off < all.length; off += 7) {
    s = base(
      tr("Register health", "حالة السجلات") +
        " " +
        (isAr
          ? off
            ? "(الجزء الثاني)"
            : "(الجزء الأول)"
          : off
            ? "2 / 2"
            : "1 / 2"),
    );
    table(
      s,
      [
        tr("Register", "السجل"),
        tr("Total", "الإجمالي"),
        tr("Open", "مفتوح"),
        tr("Review", "مراجعة"),
        tr("Closed", "مغلق"),
        tr("Overdue", "متأخر"),
      ],
      all
        .slice(off, off + 7)
        .map((r) => [
          name(r.category),
          num(r.total),
          num(r.open),
          num(r.review),
          num(r.closed),
          num(r.overdue),
        ]),
      { widths: [4.2, 1.6, 1.6, 1.6, 1.6, 1.6] },
    );
    text(
      s,
      tr(
        "Current revisions only. Total also includes other, void and superseded states.",
        "المراجعات الحالية فقط. الإجمالي يشمل أيضا الحالات الأخرى والملغاة والمستبدلة.",
      ),
      0.55,
      6.2,
      12,
      0.4,
      12,
      { color: C.muted },
    );
  }
  s = base(tr("Overdue items needing review", "البنود المتأخرة للمراجعة"));
  text(
    s,
    num(snapshot.overdueCount) +
      " " +
      tr(
        "open or under-review items past their due date",
        "بند مفتوح أو قيد المراجعة تجاوز تاريخ الاستحقاق",
      ),
    0.55,
    1.62,
    12,
    0.4,
    18,
    { color: C.muted },
  );
  if (snapshot.overdue.length)
    table(
      s,
      [
        tr("Reference", "المرجع"),
        tr("Register", "السجل"),
        tr("Owner", "المسؤول"),
        tr("Due date", "تاريخ الاستحقاق"),
      ],
      snapshot.overdue
        .slice(0, 8)
        .map((r) => [
          short(r.reference, 46),
          name(r.category),
          short(r.owner || "-", 36),
          r.due_date,
        ]),
      { y: 2.28, widths: [4.1, 3, 3.1, 2] },
    );
  else
    text(
      s,
      tr(
        "No overdue items in the current saved records.",
        "لا توجد بنود متأخرة في السجلات الحالية المحفوظة.",
      ),
      0.55,
      2.6,
      12,
      1,
      24,
    );
  text(
    s,
    tr(
      "Up to 8 items shown, earliest due first. Missing dates cannot be tested for overdue.",
      "يعرض حتى 8 بنود، الأقدم استحقاقا أولا. لا يمكن تقييم التأخير للبنود بلا تاريخ.",
    ),
    0.55,
    6.4,
    12,
    0.3,
    11,
    { color: C.muted },
  );
  s = base(tr("Inspector workload", "أحمال عمل المفتشين"));
  text(
    s,
    tr(
      "Rolling 30-day Site RFI window ending ",
      "طلبات الفحص خلال 30 يوما تنتهي في ",
    ) + snapshot.endDate,
    0.55,
    1.62,
    12,
    0.4,
    18,
    { color: C.muted },
  );
  if (snapshot.workload.length)
    table(
      s,
      [
        tr("Inspector", "المفتش"),
        tr("Inspections", "الفحوصات"),
        tr("Open", "مفتوح"),
        tr("Active days", "أيام النشاط"),
      ],
      snapshot.workload
        .slice(0, 8)
        .map((r) => [
          short(r.inspector || "-", 70),
          num(r.inspections),
          num(r.open),
          num(r.active_days),
        ]),
      { y: 2.28, widths: [6.2, 2, 2, 2] },
    );
  else
    text(
      s,
      tr(
        "No dated inspection records in this 30-day window.",
        "لا توجد سجلات فحص مؤرخة في فترة الثلاثين يوما.",
      ),
      0.55,
      2.6,
      12,
      1,
      24,
    );
  text(
    s,
    tr(
      "Top 8 returned groups shown. Source owner spelling is preserved; no deduplication.",
      "أول 8 مجموعات من المصدر. أسماء المسؤولين محفوظة كما هي دون دمج.",
    ),
    0.55,
    6.4,
    12,
    0.3,
    11,
    { color: C.muted },
  );
  s = base(tr("Sources and reporting limits", "المصادر وحدود التقرير"));
  const notes = [
    tr(
      "Source: this project's saved QualityHub project record, registers and inspection workload.",
      "المصدر: بيانات هذا المشروع وسجلاته وأحمال الفحص المحفوظة في QualityHub.",
    ),
    tr("Generated at: ", "أنشئ في: ") + snapshot.generatedAt,
    tr("Project progress date: ", "تاريخ تقدم المشروع: ") +
      (p.as_of || tr("not recorded", "غير مسجل")),
    tr(
      "Register counts use current revisions and latest stored status, not historical cut-off recalculation.",
      "أعداد السجلات تعتمد المراجعات الحالية وآخر حالة محفوظة، وليست إعادة حساب بتاريخ قطع تاريخي.",
    ),
    tr(
      "Workload uses owner and inspection date from current Site RFIs, with a rolling 30-day window.",
      "أحمال العمل تعتمد المسؤول وتاريخ الفحص في طلبات الفحص الحالية خلال 30 يوما.",
    ),
    tr(
      "This is an editable data snapshot, not an AI assessment, audit, forecast or contractor feed.",
      "هذه لقطة بيانات قابلة للتحرير، وليست تقييما بالذكاء الاصطناعي أو تدقيقا أو توقعا أو تغذية من المقاول.",
    ),
  ];
  notes.forEach((v, i) =>
    text(s, "• " + v, 0.55, 1.95 + i * 0.7, 12.1, 0.62, 16),
  );
  return pptx;
}

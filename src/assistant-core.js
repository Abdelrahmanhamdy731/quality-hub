// Workbook analysis is local and deterministic. It is not a language model.
export const fields = [
  "reference",
  "title",
  "revision",
  "status",
  "state",
  "owner",
  "discipline",
  "due_date",
  "occurred_on",
  "is_current",
];
export const aliases = {
  reference: [
    "reference",
    "ref",
    "rfi no",
    "rfi number",
    "document no",
    "document number",
    "request no",
    "record id",
    "رقم المرجع",
    "رقم الطلب",
  ],
  title: ["title", "description", "subject", "activity", "الوصف", "الموضوع"],
  revision: ["revision", "rev", "المراجعة"],
  status: ["status", "current status", "الحالة"],
  state: ["state", "normalized state"],
  owner: [
    "owner",
    "inspector",
    "inspector name",
    "assigned to",
    "responsible",
    "المفتش",
    "المسؤول",
  ],
  discipline: ["discipline", "trade", "التخصص"],
  due_date: ["due date", "target date", "تاريخ الاستحقاق"],
  occurred_on: [
    "occurred on",
    "inspection date",
    "request date",
    "date",
    "تاريخ الفحص",
  ],
  is_current: ["is current", "current revision", "الحالي"],
};
const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_#.:\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function suggestMapping(headers) {
  const used = new Set(),
    m = {};
  for (const f of fields) {
    const i = headers.findIndex(
      (h, i) =>
        !used.has(i) &&
        [f.replaceAll("_", " "), ...aliases[f]].includes(norm(h)),
    );
    m[f] = i < 0 ? "" : String(i);
    if (i >= 0) used.add(i);
  }
  return m;
}
export function normalizeState(value) {
  const s = norm(value);
  const groups = {
    open: ["open", "pending", "outstanding", "مفتوح", "مفتوحة", "قيد الانتظار"],
    closed: [
      "closed",
      "approved",
      "accepted",
      "complete",
      "completed",
      "مغلق",
      "مغلقة",
      "معتمد",
      "مقبول",
    ],
    review: [
      "review",
      "under review",
      "in review",
      "submitted",
      "قيد المراجعة",
    ],
    void: ["void", "cancelled", "canceled", "ملغي"],
    superseded: ["superseded", "مستبدل"],
    other: ["other", "أخرى"],
  };
  for (const [k, a] of Object.entries(groups)) if (a.includes(s)) return k;
  return null;
}
export function validDate(v, mode = "iso") {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) throw Error("Invalid date");
    return [
      v.getFullYear(),
      String(v.getMonth() + 1).padStart(2, "0"),
      String(v.getDate()).padStart(2, "0"),
    ].join("-");
  }
  if (typeof v === "number")
    throw Error("Date column must be formatted as a date in Excel");
  let s = String(v).trim(),
    m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m && mode !== "iso") {
    let a = m[1],
      b = m[2];
    s = `${m[3]}-${(mode === "dmy" ? b : a).padStart(2, "0")}-${(mode === "dmy" ? a : b).padStart(2, "0")}`;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw Error(
      "Invalid date. Choose the correct date format or use YYYY-MM-DD",
    );
  return s;
}
export function analyzeRows({
  rows,
  headers,
  mapping,
  existing = [],
  dateMode = "iso",
  stateMap = {},
  fileName = "",
  sheetName = "",
}) {
  const errors = [],
    prepared = [],
    changes = [],
    seen = new Set(),
    byKey = new Map(
      existing.map((r) => [JSON.stringify([r.reference, r.revision]), r]),
    );
  let added = 0,
    updated = 0;
  if (mapping.reference === "")
    errors.push({
      row: 0,
      message: "Map a reference column before continuing.",
    });
  const picked = Object.values(mapping).filter((v) => v !== "");
  if (new Set(picked).size !== picked.length)
    errors.push({
      row: 0,
      message: "A source column may only map to one field.",
    });
  rows.forEach((row, i) => {
    if (!row.some((v) => String(v ?? "").trim())) return;
    try {
      const read = (f) =>
        mapping[f] !== "" && mapping[f] != null
          ? (row[Number(mapping[f])] ?? "")
          : undefined;
      const reference = String(read("reference") ?? "").trim(),
        revision = String(read("revision") ?? "").trim(),
        key = JSON.stringify([reference, revision]);
      if (!reference || reference.length > 500)
        throw Error(
          "Reference is required and must be 500 characters or fewer",
        );
      if (seen.has(key)) throw Error("Duplicate reference and revision");
      seen.add(key);
      const old = byKey.get(key);
      if (
        !old &&
        mapping.revision === "" &&
        existing.some((v) => v.reference === reference && v.revision)
      )
        throw Error(
          "This reference already has revisions. Map the revision column to avoid creating a duplicate.",
        );
      const r = old
        ? { ...old }
        : {
            reference,
            revision,
            title: "",
            status: "Open",
            state: "open",
            owner: "",
            discipline: "",
            due_date: null,
            occurred_on: null,
            is_current: true,
            payload: {},
          };
      for (const f of ["title", "status", "owner", "discipline"]) {
        const v = read(f);
        if (v !== undefined) r[f] = String(v).trim();
      }
      if (!r.title || r.title.length > 3000)
        throw Error(
          "Title is required for new rows and must be 3,000 characters or fewer",
        );
      if (read("state") !== undefined || read("status") !== undefined) {
        const value =
          read("state") !== undefined ? String(read("state")).trim() : r.status;
        r.state = stateMap[value] || normalizeState(value);
        if (!r.state) throw Error("Map the status: " + value);
        if (
          !["open", "closed", "review", "void", "superseded", "other"].includes(
            r.state,
          )
        )
          throw Error("Invalid normalized state");
      }
      for (const f of ["due_date", "occurred_on"])
        if (read(f) !== undefined) r[f] = validDate(read(f), dateMode);
      if (read("is_current") !== undefined) {
        const v = norm(read("is_current"));
        if (!["true", "false", "yes", "no", "1", "0", "نعم", "لا"].includes(v))
          throw Error("Current revision must be true/false, yes/no or 1/0");
        r.is_current = ["true", "yes", "1", "نعم"].includes(v);
      }
      const extra = Object.fromEntries(
        headers
          .map((h, j) => [
            String(j + 1) + ". " + String(h || "Column " + (j + 1)),
            row[j] instanceof Date ? validDate(row[j]) : (row[j] ?? ""),
          ])
          .filter(([, v]) => v !== ""),
      );
      r.payload = {
        ...(old?.payload || {}),
        last_upload: { file: fileName, sheet: sheetName, columns: extra },
      };
      const out = Object.fromEntries(
        [
          "reference",
          "title",
          "revision",
          "status",
          "state",
          "owner",
          "discipline",
          "due_date",
          "occurred_on",
          "is_current",
          "payload",
        ].map((f) => [f, r[f]]),
      );
      out.expected_version = old?.version ?? null;
      prepared.push(out);
      changes.push({
        reference,
        revision,
        change: old ? "update" : "new",
        before: old || {},
        after: out,
      });
      if (old) updated++;
      else added++;
    } catch (e) {
      errors.push({ row: i + 1, message: e.message });
    }
  });
  for (const c of changes) {
    if (c.change === "new" && c.after.is_current) {
      const older = existing.filter(
        (r) =>
          r.reference === c.reference &&
          r.is_current &&
          r.revision !== c.revision,
      );
      if (
        older.some(
          (r) =>
            !prepared.some(
              (p) =>
                p.reference === r.reference &&
                p.revision === r.revision &&
                !p.is_current,
            ),
        )
      )
        errors.push({
          row: 0,
          message:
            "New revision " +
            c.reference +
            " / " +
            c.revision +
            " would leave an older revision current. Include the older revision with is_current=false or mark the new row non-current.",
        });
    }
  }
  return { prepared, errors, added, updated, changes };
}
export function detectIntent(input) {
  const q = String(input).toLowerCase().trim();
  if (/^(find|search|ابحث|بحث)\s*[:：]/u.test(q))
    return {
      type: "search",
      term: input
        .replace(/^[^:：]*[:：]/, "")
        .trim()
        .slice(0, 100),
    };
  if (/presentation|powerpoint|ppt|عرض|برزنتيشن/.test(q))
    return { type: "presentation" };
  if (/excel|upload|import|sheet|اكسل|إكسل|ارفع|استيراد|شيت/.test(q))
    return { type: "upload" };
  if (/workload|inspector|حمل|مفتش/.test(q)) return { type: "workload" };
  if (/overdue|late|متأخر|متاخر/.test(q)) return { type: "overdue" };
  if (/progress|planned|actual|تقدم|إنجاز|انجاز/.test(q))
    return { type: "progress" };
  if (/status|summary|overview|rfi|ncr|punch|حالة|ملخص|الحاله/.test(q))
    return { type: "status" };
  return { type: "unsupported" };
}

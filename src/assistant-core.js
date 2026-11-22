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
    "ref no",
    "rfi no",
    "rfi ref",
    "rfi number",
    "document no",
    "doc no",
    "document number",
    "inspection no",
    "inspection ref",
    "inspection request no",
    "request no",
    "request number",
    "record id",
    "mir no",
    "wir no",
    "sir no",
    "ncr no",
    "رقم المرجع",
    "رقم الطلب",
    "رقم الفحص",
    "رقم السجل",
  ],
  title: [
    "title",
    "description",
    "subject",
    "activity",
    "work description",
    "works description",
    "inspection description",
    "activity description",
    "details",
    "scope of work",
    "الوصف",
    "الموضوع",
    "تفاصيل",
    "وصف النشاط",
  ],
  revision: ["revision", "rev", "rev no", "revision no", "rev letter", "المراجعة"],
  status: [
    "status",
    "current status",
    "rfi status",
    "approval status",
    "review status",
    "الحالة",
    "حالة الطلب",
  ],
  state: ["state", "normalized state"],
  owner: [
    "owner",
    "inspector",
    "inspector name",
    "assigned to",
    "responsible",
    "qc inspector",
    "engineer",
    "consultant",
    "requested by",
    "raised by",
    "submitted by",
    "المفتش",
    "المسؤول",
    "المهندس",
  ],
  discipline: ["discipline", "trade", "work discipline", "section", "التخصص", "القسم"],
  due_date: [
    "due date",
    "target date",
    "required date",
    "required by",
    "deadline",
    "target completion",
    "تاريخ الاستحقاق",
    "التاريخ المستهدف",
  ],
  occurred_on: [
    "occurred on",
    "inspection date",
    "request date",
    "submittal date",
    "submission date",
    "date of inspection",
    "raised date",
    "date raised",
    "issue date",
    "issued date",
    "date",
    "تاريخ الفحص",
    "تاريخ الطلب",
    "تاريخ الإصدار",
  ],
  is_current: [
    "is current",
    "current revision",
    "current",
    "latest revision",
    "is latest",
    "الحالي",
  ],
};
const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_#.:\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const stop = new Set(["of", "the", "for", "a", "an", "and"]);
const tokens = (v) => norm(v).split(" ").filter((t) => t && !stop.has(t));
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return dp[b.length];
}
const aliasNorm = {};
for (const f of fields)
  aliasNorm[f] = [f.replaceAll("_", " "), ...(aliases[f] || [])].map(norm);
function matchTok(t, set) {
  if (set.has(t)) return true;
  if (t.length >= 5)
    for (const u of set)
      if (Math.abs(u.length - t.length) <= 1 && lev(t, u) <= 1) return true;
  return false;
}
function scorePair(h, a) {
  if (!h || !a) return 0;
  if (h === a) return 1;
  const ht = new Set(tokens(h)),
    at = new Set(tokens(a));
  if (!ht.size || !at.size) return 0;
  let interH = 0;
  for (const t of ht) if (matchTok(t, at)) interH++;
  let interA = 0;
  for (const t of at) if (matchTok(t, ht)) interA++;
  const inter = Math.min(interH, interA);
  let s = inter / (ht.size + at.size - inter);
  if (interA === at.size) s += 0.25; // every alias token appears in the header
  else if (interH === ht.size) s += 0.15;
  return s;
}
const bestScore = (header, f) =>
  aliasNorm[f].reduce((m, a) => Math.max(m, scorePair(header, a)), 0);
export function suggestDetailed(headers) {
  const used = new Set(),
    m = {},
    fuzzy = [],
    hn = headers.map(norm);
  for (const f of fields) {
    const priority = f === 'owner' ? hn.findIndex((h,i) => !used.has(i) && ['inspected by','witnessed by','adnoc representative','inspector','inspector name','qc inspector'].includes(h)) : -1;
    const i = priority >= 0 ? priority : hn.findIndex((h, i) => !used.has(i) && aliasNorm[f].includes(h));
    m[f] = i < 0 ? "" : String(i);
    if (i >= 0) used.add(i);
  }
  const cand = [];
  for (const f of fields)
    if (m[f] === "")
      hn.forEach((h, i) => {
        if (used.has(i) || !h) return;
        const s = bestScore(h, f);
        if (s >= 0.5) cand.push({ f, i, s });
      });
  cand.sort((a, b) => b.s - a.s);
  for (const c of cand) {
    if (m[c.f] !== "" || used.has(c.i)) continue;
    const clash = fields.some(
      (o) =>
        o !== c.f &&
        m[o] === "" &&
        Math.abs(bestScore(hn[c.i], o) - c.s) < 0.15,
    );
    if (clash) continue;
    m[c.f] = String(c.i);
    used.add(c.i);
    fuzzy.push(c.f);
  }
  return { mapping: m, fuzzy };
}
export function suggestMapping(headers) {
  return suggestDetailed(headers).mapping;
}
export function headerScore(grid, scan = 50) {
  let row = 0, score = 0;
  for (let r = 0; r < Math.min(scan, grid.length); r++) {
    const cells = grid[r] || [];
    const labels = cells.filter(v => String(v ?? '').trim());
    if (labels.length < 2) continue;
    const found = suggestDetailed(cells).mapping;
    const matched = Object.values(found).filter(v => v !== '').length;
    const essential = Number(found.reference !== '') + Number(found.title !== '');
    // Title blocks have one long cell. Real headers have several short labels
    // and a rectangular data region below them, even far down the worksheet.
    const short = labels.filter(v => String(v).length < 70).length / labels.length;
    const following = grid.slice(r + 1, r + 6).filter(x => x.filter(v => String(v ?? '').trim()).length >= 2).length;
    const s = matched * 3 + essential * 3 + short + Math.min(following, 3) * 0.2;
    if (matched >= 2 && s > score) { row = r; score = s; }
  }
  if (!score) {
    for (let r = 0; r < Math.min(scan, grid.length - 1); r++) {
      const cells = grid[r] || [];
      if (cells.filter(v => String(v ?? '').trim()).length < 2) continue;
      const inferred = inferMapping(cells, grid.slice(r + 1));
      if (inferred.mapping.reference !== '' && inferred.mapping.title !== '') {
        const values = cells.filter(v => String(v ?? '').trim());
        if (values.every(v => typeof v === 'string' && String(v).length < 100)) {
          row = r; score = 1; break;
        }
      }
    }
  }
  return { row, score };
}
export function detectHeaderRow(grid, scan = 50) {
  return headerScore(grid, scan).row;
}

export function inferMapping(headers, rows) {
  const result = suggestDetailed(headers), m = result.mapping;
  const used = new Set(Object.values(m).filter(v => v !== '').map(Number));
  const samples = headers.map((_, i) => rows.slice(0, 100).map(r => cleanText(r[i])).filter(Boolean));
  const pick = (field, scoring, threshold) => {
    if (m[field] !== '') return;
    const candidates = samples.map((values, i) => ({ i, score: used.has(i) || !values.length ? 0 : scoring(values, i) })).sort((a,b) => b.score-a.score);
    if (candidates[0]?.score >= threshold) { m[field] = String(candidates[0].i); used.add(candidates[0].i); result.fuzzy.push(field); }
  };
  pick('reference', values => {
    const identifiers = values.filter(v => v.length <= 150 && /[A-Za-z]/.test(v) && /\d/.test(v) && /[-/]/.test(v) && !/\s/.test(v)).length / values.length;
    return identifiers * (new Set(values).size / values.length);
  }, 0.7);
  pick('title', values => values.filter(v => v.length > 12 && /\s/.test(v)).length / values.length, 0.65);
  pick('status', values => values.filter(v => normalizeState(v)).length / values.length, 0.7);
  pick('revision', (values, i) => /rev/i.test(headers[i]) ? 1 : 0, 1);
  return result;
}

export function detectDateMode(rows, mapping) {
  const cols = [mapping.due_date, mapping.occurred_on]
    .filter((v) => v !== "" && v != null)
    .map(Number);
  let iso = 0,
    dmy = 0,
    mdy = 0;
  for (const row of rows) {
    for (const c of cols) {
      const v = row[c];
      if (v == null || v === "" || v instanceof Date || typeof v === "number")
        continue;
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso++;
      else {
        const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
        if (m) {
          if (Number(m[1]) > 12) dmy++;
          else if (Number(m[2]) > 12) mdy++;
        }
      }
    }
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  if (iso && !dmy && !mdy) return "iso";
  return null;
}
export function formatKey(mapped) {
  return fields
    .filter((f) => mapped[f])
    .map((f) => f + "=" + norm(mapped[f]))
    .sort()
    .join(";");
}
export function matchSavedFormat(headers, entries) {
  const hn = headers.map(norm);
  let best = null;
  for (const e of entries || []) {
    const mapped = e.mapped || {},
      usedIdx = new Set(),
      indices = {};
    let matched = 0,
      ok = true;
    for (const f of ["reference", ...fields.filter((x) => x !== "reference")]) {
      const name = mapped[f];
      if (!name) continue;
      const i = hn.findIndex((h, i) => !usedIdx.has(i) && h === norm(name));
      if (i < 0) {
        if (f === "reference") {
          ok = false;
          break;
        }
        continue;
      }
      indices[f] = String(i);
      usedIdx.add(i);
      matched++;
    }
    if (!ok || matched < 2) continue;
    if (
      !best ||
      matched > best.matched ||
      (matched === best.matched && (e.savedAt || "") > (best.entry.savedAt || ""))
    )
      best = {
        matched,
        entry: e,
        mapping: Object.fromEntries(fields.map((f) => [f, indices[f] || ""])),
      };
  }
  return best;
}
export function normalizeState(value) {
  const s = norm(value);
  const groups = {
    open: [
      "open",
      "pending",
      "outstanding",
      "in progress",
      "new",
      "reopened",
      "re opened",
      "ongoing",
      "rejected",
      "not satisfactory",
      "unsatisfactory",
      "مفتوح",
      "مفتوحة",
      "قيد الانتظار",
      "جاري",
      "قيد التنفيذ",
    ],
    closed: [
      "satisfactory",
      "satisfactory w/c",
      "satisfactory with comments",
      "satisfactory with commets",
      "satisfactory w/comment",
      "accepted with comments",
      "closed",
      "close",
      "approved",
      "accepted",
      "complete",
      "completed",
      "done",
      "closed approved",
      "approved as noted",
      "resolved",
      "مغلق",
      "مغلقة",
      "معتمد",
      "مقبول",
      "منجز",
      "تم",
    ],
    review: [
      "review",
      "under review",
      "in review",
      "for review",
      "submitted",
      "with consultant",
      "for approval",
      "awaiting approval",
      "قيد المراجعة",
      "للمراجعة",
    ],
    void: ["cancel", "with draw rfi", "rfi withdrawn", "not in used rfi number", "not ready for inspection", "not ready", "void", "cancelled", "canceled", "withdrawn", "ملغي", "مسحوب"],
    superseded: ["superseded", "replaced", "مستبدل", "تم استبداله"],
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
const cleanText = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export function analyzeRows({
  rows,
  headers,
  mapping,
  existing = [],
  dateMode = "iso",
  stateMap = {},
  fileName = "",
  sheetName = "",
  automatic = false,
}) {
  const errors = [],
    prepared = [],
    changes = [],
    seen = new Set(),
    byKey = new Map(
      existing.map((r) => [JSON.stringify([r.reference, r.revision]), r]),
    ),
    cleaning = { dates: 0, statuses: 0, trimmed: 0, warnings: [] };
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
      const readText = (f) => {
        const v = read(f);
        if (v === undefined) return undefined;
        const cleaned = cleanText(v);
        if (cleaned !== String(v ?? "")) cleaning.trimmed++;
        return cleaned;
      };
      const reference = readText("reference") ?? "",
        revision = readText("revision") ?? "",
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
        const v = readText(f);
        if (v !== undefined && !(automatic && old && v === '')) r[f] = v;
      }
      if (!r.title || r.title.length > 3000)
        throw Error(
          "Title is required for new rows and must be 3,000 characters or fewer",
        );
      if (read("state") !== undefined || read("status") !== undefined) {
        const value =
          read("state") !== undefined ? cleanText(read("state")) : r.status;
        const custom = stateMap[value];
        r.state = custom || normalizeState(value);
        if (!r.state && automatic && value === '') {
          r.state = old?.state || 'other';
          cleaning.warnings.push('Blank status preserved without guessing');
        }
        if (!r.state && automatic) {
          r.state = old?.state || 'other';
          cleaning.warnings.push('Unrecognized status kept as source text: ' + value);
        }
        if (!r.state) throw Error("Map the status: " + value);
        if (
          !["open", "closed", "review", "void", "superseded", "other"].includes(
            r.state,
          )
        )
          throw Error("Invalid normalized state");
        if (custom || norm(value) !== r.state) cleaning.statuses++;
      }
      for (const f of ["due_date", "occurred_on"])
        if (read(f) !== undefined) {
          const raw = read(f);
          if (automatic && old && (raw === '' || raw == null)) continue;
          try {
            let parsed = raw;
            if (automatic && /^\d{5}(\.\d+)?$/.test(String(raw)) && Number(raw) >= 20000 && Number(raw) < 100000) {
              parsed = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(raw)) * 86400000).toISOString().slice(0, 10);
            }
            if (automatic && /^\d{1,2}[- /][A-Za-z]{3,9}[- /]\d{2,4}$/.test(String(raw))) {
              const d = new Date(String(raw));
              if (Number.isFinite(d.getTime())) parsed = d.toISOString().slice(0,10);
            }
            r[f] = validDate(parsed, dateMode);
          }
          catch (e) {
            if (!automatic) throw e;
            cleaning.warnings.push('Unresolved date retained in source fields: ' + String(raw));
            continue;
          }
          if (raw instanceof Date || String(raw).trim() !== String(r[f]))
            cleaning.dates++;
        }
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
            (row._original || row)[j] instanceof Date ? validDate((row._original || row)[j]) : ((row._original || row)[j] ?? ""),
          ])
          .filter(([, v]) => v !== ""),
      );
      r.payload = {
        ...(old?.payload || {}),
        last_upload: { file: fileName, sheet: sheetName, source_row: row._sourceRow || i + 1, columns: extra },
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
  if (automatic) {
    const all = [...existing, ...prepared];
    const refs = [...new Set(prepared.map(r=>r.reference))];
    for (const ref of refs) {
      const revisions = all.filter(r=>r.reference===ref).map(r=>r.revision || '');
      const latest = [...new Set(revisions)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
      for(const row of prepared.filter(r=>r.reference===ref)) row.is_current=row.revision===latest;
      for(const old of existing.filter(r=>r.reference===ref && r.is_current && r.revision!==latest)) {
        if(prepared.some(r=>r.reference===ref && r.revision===old.revision)) continue;
        const out=Object.fromEntries(fields.map(f=>[f,old[f]]));
        out.payload=old.payload || {}; out.expected_version=old.version; out.is_current=false;
        prepared.push(out); updated++;
        changes.push({reference:ref,revision:old.revision,change:'update',before:old,after:out});
      }
    }
  }
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
  return { prepared, errors, added, updated, changes, cleaning };
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

import test from "node:test";
import assert from "node:assert/strict";
import {
  suggestMapping,
  normalizeState,
  validDate,
  analyzeRows,
  detectIntent,
  fields,
} from "../src/assistant-core.js";
const headers = [
  "RFI No.",
  "Description",
  "Rev",
  "Current status",
  "Inspector",
  "Inspection date",
];
const mapping = suggestMapping(headers);
const base = {
  rows: [
    ["QA-01", "Example inspection", "A", "Open", "Inspector A", "2026-11-22"],
  ],
  headers,
  mapping,
};
test("column aliases suggest exact fields", () => {
  assert.equal(mapping.reference, "0");
  assert.equal(mapping.title, "1");
  assert.equal(mapping.revision, "2");
  assert.equal(mapping.status, "3");
  assert.equal(mapping.owner, "4");
  assert.equal(mapping.occurred_on, "5");
});
test("new records have normalized state and dates", () => {
  const r = analyzeRows(base);
  assert.equal(r.errors.length, 0);
  assert.equal(r.added, 1);
  assert.equal(r.prepared[0].state, "open");
  assert.equal(r.prepared[0].expected_version, null);
  assert.equal(r.prepared[0].occurred_on, "2026-11-22");
});
test("unknown statuses require explicit mapping", () => {
  const x = {
    ...base,
    rows: [["QA-01", "Example", "A", "Code B", "A", "2026-11-22"]],
  };
  assert.equal(analyzeRows(x).errors.length, 1);
  const r = analyzeRows({ ...x, stateMap: { "Code B": "review" } });
  assert.equal(r.errors.length, 0);
  assert.equal(r.prepared[0].state, "review");
});
test("existing unmapped fields and payload preserved", () => {
  const m = { ...mapping, owner: "", occurred_on: "" };
  const r = analyzeRows({
    ...base,
    mapping: m,
    existing: [
      {
        reference: "QA-01",
        revision: "A",
        title: "Old title",
        owner: "Saved inspector",
        state: "closed",
        status: "Closed",
        discipline: "Civil",
        due_date: "2026-12-01",
        occurred_on: "2026-11-01",
        is_current: false,
        payload: { retained: "yes" },
        version: 5,
      },
    ],
  });
  assert.equal(r.updated, 1);
  assert.equal(r.prepared[0].owner, "Saved inspector");
  assert.equal(r.prepared[0].occurred_on, "2026-11-01");
  assert.equal(r.prepared[0].is_current, false);
  assert.equal(r.prepared[0].payload.retained, "yes");
  assert.equal(r.prepared[0].expected_version, 5);
});
test("mapped blank owner explicitly clears saved owner", () => {
  const r = analyzeRows({
    ...base,
    rows: [["QA-01", "Example", "A", "Open", "", "2026-11-22"]],
    existing: [
      {
        reference: "QA-01",
        revision: "A",
        title: "Example",
        owner: "Old",
        state: "open",
        status: "Open",
        version: 1,
        payload: {},
      },
    ],
  });
  assert.equal(r.prepared[0].owner, "");
});
test("duplicate row identity rejected", () => {
  assert.equal(
    analyzeRows({ ...base, rows: [...base.rows, ...base.rows] }).errors.length,
    1,
  );
});
test("no missing title on inserts", () => {
  assert.equal(
    analyzeRows({ ...base, mapping: { ...mapping, title: "" } }).errors.length,
    1,
  );
});
test("missing title mapping is allowed for an existing row", () => {
  const r = analyzeRows({
    ...base,
    mapping: { ...mapping, title: "" },
    existing: [
      {
        reference: "QA-01",
        revision: "A",
        title: "Saved title",
        version: 1,
        payload: {},
      },
    ],
  });
  assert.equal(r.prepared[0].title, "Saved title");
});
test("missing revision mapping does not duplicate revised references", () => {
  assert.match(
    analyzeRows({
      ...base,
      mapping: { ...mapping, revision: "" },
      existing: [{ reference: "QA-01", revision: "A", version: 1 }],
    }).errors[0].message,
    /revisions/,
  );
});
test("duplicate column mapping rejected", () => {
  assert.match(
    analyzeRows({ ...base, mapping: { ...mapping, owner: "0" } }).errors[0]
      .message,
    /one field/,
  );
});
test("dates reject rollover and ambiguous text", () => {
  assert.throws(() => validDate("2026-02-30"));
  assert.throws(() => validDate("03/04/2026"));
  assert.equal(validDate("03/04/2026", "dmy"), "2026-04-03");
  assert.equal(validDate("03/04/2026", "mdy"), "2026-03-04");
  assert.equal(validDate(""), null);
});
test("Date objects preserve calendar day", () => {
  assert.equal(validDate(new Date(2026, 10, 22, 0, 0)), "2026-11-22");
});
test("numeric dates require formatted Excel date cells", () =>
  assert.throws(() => validDate(46000)));
test("Arabic state aliases supported", () =>
  assert.equal(normalizeState("قيد المراجعة"), "review"));
test("no guessed state from arbitrary text", () =>
  assert.equal(normalizeState("Approved with comments B"), null));
test("unknown boolean rejected", () => {
  assert.equal(
    analyzeRows({
      ...base,
      headers: [...headers, "Current revision"],
      rows: [base.rows[0].concat("maybe")],
      mapping: { ...mapping, is_current: "6" },
    }).errors.length,
    1,
  );
});
test("cell text is preserved only as data", () => {
  const r = analyzeRows({
    ...base,
    rows: [["QA-01", "Example <b>text</b>", "A", "Open", "A", "2026-11-22"]],
  });
  assert.equal(r.prepared[0].title, "Example <b>text</b>");
});
test("blank rows ignored", () =>
  assert.equal(
    analyzeRows({ ...base, rows: [[], ...base.rows] }).prepared.length,
    1,
  ));
test("supported intents remain bounded", () => {
  assert.equal(detectIntent("Project status").type, "status");
  assert.equal(detectIntent("حالة المشروع").type, "status");
  assert.equal(detectIntent("search: QA-01").term, "QA-01");
  assert.equal(detectIntent("ابحث: QA-01").type, "search");
  assert.equal(detectIntent("Why is the contractor late?").type, "overdue");
  assert.equal(detectIntent("Who will win the match?").type, "unsupported");
});

test("a new revision cannot silently double-count current records", () => {
  const r = analyzeRows({
    ...base,
    rows: [["QA-01", "New revision", "B", "Open", "A", "2026-11-22"]],
    existing: [
      { reference: "QA-01", revision: "A", is_current: true, version: 1 },
    ],
  });
  assert.match(r.errors[0].message, /older revision current/);
});
test("before and after review preserves original values", () => {
  const r = analyzeRows({
    ...base,
    existing: [
      {
        reference: "QA-01",
        revision: "A",
        title: "Before",
        version: 2,
        payload: {},
      },
    ],
  });
  assert.equal(r.changes[0].before.title, "Before");
  assert.equal(r.changes[0].after.title, "Example inspection");
});
import {
  suggestDetailed,
  detectHeaderRow,
  detectDateMode,
  matchSavedFormat,
  formatKey,
} from "../src/assistant-core.js";

const contractorHeaders = [
  "Document Ref. No",
  "Work Description",
  "Rev No.",
  "Approval Status",
  "QC Engineer",
  "Required By Date",
  "Date of Submission",
];
test("fuzzy contractor headers map to register fields", () => {
  const d = suggestDetailed(contractorHeaders);
  assert.equal(d.mapping.reference, "0");
  assert.equal(d.mapping.title, "1");
  assert.equal(d.mapping.revision, "2");
  assert.equal(d.mapping.status, "3");
  assert.equal(d.mapping.owner, "4");
  assert.equal(d.mapping.due_date, "5");
  assert.equal(d.mapping.occurred_on, "6");
  assert.ok(d.fuzzy.length > 0, "fuzzy matches are labeled");
});
test("ambiguous headers are left for manual mapping", () => {
  const d = suggestDetailed(["Notes column", "Misc data"]);
  assert.equal(d.mapping.reference, "");
  assert.equal(d.mapping.title, "");
});
test("header row detected under title rows", () => {
  const grid = [
    ["Contractor weekly register"],
    [],
    ["RFI No.", "Description", "Rev", "Current status", "Inspector", "Inspection date"],
    ["QA-1", "Work", "A", "Open", "Insp", "2026-11-22"],
  ];
  assert.equal(detectHeaderRow(grid), 2);
});
test("header row defaults to first when nothing matches", () => {
  assert.equal(detectHeaderRow([["a", "b"], ["c", "d"]]), 0);
});
test("date mode detected from unambiguous values", () => {
  const m = { due_date: "0", occurred_on: "" };
  assert.equal(detectDateMode([["22/11/2026"]], m), "dmy");
  assert.equal(detectDateMode([["11/22/2026"]], m), "mdy");
  assert.equal(detectDateMode([["2026-11-22"]], m), "iso");
  assert.equal(detectDateMode([["02/03/2026"]], m), null);
});
test("saved format matches despite moved or extra columns", () => {
  const saved = {
    mapped: { reference: "RFI No.", title: "Description", owner: "Inspector" },
    savedAt: "2026-11-22T00:00:00Z",
  };
  const m = matchSavedFormat(
    ["Extra note", "RFI No.", "Description", "Inspector", "New column"],
    [saved],
  );
  assert.ok(m, "format recognized");
  assert.equal(m.mapping.reference, "1");
  assert.equal(m.mapping.title, "2");
  assert.equal(m.mapping.owner, "3");
});
test("saved format rejected when reference column missing", () => {
  const saved = { mapped: { reference: "RFI No.", title: "Description" } };
  assert.equal(matchSavedFormat(["Description", "Other"], [saved]), null);
});
test("format key is order independent", () => {
  assert.equal(
    formatKey({ title: "B", reference: "A" }),
    formatKey({ reference: "A", title: "B" }),
  );
});
test("cleaning counts dates, statuses and trimmed cells", () => {
  const r = analyzeRows({
    ...base,
    rows: [["  QA-01 ", "Example   inspection", "A", "Under Review", "Insp", "22/11/2026"]],
    dateMode: "dmy",
  });
  assert.equal(r.errors.length, 0);
  assert.equal(r.cleaning.dates, 1);
  assert.equal(r.cleaning.statuses, 1);
  assert.ok(r.cleaning.trimmed >= 1);
  assert.equal(r.prepared[0].reference, "QA-01");
  assert.equal(r.prepared[0].title, "Example inspection");
  assert.equal(r.prepared[0].state, "review");
});

// Automatic import regression coverage.
import { inferMapping } from '../src/assistant-core.js';
test('title block and fuzzy labels beyond row ten do not become the header', () => {
  const grid = [['','','','Construction of Flowlines and Wellhead Tie-ins at BAB/NEB Field'], ...Array.from({length:23},()=>[]), ['Document Ref. No','Work Description','Rev No.','Approval Status'], ['RFI-001','Pipe inspection','A','Approved']];
  assert.equal(detectHeaderRow(grid),24);
});
test('automatic mode preserves reliable existing state for unknown status text', () => {
  const r = analyzeRows({...base, automatic:true, rows:[['QA-01','Updated inspection','A','Contractor code X','Inspector','2026-11-22']], existing:[{reference:'QA-01',revision:'A',title:'Old',status:'Open',state:'open',version:2,payload:{}}]});
  assert.equal(r.errors.length,0); assert.equal(r.prepared[0].state,'open');
  assert.equal(r.prepared[0].status,'Contractor code X'); assert.equal(r.cleaning.warnings.length,1);
});
test('automatic mode preserves ambiguous date in source without overwriting saved date', () => {
  const r = analyzeRows({...base, automatic:true, rows:[['QA-01','Updated inspection','A','Open','Inspector','02/03/2026']], existing:[{reference:'QA-01',revision:'A',title:'Old',status:'Open',state:'open',occurred_on:'2026-01-01',version:2,payload:{}}]});
  assert.equal(r.errors.length,0); assert.equal(r.prepared[0].occurred_on,'2026-01-01');
  assert.ok(Object.values(r.prepared[0].payload.last_upload.columns).includes('02/03/2026'));
});
test('automatic mode does not clear existing fields from blank cells', () => {
  const r=analyzeRows({...base,automatic:true,rows:[['QA-01','Updated inspection','A','Open','','2026-11-22']],existing:[{reference:'QA-01',revision:'A',title:'Old',status:'Open',state:'open',owner:'Existing inspector',version:2,payload:{}}]});
  assert.equal(r.errors.length,0);assert.equal(r.prepared[0].owner,'Existing inspector');
});
test('data-shape inference recovers reference, description and status without using serial numbers', () => {
  const r=inferMapping(['Sequence','Key','Details text','Result'],[[1,'RFI-001','Pipework inspection','Approved'],[2,'RFI-002','Concrete inspection','Open']]);
  assert.equal(r.mapping.reference,'1');assert.equal(r.mapping.title,'2');assert.equal(r.mapping.status,'3');
});
test('automatic mode reads Excel serial dates in explicitly mapped date columns', () => {
  const r=analyzeRows({...base,automatic:true,rows:[['QA-01','Example inspection','A','Open','Inspector','46348']]});
  assert.equal(r.errors.length,0);assert.match(r.prepared[0].occurred_on,/^2026-/);
});

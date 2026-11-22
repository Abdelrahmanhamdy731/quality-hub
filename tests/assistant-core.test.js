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

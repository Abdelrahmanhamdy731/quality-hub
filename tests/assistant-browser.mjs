import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
const root = path.resolve("docs"),
  mime = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".svg": "image/svg+xml",
  };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = path.join(root, pathname === "/" ? "index.html" : pathname);
    if (!file.startsWith(root + path.sep)) throw Error("path");
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  executablePath: chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox"],
});
let checks = 0;
function ok(value, msg) {
  assert.ok(value, msg);
  checks++;
  console.log("PASS", msg);
}
const p1 = "11111111-1111-4111-8111-111111111111",
  p2 = "22222222-2222-4222-8222-222222222222",
  uid = "33333333-3333-4333-8333-333333333333";
const projects = [
  {
    id: p1,
    code: "EXAMPLE-A",
    name: "Example project alpha",
    number: "QA-A",
    contractor: "Example contractor",
    contract: "Example contract",
    actual: 47,
    planned: 50,
    as_of: "2026-11-21",
    stage: "Active",
    color: "#879acc",
    note: "Example project note",
    source_label: "QA fixture",
    archived: false,
  },
  {
    id: p2,
    code: "EXAMPLE-B",
    name: "Example project beta",
    number: "QA-B",
    contractor: "Example contractor",
    actual: 20,
    planned: 30,
    as_of: "2026-11-20",
    stage: "Active",
    color: "#8ab89b",
    note: "Beta project note",
    archived: false,
  },
];
const old = {
  id: "44444444-4444-4444-8444-444444444444",
  project_id: p1,
  category: "site_rfi",
  reference: "QA-OLD",
  revision: "A",
  title: "Original inspection",
  status: "Open",
  state: "open",
  owner: "Original inspector",
  discipline: "Civil",
  due_date: "2026-11-20",
  occurred_on: "2026-11-19",
  is_current: true,
  payload: { keep: "retained" },
  version: 5,
};
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  book,
  XLSX.utils.aoa_to_sheet([
    ["Workbook overview"],
    ["Choose the Register sheet for the table."],
  ]),
  "Overview",
);
XLSX.utils.book_append_sheet(
  book,
  XLSX.utils.aoa_to_sheet([
    ["Example inspection register"],
    [],
    [
      "RFI No.",
      "Description",
      "Rev",
      "Current status",
      "Inspector",
      "Inspection date",
    ],
    ["QA-OLD", "Updated inspection", "A", "B", "Inspector one", "22/11/2026"],
    ["QA-NEW", "New inspection", "A", "Open", "Inspector two", "21/11/2026"],
  ]),
  "Register",
);
await fs.writeFile(
  "/downloads/assistant-fixture.xlsx",
  XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
);
const contractorBook = (title) => {
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    b,
    XLSX.utils.aoa_to_sheet([
      ["ABC Contracting - weekly inspection register"],
      ["Prepared by site QA", ""],
      [
        "Document Ref. No",
        "Work Description",
        "Rev No.",
        "Approval Status",
        "QC Engineer",
        "Required By Date",
        "Date of Submission",
      ],
      ["QA-OLD", title, "A", "Approved", "Eng. Smith", "30/11/2026", "22/11/2026"],
      ["QA-NEW2", "New contractor row", "A", "In Progress", "Eng. Smith", "29/11/2026", "21/11/2026"],
    ]),
    "Weekly Report",
  );
  return XLSX.write(b, { type: "buffer", bookType: "xlsx" });
};
await fs.writeFile("/downloads/assistant-contractor-a.xlsx", contractorBook("Contractor row v1"));
const contractorBook2 = () => {
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    b,
    XLSX.utils.aoa_to_sheet([
      ["ABC Contracting - weekly inspection register"],
      [],
      [
        "Document Ref. No",
        "Work Description",
        "Extra Note",
        "Rev No.",
        "Approval Status",
        "QC Engineer",
        "Required By Date",
        "Date of Submission",
      ],
      ["QA-OLD", "Contractor row v2", "note", "A", "Approved", "Eng. Smith", "30/11/2026", "22/11/2026"],
      ["QA-NEW2", "New contractor row", "note", "A", "In Progress", "Eng. Smith", "29/11/2026", "21/11/2026"],
    ]),
    "Weekly Report",
  );
  return XLSX.write(b, { type: "buffer", bookType: "xlsx" });
};
await fs.writeFile("/downloads/assistant-contractor-b.xlsx", contractorBook2());
async function setup(role = "admin") {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    }),
    page = await context.newPage(),
    errors = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => console.log("PAGE", msg.text()));
  await page.route(
    "https://vkalxaaujzzdtootllax.supabase.co/**",
    async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        pathname = u.pathname;
      let data = {},
        status = 200,
        count;
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
          },
        });
      if (pathname.endsWith("/token"))
        data = {
          access_token:
            "eyJhbGciOiJIUzI1NiJ9." +
            Buffer.from(
              JSON.stringify({
                sub: uid,
                exp: Math.floor(Date.now() / 1000) + 3600,
              }),
            ).toString("base64url") +
            ".test",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "test-only",
          user: { id: uid, email: "qa@quality-hub.internal" },
        };
      else if (pathname.endsWith("/user"))
        data = { id: uid, email: "qa@quality-hub.internal" };
      else if (pathname.endsWith("/profiles"))
        data = {
          id: uid,
          username: "qaadmin",
          full_name: "QA user",
          role,
          active: true,
        };
      else if (pathname.endsWith("/projects")) data = projects;
      else if (pathname.endsWith("/dashboard_stats"))
        data = [
          {
            project_id: p1,
            category: "site_rfi",
            total: 1,
            open: 1,
            review: 0,
            closed: 0,
            overdue: 1,
          },
          {
            project_id: p2,
            category: "site_rfi",
            total: 2,
            open: 2,
            review: 0,
            closed: 0,
            overdue: 0,
          },
        ];
      else if (pathname.endsWith("/project_updates")) data = [];
      else if (pathname.endsWith("/inspection_workload")) {
        data = [
          {
            inspector: "Example inspector",
            inspections: 5,
            open: 2,
            active_days: 3,
            per_active_day: 1.7,
            events: [],
          },
        ];
        ok(
          JSON.parse(req.postData()).p_project !== null,
          "workload request is project scoped",
        );
      } else if (pathname.endsWith("/records")) {
        data = u.searchParams.get("project_id") === "eq." + p1 ? [old] : [];
        count = data.length;
      } else if (pathname.endsWith("/apply_assistant_workbook")) {
        const body = JSON.parse(req.postData());
        writes.push({pid:body.pid,cat:body.imports[0].cat,items:body.imports.flatMap(x=>x.items),imports:body.imports});
        if (role !== "admin") {
          status = 403;
          data = { message: "Administrator access required" };
        } else data = { added: 1, updated: 1 };
      } else {
        status = 404;
        data = { message: "Unmocked " + pathname };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Range",
          ...(count != null
            ? { "Content-Range": `0-${Math.max(0, count - 1)}/${count}` }
            : {}),
        },
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto(origin);
  await page.getByLabel("Username", { exact: true }).fill("qaadmin");
  await page
    .getByLabel("Password", { exact: true })
    .fill("qa-only-not-a-secret");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .locator('[data-project="' + p1 + '"]')
    .first()
    .click();
  await page.locator('[data-tab="assistant"]').click();
  await page.locator("#assistant-question").waitFor();
  return { context, page, errors, writes };
}
try {
  const { context, page, errors, writes } = await setup();
  await page.locator('#assistant-upload').click();
  await page.locator('#assistant-file').setInputFiles('/downloads/assistant-contractor-a.xlsx');
  await page.locator('.modal-backdrop').waitFor({state:'hidden'});
  ok(writes.length === 1, 'file upload alone triggered one atomic save');
  ok(writes[0].items.find(r=>r.reference==='QA-OLD').title==='Contractor row v1', 'existing reference updated automatically');
  ok(writes[0].items.find(r=>r.reference==='QA-NEW2').occurred_on==='2026-11-21', 'dates standardized automatically');
  ok(writes[0].items.find(r=>r.reference==='QA-OLD').expected_version===5, 'stale version protection retained');
  ok((await page.locator('#assistant-messages').innerText()).includes('dashboard updated automatically'), 'post-save compact summary shown');
  await page.screenshot({path:'/downloads/zero-manual-en.png',fullPage:true});
  await page.locator('#assistant-upload').click();
  await page.locator('#assistant-file').setInputFiles('/downloads/assistant-contractor-b.xlsx');
  await page.locator('.modal-backdrop').waitFor({state:'hidden'});
  ok(writes.length===2, 'recognized moved-column format saved without any clicks');
  ok(writes[1].items.find(r=>r.reference==='QA-OLD').revision==='A','moved revision column resolved by name');
  await page.locator('#assistant-upload').click();
  await page.locator('#assistant-file').setInputFiles('/downloads/assistant-fixture.xlsx');
  await page.locator('.modal-backdrop').waitFor({state:'hidden'});
  ok(writes.length===3, 'unknown status no longer blocks import');
  ok(writes[2].items.find(r=>r.reference==='QA-OLD').state==='open','unknown status preserves existing state');
  if(process.env.QUALITY_REAL_WORKBOOK) {
    await page.locator('#assistant-upload').click();
    await page.locator('#assistant-file').setInputFiles(process.env.QUALITY_REAL_WORKBOOK);
    await page.locator('.modal-backdrop').waitFor({state:'hidden',timeout:120000});
    ok(writes.length===4,'actual workbook saved in one call after file selection alone');
    ok(writes[3].imports.length===8,'actual workbook detects all eight logs and skips summary');
    ok(writes[3].items.length===8674,'all actual unique reference/revision records prepared');
    ok(writes[3].items.filter(r=>r.is_current).length===6616,'one current revision per actual reference');
    await page.screenshot({path:'/downloads/actual-workbook-local.png',fullPage:true});
  }
  await page.locator('[data-action="language"]').click();
  await page.locator('#assistant-question').waitFor();
  await page.screenshot({path:'/downloads/zero-manual-ar.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#assistant-upload').click();
  await page.screenshot({path:'/downloads/zero-manual-mobile.png',fullPage:true});
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile has no horizontal overflow');
  ok(errors.length===0,'no browser script errors: '+errors.join(';'));
  await context.close();
  const viewer=await setup('viewer');
  await viewer.page.locator('#assistant-upload').click();
  await viewer.page.locator('#assistant-file').setInputFiles('/downloads/assistant-contractor-a.xlsx');
  await viewer.page.getByText('Read-only analysis.',{exact:false}).waitFor();
  ok(viewer.writes.length===0,'viewer cannot write');
  await viewer.context.close();
  console.log('BROWSER CHECKS PASSED:',checks);
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}

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
      } else if (pathname.endsWith("/apply_assistant_import")) {
        const body = JSON.parse(req.postData());
        writes.push(body);
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
  ok(
    await page.getByText("AI not connected", { exact: true }).isVisible(),
    "honest non-AI disclosure",
  );
  await page.locator('[data-assistant-prompt="status"]').click();
  await page.locator(".assistant-thinking").waitFor({ state: "hidden" });
  ok(
    (await page.locator("#assistant-messages").innerText()).includes("47.0%"),
    "status reply uses saved project progress",
  );
  ok(
    (await page.locator("#assistant-messages").innerText()).includes(
      "EXAMPLE-A",
    ),
    "reply includes project source",
  );
  await page.screenshot({
    path: "/downloads/assistant-local-en.png",
    fullPage: true,
  });
  await page.locator('[data-action="back-projects"]').click();
  await page
    .locator('[data-project="' + p2 + '"]')
    .first()
    .click();
  await page.locator('[data-tab="assistant"]').click();
  ok(
    !(await page.locator("#assistant-messages").innerText()).includes("47.0%"),
    "project chats isolated",
  );
  await page.locator('[data-action="back-projects"]').click();
  await page
    .locator('[data-project="' + p1 + '"]')
    .first()
    .click();
  await page.locator('[data-tab="assistant"]').click();
  ok(
    (await page.locator("#assistant-messages").innerText()).includes("47.0%"),
    "chat retained for original project only",
  );
  await page.locator("#assistant-upload").click();
  await page
    .locator("#assistant-file")
    .setInputFiles("/downloads/assistant-fixture.xlsx");
  await page.locator("#assistant-sheet").waitFor({ state: "visible" });
  await page.locator("#assistant-sheet").selectOption("Register");
  await page.locator("#assistant-header").fill("3");
  await page.locator("#assistant-header").press("Tab");
  await page.locator("#assistant-date-mode").selectOption("dmy");
  await page.locator('[data-status-index="0"]').selectOption("review");
  ok(
    (await page.locator('[data-map-field="reference"]').inputValue()) === "0",
    "reference alias mapping works after header selection",
  );
  await page.locator("#assistant-analyze").click();
  await page.locator("#assistant-approval").waitFor();
  ok(
    await page.locator("#assistant-commit").isDisabled(),
    "save disabled before explicit confirmation",
  );
  const preview = await page.locator("#assistant-import-preview").innerText();
  ok(
    preview.includes("1 new") &&
      preview.includes("1 updates") &&
      preview.includes("0 errors"),
    "preview classifies new and updated rows",
  );
  const [review] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#assistant-review-all").click(),
  ]);
  await review.saveAs("/downloads/assistant-change-review.csv");
  const csv = await fs.readFile(
    "/downloads/assistant-change-review.csv",
    "utf8",
  );
  ok(
    csv.includes("title_before") &&
      csv.includes("Original inspection") &&
      csv.includes("Updated inspection"),
    "full review contains before and after values",
  );
  await page.locator("#assistant-approval").check();
  await page.locator("#assistant-commit").click();
  await page.locator(".modal-backdrop").waitFor({ state: "hidden" });
  ok(writes.length === 1, "single atomic import call");
  ok(
    writes[0].pid === p1 && writes[0].cat === "site_rfi",
    "commit target frozen to current project/register",
  );
  ok(
    writes[0].items.find((r) => r.reference === "QA-OLD").expected_version ===
      5,
    "existing version carried to server",
  );
  ok(
    writes[0].items.find((r) => r.reference === "QA-OLD").payload.keep ===
      "retained",
    "existing additional fields retained",
  );
  ok(
    writes[0].items.find((r) => r.reference === "QA-NEW").occurred_on ===
      "2026-11-21",
    "day/month/year import preserved",
  );
  // New contractor format: fuzzy headers, auto sheet/header/date detection, one review, then saved
  await page.locator("#assistant-upload").click();
  await page
    .locator("#assistant-file")
    .setInputFiles("/downloads/assistant-contractor-a.xlsx");
  await page.locator("#assistant-sheet").waitFor({ state: "visible" });
  ok(
    (await page.locator("#assistant-sheet").inputValue()) === "Weekly Report",
    "register worksheet auto-selected over title sheets",
  );
  ok(
    (await page.locator("#assistant-header").inputValue()) === "3",
    "header row auto-detected under title rows",
  );
  ok(
    (await page.locator('[data-map-field="reference"]').inputValue()) === "0" &&
      (await page.locator('[data-map-field="due_date"]').inputValue()) === "5" &&
      (await page.locator('[data-map-field="occurred_on"]').inputValue()) === "6",
    "fuzzy contractor headers mapped",
  );
  ok(
    (await page.locator("#assistant-date-mode").inputValue()) === "dmy",
    "day-first date format auto-detected",
  );
  ok(
    (await page.locator("#assistant-mapping").innerText()).includes("(auto)"),
    "fuzzy matches labeled as automatic",
  );
  await page.screenshot({
    path: "/downloads/auto-format-mapping-en.png",
    fullPage: true,
  });
  await page.locator("#assistant-analyze").click();
  await page.locator("#assistant-approval").waitFor();
  const previewA = await page
    .locator("#assistant-import-preview")
    .innerText();
  ok(
    previewA.includes("1 new") &&
      previewA.includes("1 updates") &&
      previewA.includes("0 errors"),
    "contractor format preview clean",
  );
  ok(
    previewA.includes("Cleaned automatically") && previewA.includes("dates standardized"),
    "cleaning summary reported",
  );
  await page.locator("#assistant-approval").check();
  await page.locator("#assistant-commit").click();
  await page.locator(".modal-backdrop").waitFor({ state: "hidden" });
  ok(
    writes[1].items.find((r) => r.reference === "QA-OLD").due_date ===
      "2026-11-30",
    "day-first due date standardized on save",
  );
  // Same format again with a moved layout: recognized, auto-analyzed, no mapping work
  await page.locator("#assistant-upload").click();
  await page
    .locator("#assistant-file")
    .setInputFiles("/downloads/assistant-contractor-b.xlsx");
  await page.locator("#assistant-approval").waitFor();
  ok(
    (await page.locator("#assistant-mapping").innerText()).includes(
      "Known format recognized",
    ),
    "saved format recognized on later upload",
  );
  ok(
    (await page.locator('[data-map-field="revision"]').inputValue()) === "3",
    "saved mapping resolved by column name after layout shift",
  );
  await page.screenshot({
    path: "/downloads/auto-format-recognized-en.png",
    fullPage: true,
  });
  const previewB = await page
    .locator("#assistant-import-preview")
    .innerText();
  ok(
    previewB.includes("Known format applied") &&
      previewB.includes("0 errors") &&
      previewB.includes("1 updates"),
    "recognized format auto-analyzed to a compact preview",
  );
  await page.locator("#assistant-approval").check();
  await page.locator("#assistant-commit").click();
  await page.locator(".modal-backdrop").waitFor({ state: "hidden" });
  ok(writes.length === 3, "recognized format saved atomically too");
  ok(
    writes[2].items.find((r) => r.reference === "QA-OLD").title ===
      "Contractor row v2",
    "second upload updated the record",
  );
  const [ppt] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#assistant-presentation").click(),
  ]);
  await ppt.saveAs("/downloads/assistant-browser-qa.pptx");
  ok(
    (await fs.stat("/downloads/assistant-browser-qa.pptx")).size > 10000,
    "browser creates editable PowerPoint",
  );
  await page.locator('[data-action="language"]').click();
  await page.locator("#assistant-question").waitFor();
  ok(
    (await page.locator("html").getAttribute("dir")) === "rtl",
    "Arabic RTL supported",
  );
  await page.screenshot({
    path: "/downloads/assistant-local-ar.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/downloads/assistant-local-mobile.png",
    fullPage: true,
  });
  ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "390px layout has no horizontal overflow",
  );
  ok(errors.length === 0, "no browser JavaScript errors: " + errors.join("; "));
  await context.close();
  const viewer = await setup("viewer");
  await viewer.page.locator("#assistant-upload").click();
  await viewer.page
    .locator("#assistant-file")
    .setInputFiles("/downloads/assistant-fixture.xlsx");
  await viewer.page.locator("#assistant-sheet").waitFor({ state: "visible" });
  await viewer.page.locator("#assistant-sheet").selectOption("Register");
  await viewer.page.locator("#assistant-header").fill("3");
  await viewer.page.locator("#assistant-header").press("Tab");
  await viewer.page.locator("#assistant-date-mode").selectOption("dmy");
  await viewer.page.locator('[data-status-index="0"]').selectOption("review");
  await viewer.page.locator("#assistant-analyze").click();
  await viewer.page
    .getByText(
      "Read-only analysis. Ask your administrator to save this import.",
    )
    .waitFor();
  ok(
    await viewer.page.locator("#assistant-commit").isDisabled(),
    "viewer cannot save",
  );
  ok(
    (await viewer.page.locator("#assistant-approval").count()) === 0,
    "viewer has no approval control",
  );
  ok(viewer.writes.length === 0, "viewer submitted no writes");
  await viewer.context.close();
  console.log("BROWSER CHECKS PASSED:", checks);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

import {
  fields,
  suggestDetailed,
  inferMapping,
  normalizeState,
  analyzeRows,
  detectIntent,
  detectHeaderRow,
  headerScore,
  detectDateMode,
  matchSavedFormat,
  formatKey,
} from "./assistant-core.js";
import "./assistant.css";
import { workbookTables, sheetGrid } from "./workbook.js";

export function createAssistant(ctx) {
  const { db, esc, icon, modal, check, loadData, toast } = ctx;
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)],
    chats = new Map();
  let busy = false;
  const tr = (en, ar) => (ctx.lang() === "ar" ? ar : en),
    now = () =>
      new Date().toLocaleString(ctx.lang() === "ar" ? "ar-AE" : "en-GB", {
        timeZone: "Asia/Dubai",
      }),
    day = () =>
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }),
    num = (v) =>
      Number(v || 0).toLocaleString(ctx.lang() === "ar" ? "ar-AE" : "en-GB"),
    pc = (v) =>
      v == null ? tr("Not recorded", "غير مسجل") : Number(v).toFixed(1) + "%";
  const store = (pid) => {
    const key = ctx.userId() + ":" + pid;
    if (!chats.has(key)) chats.set(key, []);
    return chats.get(key);
  };
  const formatStore = {
    key: () => "quality-import-formats:" + ctx.userId(),
    all() {
      try {
        return JSON.parse(localStorage.getItem(this.key()) || "{}");
      } catch {
        return {};
      }
    },
    save(fp, entry) {
      const a = this.all();
      a[fp] = entry;
      const keys = Object.keys(a).sort(
        (x, y) => (a[y].savedAt || "").localeCompare(a[x].savedAt || ""),
      );
      for (const k of keys.slice(50)) delete a[k];
      try {
        localStorage.setItem(this.key(), JSON.stringify(a));
      } catch {
        /* storage full or blocked: recognition just stays off */
      }
    },
  };
  const labels = {
    reference: ["Reference", "المرجع"],
    title: ["Description", "الوصف"],
    revision: ["Revision", "المراجعة"],
    status: ["Source status", "الحالة الأصلية"],
    state: ["Normalized state", "الحالة الموحدة"],
    owner: ["Owner / inspector", "المسؤول / المفتش"],
    discipline: ["Discipline", "التخصص"],
    due_date: ["Due date", "تاريخ الاستحقاق"],
    occurred_on: ["Inspection / issue date", "تاريخ الفحص / الإصدار"],
    is_current: ["Current revision", "المراجعة الحالية"],
  };
  const stateLabels = {
    open: ["Open", "مفتوح"],
    closed: ["Closed", "مغلق"],
    review: ["Under review", "قيد المراجعة"],
    void: ["Void", "ملغي"],
    superseded: ["Superseded", "مستبدل"],
    other: ["Other", "أخرى"],
  };
  const errorText = (msg) => {
    if (ctx.lang() !== "ar") return msg;
    const messages = {
      "Map a reference column before continuing.":
        "اربط عمود المرجع قبل المتابعة.",
      "A source column may only map to one field.":
        "لا يمكن ربط عمود المصدر بأكثر من حقل واحد.",
      "Reference is required and must be 500 characters or fewer":
        "المرجع مطلوب وبحد أقصى 500 حرف.",
      "Duplicate reference and revision": "المرجع والمراجعة مكرران في الملف.",
      "This reference already has revisions. Map the revision column to avoid creating a duplicate.":
        "لهذا المرجع مراجعات محفوظة. اربط عمود المراجعة لتجنب إنشاء سجل مكرر.",
      "Title is required for new rows and must be 3,000 characters or fewer":
        "الوصف مطلوب للسجلات الجديدة وبحد أقصى 3000 حرف.",
      "Invalid normalized state": "الحالة الموحدة غير صالحة.",
      "Current revision must be true/false, yes/no or 1/0":
        "المراجعة الحالية يجب أن تكون true/false أو yes/no أو 1/0.",
      "Invalid date. Choose the correct date format or use YYYY-MM-DD":
        "تاريخ غير صالح. اختر التنسيق الصحيح أو استخدم YYYY-MM-DD.",
      "Date column must be formatted as a date in Excel":
        "نسق عمود التاريخ كتاريخ داخل Excel.",
      "Invalid date": "تاريخ غير صالح.",
    };
    if (messages[msg]) return messages[msg];
    if (msg.startsWith("Map the status: "))
      return "حدد معنى الحالة: " + msg.slice(16);
    if (msg.startsWith("New revision "))
      return (
        "قد تترك المراجعة الجديدة مراجعة سابقة حالية أيضا. أضف صف المراجعة السابقة مع is_current=false أو اجعل الصف الجديد غير حالي. " +
        msg.match(/New revision (.*?) would/)?.[1]
      );
    return msg;
  };
  const label = (k) => {
    const a = labels[k] || stateLabels[k] || [k, k];
    return tr(...a);
  };
  function html(p) {
    return `<section class="assistant-head panel panel-pad"><div class="row spread wrap"><div class="row"><span class="assistant-glyph">${icon("bolt")}</span><div><div class="eyebrow">${esc(p.code)} · ${tr("PROJECT TOOLS", "أدوات المشروع")}</div><h2>${tr("Project assistant", "مساعد المشروع")}</h2></div></div><span class="pill amber">${tr("AI not connected", "الذكاء الاصطناعي غير متصل")}</span></div><p class="assistant-disclosure">${tr("Data-backed answers, Excel review and editable presentations. These tools work without an AI service. Open-ended AI analysis is not enabled.", "إجابات من البيانات، ومراجعة Excel، وعروض قابلة للتحرير. تعمل هذه الأدوات دون خدمة ذكاء اصطناعي. التحليل الحر بالذكاء الاصطناعي غير مفعل.")}</p></section><div class="assistant-layout"><section class="panel assistant-chat"><div class="assistant-chat-head row spread"><div><h3>${tr("Ask about this project", "اسأل عن هذا المشروع")}</h3><span class="small muted">${tr("Only this project. Latest saved data.", "هذا المشروع فقط. أحدث البيانات المحفوظة.")}</span></div><button class="btn" id="assistant-clear">${tr("Clear chat", "مسح المحادثة")}</button></div><div id="assistant-messages" class="assistant-messages" role="log" aria-live="polite"></div><div class="assistant-prompts">${[
      ["status", "Project status", "حالة المشروع"],
      ["progress", "Progress", "التقدم"],
      ["overdue", "Overdue items", "البنود المتأخرة"],
      ["workload", "Inspector workload", "أحمال المفتشين"],
    ]
      .map(
        ([q, en, ar]) =>
          `<button class="btn" data-assistant-prompt="${q}">${tr(en, ar)}</button>`,
      )
      .join(
        "",
      )}</div><form id="assistant-form" class="assistant-compose"><label class="sr-only" for="assistant-question">${tr("Project question", "سؤال عن المشروع")}</label><textarea id="assistant-question" maxlength="2000" rows="2" required placeholder="${tr("Ask for status, progress, overdue items, or search: reference", "اسأل عن الحالة أو التقدم أو التأخير، أو ابحث: المرجع")}"></textarea><button type="submit" class="btn primary" id="assistant-send">${tr("Send", "إرسال")}${icon("arrow")}</button></form><p class="assistant-local-note">${tr("Chat stays in this tab and clears when you sign out. No data is sent to an AI provider.", "المحادثة في علامة التبويب هذه فقط وتمسح عند الخروج. لا ترسل البيانات إلى مزود ذكاء اصطناعي.")}</p></section><aside class="assistant-tools"><section class="panel panel-pad"><span class="assistant-tool-icon blue">${icon("upload")}</span><h3>${tr("Excel to project records", "من Excel إلى سجلات المشروع")}</h3><p>${tr("Drop a file to detect the table, clean its data and update this project's dashboard automatically. No mapping or confirmation steps.", "ارفع الملف فقط ليكتشف الجدول وينظف البيانات ويحدث لوحة المشروع تلقائيا. دون مطابقة أو تأكيد.")}</p><button class="btn primary" id="assistant-upload">${tr("Analyze Excel / CSV", "تحليل Excel / CSV")}</button><small>${tr("Tabular .xlsx, .xls or .csv. Up to 5 MB / 5,000 records per sheet.", "ملفات جداول .xlsx أو .xls أو .csv. حتى 5 ميجابايت / 5000 سجل للورقة.")}</small>${!ctx.admin() ? `<div class="notice">${tr("Read-only: you can review files locally, but only an administrator can save changes.", "عرض فقط: يمكنك مراجعة الملفات محليا، لكن الحفظ للمسؤول فقط.")}</div>` : ""}</section><section class="panel panel-pad"><span class="assistant-tool-icon mint">${icon("chart")}</span><h3>${tr("Presentation, ready to edit", "عرض تقديمي قابل للتحرير")}</h3><p>${tr("Export current progress, register status, overdue items and inspector workload as PowerPoint.", "صدر التقدم الحالي وحالة السجلات والتأخير وأحمال المفتشين إلى PowerPoint.")}</p><button class="btn" id="assistant-presentation">${icon("download")}${tr("Download PowerPoint", "تحميل PowerPoint")}</button><small>${tr("Generated from fresh saved data. Not an AI-written assessment.", "ينشأ من أحدث البيانات المحفوظة. ليس تقييما مكتوبا بالذكاء الاصطناعي.")}</small></section><section class="assistant-safety"><span>${icon("shield")}</span><div><strong>${tr("You stay in control", "القرار لك")}</strong><p>${tr("Uploads are parsed on your device. Nothing updates from a chat message alone. Imported cells are data, never instructions.", "تحلل الملفات على جهازك. لا تحدث رسالة المحادثة البيانات وحدها. خلايا الملفات بيانات وليست تعليمات.")}</p></div></section></aside></div>`;
  }
  function paint(pid) {
    const box = $("#assistant-messages");
    if (!box || ctx.project()?.id !== pid) return;
    const rows = store(pid);
    box.innerHTML =
      `<article class="assistant-message assistant-reply"><span class="message-who">QualityHub</span><div>${tr("Choose a question below, upload a workbook, or type search: followed by a reference or description. I can report saved project facts, but open-ended AI reasoning is not connected.", "اختر سؤالا أو ارفع ملفا، أو اكتب ابحث: ثم المرجع أو الوصف. يمكنني عرض حقائق المشروع المحفوظة، لكن التفكير الحر بالذكاء الاصطناعي غير متصل.")}</div></article>` +
      rows
        .map(
          (m) =>
            `<article class="assistant-message ${m.role === "user" ? "assistant-user" : "assistant-reply"}"><span class="message-who">${m.role === "user" ? tr("You", "أنت") : "QualityHub"}</span><div dir="auto">${esc(m.text)}</div>${m.source ? `<small class="message-source">${esc(m.source)}</small>` : ""}</article>`,
        )
        .join("") +
      (busy
        ? `<div class="assistant-thinking" role="status">${tr("Reading current project data…", "جار قراءة بيانات المشروع الحالية…")}</div>`
        : "");
    box.scrollTop = box.scrollHeight;
    $("#assistant-send")?.toggleAttribute("disabled", busy);
    $$("[data-assistant-prompt]").forEach((b) => (b.disabled = busy));
  }
  async function getSnapshot(pid) {
    await loadData();
    const p = ctx.projects().find((p) => p.id === pid);
    if (!p)
      throw Error(
        tr(
          "Project access is no longer available.",
          "لم يعد الوصول للمشروع متاحا.",
        ),
      );
    const endDate = day();
    const [over, workload] = await Promise.all([
      db
        .from("records")
        .select("reference,title,category,owner,due_date,state", {
          count: "exact",
        })
        .eq("project_id", pid)
        .eq("is_current", true)
        .in("state", ["open", "review"])
        .lt("due_date", endDate)
        .order("due_date")
        .order("reference")
        .limit(8),
      check(
        db.rpc("inspection_workload", { p_project: pid, end_date: endDate }),
      ),
    ]);
    if (over.error) throw Error(over.error.message);
    return {
      project: p,
      stats: ctx.stats().filter((r) => r.project_id === pid),
      overdue: over.data,
      overdueCount: over.count || 0,
      workload,
      endDate,
      generatedAt: now(),
    };
  }
  async function reply(pid, input) {
    if (busy) return;
    busy = true;
    const rows = store(pid);
    rows.push({ role: "user", text: input });
    if (rows.length > 60) rows.splice(0, 2);
    paint(pid);
    let text = "",
      source = "";
    try {
      const intent = detectIntent(input);
      if (intent.type === "upload") {
        text = tr(
          "Use Analyze Excel / CSV and drop the workbook. The table and columns are detected automatically, the data is cleaned, and the dashboard is updated. You get a summary after saving. Uncertain dates and statuses are preserved without guessing.",
          "استخدم تحليل Excel / CSV وارفع الملف فقط. يكتشف الجدول والأعمدة وينظف البيانات ويحدث لوحة المتابعة تلقائيا، ثم يعرض ملخصا بعد الحفظ. القيم غير المؤكدة تحفظ دون تخمين.",
        );
      } else if (intent.type === "presentation") {
        text = tr(
          "Use Download PowerPoint to generate an editable presentation from this project's latest saved data.",
          "استخدم تحميل PowerPoint لإنشاء عرض قابل للتحرير من أحدث بيانات هذا المشروع.",
        );
      } else if (intent.type === "unsupported") {
        text = tr(
          "Open-ended AI is not connected. I can show project status, progress, overdue items, inspector workload, or search: followed by a record reference or description. I will not guess an answer.",
          "الذكاء الاصطناعي الحر غير متصل. أستطيع عرض الحالة والتقدم والتأخير وأحمال المفتشين، أو ابحث: ثم مرجع السجل أو وصفه. لن أخمن الإجابة.",
        );
      } else if (intent.type === "search") {
        const term = intent.term.replace(/[%_(),"\\]/g, " ").trim();
        if (!term)
          throw Error(
            tr(
              "Enter a reference or description after search:.",
              "أدخل مرجعا أو وصفا بعد ابحث:.",
            ),
          );
        const { data, error, count } = await db
          .from("records")
          .select("reference,title,status,owner,category", { count: "exact" })
          .eq("project_id", pid)
          .eq("is_current", true)
          .or(
            `reference.ilike.%${term}%,title.ilike.%${term}%,owner.ilike.%${term}%`,
          )
          .order("reference")
          .limit(10);
        if (error) throw Error(error.message);
        text =
          tr("Matching current records: ", "السجلات الحالية المطابقة: ") +
          num(count) +
          "\n" +
          data
            .map(
              (r) =>
                r.reference +
                " · " +
                ctx.mname(r.category) +
                " · " +
                r.status +
                "\n" +
                r.title +
                (r.owner ? "\n" + tr("Owner: ", "المسؤول: ") + r.owner : ""),
            )
            .join("\n\n") +
          "\n" +
          tr("Up to 10 matches shown.", "تعرض حتى 10 نتائج.");
        source =
          tr(
            "Source: current project records · ",
            "المصدر: سجلات المشروع الحالية · ",
          ) +
          now() +
          " (Dubai)";
      } else {
        const s = await getSnapshot(pid),
          p = s.project;
        source =
          p.code +
          " · " +
          tr(
            "Source: saved project + current registers · ",
            "المصدر: المشروع المحفوظ والسجلات الحالية · ",
          ) +
          s.generatedAt +
          " (Dubai)";
        if (intent.type === "progress")
          text =
            tr("Actual progress: ", "التقدم الفعلي: ") +
            pc(p.actual) +
            "\n" +
            tr("Planned progress: ", "التقدم المخطط: ") +
            pc(p.planned) +
            "\n" +
            tr("Progress date: ", "تاريخ التقدم: ") +
            (p.as_of || tr("Not recorded", "غير مسجل")) +
            (p.note
              ? "\n\n" +
                tr(
                  "Saved note (may reflect an earlier reporting cut-off): ",
                  "ملاحظة محفوظة (قد تعكس تاريخ تقرير سابقا): ",
                ) +
                p.note
              : "");
        else if (intent.type === "overdue")
          text =
            num(s.overdueCount) +
            " " +
            tr(
              "current open or under-review records are past their due date.",
              "سجل حالي مفتوح أو قيد المراجعة تجاوز تاريخ الاستحقاق.",
            ) +
            "\n\n" +
            s.overdue
              .map(
                (r) =>
                  r.reference +
                  " · " +
                  ctx.mname(r.category) +
                  " · " +
                  r.due_date +
                  " · " +
                  (r.owner || tr("Unassigned", "غير معين")),
              )
              .join("\n") +
            "\n\n" +
            tr(
              "Up to 8 shown, earliest due first. Missing due dates are not counted.",
              "يعرض حتى 8 بنود، الأقدم استحقاقا أولا. لا تحتسب التواريخ غير المسجلة.",
            );
        else if (intent.type === "workload")
          text =
            tr(
              "Inspector workload, 30 days ending ",
              "أحمال المفتشين خلال 30 يوما تنتهي في ",
            ) +
            s.endDate +
            "\n\n" +
            (s.workload.length
              ? s.workload
                  .slice(0, 10)
                  .map(
                    (r) =>
                      r.inspector +
                      ": " +
                      num(r.inspections) +
                      " " +
                      tr("inspections", "فحص") +
                      " · " +
                      num(r.open) +
                      " " +
                      tr("open", "مفتوح"),
                  )
                  .join("\n")
              : tr(
                  "No dated Site RFI records in this window.",
                  "لا توجد طلبات فحص مؤرخة في هذه الفترة.",
                )) +
            "\n\n" +
            tr(
              "Top 10 returned groups shown. Uses owner and inspection date on current Site RFIs. Name variants are not merged.",
              "تعرض أول 10 مجموعات من المصدر. يعتمد على المسؤول وتاريخ الفحص في الطلبات الحالية. لا تدمج صيغ الأسماء المختلفة.",
            );
        else {
          const sum = (k) => s.stats.reduce((v, r) => v + Number(r[k] || 0), 0);
          text =
            p.code +
            " · " +
            p.name +
            "\n" +
            tr("Actual: ", "الفعلي: ") +
            pc(p.actual) +
            " · " +
            tr("Planned: ", "المخطط: ") +
            pc(p.planned) +
            "\n" +
            tr("Progress date: ", "تاريخ التقدم: ") +
            (p.as_of || tr("Not recorded", "غير مسجل")) +
            "\n\n" +
            num(sum("total")) +
            " " +
            tr("current register records", "سجل حالي") +
            "\n" +
            num(sum("open")) +
            " " +
            tr("open", "مفتوح") +
            " · " +
            num(sum("review")) +
            " " +
            tr("under review", "قيد المراجعة") +
            " · " +
            num(sum("closed")) +
            " " +
            tr("closed", "مغلق") +
            "\n" +
            num(s.overdueCount) +
            " " +
            tr(
              "overdue open / review items",
              "بند متأخر مفتوح أو قيد المراجعة",
            ) +
            "\n\n" +
            s.stats
              .filter((r) => r.total)
              .map(
                (r) =>
                  ctx.mname(r.category) +
                  ": " +
                  num(r.total) +
                  " · " +
                  num(r.open) +
                  " " +
                  tr("open", "مفتوح"),
              )
              .join("\n") +
            "\n\n" +
            tr(
              "Counts use current revisions and latest stored status. This is not a historical cut-off calculation or live contractor feed.",
              "الأعداد للمراجعات الحالية وآخر حالة محفوظة، وليست حسابات تاريخ قطع أو تغذية مباشرة من المقاول.",
            );
        }
      }
      rows.push({ role: "assistant", text, source });
    } catch (e) {
      rows.push({
        role: "assistant",
        text:
          tr(
            "Could not read the current data. Nothing was changed. ",
            "تعذرت قراءة البيانات الحالية. لم يتغير شيء. ",
          ) + e.message,
      });
    } finally {
      busy = false;
      paint(pid);
    }
  }
  function bind(p) {
    paint(p.id);
    $("#assistant-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#assistant-question"),
        q = input.value.trim();
      if (!q) return;
      input.value = "";
      reply(p.id, q);
    });
    $$("[data-assistant-prompt]").forEach(
      (b) =>
        (b.onclick = () =>
          reply(
            p.id,
            tr(
              {
                status: "Project status",
                progress: "Progress",
                overdue: "Overdue items",
                workload: "Inspector workload",
              }[b.dataset.assistantPrompt],
              {
                status: "حالة المشروع",
                progress: "التقدم",
                overdue: "البنود المتأخرة",
                workload: "أحمال المفتشين",
              }[b.dataset.assistantPrompt],
            ),
          )),
    );
    $("#assistant-clear").onclick = () => {
      if (busy) return;
      store(p.id).length = 0;
      paint(p.id);
    };
    $("#assistant-upload").onclick = () => uploadDialog(p);
    $("#assistant-presentation").onclick = async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        toast(
          tr(
            "Preparing current project presentation…",
            "جار تجهيز عرض المشروع الحالي…",
          ),
        );
        const s = await getSnapshot(p.id),
          { createProjectDeck } = await import("./presentation.js"),
          deck = await createProjectDeck(s, { language: ctx.lang() });
        await deck.writeFile({
          fileName:
            p.code.replace(/[^a-zA-Z0-9_-]/g, "_") +
            "-status-" +
            day() +
            ".pptx",
        });
        toast(tr("Presentation downloaded", "تم تحميل العرض التقديمي"));
      } catch (e) {
        toast(e.message, true);
      } finally {
        b.disabled = false;
      }
    };
  }

  async function uploadDialog(p) {
    let book, grid = [], headers = [], data = [], mapping = {}, prepared, busyImport = false, tables = [], skippedSheets = [], summaryCounts = [];
    let sheetName = '', headerRow = 0, dateMode = 'iso', savedMatch, fuzzy = [], dateUncertain = false;
    const opts = (items, value = '') => items.map(([v,l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const w = modal(tr('Automatic workbook import', 'استيراد الملف تلقائيا'), p.code + ' · ' + p.name,
      `<div class="notice">${icon('shield')}<span>${tr('Choose a file. The table, columns and values are detected, cleaned and saved automatically to this project. No mapping or confirmation is required. Existing records are never deleted. Files stay local during analysis.', 'اختر الملف فقط. يكتشف الجدول والأعمدة وينظف القيم ويحفظ تلقائيا لهذا المشروع دون مطابقة أو تأكيد. لا تحذف السجلات الموجودة. تحليل الملفات محلي.')}</span></div>
      <div class="file-drop"><h3>${tr('Drop Excel or CSV here', 'اسحب Excel أو CSV هنا')}</h3><input type="file" id="assistant-file" accept=".xlsx,.xls,.csv" aria-label="${tr('Workbook file','ملف الجداول')}"><p>${tr('Up to 5 MB, 5,000 records per sheet, 20,000 per workbook, 100 populated columns. Register sheets are combined; summaries are excluded.', 'حتى 5 ميجابايت و5000 سجل للورقة و20000 للملف و100 عمود فعلي. تستورد أوراق السجلات معا وتستبعد الملخصات.')}</p></div>
      <div id="assistant-import-preview" aria-live="polite"></div>
      <details id="assistant-adjust" hidden><summary>${tr('Optional: adjust detection', 'اختياري: تعديل الاكتشاف')}</summary><div class="form-grid"><label class="field"><span>${tr('Worksheet','ورقة العمل')}</span><select id="assistant-sheet"></select></label><label class="field"><span>${tr('Header row','صف العناوين')}</span><input id="assistant-header" type="number" min="1" max="50"></label><label class="field"><span>${tr('Register','السجل')}</span><select id="assistant-register">${opts(Object.keys(ctx.modules).map(k => [k,ctx.mname(k)]),'site_rfi')}</select></label><label class="field"><span>${tr('Date order','ترتيب التاريخ')}</span><select id="assistant-date-mode">${opts([['iso',tr('Preserve ambiguous dates','حفظ التواريخ الملتبسة')],['dmy','DD/MM/YYYY'],['mdy','MM/DD/YYYY']])}</select></label></div><div id="assistant-mapping" class="assistant-map-grid"></div><button type="button" id="assistant-analyze" class="btn">${tr('Apply adjustments and retry','تطبيق التعديل وإعادة المحاولة')}</button></details><div class="form-actions"><button type="button" class="btn" data-close>${tr('Close','إغلاق')}</button></div>`, null, true);
    const preview = $('#assistant-import-preview', w);
    const fail = e => { preview.innerHTML = `<div class="form-error">${esc(tr('Nothing was saved. ', 'لم يتم حفظ أي شيء. ') + e.message)}</div>`; };
    const gridFromSheet = sheetGrid;
    function categoryFor(name, columns) {
      const hint = (name + ' ' + ($('#assistant-file',w).files[0]?.name || '') + ' ' + columns.join(' ')).toLowerCase();
      const candidates = [ [/\bncr\b|\bcar\b|non.?conform/i,'findings'], [/\bsmr\b|material/i,'smr'], [/vendor.*document/i,'vdocs'], [/vendor.*rfi|vendor.*inspection/i,'vendor_rfi'], [/punch/i,'punch'], [/test.?pack/i,'test_pack'], [/dossier/i,'dossier'], [/\bwps\b|welding procedure/i,'wps'], [/welder/i,'welders'], [/quality document|document register|submittal/i,'docs'], [/action tracker/i,'actions'], [/\bwir\b|\brfi\b|inspection request/i,'site_rfi'] ];
      for (const [re,key] of candidates) if (re.test(hint) && ctx.modules[key]) return key;
      return null;
    }
    function setupDetection() {
      headerRow = Number($('#assistant-header',w).value) - 1;
      if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow > 49) throw Error(tr('Header row must be 1 to 50.','صف العناوين من 1 إلى 50.'));
      const width = Math.max(...grid.slice(headerRow,headerRow + 10).map(r => r.length));
      headers = Array.from({length:width},(_,i) => String(grid[headerRow]?.[i] ?? '').replace(/\s+/g,' ').trim() || 'Column ' + (i+1));
      const detection = inferMapping(headers,grid.slice(headerRow+1));
      mapping = detection.mapping; fuzzy = detection.fuzzy;
      data = grid.slice(headerRow+1).filter(r => r.some(v => String(v ?? '').trim()));
      // Repeated page headers and footer totals are presentation rows, not records.
      data = data.filter(r => {
        const ref = String(r[Number(mapping.reference)] ?? '').trim();
        return normHeader(ref) !== normHeader(headers[Number(mapping.reference)]) && !/^(grand\s+total|total|subtotal|page\s+\d+)$/i.test(ref);
      });
      if (data.length > 5000) throw Error(tr('Use at most 5,000 data rows.','استخدم 5000 صف بيانات كحد أقصى.'));
      if (data.some(r => r.some(v => typeof v === 'string' && v.length > 5000))) throw Error(tr('A cell exceeds 5,000 characters.','تتجاوز خلية 5000 حرف.'));
      savedMatch = matchSavedFormat(headers,Object.values(formatStore.all()));
      if (savedMatch) mapping = {...mapping,...savedMatch.mapping};
      dateMode = detectDateMode(data,mapping) || savedMatch?.entry.dateMode || 'iso';
      dateUncertain = dateMode === 'iso' && !detectDateMode(data,mapping) && data.some(r => [mapping.due_date,mapping.occurred_on].some(c => c !== '' && /^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(String(r[Number(c)] ?? ''))));
      $('#assistant-date-mode',w).value = dateMode;
      $('#assistant-register',w).value = categoryFor(sheetName,headers) || (savedMatch?.entry.category && ctx.modules[savedMatch.entry.category] ? savedMatch.entry.category : 'site_rfi');
      paintMapping();
    }
    const normHeader = v => String(v ?? '').toLowerCase().replace(/\W/g,'');
    function paintMapping() {
      $('#assistant-mapping',w).innerHTML = fields.map(f => `<label class="field"><span>${label(f)}</span><select data-map-field="${f}">${opts([['',tr('Preserve existing','الاحتفاظ بالمحفوظ')],...headers.map((h,i) => [String(i),h])],mapping[f])}</select></label>`).join('');
    }
    async function processFile(adjusted = false) {
      if (busyImport) return;
      busyImport=true; prepared=null;
      $('#assistant-file',w).disabled=true; $('#assistant-analyze',w).disabled=true;
      preview.innerHTML=`<div class="notice">${tr('Analyzing, cleaning and updating the dashboard…','جار التحليل والتنظيف وتحديث لوحة المتابعة…')}</div>`;
      try {
        const active = adjusted ? [{sheetName,headerRow,headers,rows:data,mapping,dateMode,omitted:0,duplicates:0,continued:0,missingTitles:0}] : tables;
        const imports=[],reports=[],categoryRows=new Map(); let warnings=0,dates=0,statuses=0,trimmed=0,omitted=0,duplicates=0,continued=0,missingTitles=0;
        for(const table of active) {
          preview.innerHTML=`<div class="notice">${esc(tr('Processing ','جار معالجة ') + table.sheetName)}</div>`;
          const match=matchSavedFormat(table.headers,Object.values(formatStore.all()));
          const map=match ? {...table.mapping,...match.mapping} : table.mapping;
          const mode=table.dateMode !== 'iso' ? table.dateMode : match?.entry.dateMode || table.dateMode;
          const cat=adjusted ? $('#assistant-register',w).value : categoryFor(table.sheetName,table.headers) || match?.entry.category || 'site_rfi';
          if(!table.rows.length || map.reference==='') throw Error(tr('No reliable record references found.','لم توجد مراجع سجلات موثوقة.'));
          const wanted=new Set(table.rows.map(r=>String(r[Number(map.reference)]??'').replace(/\s+/g,' ').trim()).filter(Boolean));
          if(!categoryRows.has(cat)) {
            const saved=[];let offset=0;
            while(true) {
              const chunk=await check(db.from('records').select('reference,title,revision,status,state,owner,discipline,due_date,occurred_on,is_current,payload,version').eq('project_id',p.id).eq('category',cat).order('id').range(offset,offset+999));
              saved.push(...chunk);if(chunk.length<1000) break;offset+=1000;
              if(offset>100000) throw Error(tr('Register is too large for this upload.','السجل كبير جدا لهذا الاستيراد.'));
            }
            categoryRows.set(cat,saved);
          }
          const existing=categoryRows.get(cat).filter(r=>wanted.has(r.reference));
          const result=analyzeRows({rows:table.rows,headers:table.headers,mapping:map,existing,dateMode:mode,stateMap:match?.entry.statusMap||{},fileName:$('#assistant-file',w).files[0].name,sheetName:table.sheetName,automatic:true});
          if(result.errors.length) throw Error(table.sheetName + ': ' + result.errors.slice(0,6).map(e=>tr('Row ','صف ')+e.row+': '+errorText(e.message)).join('\n'));
          if(!result.prepared.length) continue;
          imports.push({cat,items:result.prepared});
          const cl=result.cleaning;warnings+=cl.warnings.length;dates+=cl.dates;statuses+=cl.statuses;trimmed+=cl.trimmed;
          omitted+=table.omitted||0;duplicates+=table.duplicates||0;continued+=table.continued||0;missingTitles+=table.missingTitles||0;
          reports.push({...table,map,mode,cat});
        }
        if(!imports.length) throw Error(tr('No importable register tables found.','لم توجد جداول سجلات قابلة للاستيراد.'));
        if(!ctx.admin()) {
          preview.innerHTML=`<div class="notice">${tr('Read-only analysis. An administrator must save the file. Detected records: ','تحليل للعرض فقط. يلزم مسؤول لحفظ الملف. السجلات المكتشفة: ')}${num(imports.reduce((n,x)=>n+x.items.length,0))}</div>`;
          return;
        }
        preview.innerHTML=`<div class="notice">${tr('Saving all detected register sheets together…','جار حفظ كل أوراق السجلات معا…')}</div>`;
        const result=await check(db.rpc('apply_assistant_workbook',{pid:p.id,imports}));
        for(const t of reports) {
          const mapped=Object.fromEntries(fields.filter(f=>t.map[f]!=='').map(f=>[f,t.headers[Number(t.map[f])]]));
          formatStore.save(formatKey(mapped),{mapped,dateMode:t.mode,category:t.cat,statusMap:{},savedAt:new Date().toISOString(),file:$('#assistant-file',w).files[0].name});
        }
        let summary=tr('File processed and dashboard updated automatically. ','تم تحليل الملف وتحديث لوحة المتابعة تلقائيا. ')+num(result.added)+tr(' added, ',' مضاف، ')+num(result.updated)+tr(' updated. No rows deleted.',' محدث. لم تحذف صفوف.')+'\n'+reports.map(t=>t.sheetName+tr(' · header row ',' · صف العناوين ')+(t.headerRow+1)+' · '+num(t.rows.length)).join('\n')+'\n'+num(trimmed)+tr(' cells cleaned · ',' خلية منظفة · ')+num(dates)+tr(' dates standardized · ',' تاريخ موحد · ')+num(statuses)+tr(' statuses normalized.',' حالة موحدة.')+(continued?'\n'+num(continued)+tr(' revision continuation references restored.',' مرجع مراجعة مستعاد من صف الاستكمال.'):'')+(duplicates?'\n'+num(duplicates)+tr(' duplicate reference/revision rows consolidated (last source row retained).',' صف مكرر دمج مع الاحتفاظ بآخر صف في المصدر.'):'')+(missingTitles?'\n'+num(missingTitles)+tr(' missing descriptions inherited from the same reference or labeled as not provided.',' وصف ناقص استكمل من نفس المرجع أو علم بأنه غير متاح.'):'')+(warnings?'\n'+num(warnings)+tr(' uncertain values preserved in source fields, not guessed.',' قيمة غير مؤكدة محفوظة في حقول المصدر دون تخمين.'):'')+(omitted?'\n'+num(omitted)+tr(' source rows without a usable reference were not imported.',' صف مصدر دون مرجع صالح لم يستورد.'):'')+(skippedSheets.length?'\n'+tr('Summary/non-register sheets excluded to avoid double counting: ','استبعدت أوراق الملخص لتجنب العد المزدوج: ')+skippedSheets.join(', '):'');
        const sourceCurrent=imports.reduce((n,x)=>n+x.items.filter(r=>r.is_current).length,0);
        for(const count of summaryCounts) if(count.total!==sourceCurrent) summary+='\n'+tr('Source summary reports ','ملخص المصدر يعرض ')+num(count.total)+tr('; detailed logs contain ','؛ السجلات التفصيلية تحتوي على ')+num(sourceCurrent)+tr(' current references. The dashboard uses the detailed logs.',' مرجعا حاليا. لوحة المتابعة تستخدم السجلات التفصيلية.');
        w.close();await loadData();store(p.id).push({role:'assistant',text:summary,source:p.code+' · '+now()+' (Dubai)'});await ctx.render();toast(tr('Import saved automatically','تم الاستيراد والحفظ تلقائيا'));
      } catch(e) {fail(e);}
      finally {busyImport=false;$('#assistant-file',w).disabled=false;$('#assistant-analyze',w).disabled=false;}
    }
    $('#assistant-file',w).onchange = async e => {
      if (busyImport) return;
      const file=e.target.files[0]; if (!file) return;
      try {
        if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw Error(tr('Choose .xlsx, .xls or .csv.','اختر .xlsx أو .xls أو .csv.'));
        if (file.size>5*1024*1024) throw Error(tr('File exceeds 5 MB.','يتجاوز الملف 5 ميجابايت.'));
        const X=await import('xlsx');
        book=X.read(await file.arrayBuffer(),{type:'array',raw:true,cellDates:true,sheetRows:5051});
        $('#assistant-sheet',w).innerHTML=opts(book.SheetNames.map(n=>[n,n]));
        const parsed=workbookTables(book,X);
        tables=parsed.tables;skippedSheets=parsed.skipped;summaryCounts=parsed.summaryCounts;
        if(!tables.length) throw Error(tr('No register table with references and descriptions was found.','لم يوجد جدول سجلات يحتوي على مراجع وأوصاف.'));
        const first=tables[0];
        sheetName=first.sheetName;headerRow=first.headerRow;headers=first.headers;data=first.rows;mapping=first.mapping;dateMode=first.dateMode;
        grid=gridFromSheet(book.Sheets[sheetName],X);
        $('#assistant-sheet',w).value=sheetName;
        $('#assistant-header',w).value=String(headerRow+1);
        $('#assistant-date-mode',w).value=dateMode;
        $('#assistant-register',w).value=categoryFor(sheetName,headers)||'site_rfi';
        paintMapping();$('#assistant-adjust',w).hidden=false;
        await processFile();
      } catch(e) { fail(e); }
    };
    $('#assistant-sheet',w).onchange=async()=>{ try {sheetName=$('#assistant-sheet',w).value;grid=gridFromSheet(book.Sheets[sheetName],await import('xlsx'));$('#assistant-header',w).value=String(detectHeaderRow(grid)+1);setupDetection();}catch(e){fail(e);} };
    $('#assistant-header',w).onchange=()=>{try{setupDetection();}catch(e){fail(e);}};
    $('#assistant-analyze',w).onclick=async()=>{
      $$('[data-map-field]',w).forEach(s=>mapping[s.dataset.mapField]=s.value);
      dateMode=$('#assistant-date-mode',w).value;
      await processFile(true);
    };
  }
  return {
    html,
    bind,
    clear: () => {
      chats.clear();
      busy = false;
    },
    snapshot: getSnapshot,
  };
}

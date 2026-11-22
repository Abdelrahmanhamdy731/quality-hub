import {
  fields,
  suggestMapping,
  normalizeState,
  analyzeRows,
  detectIntent,
} from "./assistant-core.js";
import "./assistant.css";

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
      )}</div><form id="assistant-form" class="assistant-compose"><label class="sr-only" for="assistant-question">${tr("Project question", "سؤال عن المشروع")}</label><textarea id="assistant-question" maxlength="2000" rows="2" required placeholder="${tr("Ask for status, progress, overdue items, or search: reference", "اسأل عن الحالة أو التقدم أو التأخير، أو ابحث: المرجع")}"></textarea><button type="submit" class="btn primary" id="assistant-send">${tr("Send", "إرسال")}${icon("arrow")}</button></form><p class="assistant-local-note">${tr("Chat stays in this tab and clears when you sign out. No data is sent to an AI provider.", "المحادثة في علامة التبويب هذه فقط وتمسح عند الخروج. لا ترسل البيانات إلى مزود ذكاء اصطناعي.")}</p></section><aside class="assistant-tools"><section class="panel panel-pad"><span class="assistant-tool-icon blue">${icon("upload")}</span><h3>${tr("Excel to project records", "من Excel إلى سجلات المشروع")}</h3><p>${tr("Choose a worksheet, match its columns, and review every change before saving.", "اختر ورقة العمل وطابق أعمدتها وراجع التغييرات قبل الحفظ.")}</p><button class="btn primary" id="assistant-upload">${tr("Analyze Excel / CSV", "تحليل Excel / CSV")}</button><small>${tr("Tabular .xlsx, .xls or .csv. Up to 5 MB / 5,000 rows.", "ملفات جداول .xlsx أو .xls أو .csv. حتى 5 ميجابايت / 5000 صف.")}</small>${!ctx.admin() ? `<div class="notice">${tr("Read-only: you can review files locally, but only an administrator can save changes.", "عرض فقط: يمكنك مراجعة الملفات محليا، لكن الحفظ للمسؤول فقط.")}</div>` : ""}</section><section class="panel panel-pad"><span class="assistant-tool-icon mint">${icon("chart")}</span><h3>${tr("Presentation, ready to edit", "عرض تقديمي قابل للتحرير")}</h3><p>${tr("Export current progress, register status, overdue items and inspector workload as PowerPoint.", "صدر التقدم الحالي وحالة السجلات والتأخير وأحمال المفتشين إلى PowerPoint.")}</p><button class="btn" id="assistant-presentation">${icon("download")}${tr("Download PowerPoint", "تحميل PowerPoint")}</button><small>${tr("Generated from fresh saved data. Not an AI-written assessment.", "ينشأ من أحدث البيانات المحفوظة. ليس تقييما مكتوبا بالذكاء الاصطناعي.")}</small></section><section class="assistant-safety"><span>${icon("shield")}</span><div><strong>${tr("You stay in control", "القرار لك")}</strong><p>${tr("Uploads are parsed on your device. Nothing updates from a chat message alone. Imported cells are data, never instructions.", "تحلل الملفات على جهازك. لا تحدث رسالة المحادثة البيانات وحدها. خلايا الملفات بيانات وليست تعليمات.")}</p></div></section></aside></div>`;
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
            `<article class="assistant-message ${m.role === "user" ? "assistant-user" : "assistant-reply"}"><span class="message-who">${m.role === "user" ? tr("You", "أنت") : "QualityHub"}</span><div>${esc(m.text)}</div>${m.source ? `<small class="message-source">${esc(m.source)}</small>` : ""}</article>`,
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
          "Use Analyze Excel / CSV to choose a worksheet and map columns. You will see a preview before any update.",
          "استخدم تحليل Excel / CSV لاختيار ورقة العمل ومطابقة الأعمدة. ستظهر المعاينة قبل أي تحديث.",
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
            (p.note ? "\n\n" + p.note : "");
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
    let book = null,
      grid = [],
      headers = [],
      data = [],
      mapping = {},
      prepared = null,
      selection = 0;
    const options = (items, value = "") =>
      items
        .map(
          ([v, l]) =>
            `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`,
        )
        .join("");
    const w = modal(
      tr("Analyze a workbook", "تحليل ملف جداول"),
      p.code + " · " + p.name,
      `<div class="notice">${icon("shield")}<span>${tr("Local analysis only. Choose one table at a time. No model reads your file. Nothing is saved until you confirm the preview.", "تحليل محلي فقط. اختر جدولا واحدا كل مرة. لا يقرأ أي نموذج ملفك. لا يحفظ شيء حتى تأكيد المعاينة.")}</span></div><div class="file-drop"><h3>${tr("Choose Excel or CSV", "اختر Excel أو CSV")}</h3><input type="file" id="assistant-file" accept=".xlsx,.xls,.csv" aria-label="${tr("Workbook file", "ملف الجداول")}"><p>${tr("Up to 5 MB, 5,000 data rows and 100 columns per sheet. Tables only, not scanned pages or arbitrary report layouts.", "حتى 5 ميجابايت و5000 صف و100 عمود لكل ورقة. جداول فقط، وليس صورا ممسوحة أو تقارير غير منتظمة.")}</p></div><div id="assistant-workbook" hidden><div class="form-grid"><label class="field"><span>${tr("Worksheet", "ورقة العمل")}</span><select id="assistant-sheet"></select></label><label class="field"><span>${tr("Header row", "صف العناوين")}</span><input id="assistant-header" type="number" min="1" max="50" value="1"></label><label class="field"><span>${tr("Target register", "السجل المستهدف")}</span><select id="assistant-register">${options(
        Object.keys(ctx.modules).map((k) => [k, ctx.mname(k)]),
        "site_rfi",
      )}</select></label><label class="field"><span>${tr("Text date format", "تنسيق التاريخ النصي")}</span><select id="assistant-date-mode">${options(
        [
          ["iso", tr("YYYY-MM-DD only", "YYYY-MM-DD فقط")],
          ["dmy", tr("Day / month / year", "يوم / شهر / سنة")],
          ["mdy", tr("Month / day / year", "شهر / يوم / سنة")],
        ],
      )}</select></label></div><div id="assistant-mapping"></div><div id="assistant-status-mapping"></div><div class="assistant-import-warning">${tr("Matched rows use reference + revision in this project/register. Mapped blank cells clear the saved value. Unmapped fields on existing records stay unchanged. No rows are deleted. Review the preview carefully.", "تطابق الصفوف بالمرجع والمراجعة داخل هذا المشروع والسجل. الخلايا الفارغة المربوطة تمسح القيمة المحفوظة. الحقول غير المربوطة تبقى كما هي في السجلات الموجودة. لا تحذف صفوف. راجع المعاينة جيدا.")}</div><button class="btn primary" type="button" id="assistant-analyze">${tr("Analyze and preview changes", "تحليل ومعاينة التغييرات")}</button></div><div id="assistant-import-preview" aria-live="polite"></div><div class="form-actions"><button type="button" class="btn" data-close>${tr("Cancel", "إلغاء")}</button><button type="submit" class="btn primary" id="assistant-commit" disabled>${tr("Confirm and save records", "تأكيد وحفظ السجلات")}</button></div>`,
      async () => {
        if (!ctx.admin())
          throw Error(
            tr("Administrator access required.", "صلاحية المسؤول مطلوبة."),
          );
        if (
          !prepared ||
          prepared.errors.length ||
          !prepared.prepared.length ||
          !$("#assistant-approval", w)?.checked
        )
          throw Error(
            tr(
              "Analyze the file and confirm the preview first.",
              "حلل الملف وأكد المعاينة أولا.",
            ),
          );
        const pid = p.id,
          cat = $("#assistant-register", w).value,
          items = prepared.prepared;
        $$("input,select,button", w).forEach((x) => (x.disabled = true));
        try {
          const result = await check(
            db.rpc("apply_assistant_import", { pid, cat, items }),
          );
          w.close();
          await loadData();
          store(pid).push({
            role: "assistant",
            text:
              tr("Workbook import saved. ", "تم حفظ استيراد الملف. ") +
              num(result.added) +
              tr(" added, ", " مضاف، ") +
              num(result.updated) +
              tr(" updated. No rows deleted.", " محدث. لم تحذف صفوف."),
            source:
              p.code + " · " + ctx.mname(cat) + " · " + now() + " (Dubai)",
          });
          await ctx.render();
          toast(tr("Import saved", "تم حفظ الاستيراد"));
        } catch (e) {
          prepared = null;
          $("#assistant-import-preview", w).innerHTML =
            `<div class="form-error">${esc(tr("Nothing was saved by this import. Analyze again before retrying. ", "لم يحفظ هذا الاستيراد أي شيء. حلل الملف مجددا قبل المحاولة. ") + e.message)}</div>`;
          throw e;
        } finally {
          $$("input,select,button", w).forEach((x) => (x.disabled = false));
          $("#assistant-commit", w).disabled = true;
        }
      },
      true,
    );
    const invalidate = () => {
      selection++;
      prepared = null;
      $("#assistant-commit", w).disabled = true;
      $("#assistant-import-preview", w).innerHTML = "";
    };
    function stateChoices() {
      const f =
          mapping.state !== ""
            ? "state"
            : mapping.status !== ""
              ? "status"
              : null,
        values = f
          ? [
              ...new Set(
                data.map((r) => String(r[Number(mapping[f])] ?? "").trim()),
              ),
            ].sort()
          : [];
      $("#assistant-status-mapping", w).innerHTML = values.length
        ? `<h3 class="assistant-step">${tr("Status interpretation, confirm each value", "تفسير الحالات، أكد كل قيمة")}</h3><p class="small muted">${tr("Suggestions are exact aliases, not AI decisions. Check the meaning in your source register.", "الاقتراحات تطابق أسماء معروفة وليست قرارات ذكاء اصطناعي. تحقق من المعنى في السجل الأصلي.")}</p><div class="assistant-map-grid">${values
            .slice(0, 60)
            .map(
              (v, i) =>
                `<label class="field"><span>${esc(v || tr("(blank)", "(فارغ)"))}</span><select data-status-index="${i}">${options([["", tr("Choose a state", "اختر الحالة")], ...Object.keys(stateLabels).map((k) => [k, label(k)])], normalizeState(v) || "")}</select></label>`,
            )
            .join(
              "",
            )}</div>${values.length > 60 ? `<div class="form-error">${tr("More than 60 unique statuses. Clean this column before importing.", "أكثر من 60 حالة مختلفة. نظف العمود قبل الاستيراد.")}</div>` : ""}`
        : "";
      $$("[data-status-index]", w).forEach((s) => (s.onchange = invalidate));
      w.statusValues = values;
    }
    function renderMap() {
      invalidate();
      data = [];
      const start = Number($("#assistant-header", w).value) - 1;
      if (!Number.isInteger(start) || start < 0 || start > 49)
        throw Error(
          tr("Header row must be 1 to 50.", "صف العناوين من 1 إلى 50."),
        );
      headers = (grid[start] || []).map(
        (v, i) => String(v ?? "").trim() || tr("Column ", "عمود ") + (i + 1),
      );
      if (!headers.length)
        throw Error(
          tr("The selected header row is empty.", "صف العناوين المختار فارغ."),
        );
      if (headers.length > 100)
        throw Error(
          tr("Use at most 100 columns.", "استخدم 100 عمود كحد أقصى."),
        );
      data = grid
        .slice(start + 1)
        .filter((r) => r.some((v) => String(v ?? "").trim()));
      if (data.length > 5000)
        throw Error(
          tr("Use at most 5,000 data rows.", "استخدم 5000 صف بيانات كحد أقصى."),
        );
      if (
        data.some((r) =>
          r.some((v) => typeof v === "string" && v.length > 5000),
        )
      )
        throw Error(
          tr(
            "A cell exceeds 5,000 characters. Split or shorten it.",
            "تتجاوز خلية 5000 حرف. اختصرها أو قسمها.",
          ),
        );
      mapping = suggestMapping(headers);
      $("#assistant-mapping", w).innerHTML =
        `<div class="section-head assistant-step"><h3>${tr("Map source columns", "مطابقة أعمدة المصدر")}</h3><span class="pill blue">${num(data.length)} ${tr("nonblank rows", "صف غير فارغ")}</span></div><p class="small muted">${tr("Reference is required. Description is required for new records. Map revision when the source has revisions.", "المرجع مطلوب. الوصف مطلوب للسجلات الجديدة. اربط المراجعة إذا كانت موجودة في المصدر.")}</p><div class="assistant-map-grid">${fields.map((f) => `<label class="field"><span>${label(f)}</span><select data-map-field="${f}">${options([["", tr("Not mapped, keep existing", "غير مربوط، احتفظ بالمحفوظ")], ...headers.map((h, i) => [String(i), String(i + 1) + ". " + h])], mapping[f])}</select></label>`).join("")}</div><details class="assistant-source-preview"><summary>${tr("View first 5 source rows", "عرض أول 5 صفوف من المصدر")}</summary><div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${data
          .slice(0, 5)
          .map(
            (r) =>
              `<tr>${headers.map((_, i) => `<td>${esc(String(r[i] ?? "").slice(0, 140))}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div></details>`;
      $$("[data-map-field]", w).forEach(
        (s) =>
          (s.onchange = () => {
            mapping[s.dataset.mapField] = s.value;
            invalidate();
            stateChoices();
          }),
      );
      stateChoices();
      invalidate();
    }
    async function readSheet() {
      invalidate();
      grid = [];
      data = [];
      const name = $("#assistant-sheet", w).value,
        sheet = book.Sheets[name],
        XLSX = await import("xlsx");
      const range = XLSX.utils.decode_range(
        sheet["!fullref"] || sheet["!ref"] || "A1",
      );
      if (range.e.r > 5049 || range.e.c > 99)
        throw Error(
          tr(
            "Sheet is too large. Keep at most 5,000 data rows, 50 header rows and 100 columns.",
            "الورقة كبيرة. الحد 5000 صف بيانات و50 صف عناوين و100 عمود.",
          ),
        );
      grid = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        range: 0,
        defval: "",
        blankrows: true,
        raw: true,
      });
      grid.forEach((row, r) =>
        row.forEach((v, c) => {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })];
          if (cell?.t === "n" && cell.w != null) row[c] = cell.w;
        }),
      );
      renderMap();
    }
    const fail = (e) => {
      $("#assistant-import-preview", w).innerHTML =
        `<div class="form-error">${esc(e.message)}</div>`;
      $("#assistant-commit", w).disabled = true;
    };
    $("#assistant-file", w).onchange = async (e) => {
      invalidate();
      book = null;
      $("#assistant-workbook", w).hidden = true;
      const f = e.target.files[0];
      if (!f) return;
      try {
        if (!/\.(xlsx|xls|csv)$/i.test(f.name))
          throw Error(
            tr("Choose .xlsx, .xls or .csv.", "اختر .xlsx أو .xls أو .csv."),
          );
        if (f.size > 5 * 1024 * 1024)
          throw Error(tr("File exceeds 5 MB.", "يتجاوز الملف 5 ميجابايت."));
        const XLSX = await import("xlsx");
        book = XLSX.read(await f.arrayBuffer(), {
          type: "array",
          raw: true,
          cellDates: true,
          sheetRows: 5051,
        });
        $("#assistant-sheet", w).innerHTML = options(
          book.SheetNames.map((n) => [n, n]),
        );
        $("#assistant-header", w).value = "1";
        await readSheet();
        $("#assistant-workbook", w).hidden = false;
      } catch (e) {
        fail(e);
      }
    };
    $("#assistant-sheet", w).onchange = () => readSheet().catch(fail);
    $("#assistant-header", w).onchange = () => {
      try {
        renderMap();
      } catch (e) {
        invalidate();
        fail(e);
      }
    };
    $("#assistant-date-mode", w).onchange = invalidate;
    $("#assistant-register", w).onchange = invalidate;
    $("#assistant-analyze", w).onclick = async (e) => {
      invalidate();
      const ticket = selection,
        b = e.currentTarget;
      b.disabled = true;
      try {
        if (!book || !data.length)
          throw Error(tr("No data rows found.", "لم توجد صفوف بيانات."));
        if (w.statusValues.length > 60)
          throw Error(
            tr(
              "Too many distinct source statuses.",
              "عدد الحالات المختلفة كبير جدا.",
            ),
          );
        if (!ctx.admin()) {
          /* Viewers may analyze locally; read requests still obey RLS. */
        }
        const cat = $("#assistant-register", w).value,
          refs = [
            ...new Set(
              data
                .map((r) => String(r[Number(mapping.reference)] ?? "").trim())
                .filter(Boolean),
            ),
          ],
          existing = [];
        for (let i = 0; i < refs.length; i += 75) {
          let offset = 0;
          while (true) {
            const chunk = await check(
              db
                .from("records")
                .select(
                  "reference,title,revision,status,state,owner,discipline,due_date,occurred_on,is_current,payload,version",
                )
                .eq("project_id", p.id)
                .eq("category", cat)
                .in("reference", refs.slice(i, i + 75))
                .order("id")
                .range(offset, offset + 999),
            );
            existing.push(...chunk);
            if (chunk.length < 1000) break;
            offset += 1000;
            if (offset > 10000)
              throw Error(
                tr(
                  "Too many revisions. Use a smaller file.",
                  "مراجعات كثيرة جدا. استخدم ملفا أصغر.",
                ),
              );
          }
        }
        if (ticket !== selection || !w.isConnected) return;
        const stateMap = Object.fromEntries(
          $$("[data-status-index]", w).map((s) => [
            w.statusValues[Number(s.dataset.statusIndex)],
            s.value,
          ]),
        );
        prepared = analyzeRows({
          rows: data,
          headers,
          mapping,
          existing,
          dateMode: $("#assistant-date-mode", w).value,
          stateMap,
          fileName: $("#assistant-file", w).files[0].name,
          sheetName: $("#assistant-sheet", w).value,
        });
        const { errors, added, updated } = prepared;
        $("#assistant-import-preview", w).innerHTML =
          `<div class="soft-divider"></div><h3>${tr("Review before saving", "راجع قبل الحفظ")}</h3><div class="assistant-preview-counts"><span class="pill green">${num(added)} ${tr("new", "جديد")}</span><span class="pill blue">${num(updated)} ${tr("updates", "تحديث")}</span><span class="pill ${errors.length ? "red" : ""}">${num(errors.length)} ${tr("errors", "خطأ")}</span><span class="pill">0 ${tr("deletions", "حذف")}</span></div><p class="small">${esc(p.code)} · ${esc(ctx.mname(cat))}</p>${
            errors.length
              ? `<div class="form-error">${errors
                  .slice(0, 12)
                  .map((e) =>
                    esc(
                      (e.row
                        ? tr("Data row ", "صف بيانات ") + e.row + ": "
                        : "") + errorText(e.message),
                    ),
                  )
                  .join("<br>")}</div>`
              : ""
          }<div class="table-wrap"><table><thead><tr>${[tr("Change", "التغيير"), label("reference"), label("revision"), label("title"), label("state"), label("owner")].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${prepared.prepared
            .slice(0, 12)
            .map(
              (r) =>
                `<tr><td>${r.expected_version == null ? tr("New", "جديد") : tr("Update", "تحديث")}</td><td>${esc(r.reference)}</td><td>${esc(r.revision || "-")}</td><td>${esc(r.title.slice(0, 130))}</td><td>${label(r.state)}</td><td>${esc(r.owner || "-")}</td></tr>`,
            )
            .join(
              "",
            )}</tbody></table></div><p class="small muted">${tr("First 12 proposed rows shown. All rows are validated. Extra source columns are kept in each record's additional fields.", "تعرض أول 12 صفا مقترحا. تتحقق كل الصفوف. تحفظ أعمدة المصدر الإضافية في الحقول الإضافية لكل سجل.")}</p><button type="button" id="assistant-review-all" class="btn">${icon("download")}${tr("Download all before / after changes (CSV)", "تحميل كل القيم قبل وبعد (CSV)")}</button>${ctx.admin() ? `<label class="check-inline assistant-approval"><input type="checkbox" id="assistant-approval" ${errors.length ? "disabled" : ""}>${tr("I reviewed the target register, column mappings and proposed changes. Save these records.", "راجعت السجل المستهدف ومطابقة الأعمدة والتغييرات المقترحة. احفظ هذه السجلات.")}</label>` : `<div class="notice">${tr("Read-only analysis. Ask your administrator to save this import.", "تحليل للعرض فقط. اطلب من المسؤول حفظ الاستيراد.")}</div>`}`;
        $("#assistant-review-all", w).onclick = () => {
          const detail = fields.filter(
              (f) => !["reference", "revision"].includes(f),
            ),
            cols = [
              "change",
              "reference",
              "revision",
              ...detail.flatMap((f) => [f + "_before", f + "_after"]),
            ],
            quote = (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+@\-\t\r]/, "'" + "$&")
                .replaceAll('"', '""') +
              '"',
            out = [
              cols.map(quote).join(","),
              ...prepared.changes.map((c) =>
                [
                  c.change,
                  c.reference,
                  c.revision,
                  ...detail.flatMap((f) => [c.before[f], c.after[f]]),
                ]
                  .map(quote)
                  .join(","),
              ),
            ].join("\r\n");
          ctx.download("qualityhub-change-review.csv", "\ufeff" + out);
        };
        $("#assistant-approval", w)?.addEventListener("change", (e) => {
          $("#assistant-commit", w).disabled =
            !e.target.checked ||
            !!prepared?.errors.length ||
            !prepared?.prepared.length;
        });
      } catch (e) {
        prepared = null;
        fail(e);
      } finally {
        b.disabled = false;
      }
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

/**
 * SMES Turf – styled Excel master report (used by the Admin and Sub-Admin "Export Excel" buttons).
 * Needs the `exceljs` package:   npm install exceljs
 */

export interface ReportInput {
  bookings: any[];
  students: any[]; // each with student_payments[] and student_attendance[]
  paymentLog: any[]; // rows of payment_log (may be empty)
  todayStr: string; // YYYY-MM-DD (IST)
  exportedBy: string;
  exportedByRole: string;
  fixedFee: number;
  isNewStudent: (s: any) => boolean;
}

/* ---------- look & feel ---------- */
const C = {
  ink: "FF0B1220",
  head: "FF111827",
  lime: "FFA3E635",
  limeSoft: "FFECFCCB",
  limeDark: "FF3F6212",
  zebra: "FFF8FAFC",
  line: "FFE2E8F0",
  mute: "FF64748B",
  white: "FFFFFFFF",
  green: "FFDCFCE7",
  greenTx: "FF166534",
  red: "FFFEE2E2",
  redTx: "FF991B1B",
  amber: "FFFEF3C7",
  amberTx: "FF92400E",
  blue: "FFDBEAFE",
  blueTx: "FF1E40AF",
  violet: "FFEDE9FE",
  violetTx: "FF5B21B6",
  grey: "FFF1F5F9",
};

// ₹ with Indian digit grouping (12,34,567)
const INR = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"##,##0';
const PCT = "0%";

const fill = (argb: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: C.line } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

type Tone = "good" | "bad" | "warn" | "info" | "violet" | "grey";
const TONES: Record<Tone, [string, string]> = {
  good: [C.green, C.greenTx],
  bad: [C.red, C.redTx],
  warn: [C.amber, C.amberTx],
  info: [C.blue, C.blueTx],
  violet: [C.violet, C.violetTx],
  grey: [C.grey, C.mute],
};
function tone(cell: any, t: Tone) {
  const [bg, tx] = TONES[t];
  cell.fill = fill(bg);
  cell.font = { bold: true, color: { argb: tx }, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

/* ---------- small helpers ---------- */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtMonth(my: string) {
  if (my && my.includes("-")) {
    const [y, m] = my.split("-");
    const idx = parseInt(m, 10) - 1;
    if (MONTHS[idx]) return `${MONTHS[idx]} ${y}`;
  }
  return my || "-";
}
function toDate(ymd?: string | null) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtIST(ts?: string | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}
function shortDay(ymd: string) {
  const [, m, d] = ymd.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${SHORT[m - 1] || ""}`;
}
function num(v: any) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/** "cricket", "Cricket", " CRICKET " -> "Cricket" so the same sport is never split in two. */
function normSport(v: any) {
  const t = String(v ?? "").trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "-";
}
/**
 * Payment log -> only the collections that are still standing.
 * A "booking_reset" cancels the balance collected earlier on that booking, and a
 * "student_fee_removed" cancels the matching earlier student fee, so neither is
 * credited to a staff member any more. (The raw log is still shown on the Payment Log sheet.)
 */
function netPaymentLog(log: any[]) {
  const asc = [...log].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const live: any[] = [];
  const bookingId = (p: any) => (p.booking_id ?? p.bookingId ?? null) as any;
  const studentId = (p: any) => String(p.student_id ?? p.studentId ?? "");
  asc.forEach((p) => {
    if (p.kind === "booking_reset") {
      const id = bookingId(p);
      const resetName = String(p.note || "").replace(/^Payment reset for\s+/i, "").trim();
      for (let i = live.length - 1; i >= 0; i--) {
        const q = live[i];
        if (q.kind !== "booking_balance") continue;
        const same = id != null && bookingId(q) != null ? String(bookingId(q)) === String(id) : !!resetName && String(q.note || "").startsWith(resetName + " ·");
        if (same) live.splice(i, 1);
      }
      return;
    }
    if (p.kind === "student_fee_removed") {
      const sid = studentId(p);
      for (let i = live.length - 1; i >= 0; i--) {
        const q = live[i];
        if (q.kind !== "student_fee" || q.month_year !== p.month_year || studentId(q) !== sid) continue;
        if (!sid && num(q.amount) !== num(p.amount)) continue;
        live.splice(i, 1);
        break;
      }
      return;
    }
    live.push(p);
  });
  return live;
}

function staffRowsFromLog(entries: any[]) {
  const map: Record<string, { role: string; bc: number; ba: number; sc: number; sa: number }> = {};
  entries.forEach((p) => {
    const name = p.collected_by || "Unknown";
    const e = (map[name] = map[name] || { role: p.collected_by_role || "-", bc: 0, ba: 0, sc: 0, sa: 0 });
    if (p.kind === "booking_advance" || p.kind === "booking_balance") {
      e.bc++;
      e.ba += num(p.amount);
    } else if (p.kind === "student_fee") {
      e.sc++;
      e.sa += num(p.amount);
    }
  });
  return staffRowsFromMap(map);
}
function staffRowsFromMap(map: Record<string, { role: string; bc: number; ba: number; sc: number; sa: number }>) {
  const rows = Object.entries(map)
    .map(([name, e]) => [name, e.role, e.bc, e.ba, e.sc, e.sa, e.ba + e.sa] as any[])
    .sort((a, b) => b[6] - a[6]);
  if (rows.length === 0) rows.push(["No staff-recorded collections", "-", 0, 0, 0, 0, 0]);
  return rows;
}

function moneyOf(b: any) {
  const total = num(b.total_amount);
  const bal = num(b.balance_amount);
  const adv = num(b.advance_amount);
  const paid = total - bal;
  const cash = num(b.cash_received);
  const upi = Math.max(0, paid - cash);
  return { total, adv, bal, paid, cash, upi };
}
function statsOf(list: any[]) {
  const s = { count: list.length, total: 0, adv: 0, bal: 0, cash: 0, upi: 0, inHand: 0 };
  list.forEach((b) => {
    const m = moneyOf(b);
    s.total += m.total;
    s.adv += m.adv;
    s.bal += m.bal;
    s.cash += m.cash;
    s.upi += m.upi;
  });
  s.inHand = s.cash + s.upi;
  return s;
}

/* ---------- reusable sheet pieces ---------- */
function setup(ws: any, tab: string, landscape = true) {
  ws.properties.tabColor = { argb: tab };
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { orientation: landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

function titleBar(ws: any, title: string, sub: string, lastCol: number, mergeTo = lastCol) {
  const narrow = mergeTo < lastCol;
  ws.mergeCells(1, 1, 1, mergeTo);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 18, color: { argb: C.lime } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 36;
  ws.mergeCells(2, 1, 2, mergeTo);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 10, color: { argb: "FFCBD5E1" } };
  s.alignment = { vertical: "middle", horizontal: "center", wrapText: narrow };
  ws.getRow(2).height = narrow ? 34 : 20;
  for (let c = 1; c <= lastCol; c++) {
    ws.getCell(1, c).fill = fill(C.ink);
    ws.getCell(2, c).fill = fill(C.head);
  }
}

function headerRow(ws: any, rowIdx: number, headers: string[], startCol = 1) {
  const row = ws.getRow(rowIdx);
  headers.forEach((h, i) => {
    const cell = row.getCell(startCol + i);
    cell.value = h;
    cell.fill = fill(C.head);
    cell.font = { bold: true, color: { argb: C.white }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });
  row.height = 32;
}

/** Writes body rows with borders, zebra stripes, number formats & alignment. Returns [firstRow, lastRow]. */
function bodyRows(ws: any, firstRow: number, rows: any[][], fmts: (string | undefined)[], aligns?: (string | undefined)[]) {
  rows.forEach((vals, r) => {
    const row = ws.getRow(firstRow + r);
    vals.forEach((v, i) => {
      const cell = row.getCell(1 + i);
      cell.value = v as any;
      cell.border = BORDER;
      cell.font = { size: 10, color: { argb: "FF0F172A" } };
      if (r % 2 === 1) cell.fill = fill(C.zebra);
      if (fmts[i]) cell.numFmt = fmts[i] as string;
      cell.alignment = { vertical: "middle", horizontal: (aligns && aligns[i]) || (typeof v === "number" ? "right" : "left") };
    });
    row.height = 20;
  });
  return [firstRow, firstRow + rows.length - 1];
}

function totalsRow(ws: any, rowIdx: number, label: string, firstData: number, lastData: number, sumCols: number[], values: Record<number, number>, fmt = INR, totalCols = 1) {
  const row = ws.getRow(rowIdx);
  for (let c = 1; c <= totalCols; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(C.limeSoft);
    cell.border = BORDER;
    cell.font = { bold: true, size: 10, color: { argb: C.limeDark } };
  }
  row.getCell(1).value = label;
  sumCols.forEach((c) => {
    const cell = row.getCell(c);
    const letter = ws.getColumn(c).letter;
    cell.value = lastData >= firstData ? ({ formula: `SUBTOTAL(109,${letter}${firstData}:${letter}${lastData})`, result: values[c] } as any) : 0;
    cell.numFmt = fmt;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  });
  row.height = 24;
}

function sectionBand(ws: any, rowIdx: number, text: string, lastCol: number) {
  ws.mergeCells(rowIdx, 1, rowIdx, lastCol);
  const c = ws.getCell(rowIdx, 1);
  c.value = text;
  c.font = { bold: true, size: 11, color: { argb: C.limeDark } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (let i = 1; i <= lastCol; i++) {
    ws.getCell(rowIdx, i).fill = fill(C.limeSoft);
    ws.getCell(rowIdx, i).border = { bottom: { style: "medium", color: { argb: C.lime } } };
  }
  ws.getRow(rowIdx).height = 24;
}

function setWidths(ws: any, widths: number[]) {
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

/** Header + rows of the "collected by staff" table. Returns the next free row. */
function staffTable(ws: any, r: number, rows: any[][], lastCol: number, note?: string) {
  headerRow(ws, r, ["Staff Name", "Role", "Booking Payments", "Booking ₹", "Student Fees", "Student ₹", "Total ₹"]);
  const sf = r + 1;
  bodyRows(ws, sf, rows, [undefined, undefined, "#,##0", INR, "#,##0", INR, INR], [undefined, "center"]);
  rows.forEach((_, i) => {
    ws.getCell(sf + i, 1).font = { bold: true, size: 10 };
    ws.getCell(sf + i, 7).font = { bold: true, size: 10, color: { argb: C.greenTx } };
  });
  r = sf + rows.length;
  if (note) {
    ws.mergeCells(r, 1, r, lastCol);
    ws.getCell(r, 1).value = note;
    ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: C.mute } };
  }
  return r;
}

/** Sport-wise table (sport names are merged case-insensitively). Returns the last row used. */
function sportTable(ws: any, r: number, list: any[], lastCol: number, shareCol: number) {
  headerRow(ws, r, ["Sport", "Bookings", "Revenue Expected", "Collected", "Pending", "Share of Revenue"]);
  const all = statsOf(list);
  const map: Record<string, { n: number; total: number; paid: number; bal: number }> = {};
  list.forEach((b) => {
    const k = normSport(b.sport);
    const m = moneyOf(b);
    const e = (map[k] = map[k] || { n: 0, total: 0, paid: 0, bal: 0 });
    e.n++;
    e.total += m.total;
    e.paid += m.paid;
    e.bal += m.bal;
  });
  const rows = Object.entries(map)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, e]) => [k, e.n, e.total, e.paid, e.bal, all.total ? e.total / all.total : 0] as any[]);
  if (rows.length === 0) rows.push(["-", 0, 0, 0, 0, 0]);
  const f = r + 1;
  bodyRows(ws, f, rows, [undefined, "#,##0", INR, INR, INR, PCT]);
  rows.forEach((_, i) => (ws.getCell(f + i, 1).font = { bold: true, size: 10 }));
  const letter = ws.getColumn(shareCol).letter;
  ws.addConditionalFormatting({
    ref: `${letter}${f}:${letter}${f + rows.length - 1}`,
    rules: [{ type: "dataBar", cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: C.lime } }],
  });
  return f + rows.length - 1;
}

/* =========================================================================== */
export async function downloadMasterReport(input: ReportInput) {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMES Turf";
  wb.created = new Date();

  const { bookings, students, paymentLog, todayStr, exportedBy, exportedByRole, fixedFee, isNewStudent } = input;
  const ym = todayStr.slice(0, 7);
  const monthLabel = fmtMonth(ym);
  const sub = `Exported ${fmtIST(new Date().toISOString())}  ·  by ${exportedBy} (${exportedByRole})`;

  const todayList = bookings.filter((b) => (b.booking_date || "").split("T")[0] === todayStr);
  const monthList = bookings.filter((b) => (b.booking_date || "").startsWith(ym));
  const sAll = statsOf(bookings);
  const sToday = statsOf(todayList);
  const sMonth = statsOf(monthList);

  // coaching numbers
  const activeStudents = students;
  const morning = activeStudents.filter((s) => s.batch === "Morning Batch").length;
  const evening = activeStudents.filter((s) => s.batch === "Evening Batch").length;
  const newThisMonth = activeStudents.filter((s) => isNewStudent(s)).length;
  let feesCollectedMonth = 0;
  let settledMonth = 0;
  activeStudents.forEach((s) => {
    (s.student_payments || []).forEach((p: any) => {
      if (p.month_year === ym && p.status === "settled") {
        settledMonth++;
        feesCollectedMonth += num(p.amount_paid);
      }
    });
  });
  const pendingMonth = Math.max(0, activeStudents.length - settledMonth);

  const sorted = [...activeStudents].sort((a, b) => {
    const rank = (s: any) => (s.batch === "Morning Batch" ? 0 : s.batch === "Evening Batch" ? 1 : 2);
    return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name));
  });
  const allMonths = Array.from(new Set(sorted.flatMap((s) => (s.student_payments || []).map((p: any) => p.month_year as string)))).filter(Boolean).sort();

  // collections that are still standing (resets / removed fees are netted out)
  const liveLog = netPaymentLog(paymentLog);

  /* ======================= 1. SUMMARY ======================= */
  {
    const ws = wb.addWorksheet("Summary");
    setup(ws, C.lime, false);
    setWidths(ws, [34, 18, 18, 18, 18, 18, 18]);
    titleBar(ws, "SMES TURF  ·  MASTER REPORT", sub, 7);

    // KPI cards (row 4 label / row 5 value)
    const cards: { from: number; to: number; label: string; value: number; fmt: string; t: Tone }[] = [
      { from: 1, to: 1, label: "MONEY IN HAND (ALL TIME)", value: sAll.inHand, fmt: INR, t: "good" },
      { from: 2, to: 3, label: "PENDING BALANCE", value: sAll.bal, fmt: INR, t: sAll.bal > 0 ? "bad" : "good" },
      { from: 4, to: 5, label: "TOTAL BOOKINGS", value: sAll.count, fmt: "#,##0", t: "info" },
      { from: 6, to: 7, label: `STUDENT FEES · ${monthLabel.toUpperCase()}`, value: feesCollectedMonth, fmt: INR, t: "violet" },
    ];
    ws.getRow(4).height = 20;
    ws.getRow(5).height = 40;
    cards.forEach((cd) => {
      if (cd.to > cd.from) {
        ws.mergeCells(4, cd.from, 4, cd.to);
        ws.mergeCells(5, cd.from, 5, cd.to);
      }
      const [bg, tx] = TONES[cd.t];
      const l = ws.getCell(4, cd.from);
      l.value = cd.label;
      l.font = { size: 9, bold: true, color: { argb: tx } };
      l.alignment = { horizontal: "center", vertical: "bottom" };
      const v = ws.getCell(5, cd.from);
      v.value = cd.value;
      v.numFmt = cd.fmt;
      v.font = { size: 22, bold: true, color: { argb: tx } };
      v.alignment = { horizontal: "center", vertical: "middle" };
      for (let c = cd.from; c <= cd.to; c++) {
        ws.getCell(4, c).fill = fill(bg);
        ws.getCell(5, c).fill = fill(bg);
        ws.getCell(4, c).border = { top: { style: "medium", color: { argb: tx } } };
      }
    });

    // Turf bookings table
    let r = 7;
    sectionBand(ws, r, "🏟️  TURF BOOKINGS", 7);
    r++;
    headerRow(ws, r, ["Metric", "Today", "This Month", "All Time"]);
    const metricRows: [string, number, number, number, string][] = [
      ["Total Bookings", sToday.count, sMonth.count, sAll.count, "#,##0"],
      ["Revenue Expected (₹)", sToday.total, sMonth.total, sAll.total, INR],
      ["Advance Collected (₹)", sToday.adv, sMonth.adv, sAll.adv, INR],
      ["Cash Collected (₹)", sToday.cash, sMonth.cash, sAll.cash, INR],
      ["UPI / Online Collected (₹)", sToday.upi, sMonth.upi, sAll.upi, INR],
      ["Total Money In Hand (₹)", sToday.inHand, sMonth.inHand, sAll.inHand, INR],
      ["Pending Balance (₹)", sToday.bal, sMonth.bal, sAll.bal, INR],
    ];
    const first = r + 1;
    bodyRows(ws, first, metricRows.map((m) => [m[0], m[1], m[2], m[3]]), [undefined, INR, INR, INR]);
    metricRows.forEach((m, i) => {
      for (let c = 2; c <= 4; c++) ws.getCell(first + i, c).numFmt = m[4];
      ws.getCell(first + i, 1).font = { bold: true, size: 10 };
    });
    // highlight money-in-hand & pending rows
    for (let c = 1; c <= 4; c++) {
      ws.getCell(first + 5, c).fill = fill(C.green);
      ws.getCell(first + 5, c).font = { bold: true, size: 10, color: { argb: C.greenTx } };
    }
    const pendRow = first + 6;
    [sToday.bal, sMonth.bal, sAll.bal].forEach((v, i) => {
      if (v > 0) {
        ws.getCell(pendRow, 2 + i).fill = fill(C.red);
        ws.getCell(pendRow, 2 + i).font = { bold: true, size: 10, color: { argb: C.redTx } };
      }
    });
    r = first + metricRows.length;
    const stRow = ws.getRow(r);
    stRow.getCell(1).value = "Settlement Status";
    stRow.getCell(1).font = { bold: true, size: 10 };
    stRow.getCell(1).border = BORDER;
    [sToday, sMonth, sAll].forEach((s, i) => {
      const cell = stRow.getCell(2 + i);
      cell.value = s.bal > 0 ? `⚠ ₹${s.bal.toLocaleString("en-IN")} DUE` : "✔ SETTLED";
      cell.border = BORDER;
      tone(cell, s.bal > 0 ? "bad" : "good");
    });
    stRow.height = 22;

    // Coaching
    r += 2;
    sectionBand(ws, r, "🎓  COACHING ACADEMY", 7);
    r++;
    headerRow(ws, r, ["Metric", "Value"]);
    const coachRows: [string, number, string][] = [
      ["Active Students", activeStudents.length, "#,##0"],
      ["Morning Batch", morning, "#,##0"],
      ["Evening Batch", evening, "#,##0"],
      [`New Students (${monthLabel})`, newThisMonth, "#,##0"],
      [`Fees Collected (${monthLabel})`, feesCollectedMonth, INR],
      [`Students Paid (${monthLabel})`, settledMonth, "#,##0"],
      [`Students Pending (${monthLabel})`, pendingMonth, "#,##0"],
      ["Standard Monthly Fee", fixedFee, INR],
    ];
    const cf = r + 1;
    bodyRows(ws, cf, coachRows.map((m) => [m[0], m[1]]), [undefined, INR]);
    coachRows.forEach((m, i) => {
      ws.getCell(cf + i, 2).numFmt = m[2];
      ws.getCell(cf + i, 1).font = { bold: true, size: 10 };
    });
    if (pendingMonth > 0) tone(ws.getCell(cf + 6, 2), "bad");
    else tone(ws.getCell(cf + 6, 2), "good");
    r = cf + coachRows.length;

    // Collected by staff
    r += 1;
    sectionBand(ws, r, "👤  COLLECTED BY STAFF", 7);
    r++;
    let staffRows: any[][];
    let source = "";
    if (paymentLog.length > 0) {
      source = "Source: payment log. Payments that were reset / removed are not counted.";
      staffRows = staffRowsFromLog(liveLog);
    } else {
      source = "Source: latest collector saved on each booking / student payment.";
      const staffMap: Record<string, { role: string; bc: number; ba: number; sc: number; sa: number }> = {};
      const bump = (name: string, role: string) => (staffMap[name] = staffMap[name] || { role: role || "-", bc: 0, ba: 0, sc: 0, sa: 0 });
      bookings.forEach((b) => {
        if (!b.collected_by) return;
        const e = bump(b.collected_by, b.collected_by_role);
        e.bc++;
        e.ba += moneyOf(b).paid;
      });
      activeStudents.forEach((s) =>
        (s.student_payments || []).forEach((p: any) => {
          if (!p.collected_by || p.status !== "settled") return;
          const e = bump(p.collected_by, p.collected_by_role);
          e.sc++;
          e.sa += num(p.amount_paid);
        })
      );
      staffRows = staffRowsFromMap(staffMap);
    }
    r = staffTable(ws, r, staffRows, 7, source);

    // Sport-wise
    r += 2;
    sectionBand(ws, r, "⚽  SPORT-WISE", 7);
    r++;
    sportTable(ws, r, bookings, 7, 6);
  }

  /* ======================= 2. BOOKINGS ======================= */
  {
    const ws = wb.addWorksheet("Bookings");
    setup(ws, "FF2563EB");
    const headers = ["S.No.", "Date", "Time", "Customer", "Phone", "Sport", "Type", "Court", "Duration (min)", "Total (₹)", "Advance (₹)", "Balance (₹)", "Cash (₹)", "UPI / Online (₹)", "Payment Method", "Booking Status", "Payment", "Collected By", "Collector Role", "Collected At", "Email", "Reference ID", "Booking ID"];
    setWidths(ws, [7, 13, 11, 24, 15, 13, 13, 9, 11, 13, 13, 13, 13, 15, 16, 16, 12, 16, 14, 22, 28, 18, 12]);
    titleBar(ws, "BOOKINGS  ·  FULL HISTORY", `${bookings.length} bookings  ·  ${sub}`, headers.length, 4);
    const HR = 4;
    headerRow(ws, HR, headers);
    const rows = bookings.map((b, i) => {
      const m = moneyOf(b);
      return [
        i + 1,
        toDate(b.booking_date),
        b.start_time || "-",
        b.customer_name || "-",
        b.phone || "-",
        normSport(b.sport),
        b.booking_type || "-",
        b.court_number || "-",
        num(b.duration_minutes) || 60,
        m.total,
        m.adv,
        m.bal,
        m.cash,
        m.upi,
        b.payment_method || "-",
        b.payment_status || "-",
        b.payment_completed ? "Paid" : "Pending",
        b.collected_by || "-",
        b.collected_by_role || "-",
        fmtIST(b.collected_at),
        b.email || "-",
        b.booking_reference || "-",
        b.id,
      ] as any[];
    });
    const fmts: (string | undefined)[] = [undefined, "dd-mmm-yyyy", undefined, undefined, undefined, undefined, undefined, undefined, "0", INR, INR, INR, INR, INR];
    const aligns: (string | undefined)[] = ["center", "center", "center", undefined, undefined, "center", "center", "center", "center"];
    const [f, l] = bodyRows(ws, HR + 1, rows, fmts, aligns);
    rows.forEach((row, i) => {
      const rr = f + i;
      const pay = ws.getCell(rr, 17);
      tone(pay, row[16] === "Paid" ? "good" : "warn");
      if (row[11] > 0) ws.getCell(rr, 12).font = { bold: true, size: 10, color: { argb: C.redTx } };
      ws.getCell(rr, 4).font = { bold: true, size: 10 };
      if (row[17] !== "-") ws.getCell(rr, 18).font = { bold: true, size: 10, color: { argb: C.blueTx } };
      ws.getCell(rr, 18).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(rr, 19).alignment = { horizontal: "center", vertical: "middle" };
    });
    if (rows.length > 0) {
      totalsRow(ws, l + 1, "TOTAL (follows filters)", f, l, [10, 11, 12, 13, 14], { 10: sAll.total, 11: sAll.adv, 12: sAll.bal, 13: sAll.cash, 14: sAll.upi }, INR, headers.length);
      ws.autoFilter = { from: { row: HR, column: 1 }, to: { row: l, column: headers.length } };
    }
    ws.views = [{ state: "frozen", xSplit: 4, showGridLines: false }];
  }

  /* ======================= 3. DAILY SUMMARY ======================= */
  {
    const ws = wb.addWorksheet("Daily Summary");
    setup(ws, "FF0891B2");
    const headers = ["Date", "Day", "Bookings", "Revenue (₹)", "Advance (₹)", "Cash (₹)", "UPI / Online (₹)", "Money In Hand (₹)", "Pending (₹)", "Status"];
    setWidths(ws, [14, 8, 11, 15, 15, 15, 17, 18, 15, 18]);
    titleBar(ws, "DAILY SUMMARY", sub, headers.length);
    headerRow(ws, 4, headers);
    const byDay: Record<string, any[]> = {};
    bookings.forEach((b) => {
      const d = (b.booking_date || "").split("T")[0] || "Unknown";
      (byDay[d] = byDay[d] || []).push(b);
    });
    const days = Object.keys(byDay).sort();
    const rows = days.map((d) => {
      const s = statsOf(byDay[d]);
      const dt = toDate(d);
      const dayName = dt ? dt.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }) : "-";
      return [dt || d, dayName, s.count, s.total, s.adv, s.cash, s.upi, s.inHand, s.bal, s.bal > 0 ? `⚠ ₹${s.bal.toLocaleString("en-IN")} DUE` : "✔ SETTLED"] as any[];
    });
    const [f, l] = bodyRows(ws, 5, rows, ["dd-mmm-yyyy", undefined, "#,##0", INR, INR, INR, INR, INR, INR], ["center", "center", "center"]);
    rows.forEach((row, i) => {
      tone(ws.getCell(f + i, 10), row[8] > 0 ? "bad" : "good");
      ws.getCell(f + i, 8).font = { bold: true, size: 10, color: { argb: C.greenTx } };
    });
    if (rows.length > 0) {
      totalsRow(ws, l + 1, "TOTAL (follows filters)", f, l, [3, 4, 5, 6, 7, 8, 9], { 3: sAll.count, 4: sAll.total, 5: sAll.adv, 6: sAll.cash, 7: sAll.upi, 8: sAll.inHand, 9: sAll.bal }, INR, headers.length);
      ws.getCell(l + 1, 3).numFmt = "#,##0";
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: l, column: headers.length } };
      ws.addConditionalFormatting({
        ref: `H${f}:H${l}`,
        rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: C.lime }] }],
      });
    }
    ws.views = [{ showGridLines: false }];
  }

  /* ======================= 4. COACHING ROSTER ======================= */
  {
    const ws = wb.addWorksheet("Coaching Roster");
    setup(ws, "FF7C3AED");
    const fixed = ["ID", "Student Name", "Batch", "Phone", "Date of Birth", "Email", "Joined", "Type", "Monthly Fee (₹)", "Total Paid (₹)", "Months Pending"];
    const lastCol = fixed.length + allMonths.length * 2;
    setWidths(ws, [6, 26, 16, 15, 14, 28, 14, 14, 14, 15, 11]);
    for (let i = 0; i < allMonths.length * 2; i++) ws.getColumn(fixed.length + 1 + i).width = i % 2 === 0 ? 14 : 15;
    titleBar(ws, "COACHING ROSTER  ·  FEES", `${sorted.length} students  ·  ${sub}`, Math.max(lastCol, 11));
    // two header rows: 4 = group, 5 = sub
    headerRow(ws, 5, fixed);
    fixed.forEach((_, i) => ws.mergeCells(4, i + 1, 5, i + 1));
    fixed.forEach((h, i) => {
      const c = ws.getCell(4, i + 1);
      c.value = h;
      c.fill = fill(C.head);
      c.font = { bold: true, color: { argb: C.white }, size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = BORDER;
    });
    allMonths.forEach((m, i) => {
      const c0 = fixed.length + 1 + i * 2;
      ws.mergeCells(4, c0, 4, c0 + 1);
      const g = ws.getCell(4, c0);
      g.value = fmtMonth(m);
      g.fill = fill(C.limeDark);
      g.font = { bold: true, color: { argb: C.white }, size: 10 };
      g.alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(4, c0 + 1).fill = fill(C.limeDark);
      headerRow(ws, 5, ["Fee Status", "Collected By"], c0);
    });
    ws.getRow(4).height = 22;
    ws.getRow(5).height = 24;

    const rows = sorted.map((s, i) => {
      const pays: Record<string, any> = {};
      (s.student_payments || []).forEach((p: any) => (pays[p.month_year] = p));
      const totalPaid = (s.student_payments || []).filter((p: any) => p.status === "settled").reduce((a: number, p: any) => a + num(p.amount_paid), 0);
      const pending = allMonths.filter((m) => !pays[m] || pays[m].status !== "settled").length;
      const row: any[] = [
        i + 1,
        s.name,
        s.batch || "Unassigned",
        s.phone || "-",
        s.dob ? toDate(s.dob) || "-" : "-",
        s.email || "-",
        s.created_at ? toDate(String(s.created_at).split("T")[0]) : "-",
        isNewStudent(s) ? "NEW" : "Existing",
        num(s.monthly_fee) || fixedFee,
        totalPaid,
        pending,
      ];
      allMonths.forEach((m) => {
        const p = pays[m];
        row.push(!p ? "—" : p.status === "settled" ? "✔ SETTLED" : "✖ PENDING");
        row.push(p && p.collected_by ? p.collected_by : "-");
      });
      return row;
    });
    const fmts: (string | undefined)[] = [undefined, undefined, undefined, undefined, "dd-mmm-yyyy", undefined, "dd-mmm-yyyy", undefined, INR, INR, "0"];
    const aligns: (string | undefined)[] = ["center", undefined, "center", undefined, "center", undefined, "center", "center"];
    for (let i = 0; i < allMonths.length * 2; i++) aligns.push("center");
    const [f, l] = bodyRows(ws, 6, rows, fmts, aligns);
    rows.forEach((row, i) => {
      const rr = f + i;
      ws.getCell(rr, 2).font = { bold: true, size: 10 };
      tone(ws.getCell(rr, 3), row[2] === "Morning Batch" ? "warn" : row[2] === "Evening Batch" ? "violet" : "grey");
      tone(ws.getCell(rr, 8), row[7] === "NEW" ? "info" : "grey");
      ws.getCell(rr, 10).font = { bold: true, size: 10, color: { argb: C.greenTx } };
      tone(ws.getCell(rr, 11), row[10] > 0 ? "bad" : "good");
      allMonths.forEach((_, k) => {
        const cc = fixed.length + 1 + k * 2;
        const v = row[cc - 1];
        tone(ws.getCell(rr, cc), v.startsWith("✔") ? "good" : v.startsWith("✖") ? "bad" : "grey");
        if (row[cc] !== "-") ws.getCell(rr, cc + 1).font = { bold: true, size: 10, color: { argb: C.blueTx } };
      });
    });
    if (rows.length > 0) {
      const tr = l + 1;
      totalsRow(ws, tr, "TOTAL (follows filters)", f, l, [10], { 10: rows.reduce((a, r) => a + r[9], 0) }, INR, 11);
      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: l, column: lastCol } };
    }
    ws.views = [{ showGridLines: false }];
  }

  /* ======================= 5. ATTENDANCE ======================= */
  {
    const ws = wb.addWorksheet("Attendance");
    setup(ws, "FFEA580C");
    const dates = Array.from(new Set(sorted.flatMap((s) => (s.student_attendance || []).map((a: any) => a.date as string)))).filter(Boolean).sort();
    const fixed = ["ID", "Student Name", "Batch", "Present", "Absent", "Attendance %"];
    const lastCol = fixed.length + dates.length;
    setWidths(ws, [6, 26, 16, 10, 10, 13]);
    for (let i = 0; i < dates.length; i++) ws.getColumn(fixed.length + 1 + i).width = 5.5;
    titleBar(ws, "ATTENDANCE RECORD", `P = Present · A = Absent  ·  ${sub}`, Math.max(lastCol, 9));
    headerRow(ws, 4, fixed);
    dates.forEach((d, i) => {
      const c = ws.getCell(4, fixed.length + 1 + i);
      c.value = shortDay(d);
      c.fill = fill(C.head);
      c.font = { bold: true, color: { argb: C.white }, size: 9 };
      c.alignment = { textRotation: 90, horizontal: "center", vertical: "middle" };
      c.border = BORDER;
    });
    ws.getRow(4).height = 52;
    const rows = sorted.map((s, i) => {
      const att: Record<string, string> = {};
      (s.student_attendance || []).forEach((a: any) => (att[a.date] = a.status));
      const present = Object.values(att).filter((v) => v === "Present").length;
      const absent = Object.values(att).filter((v) => v === "Absent").length;
      const pct = present + absent > 0 ? present / (present + absent) : 0;
      const row: any[] = [i + 1, s.name, s.batch || "-", present, absent, pct];
      dates.forEach((d) => row.push(att[d] === "Present" ? "P" : att[d] === "Absent" ? "A" : ""));
      return row;
    });
    const aligns: (string | undefined)[] = ["center", undefined, "center", "center", "center", "center"];
    for (let i = 0; i < dates.length; i++) aligns.push("center");
    const [f] = bodyRows(ws, 5, rows, [undefined, undefined, undefined, "0", "0", PCT], aligns);
    rows.forEach((row, i) => {
      const rr = f + i;
      ws.getCell(rr, 2).font = { bold: true, size: 10 };
      tone(ws.getCell(rr, 3), row[2] === "Morning Batch" ? "warn" : row[2] === "Evening Batch" ? "violet" : "grey");
      tone(ws.getCell(rr, 6), row[5] >= 0.75 ? "good" : row[5] >= 0.5 ? "warn" : "bad");
      ws.getCell(rr, 6).numFmt = PCT;
      dates.forEach((_, k) => {
        const cell = ws.getCell(rr, fixed.length + 1 + k);
        if (cell.value === "P") tone(cell, "good");
        else if (cell.value === "A") tone(cell, "bad");
      });
    });
    if (rows.length > 0) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: f + rows.length - 1, column: lastCol } };
    ws.views = [{ showGridLines: false }];
  }

  /* ======================= 6. PAYMENT LOG ======================= */
  if (paymentLog.length > 0) {
    const ws = wb.addWorksheet("Payment Log");
    setup(ws, "FFDB2777");
    const headers = ["When (IST)", "Collected By", "Role", "Action", "Amount (₹)", "Method", "Month", "Details"];
    setWidths(ws, [24, 16, 14, 20, 14, 16, 18, 60]);
    titleBar(ws, "PAYMENT LOG  ·  WHO COLLECTED WHAT", `${paymentLog.length} entries  ·  ${sub}`, headers.length);
    headerRow(ws, 4, headers);
    const KIND: Record<string, [string, Tone]> = {
      booking_balance: ["Booking balance", "info"],
      booking_advance: ["Booking advance", "info"],
      booking_reset: ["Payment reset", "bad"],
      student_fee: ["Student fee", "good"],
      student_fee_removed: ["Fee removed", "bad"],
    };
    const rows = paymentLog.map((p) => [fmtIST(p.created_at), p.collected_by || "-", p.collected_by_role || "-", (KIND[p.kind] || [p.kind, "grey"])[0], num(p.amount), p.method || "-", p.month_year ? fmtMonth(p.month_year) : "-", p.note || ""] as any[]);
    const [f, l] = bodyRows(ws, 5, rows, [undefined, undefined, undefined, undefined, INR], [undefined, "center", "center", "center", undefined, "center", "center"]);
    rows.forEach((_, i) => {
      tone(ws.getCell(f + i, 4), (KIND[paymentLog[i].kind] || ["", "grey"])[1] as Tone);
      ws.getCell(f + i, 2).font = { bold: true, size: 10, color: { argb: C.blueTx } };
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: l, column: headers.length } };
    ws.views = [{ showGridLines: false }];
  }

  /* ---------- download ---------- */
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SMES_Master_Report_${todayStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
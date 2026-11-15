"""Excel export and printable customer report."""
import io, html
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from . import hs as hsm, db


def dmy(s):
    s = str(s or "")
    return f"{s[8:10]}/{s[5:7]}/{s[2:4]}" if len(s) >= 10 and s[4] == "-" else s


def _hdr(ws, row, cols):
    fill = PatternFill("solid", fgColor="1F3A5F")
    for i, c in enumerate(cols, 1):
        x = ws.cell(row=row, column=i, value=c)
        x.font = Font(bold=True, color="FFFFFF"); x.fill = fill
        x.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def to_xlsx(decl, issues, labels):
    wb = Workbook()
    ws = wb.active; ws.title = "Summary"
    h = decl["header"]
    rows = [("Declaration", decl.get("name", "")), ("Regime", labels.get("regime", "")), ("Declaration type", labels.get("declaration", "")),
            ("Payment type", labels.get("payment", "")), ("Shipper", h.get("shipper", "")), ("Buyer", h.get("buyer", "")),
            ("Currency", h.get("currency", "")), ("IncoTerm", h.get("incoterm", "")), ("Pages", h.get("pages", "")),
            ("Invoices", len(decl["invoices"])), ("Lines", sum(len(i["lines"]) for i in decl["invoices"])),
            ("Total value", sum(l["value"] for i in decl["invoices"] for l in i["lines"])),
            ("Total net weight", sum(l["weight"] for i in decl["invoices"] for l in i["lines"]))]
    for r, (a, b) in enumerate(rows, 1):
        ws.cell(row=r, column=1, value=a).font = Font(bold=True); ws.cell(row=r, column=2, value=b)
    ws.column_dimensions["A"].width = 22; ws.column_dimensions["B"].width = 40
    ws2 = wb.create_sheet("Lines")
    cols = ["Invoice", "Date", "Line", "Master HS (8)", "Master HS (12)", "Invoice HS", "Description", "Unit", "Qty", "Net weight", "Value", "Currency", "Country", "HS status"]
    _hdr(ws2, 1, cols)
    r = 2
    for inv in decl["invoices"]:
        for i, l in enumerate(inv["lines"], 1):
            vals = [inv["number"], dmy(inv["date"]), i, l.get("hs8", ""), l.get("hs12", ""), l.get("hs_inv", ""), l.get("description", ""),
                    l.get("unit", ""), l["qty"], l["weight"], l["value"], inv.get("currency") or h.get("currency"), l.get("country", ""), l.get("hs_status", "")]
            for c, v in enumerate(vals, 1):
                cell = ws2.cell(row=r, column=c, value=v)
                if c in (4, 5, 6):
                    cell.number_format = "@"
                if c == 9: cell.number_format = "#,##0.####"
                if c == 10: cell.number_format = "#,##0.0000"
                if c == 11: cell.number_format = "#,##0.000"
            r += 1
    ws2.cell(row=r, column=8, value="TOTAL").font = Font(bold=True)
    for c, f in ((9, "#,##0.####"), (10, "#,##0.0000"), (11, "#,##0.000")):
        L = get_column_letter(c)
        x = ws2.cell(row=r, column=c, value=f"=SUM({L}2:{L}{r - 1})"); x.font = Font(bold=True); x.number_format = f
    ws2.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{max(r - 1, 1)}"
    for i, w in enumerate([14, 12, 6, 14, 15, 15, 40, 7, 11, 13, 13, 9, 9, 11], 1):
        ws2.column_dimensions[get_column_letter(i)].width = w
    ws3 = wb.create_sheet("HS summary")
    _hdr(ws3, 1, ["Master HS (8)", "Lines", "Qty", "Net weight", "Value", "Description (EN)"])
    agg = {}
    for inv in decl["invoices"]:
        for l in inv["lines"]:
            a = agg.setdefault(l.get("hs8") or l.get("hs_inv"), [0, 0, 0, 0])
            a[0] += 1; a[1] += l["qty"]; a[2] += l["weight"]; a[3] += l["value"]
    for k, (n, q, w, v) in sorted(agg.items(), key=lambda kv: str(kv[0])):
        m = hsm.by_old8(k) if k else []
        ws3.append([str(k), n, q, w, v, m[0]["desc_en"] if m else ""])
        ws3.cell(row=ws3.max_row, column=1).number_format = "@"
    ws3.column_dimensions["A"].width = 15; ws3.column_dimensions["F"].width = 80
    ws4 = wb.create_sheet("Validation")
    _hdr(ws4, 1, ["Level", "Message"])
    for i in issues:
        ws4.append([i["level"], i["msg"]])
    ws4.column_dimensions["B"].width = 100
    bio = io.BytesIO(); wb.save(bio)
    return bio.getvalue()


def report_html(decl, issues, labels, company):
    e = html.escape
    h = decl["header"]
    tv = sum(l["value"] for i in decl["invoices"] for l in i["lines"])
    tw = sum(l["weight"] for i in decl["invoices"] for l in i["lines"])
    cache = {}
    def desc(k):
        if k not in cache:
            m = hsm.by_old8(k) if k else []
            cache[k] = (m[0]["desc_en"], m[0]["desc_ar"], m[0]["duty"]) if m else ("", "", 0)
        return cache[k]
    body = []
    for inv in decl["invoices"]:
        rows = []
        for i, l in enumerate(inv["lines"], 1):
            en, ar, duty = desc(l.get("hs8"))
            rows.append(f"<tr><td>{i}</td><td class=m>{e(str(l.get('hs8','')))}</td><td class=m>{e(l.get('hs_inv',''))}</td>"
                        f"<td>{e(l.get('description',''))}<div class=s>{e(en)}</div><div class='s ar' dir=rtl>{e(ar)}</div></td>"
                        f"<td>{e(l.get('unit',''))}</td><td class=r>{l['qty']:,.4g}</td><td class=r>{l['weight']:,.4f}</td>"
                        f"<td class=r>{l['value']:,.3f}</td><td>{e(l.get('country',''))}</td><td class=r>{duty:g}%</td></tr>")
        body.append(f"<h3>Invoice {e(inv['number'])} <span>{e(dmy(inv['date']))} · {e(inv.get('currency') or h.get('currency',''))} · {e(inv.get('incoterm') or h.get('incoterm',''))}</span></h3>"
                    "<table><thead><tr><th>#</th><th>Master HS</th><th>Invoice HS</th><th>Description / الوصف</th><th>Unit</th><th>Qty</th><th>Net wt</th><th>Value</th><th>Origin</th><th>Duty</th></tr></thead><tbody>"
                    + "".join(rows) + "</tbody></table>")
    notes = "".join(f"<li class={e(i['level'])}>{e(i['msg'])}</li>" for i in issues if i["level"] != "info") or "<li>No validation issues.</li>"
    return f"""<!doctype html><meta charset=utf-8><title>Customer report – {e(decl.get('name',''))}</title>
<style>body{{font:13px/1.4 system-ui,Segoe UI,Arial;margin:32px;color:#14213d}}h1{{margin:0}}h3{{margin:24px 0 6px}}h3 span{{font-weight:400;color:#667}}
.top{{display:flex;justify-content:space-between;border-bottom:3px solid #1f3a5f;padding-bottom:10px}}.kv{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}}
.kv div{{background:#f3f6fa;padding:8px 10px;border-radius:6px}}.kv b{{display:block;font-size:11px;color:#667;text-transform:uppercase}}
table{{width:100%;border-collapse:collapse}}th{{background:#1f3a5f;color:#fff;text-align:left;padding:5px 6px;font-size:11px}}td{{padding:4px 6px;border-bottom:1px solid #e3e8ef;vertical-align:top}}
.r{{text-align:right}}.m{{font-family:ui-monospace,Consolas,monospace}}.s{{color:#667;font-size:11px}}.ar{{font-family:Tahoma,Arial}}li.error{{color:#b3261e}}li.warning{{color:#9a6700}}
@media print{{body{{margin:12mm}}}}</style>
<div class=top><div><h1>Customs declaration report</h1><div>{e(company)}</div></div><div style="text-align:right">{e(decl.get('name',''))}<br>{e(str(decl.get('updated',''))[:10])}</div></div>
<div class=kv><div><b>Shipper</b>{e(h.get('shipper',''))}</div><div><b>Buyer</b>{e(h.get('buyer',''))}</div><div><b>Regime</b>{e(labels.get('regime',''))}</div><div><b>Declaration type</b>{e(labels.get('declaration',''))}</div>
<div><b>Payment</b>{e(labels.get('payment',''))}</div><div><b>Currency / Inco</b>{e(h.get('currency',''))} / {e(h.get('incoterm',''))}</div><div><b>Total value</b>{tv:,.3f}</div><div><b>Total net weight</b>{tw:,.4f} kg</div></div>
{''.join(body)}<h3>Validation notes</h3><ul>{notes}</ul><script>if(location.search.includes('print'))print()</script>"""

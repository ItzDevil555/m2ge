"""M2 text file: parser + writer. Data-driven by a profile (see db.DEFAULT_SETTINGS)."""
import re, csv, io
from . import hs as hsm

CRLF = "\r\n"


def _q(v):
    return '"' + str(v).replace('"', '""') + '"'


def fmt_hs(s):
    d = hsm.digits(s)
    if len(d) == 10:
        return f"{d[:4]} {d[4:6]} {d[6:]}"
    if len(d) == 8:
        return f"{d[:4]} {d[4:6]} {d[6:]}"
    if len(d) == 6:
        return f"{d[:4]} {d[4:]}"
    return str(s or "")


def num(v, default=0.0):
    try:
        return float(str(v).replace(",", "").strip())
    except Exception:
        return default


def fmt_qty(line, decimal_units):
    q = num(line.get("qty"))
    if (line.get("unit") or "") in decimal_units or abs(q - round(q)) > 1e-9:
        return f"{q:.4f}"
    return str(int(round(q)))


def parse(text):
    """Parse M2 text into {'header':{codes}, 'invoices':[{...,'lines':[...]}], 'unknown':n}."""
    rows = list(csv.reader(io.StringIO(text)))
    invoices, cur, last = [], None, None
    header = {}
    unknown = 0
    for r in rows:
        if not r:
            continue
        t = r[0]
        r = r + [""] * (18 - len(r))
        if t == "IH":
            cur = {"number": r[1], "date": r[2], "currency": r[8], "incoterm": r[10], "total": r[9], "lines": []}
            header = {"regime_code": r[3], "declaration_code": r[4], "shipper": r[5], "payment_code": r[6]}
            invoices.append(cur); last = None
        elif t == "ID" and cur is not None:
            last = {"hs8": r[2], "hs_inv": r[3], "flag": r[4], "unit": r[5], "qty": num(r[6]), "weight": num(r[8]),
                    "value": num(r[11]), "country": r[12], "f17": r[16], "description": "", "hs_status": "ok",
                    "hs12": "", "pd": [], "extra": []}
            cur["lines"].append(last)
        elif t == "PD" and last is not None:
            last["pd"].append({"a": r[1], "code": r[2], "flag": r[3]})
        else:
            unknown += 1
            if last is not None:
                last["extra"].append(r)
    return {"header": header, "invoices": invoices, "unknown": unknown}


def code_for(decl, kind, table):
    """Resolve the code for a header entry (stored as label/id) from the code table."""
    return table.get(kind, {}).get(str(decl.get(kind + "_id", "")), "")


def write_invoice(inv, hdr, st, start_no=1):
    dec = set((st.get("decimal_units") or "kg").split(","))
    use12 = st.get("m2_code_field") == "hs12"
    total = sum(num(l.get("value")) for l in inv["lines"])
    out = []
    out.append([ "IH", inv["number"], inv["date"], hdr["regime_code"], hdr["declaration_code"], hdr["shipper"],
                 hdr["payment_code"], "", inv.get("currency") or hdr.get("currency", ""), f"{total:.3f}",
                 inv.get("incoterm") or hdr.get("incoterm", ""), "", "", "", ""])
    n = start_no
    for l in inv["lines"]:
        code = (l.get("hs12") if use12 else l.get("hs8")) or l.get("hs8") or ""
        out.append(["ID", str(n), code, fmt_hs(l.get("hs_inv")), l.get("flag") or "N", l.get("unit") or "u",
                    fmt_qty(l, dec), "kg", f"{num(l.get('weight')):.4f}", "", "", f"{num(l.get('value')):.3f}",
                    l.get("country") or "", "", "", "", l.get("f17") or "0", ""])
        for p in l.get("pd", []):
            out.append(["PD", p.get("a", ""), p.get("code", ""), p.get("flag", "N")])
        for e in l.get("extra", []):
            out.append(e)
        n += 1
    return out, n


def write(decl, st, codes):
    """decl: declaration doc. codes: {'regime': {id: code}, ...}. Returns text (CRLF, trailing CRLF)."""
    h = decl["header"]
    hdr = {"regime_code": codes["regime"].get(str(h.get("regime_id")), ""),
           "declaration_code": codes["declaration"].get(str(h.get("declaration_id")), ""),
           "payment_code": codes["payment"].get(str(h.get("payment_id")), ""),
           "shipper": h.get("shipper", ""), "currency": h.get("currency", ""), "incoterm": h.get("incoterm", "")}
    rows, no = [], 1
    for inv in decl["invoices"]:
        r, no = write_invoice(inv, hdr, st, 1 if st.get("line_numbering") != "continuous" else no)
        rows += r
    return "".join(",".join(_q(x) for x in r) + CRLF for r in rows)


def split_files(decl, st, codes, base):
    """Return [(filename, text)] split per invoice or by max lines."""
    mx = int(st.get("max_lines_per_file") or 0)
    if not mx:
        return [(base + ".txt", write(decl, st, codes))]
    files, part, cnt, k = [], {"header": decl["header"], "invoices": []}, 0, 1
    for inv in decl["invoices"]:
        lines = inv["lines"]
        for i in range(0, max(len(lines), 1), mx):
            chunk = dict(inv, lines=lines[i:i + mx])
            files.append((f"{base}_{k:02d}.txt", write({"header": decl["header"], "invoices": [chunk]}, st, codes)))
            k += 1
    return files

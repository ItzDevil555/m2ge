"""Excel/CSV import: sheet listing, header-row detection, column auto-mapping, invoice-info detection."""
import io, re
import pandas as pd
import pycountry
from . import hs as hsm

FIELDS = ["hs_inv", "description", "qty", "weight", "value", "country", "unit", "invoice_no", "invoice_date"]
LABELS = {"hs_inv": "HS / HTS code", "description": "Description", "qty": "Quantity", "weight": "Net weight",
          "value": "Line value", "country": "Country of origin", "unit": "Unit", "invoice_no": "Invoice no (per line)",
          "invoice_date": "Invoice date (per line)"}
SYN = {
    "hs_inv": ["hts code", "hts", "hs code", "hscode", "tariff", "commodity code", "customs code", "harmonized", "hs"],
    "description": ["description", "goods", "item description", "product", "material description", "desc"],
    "qty": ["quantity", "qty", "units", "pieces", "pcs"],
    "weight": ["net weight", "netweight", "net wt", "weight", "net kg", "wt"],
    "value": ["total value", "line value", "amount", "total price", "total unit cost", "extended", "value", "total"],
    "country": ["country of origin", "origin", "coo", "country"],
    "unit": ["uom", "unit of measure", "unit"],
    "invoice_no": ["invoice no", "invoice number", "invoice"],
    "invoice_date": ["invoice date"],
}
ALIASES = {"VIET NAM": "VN", "VIETNAM": "VN", "TURKIYE": "TR", "TÜRKIYE": "TR", "TURKEY": "TR", "PRC": "CN",
           "CHINA": "CN", "U.A.E.": "AE", "UAE": "AE", "UNITED ARAB EMIRATES": "AE", "USA": "US", "U.S.A.": "US",
           "UK": "GB", "U.K.": "GB", "SOUTH KOREA": "KR", "KOREA": "KR", "RUSSIA": "RU", "TAIWAN": "TW",
           "HONG KONG": "HK", "IRAN": "IR", "SYRIA": "SY", "LAOS": "LA", "CZECHIA": "CZ", "CZECH REPUBLIC": "CZ",
           "GERMANY": "DE", "DEUTSCHLAND": "DE"}


def country_iso(v):
    s = str(v or "").strip()
    if not s:
        return ""
    u = s.upper()
    if u in ALIASES:
        return ALIASES[u]
    if len(u) == 2 and pycountry.countries.get(alpha_2=u):
        return u
    if len(u) == 3:
        c = pycountry.countries.get(alpha_3=u)
        if c:
            return c.alpha_2
    try:
        return pycountry.countries.lookup(s).alpha_2
    except LookupError:
        pass
    return ""


def parse_number(v):
    """Returns (float|None, ok). Handles 1,234.50 / 1.234,50 / (12.5) / currency symbols."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None, True
    if isinstance(v, (int, float)):
        return float(v), True
    s = str(v).strip()
    if not s:
        return None, True
    neg = s.startswith("(") and s.endswith(")")
    s = re.sub(r"[^\d,.\-]", "", s)
    if not s or s in "-.,":
        return None, False
    if "," in s and "." in s:
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") else s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".") if re.fullmatch(r"-?\d+,\d{1,2}", s) else s.replace(",", "")
    try:
        x = float(s)
        return (-x if neg else x), True
    except ValueError:
        return None, False


def sheets(content, filename):
    if filename.lower().endswith((".csv", ".txt")):
        return ["CSV"]
    return pd.ExcelFile(io.BytesIO(content), engine="openpyxl").sheet_names


def read_rows(content, filename, sheet=None):
    if filename.lower().endswith((".csv", ".txt")):
        df = pd.read_csv(io.BytesIO(content), header=None, dtype=object, sep=None, engine="python",
                         encoding_errors="replace")
    else:
        df = pd.read_excel(io.BytesIO(content), sheet_name=sheet or 0, header=None, dtype=object, engine="openpyxl")
    df = df.dropna(how="all").dropna(axis=1, how="all")
    return [[("" if pd.isna(x) else x) for x in row] for row in df.values.tolist()], df.index.tolist()


def _norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", str(s).lower().replace("\n", " ")).strip()


def header_score(row):
    sc = 0
    for c in row:
        n = _norm(c)
        if not n:
            continue
        for f, syns in SYN.items():
            if any(n == s or (len(s) > 3 and s in n) for s in syns):
                sc += 1
                break
    return sc


def detect_header(rows, scan=40):
    best, bi = 0, 0
    for i, r in enumerate(rows[:scan]):
        sc = header_score(r)
        if sc > best:
            best, bi = sc, i
    return bi, best


def auto_map(rows, hi):
    header = [str(c).strip() for c in rows[hi]]
    body = rows[hi + 1: hi + 60]
    mapping, conf = {}, {}
    used = set()
    for f in FIELDS:
        bestc, bests = None, 0
        for ci, h in enumerate(header):
            n = _norm(h)
            if not n or ci in used:
                continue
            s = 0
            for k, syn in enumerate(SYN[f]):
                if n == syn:
                    s = 100 - k
                    break
                if len(syn) > 3 and syn in n:
                    s = max(s, 70 - k)
            # fields compete: "weight" shouldn't pick gross weight when net exists
            if f == "weight" and "gross" in n:
                s = max(0, s - 40)
            if f == "value" and ("unit" in n and "total" not in n):
                s = 0
            if s > bests:
                bests, bestc = s, ci
        if bestc is not None and bests >= 40:
            mapping[f] = bestc; conf[f] = bests; used.add(bestc)
    # content-based fallbacks
    def col(ci):
        return [r[ci] for r in body if ci < len(r) and str(r[ci]).strip() != ""]
    if "hs_inv" not in mapping:
        for ci in range(len(header)):
            if ci in used: continue
            v = col(ci)
            if v and sum(1 for x in v if 6 <= len(hsm.digits(x)) <= 12 and re.fullmatch(r"[\d .]+", str(x).strip())) / len(v) > .8:
                mapping["hs_inv"] = ci; conf["hs_inv"] = 55; used.add(ci); break
    if "country" not in mapping:
        for ci in range(len(header)):
            if ci in used: continue
            v = col(ci)
            if v and sum(1 for x in v if country_iso(x)) / len(v) > .8 and not all(str(x).replace('.', '').isdigit() for x in v):
                mapping["country"] = ci; conf["country"] = 50; used.add(ci); break
    return header, mapping, conf


def _after(rows, r, c):
    """Value for a label cell: text after newline/colon in the cell, else right neighbour, else below."""
    cell = str(rows[r][c])
    for sep in ("\n", ":"):
        if sep in cell:
            tail = cell.split(sep, 1)[1].strip()
            if tail:
                return tail
    for dc in (1, 2):
        if c + dc < len(rows[r]) and str(rows[r][c + dc]).strip():
            return str(rows[r][c + dc]).strip()
    if r + 1 < len(rows) and c < len(rows[r + 1]) and str(rows[r + 1][c]).strip():
        return str(rows[r + 1][c]).strip()
    return ""


def invoice_info(rows, hi):
    info = {"invoice_no": "", "invoice_date": "", "shipper": "", "incoterm": "", "currency": ""}
    pats = {"invoice_no": r"invoice\s*(no|number|#)", "invoice_date": r"^\s*(invoice\s*)?date", "shipper": r"shipper|exporter|seller",
            "incoterm": r"inco\s*-?term", "currency": r"^\s*currency"}
    for r in range(min(len(rows), hi + 40 if hi < 5 else hi)):
        for c, cell in enumerate(rows[r]):
            t = str(cell).strip().lower()
            if not t or len(t) > 60:
                continue
            for k, p in pats.items():
                if not info[k] and re.search(p, t):
                    v = _after(rows, r, c)
                    if v and v.lower() != t:
                        info[k] = v
    if info["invoice_date"]:
        try:
            info["invoice_date"] = pd.to_datetime(info["invoice_date"], dayfirst=True).strftime("%Y-%m-%d")
        except Exception:
            pass
    m = re.search(r"\b(EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|FOB|CFR|CIF)\b", info["incoterm"].upper())
    info["incoterm"] = m.group(1) if m else info["incoterm"]
    return info


TOTAL_RE = re.compile(r"^\s*(grand\s+)?(sub\s*)?total", re.I)


def extract(rows, hi, mapping, group_by_hs=False):
    """mapping: {field: col_index}. Returns (lines, problems)."""
    lines, problems = [], []
    for ri in range(hi + 1, len(rows)):
        r = rows[ri]
        def g(f):
            ci = mapping.get(f)
            return r[ci] if ci is not None and ci < len(r) else ""
        first = " ".join(str(x) for x in r[:3])
        if TOTAL_RE.match(first) or TOTAL_RE.match(str(g("description"))):
            continue
        hs, desc = str(g("hs_inv")).strip(), str(g("description")).strip()
        if hs.endswith(".0"):
            hs = hs[:-2]
        if not hs and not desc and str(g("qty")).strip() == "":
            continue
        line = {"hs_inv": hs, "description": desc, "unit": str(g("unit")).strip().lower(), "flag": "N", "f17": "0",
                "pd": [], "extra": [], "hs8": "", "hs12": "", "hs_status": "missing", "src_row": ri + 1}
        for f in ("qty", "weight", "value"):
            v, ok = parse_number(g(f))
            line[f] = v if v is not None else 0.0
            if not ok:
                problems.append({"row": ri + 1, "field": f, "value": str(g(f))})
        iso = country_iso(g("country"))
        line["country"] = iso
        if str(g("country")).strip() and not iso:
            problems.append({"row": ri + 1, "field": "country", "value": str(g("country"))})
        if mapping.get("invoice_no") is not None:
            line["invoice_no"] = str(g("invoice_no")).strip()
        lines.append(line)
    if group_by_hs:
        agg = {}
        for l in lines:
            k = (hsm.digits(l["hs_inv"]), l["country"])
            if k in agg:
                a = agg[k]
                for f in ("qty", "weight", "value"):
                    a[f] += l[f]
                if l["description"] and l["description"] not in a["description"]:
                    a["description"] = (a["description"] + "; " + l["description"])[:200]
            else:
                agg[k] = dict(l)
        lines = list(agg.values())
    return lines, problems


def inspect(content, filename, sheet=None):
    shs = sheets(content, filename)
    sheet = sheet if sheet in shs else shs[0]
    best = None
    if not sheet or sheet == shs[0]:
        # choose the sheet with the best header score
        for s in shs[:12]:
            try:
                rows, _ = read_rows(content, filename, s)
            except Exception:
                continue
            hi, sc = detect_header(rows)
            if best is None or sc > best[0]:
                best = (sc, s)
        if best and (sheet is None or sheet == shs[0]):
            sheet = best[1]
    rows, _ = read_rows(content, filename, sheet if filename.lower().endswith(("xlsx", "xlsm", "xls")) else None)
    hi, sc = detect_header(rows)
    header, mapping, conf = auto_map(rows, hi)
    return {"sheets": shs, "sheet": sheet, "header_row": hi, "header": header, "mapping": mapping, "confidence": conf,
            "info": invoice_info(rows, hi), "preview": [[str(x) for x in r] for r in rows[hi + 1: hi + 11]],
            "row_count": max(0, len(rows) - hi - 1), "fields": [{"key": f, "label": LABELS[f]} for f in FIELDS]}

"""HS master: import (restoring Excel-dropped leading zeros), search, matching, learning memory."""
import re, io
import pandas as pd
from rapidfuzz import fuzz
from . import db

UNIT_MAP = {"Kilograms": "kg", "Pieces/Units": "u", "Square Meters": "m2", "Cubic Meters": "m3", "Liters": "l",
            "Pairs": "pr", "Meters": "m", "Carat": "ct", "Packs": "pk", "1000 Kilowatt hours": "kwh",
            "1000 Pieces/Units": "ku"}


def digits(s):
    return re.sub(r"\D", "", str(s or ""))


def norm_code(s):
    """Digits only; restore a leading zero dropped by Excel (HS chapters 01-09 -> odd digit counts)."""
    d = digits(s)
    return "0" + d if len(d) % 2 == 1 and 3 <= len(d) <= 11 else d


def load_master(xlsx_bytes_or_path, filename="HSCodeMaster.xlsx"):
    src = io.BytesIO(xlsx_bytes_or_path) if isinstance(xlsx_bytes_or_path, (bytes, bytearray)) else xlsx_bytes_or_path
    df = pd.read_excel(src, sheet_name="HSCodeMaster", dtype=str, engine="openpyxl").fillna("")
    need = ["OldHSCode", "NewHSCode", "LongDescEn"]
    for n in need:
        if n not in df.columns:
            raise ValueError(f"HSCodeMaster sheet is missing column {n}")
    df = df[df["OldHSCode"].str.strip() != ""]
    rows = []
    clean = lambda x: re.sub(r"\s+", " ", str(x).replace("_x000D_", " ")).strip()
    for col in ("LongDescAr", "LongDescEn"):
        if col in df.columns:
            df[col] = df[col].map(clean)
    recs = df.to_dict("records")
    for r in recs:
        old8 = digits(r["OldHSCode"]).split(".")[0].zfill(8)
        new12 = digits(r["NewHSCode"]).zfill(12)
        try:
            duty = float(r.get("DutyPercentage") or 0)
        except ValueError:
            duty = 0.0
        rows.append((old8, new12, str(r.get("LongDescAr", "")).strip(), str(r.get("LongDescEn", "")).strip(),
                     str(r.get("StatisticalQtyUnit", "")).strip(), duty, str(r.get("VGNMat", "")).strip()))
    with db._lock, db.conn() as c:
        c.execute("DELETE FROM hs_master")
        c.execute("DELETE FROM hs_fts")
        c.executemany("INSERT INTO hs_master(old8,new12,desc_ar,desc_en,unit,duty,vgn) VALUES(?,?,?,?,?,?,?)", rows)
        c.execute("INSERT INTO hs_fts(rowid,desc_en,desc_ar,codes) SELECT id,desc_en,desc_ar,old8||' '||new12 FROM hs_master")
        c.execute("UPDATE hs_versions SET active=0")
        c.execute("INSERT INTO hs_versions(filename,rows,uploaded) VALUES(?,?,?)", (filename, len(rows), db.now()))
    return len(rows)


def stats():
    with db.conn() as c:
        n = c.execute("SELECT COUNT(*) FROM hs_master").fetchone()[0]
        o = c.execute("SELECT COUNT(DISTINCT old8) FROM hs_master").fetchone()[0]
        v = [dict(r) for r in c.execute("SELECT * FROM hs_versions ORDER BY id DESC LIMIT 10")]
    return {"rows": n, "distinct_old": o, "versions": v}


def _row(r):
    d = dict(r)
    d["unit_code"] = UNIT_MAP.get(d.get("unit"), "u")
    return d


def search(q, limit=40):
    q = (q or "").strip()
    if not q:
        return []
    with db.conn() as c:
        d = digits(q)
        if d and len(d) >= 3 and re.fullmatch(r"[\d\s.\-]+", q):
            pats = {d, norm_code(q)}
            conds = " OR ".join(["old8 LIKE ? OR new12 LIKE ?"] * len(pats))
            args = [x for p in pats for x in (p + "%", p + "%")]
            rows = c.execute(f"SELECT * FROM hs_master WHERE {conds} ORDER BY new12 LIMIT ?", (*args, limit)).fetchall()
        else:
            toks = [t for t in re.findall(r"\w+", q, re.U) if t]
            fq = " AND ".join(f'"{t}"*' for t in toks)
            try:
                rows = c.execute("SELECT m.* FROM hs_fts f JOIN hs_master m ON m.id=f.rowid WHERE hs_fts MATCH ? "
                                 "ORDER BY rank LIMIT ?", (fq, limit)).fetchall()
            except Exception:
                rows = []
    return [_row(r) for r in rows]


def candidates(hs_inv, desc="", shipper=""):
    """Return {status, level, options[], pick}. status: ok | ambiguous | missing."""
    d = norm_code(hs_inv)
    out = {"status": "missing", "level": None, "options": [], "pick": None, "source": None}
    if len(d) < 4:
        return out
    with db.conn() as c:
        if shipper:
            m = c.execute("SELECT * FROM hs_memory WHERE shipper=? AND hs_inv=?", (shipper, d)).fetchone()
            if m:
                rows = c.execute("SELECT * FROM hs_master WHERE old8=? ORDER BY new12", (m["hs8"],)).fetchall()
                if rows:
                    rows = [_row(r) for r in rows]
                    pick = next((r for r in rows if r["new12"] == m["hs12"]), rows[0])
                    return {"status": "ok", "level": "memory", "options": rows, "pick": pick, "source": "learned"}
        if len(d) >= 12:
            rows = c.execute("SELECT * FROM hs_master WHERE new12=?", (d[:12],)).fetchall()
            if rows:
                r = _row(rows[0])
                return {"status": "ok", "level": 12, "options": [r], "pick": r, "source": "exact12"}
        for level in (10, 8, 6, 4):
            if len(d) < level:
                continue
            p = d[:level]
            rows = c.execute("SELECT * FROM hs_master WHERE old8 LIKE ? OR new12 LIKE ? ORDER BY new12 LIMIT 300",
                             (p + "%", p + "%")).fetchall()
            if not rows:
                continue
            rows = [_row(r) for r in rows]
            distinct = {r["old8"] for r in rows}
            if desc:
                for r in rows:
                    r["score"] = round(fuzz.token_set_ratio(desc.lower(), (r["desc_en"] or "").lower()), 1)
                rows.sort(key=lambda r: -r["score"])
            if level == 8 and p in distinct:
                pick = next(r for r in rows if r["old8"] == p)
                return {"status": "ok", "level": level, "options": rows[:30], "pick": pick, "source": "prefix8"}
            if len(distinct) == 1:
                return {"status": "ok", "level": level, "options": rows[:30], "pick": rows[0], "source": f"prefix{level}"}
            return {"status": "ambiguous", "level": level, "options": rows[:30], "pick": None, "source": f"prefix{level}"}
    return out


def by_old8(hs8):
    with db.conn() as c:
        return [_row(r) for r in c.execute("SELECT * FROM hs_master WHERE old8=? ORDER BY new12", (digits(hs8).zfill(8),))]


def remember(shipper, hs_inv, hs8, hs12):
    d = norm_code(hs_inv)
    if not shipper or not d or not hs8:
        return
    with db._lock, db.conn() as c:
        c.execute("INSERT INTO hs_memory(shipper,hs_inv,hs8,hs12) VALUES(?,?,?,?) "
                  "ON CONFLICT(shipper,hs_inv) DO UPDATE SET hs8=excluded.hs8,hs12=excluded.hs12,uses=uses+1",
                  (shipper, d, hs8, hs12))

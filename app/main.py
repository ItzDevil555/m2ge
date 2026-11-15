import io, os, json, uuid, zipfile, hashlib, difflib, re
from collections import Counter
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, HTMLResponse
from fastapi.staticfiles import StaticFiles
from . import uae, db, hs as hsm, m2, importer, validate, weights, reports

BASE = db.BASE
app = FastAPI(title="M2Gen Pro", version="2.0")


@app.on_event("startup")
def _startup():
    db.init()
    db.ensure_taxonomy()
    if hsm.stats()["rows"] == 0:
        p = os.path.join(BASE, "data", "Hs_Code_Dhabi_12_Digit.xlsx")
        if os.path.exists(p):
            hsm.load_master(p, os.path.basename(p))


# ---------------------------------------------------------------- helpers
def code_maps():
    out, labels = {}, {}
    with db.conn() as c:
        for r in c.execute("SELECT * FROM code_tables WHERE active=1"):
            out.setdefault(r["kind"], {})[str(r["id"])] = r["code"]
            labels.setdefault(r["kind"], {})[str(r["id"])] = r["label"]
    return out, labels


def new_decl(name="New declaration"):
    return {"name": name, "header": {"regime_id": None, "declaration_id": None, "payment_id": None, "invoice_type_id": None,
            "shipper": "", "buyer": "", "currency": db.setting("default_currency"), "incoterm": "", "pages": 1,
            "declared_weight": None}, "invoices": [], "_rev": 1}


def load(did):
    with db.conn() as c:
        r = c.execute("SELECT * FROM declarations WHERE id=? AND deleted=0", (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Declaration not found")
    d = json.loads(r["data"])
    d.update(id=r["id"], status=r["status"], created=r["created"], updated=r["updated"])
    return d


def hs_unit(hs8):
    m = hsm.by_old8(hs8)
    return m[0]["unit_code"] if m else None


def process(decl, force=False):
    """Resolve HS codes (memory → exact → prefix), default units, then validate."""
    shipper = decl["header"].get("shipper", "")
    use12 = db.setting("m2_code_field") == "hs12"
    for inv in decl["invoices"]:
        for l in inv["lines"]:
            if l.get("hs8") and l.get("hs_status") in ("ok", "manual") and not force:
                if not l.get("hs12"):
                    rows = hsm.by_old8(l["hs8"])
                    if len(rows) == 1:
                        l["hs12"] = rows[0]["new12"]
                    elif rows and use12:
                        l["hs_status"] = "ambiguous"
                if not l.get("unit") and l.get("hs8"):
                    l["unit"] = hs_unit(l["hs8"]) or "u"
                continue
            c = hsm.candidates(l.get("hs_inv", ""), l.get("description", ""), shipper)
            l["hs_status"] = c["status"]
            l["hs_source"] = c["source"]
            if c["pick"]:
                l["hs8"], l["hs12"] = c["pick"]["old8"], c["pick"]["new12"]
                if not l.get("unit"):
                    l["unit"] = c["pick"]["unit_code"]
                if use12 and len({o["new12"] for o in hsm.by_old8(l["hs8"])}) > 1 and c.get("source") not in ("exact12", "learned"):
                    l["hs_status"] = "ambiguous"
            else:
                l["hs8"] = l["hs12"] = ""
            if not l.get("unit"):
                l["unit"] = "u"
    codes, _ = code_maps()
    return validate.run(decl, codes, hs_unit)


def summarize(decl):
    ls = [l for i in decl["invoices"] for l in i["lines"]]
    return {"invoices": len(decl["invoices"]), "lines": len(ls), "value": round(sum(l["value"] for l in ls), 3),
            "weight": round(sum(l["weight"] for l in ls), 4), "qty": round(sum(l["qty"] for l in ls), 4)}


def save(decl, did=None, status=None):
    codes, _ = code_maps()
    iss = validate.run(decl, codes, None)
    decl["_meta"] = {"errors": sum(1 for i in iss if i["level"] == "error"), "warnings": sum(1 for i in iss if i["level"] == "warning"), **summarize(decl)}
    now = db.now()
    with db._lock, db.conn() as c:
        if did is None:
            did = uuid.uuid4().hex[:10]
            c.execute("INSERT INTO declarations(id,name,status,created,updated,data) VALUES(?,?,?,?,?,?)",
                      (did, decl.get("name", "Declaration"), status or "Draft", now, now, json.dumps(decl)))
        else:
            c.execute("UPDATE declarations SET name=?, status=COALESCE(?,status), updated=?, data=? WHERE id=?",
                      (decl.get("name", "Declaration"), status, now, json.dumps(decl), did))
    return did


# ---------------------------------------------------------------- meta
@app.get("/api/meta")
def meta():
    with db.conn() as c:
        codes = [dict(r) for r in c.execute("SELECT * FROM code_tables ORDER BY kind,id")]
        parties = [dict(r) for r in c.execute("SELECT * FROM parties ORDER BY name")]
    return {"codes": codes, "parties": parties, "settings": db.setting(), "hs": hsm.stats()}


@app.get("/api/uae")
def uae_ref():
    return {k: getattr(uae, k) for k in ("PORTS", "FREEZONES", "CONTAINERS", "DOCS", "INCO", "INCO_COLS", "VAT", "USD_AED", "HOLIDAY_NOTE")}


@app.get("/api/settings")
def get_settings():
    return db.setting()


@app.put("/api/settings")
async def put_settings(req: Request):
    body = await req.json()
    with db._lock, db.conn() as c:
        for k, v in body.items():
            c.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, str(v)))
    db.audit(None, "settings", json.dumps(body))
    return db.setting()


@app.post("/api/codes")
async def add_code(req: Request):
    b = await req.json()
    with db._lock, db.conn() as c:
        if b.get("id"):
            c.execute("UPDATE code_tables SET code=?, label=?, active=? WHERE id=?", (b.get("code", ""), b["label"], int(b.get("active", 1)), b["id"]))
            if "parent" in b:
                c.execute("UPDATE code_tables SET parent=? WHERE id=?", (b["parent"] or None, b["id"]))
        else:
            c.execute("INSERT INTO code_tables(kind,code,label,parent) VALUES(?,?,?,?)", (b["kind"], b.get("code", ""), b["label"], b.get("parent") or None))
    return {"ok": True}


@app.get("/api/codes/export")
def export_codes():
    with db.conn() as c:
        rows = c.execute("SELECT t.kind,t.code,t.label,p.label AS regime FROM code_tables t LEFT JOIN code_tables p ON p.id=t.parent WHERE t.active=1 ORDER BY t.kind,t.id").fetchall()
    body = "kind,code,label,regime\r\n" + "".join(f'{r["kind"]},{r["code"]},"{r["label"]}",{r["regime"] or ""}\r\n' for r in rows)
    return Response(body, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="code_tables.csv"'})


@app.post("/api/codes/bulk")
async def bulk_codes(req: Request):
    """Body {text}: lines 'kind,code,label'. Updates a matching kind+label, else inserts."""
    import csv as _csv
    text = (await req.json()).get("text", "")
    n_up = n_new = 0
    with db._lock, db.conn() as c:
        for r in _csv.reader(io.StringIO(text)):
            if len(r) < 3 or r[0].strip().lower() == "kind":
                continue
            k, code, label = r[0].strip(), r[1].strip(), r[2].strip()
            par = None
            if k == "declaration" and len(r) > 3 and r[3].strip():
                pr = c.execute("SELECT id FROM code_tables WHERE kind='regime' AND lower(label)=lower(?)", (r[3].strip(),)).fetchone()
                par = pr["id"] if pr else None
            row = c.execute("SELECT id FROM code_tables WHERE kind=? AND lower(label)=lower(?)", (k, label)).fetchone()
            if row:
                c.execute("UPDATE code_tables SET code=?, active=1, parent=COALESCE(?,parent) WHERE id=?", (code, par, row["id"])); n_up += 1
            else:
                c.execute("INSERT INTO code_tables(kind,code,label,parent) VALUES(?,?,?,?)", (k, code, label, par)); n_new += 1
    db.audit(None, "codes_bulk", f"{n_up} updated, {n_new} added")
    return {"updated": n_up, "added": n_new}


@app.delete("/api/codes/{cid}")
def del_code(cid: int):
    with db._lock, db.conn() as c:
        c.execute("DELETE FROM code_tables WHERE id=?", (cid,))
    return {"ok": True}


@app.post("/api/parties")
async def add_party(req: Request):
    b = await req.json()
    with db._lock, db.conn() as c:
        c.execute("INSERT INTO parties(name,kind,address) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET kind=excluded.kind,address=excluded.address",
                  (b["name"].strip(), b.get("kind", "shipper"), b.get("address", "")))
    return {"ok": True}


@app.delete("/api/parties/{pid}")
def del_party(pid: int):
    with db._lock, db.conn() as c:
        c.execute("DELETE FROM parties WHERE id=?", (pid,))
    return {"ok": True}


# ---------------------------------------------------------------- declarations
@app.get("/api/declarations")
def list_decls(q: str = "", status: str = ""):
    out = []
    with db.conn() as c:
        for r in c.execute("SELECT * FROM declarations WHERE deleted=? ORDER BY updated DESC", (0,)):
            d = json.loads(r["data"])
            m = d.get("_meta", {})
            if status and r["status"] != status:
                continue
            hay = (r["name"] + " " + d["header"].get("shipper", "") + " " + " ".join(i["number"] for i in d["invoices"])).lower()
            if q and q.lower() not in hay:
                continue
            out.append({"id": r["id"], "name": r["name"], "status": r["status"], "updated": r["updated"], "created": r["created"],
                        "shipper": d["header"].get("shipper", ""), **m})
    return out


@app.post("/api/declarations")
async def create_decl(req: Request):
    try:
        b = await req.json()
    except Exception:
        b = {}
    d = new_decl(b.get("name") or "New declaration")
    if b.get("header"):
        d["header"].update(b["header"])
    did = save(d)
    db.audit(did, "create", d["name"])
    return load(did)


@app.get("/api/declarations/{did}")
def get_decl(did: str):
    return load(did)


@app.put("/api/declarations/{did}")
async def put_decl(did: str, req: Request):
    cur = load(did)
    d = await req.json()
    if d.get("_rev") != cur.get("_rev"):
        raise HTTPException(409, "This declaration was changed by someone else. Reload to get the latest version.")
    d["_rev"] = cur["_rev"] + 1
    for k in ("id", "status", "created", "updated"):
        d.pop(k, None)
    save(d, did)
    db.audit(did, "save", f"rev {d['_rev']}")
    return load(did)


@app.post("/api/declarations/{did}/status")
async def set_status(did: str, req: Request):
    b = await req.json()
    with db._lock, db.conn() as c:
        c.execute("UPDATE declarations SET status=?, updated=? WHERE id=?", (b["status"], db.now(), did))
    db.audit(did, "status", b["status"])
    return {"ok": True}


@app.delete("/api/declarations/{did}")
def del_decl(did: str):
    with db._lock, db.conn() as c:
        c.execute("UPDATE declarations SET deleted=1 WHERE id=?", (did,))
    db.audit(did, "delete")
    return {"ok": True}


@app.post("/api/declarations/{did}/restore")
def restore_decl(did: str):
    with db._lock, db.conn() as c:
        c.execute("UPDATE declarations SET deleted=0 WHERE id=?", (did,))
    return {"ok": True}


@app.post("/api/declarations/{did}/duplicate")
def dup_decl(did: str):
    d = load(did)
    for k in ("id", "status", "created", "updated"):
        d.pop(k, None)
    d["name"] += " (copy)"; d["_rev"] = 1
    n = save(d)
    db.audit(n, "duplicate", did)
    return load(n)


@app.post("/api/process")
async def api_process(req: Request):
    b = await req.json()
    decl = b["decl"]
    iss = process(decl, force=bool(b.get("force")))
    return {"decl": decl, "issues": iss, "summary": summarize(decl)}


@app.post("/api/validate")
async def api_validate(req: Request):
    decl = (await req.json())["decl"]
    codes, _ = code_maps()
    return {"issues": validate.run(decl, codes, hs_unit), "summary": summarize(decl)}


# ---------------------------------------------------------------- import
@app.post("/api/import/inspect")
async def import_inspect(file: UploadFile = File(...), sheet: str = Form("")):
    content = await file.read()
    try:
        r = importer.inspect(content, file.filename, sheet or None)
    except Exception as e:
        raise HTTPException(400, f"Could not read the file: {e}")
    with db.conn() as c:
        tpls = [dict(t) for t in c.execute("SELECT * FROM templates ORDER BY id DESC")]
    hdr = [h.strip().lower() for h in r["header"]]
    for t in tpls:
        m = json.loads(t["mapping"])
        if m.get("header") and [x.strip().lower() for x in m["header"]] == hdr:
            r["mapping"] = m["map"]; r["template"] = t["name"]; break
    return r


@app.post("/api/import/apply")
async def import_apply(file: UploadFile = File(...), sheet: str = Form(""), mapping: str = Form(...), header_row: int = Form(0),
                       group_by_hs: bool = Form(False), invoice_no: str = Form(""), invoice_date: str = Form(""),
                       currency: str = Form(""), incoterm: str = Form("")):
    content = await file.read()
    rows, _ = importer.read_rows(content, file.filename, sheet or None)
    mp = {k: int(v) for k, v in json.loads(mapping).items() if v not in (None, "", -1)}
    lines, problems = importer.extract(rows, header_row, mp, group_by_hs)
    invs = {}
    for l in lines:
        invs.setdefault(l.pop("invoice_no", "") or invoice_no, []).append(l)
    invoices = [{"number": n or invoice_no, "date": invoice_date, "currency": currency, "incoterm": incoterm, "lines": ls}
                for n, ls in invs.items()]
    return {"invoices": invoices, "problems": problems, "lines": len(lines)}


@app.post("/api/import/m2")
async def import_m2(files: list[UploadFile] = File(...)):
    out, header, unknown = [], {}, 0
    for f in files:
        p = m2.parse((await f.read()).decode("utf-8", "replace"))
        out += p["invoices"]; header = header or p["header"]; unknown += p["unknown"]
    # map codes to code-table entries (create when unknown)
    ids = {}
    with db._lock, db.conn() as c:
        for kind, key in (("regime", "regime_code"), ("declaration", "declaration_code"), ("payment", "payment_code")):
            code = header.get(key, "")
            r = c.execute("SELECT id FROM code_tables WHERE kind=? AND code=?", (kind, code)).fetchone()
            if not r and code:
                cur = c.execute("INSERT INTO code_tables(kind,code,label) VALUES(?,?,?)", (kind, code, f"{kind.title()} {code} (imported)"))
                ids[kind + "_id"] = cur.lastrowid
            elif r:
                c.execute("UPDATE code_tables SET active=1 WHERE id=?", (r["id"],))
                ids[kind + "_id"] = r["id"]
        if header.get("shipper"):
            c.execute("INSERT OR IGNORE INTO parties(name,kind) VALUES(?, 'shipper')", (header["shipper"],))
    first = out[0] if out else {}
    return {"header": {**ids, "shipper": header.get("shipper", ""), "currency": first.get("currency", ""),
                       "incoterm": first.get("incoterm", "")}, "invoices": out, "unknown": unknown}


@app.post("/api/templates")
async def save_template(req: Request):
    b = await req.json()
    with db._lock, db.conn() as c:
        c.execute("INSERT INTO templates(shipper,name,mapping,created) VALUES(?,?,?,?)",
                  (b.get("shipper", ""), b["name"], json.dumps({"header": b["header"], "map": b["map"]}), db.now()))
    return {"ok": True}


@app.get("/api/templates")
def list_templates():
    with db.conn() as c:
        return [{**dict(t), "mapping": json.loads(t["mapping"])} for t in c.execute("SELECT * FROM templates ORDER BY id DESC")]


@app.delete("/api/templates/{tid}")
def del_template(tid: int):
    with db._lock, db.conn() as c:
        c.execute("DELETE FROM templates WHERE id=?", (tid,))
    return {"ok": True}


# ---------------------------------------------------------------- HS
@app.get("/api/hs/search")
def hs_search(q: str = "", limit: int = 40):
    return hsm.search(q, limit)


@app.post("/api/hs/candidates")
async def hs_candidates(req: Request):
    b = await req.json()
    r = hsm.candidates(b.get("hs_inv", ""), b.get("description", ""), b.get("shipper", ""))
    return r


@app.post("/api/hs/describe")
async def hs_describe(req: Request):
    codes = (await req.json()).get("codes", [])
    out = {}
    for k in codes[:500]:
        m = hsm.by_old8(k) if k else []
        if m:
            out[k] = {"en": m[0]["desc_en"], "ar": m[0]["desc_ar"], "duty": m[0]["duty"], "unit": m[0]["unit_code"], "n12": len(m)}
    return out


@app.post("/api/hs/remember")
async def hs_remember(req: Request):
    b = await req.json()
    hsm.remember(b.get("shipper", ""), b.get("hs_inv", ""), b.get("hs8", ""), b.get("hs12", ""))
    return {"ok": True}


@app.post("/api/hs/upload")
async def hs_upload(file: UploadFile = File(...)):
    try:
        n = hsm.load_master(await file.read(), file.filename)
    except Exception as e:
        raise HTTPException(400, f"Invalid HS master: {e}")
    db.audit(None, "hs_upload", f"{file.filename}: {n} rows")
    return hsm.stats()


@app.get("/api/hs/memory")
def hs_memory():
    with db.conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM hs_memory ORDER BY uses DESC LIMIT 500")]


# ---------------------------------------------------------------- weights
@app.post("/api/weights/distribute")
async def api_distribute(req: Request):
    b = await req.json()
    decl = b["decl"]
    flat = [(ii, li) for ii, inv in enumerate(decl["invoices"]) for li in range(len(inv["lines"]))]
    if b.get("invoice") is not None:
        flat = [(i, l) for i, l in flat if i == b["invoice"]]
    lines = [decl["invoices"][i]["lines"][l] for i, l in flat]
    locked = [k for k, x in enumerate(lines) if x.get("locked")]
    try:
        new = weights.distribute(lines, float(b["total"]), b.get("basis", "value"), float(b.get("step", 0.001)), float(b.get("minimum", 0)), locked)
    except ValueError as e:
        raise HTTPException(400, str(e))
    before = sum(float(x.get("weight") or 0) for x in lines)
    for (i, l), w in zip(flat, new):
        decl["invoices"][i]["lines"][l]["weight"] = w
        if decl["invoices"][i]["lines"][l].get("unit") == "kg":
            decl["invoices"][i]["lines"][l]["qty"] = w
    return {"decl": decl, "before": before, "after": round(sum(new), 4), "target": float(b["total"])}


# ---------------------------------------------------------------- output
def _gen(did, force):
    decl = load(did)
    iss = process(decl)
    errs = [i for i in iss if i["level"] == "error"]
    return decl, iss, errs


@app.get("/api/declarations/{did}/preview")
def preview(did: str):
    decl, iss, errs = _gen(did, False)
    codes, _ = code_maps()
    return {"text": m2.write(decl, db.setting(), codes) if decl["invoices"] else "", "issues": iss}


@app.get("/api/declarations/{did}/download")
def download(did: str, force: int = 0):
    decl, iss, errs = _gen(did, bool(force))
    if errs and not force:
        return JSONResponse({"detail": "Validation errors block generation", "issues": errs}, status_code=422)
    codes, _ = code_maps()
    base = re.sub(r"[^\w\-]+", "_", decl.get("header", {}).get("shipper") or decl["name"]).strip("_") or "declaration"
    files = m2.split_files(decl, db.setting(), codes, base)
    with db._lock, db.conn() as c:
        for fn, tx in files:
            c.execute("INSERT INTO generated(decl_id,ts,filename,sha256,lines,content) VALUES(?,?,?,?,?,?)",
                      (did, db.now(), fn, hashlib.sha256(tx.encode()).hexdigest(), tx.count("\r\n"), tx))
        c.execute("UPDATE declarations SET status='Generated', updated=? WHERE id=?", (db.now(), did))
    db.audit(did, "generate", f"{len(files)} file(s), force={force}")
    if len(files) == 1:
        return Response(files[0][1].encode("utf-8"), media_type="text/plain",
                        headers={"Content-Disposition": f'attachment; filename="{files[0][0]}"'})
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as z:
        for fn, tx in files:
            z.writestr(fn, tx.encode("utf-8"))
    return Response(bio.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{base}.zip"'})


@app.get("/api/declarations/{did}/history")
def gen_history(did: str):
    with db.conn() as c:
        return [dict(r) for r in c.execute("SELECT id,ts,filename,sha256,lines FROM generated WHERE decl_id=? ORDER BY id DESC", (did,))]


@app.get("/api/generated/{gid}")
def gen_file(gid: int):
    with db.conn() as c:
        r = c.execute("SELECT * FROM generated WHERE id=?", (gid,)).fetchone()
    if not r:
        raise HTTPException(404)
    return Response(r["content"].encode(), media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="{r["filename"]}"'})


def _labels(decl):
    _, lb = code_maps()
    h = decl["header"]
    return {"regime": lb.get("regime", {}).get(str(h.get("regime_id")), ""), "declaration": lb.get("declaration", {}).get(str(h.get("declaration_id")), ""),
            "payment": lb.get("payment", {}).get(str(h.get("payment_id")), "")}


@app.get("/api/declarations/{did}/xlsx")
def export_xlsx(did: str):
    decl, iss, _ = _gen(did, False)
    data = reports.to_xlsx(decl, iss, _labels(decl))
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{re.sub(r"[^\w-]+", "_", decl["name"])}.xlsx"'})


@app.get("/api/declarations/{did}/report", response_class=HTMLResponse)
def report(did: str):
    decl, iss, _ = _gen(did, False)
    return reports.report_html(decl, iss, _labels(decl), db.setting("company_name"))


@app.post("/api/declarations/{did}/diff")
async def diff(did: str, file: UploadFile = File(...)):
    decl, _, _ = _gen(did, False)
    codes, _ = code_maps()
    mine = m2.write(decl, db.setting(), codes).splitlines()
    ref = (await file.read()).decode("utf-8", "replace").splitlines()
    d = list(difflib.unified_diff(ref, mine, "reference", "generated", lineterm="", n=1))
    return {"identical": not d, "diff": d[:400], "ref_lines": len(ref), "gen_lines": len(mine), "changed": sum(1 for x in d if x[:1] in "+-" and x[:3] not in ("+++", "---"))}


# ---------------------------------------------------------------- dashboard / audit
@app.get("/api/dashboard")
def dashboard():
    days = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1)]
    per = Counter(); ship = Counter(); ctry = Counter(); wchap = Counter(); chap = Counter(); st = Counter(); lines = 0; val = 0.0; err = 0; n = 0
    with db.conn() as c:
        for r in c.execute("SELECT * FROM declarations WHERE deleted=0"):
            d = json.loads(r["data"]); m = d.get("_meta", {}); n += 1
            per[r["created"][:10]] += 1; st[r["status"]] += 1
            ship[d["header"].get("shipper") or "—"] += 1
            lines += m.get("lines", 0); val += m.get("value", 0)
            err += 1 if m.get("errors") else 0
            for inv in d["invoices"]:
                for l in inv["lines"]:
                    ch = (l.get("hs8") or hsm.digits(l.get("hs_inv")))[:2] or "??"
                    chap[ch] += 1; wchap[ch] += float(l.get("weight") or 0); ctry[(l.get("country") or "??").upper()] += float(l.get("value") or 0)
        gen = c.execute("SELECT COUNT(*) FROM generated").fetchone()[0]
    return {"declarations": n, "lines": lines, "value": round(val, 2), "generated": gen, "with_errors": err,
            "error_rate": round(100 * err / n, 1) if n else 0, "per_day": [{"d": d[5:], "n": per.get(d, 0)} for d in days],
            "top_shippers": ship.most_common(6), "top_chapters": chap.most_common(8), "value_by_country": [[k, round(v, 2)] for k, v in ctry.most_common(7)], "weight_by_chapter": [[k, round(v, 2)] for k, v in wchap.most_common(8)], "status": dict(st)}


@app.get("/api/audit")
def audit_log(decl: str = "", limit: int = 200):
    with db.conn() as c:
        if decl:
            rows = c.execute("SELECT * FROM audit WHERE decl_id=? ORDER BY id DESC LIMIT ?", (decl, limit))
        else:
            rows = c.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]


app.mount("/", StaticFiles(directory=os.path.join(BASE, "static"), html=True), name="static")

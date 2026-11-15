import os, sys, io, json, tempfile
os.environ["M2GEN_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from app.main import app

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "HELLMAN-LOGISTICS.txt")
SAMPLE = open(FIX, "rb").read()


def client():
    return TestClient(app)


def test_golden_roundtrip():
    """Importing the real M2 file and regenerating it must be byte-identical."""
    with client() as c:
        r = c.post("/api/import/m2", files=[("files", ("s.txt", SAMPLE))]).json()
        assert r["unknown"] == 0 and len(r["invoices"][0]["lines"]) == 220
        d = c.post("/api/declarations", json={"name": "golden", "header": {**r["header"], "currency": "USD"}}).json()
        d["invoices"] = r["invoices"]
        d = c.put(f"/api/declarations/{d['id']}", json=d).json()
        res = c.get(f"/api/declarations/{d['id']}/download?force=1")
        assert res.status_code == 200
        assert res.content == SAMPLE
        df = c.post(f"/api/declarations/{d['id']}/diff", files={"file": ("s.txt", SAMPLE)}).json()
        assert df["identical"]


def test_hs_master_loaded_with_zero_padding():
    with client() as c:
        assert c.get("/api/meta").json()["hs"]["rows"] == 13449
        r = c.get("/api/hs/search?q=10121100001").json()
        assert r and r[0]["new12"] == "010121100001" and r[0]["old8"] == "01012110"
        assert c.get("/api/hs/search?q=arabian horses").json()


def test_weight_distribution_exact():
    with client() as c:
        lines = [{"qty": 1, "value": v, "weight": 0, "unit": "u"} for v in (10, 20, 33.3, 7)]
        d = {"header": {}, "invoices": [{"number": "1", "lines": lines}]}
        r = c.post("/api/weights/distribute", json={"decl": d, "total": 100, "basis": "value", "step": 0.001}).json()
        assert abs(sum(l["weight"] for l in r["decl"]["invoices"][0]["lines"]) - 100) < 1e-9


def test_excel_import_and_process():
    import openpyxl
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["Invoice No", "INV-9"]); ws.append(["Date", "2026-03-04"]); ws.append([])
    ws.append(["HTS Code", "Description", "Quantity", "Net Weight", "Total Value", "Country of Origin"])
    ws.append(["8517.62.0090", "Router", 3, 2.5, "1,200.50", "Viet Nam"])
    ws.append(["8536.69.4040", "Connector", 10, "1,5", 99, "Germany"])
    ws.append(["Total", "", 13, 4, 1299.5, ""])
    b = io.BytesIO(); wb.save(b)
    with client() as c:
        ins = c.post("/api/import/inspect", files={"file": ("a.xlsx", b.getvalue())}).json()
        assert ins["header_row"] == 2 and ins["mapping"]["hs_inv"] == 0 and ins["mapping"]["value"] == 4
        assert ins["info"]["invoice_no"] == "INV-9"
        ap = c.post("/api/import/apply", files={"file": ("a.xlsx", b.getvalue())},
                    data={"mapping": json.dumps(ins["mapping"]), "header_row": ins["header_row"], "invoice_no": "INV-9", "invoice_date": "2026-03-04"}).json()
        ls = ap["invoices"][0]["lines"]
        assert len(ls) == 2 and ls[0]["country"] == "VN" and ls[0]["value"] == 1200.5 and ls[1]["weight"] == 1.5
        d = {"header": {"shipper": "X", "currency": "USD", "incoterm": "CIF"}, "invoices": ap["invoices"]}
        p = c.post("/api/process", json={"decl": d}).json()
        assert all(l["hs_status"] in ("ok", "ambiguous", "missing") for l in p["decl"]["invoices"][0]["lines"])
        assert any(i["level"] == "error" for i in p["issues"])  # codes not selected → generation blocked

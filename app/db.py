"""SQLite storage. Declarations are stored as JSON documents; reference data in tables."""
import os, sqlite3, json, threading
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("M2GEN_DB", os.path.join(BASE, "m2gen.db"))
_lock = threading.Lock()


def conn():
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    return c


SCHEMA = """
CREATE TABLE IF NOT EXISTS hs_master(
  id INTEGER PRIMARY KEY, old8 TEXT, new12 TEXT, desc_ar TEXT, desc_en TEXT,
  unit TEXT, duty REAL, vgn TEXT, version INTEGER DEFAULT 1);
CREATE INDEX IF NOT EXISTS ix_hs_old ON hs_master(old8);
CREATE INDEX IF NOT EXISTS ix_hs_new ON hs_master(new12);
CREATE VIRTUAL TABLE IF NOT EXISTS hs_fts USING fts5(desc_en, desc_ar, codes, tokenize='unicode61');
CREATE TABLE IF NOT EXISTS hs_versions(id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, rows INTEGER, uploaded TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS declarations(
  id TEXT PRIMARY KEY, name TEXT, status TEXT, created TEXT, updated TEXT, deleted INTEGER DEFAULT 0, data TEXT);
CREATE TABLE IF NOT EXISTS code_tables(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, code TEXT, label TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS parties(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, kind TEXT, address TEXT);
CREATE TABLE IF NOT EXISTS hs_memory(shipper TEXT, hs_inv TEXT, hs8 TEXT, hs12 TEXT, uses INTEGER DEFAULT 1, PRIMARY KEY(shipper, hs_inv));
CREATE TABLE IF NOT EXISTS templates(id INTEGER PRIMARY KEY AUTOINCREMENT, shipper TEXT, name TEXT, mapping TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, decl_id TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS generated(id INTEGER PRIMARY KEY AUTOINCREMENT, decl_id TEXT, ts TEXT, filename TEXT, sha256 TEXT, lines INTEGER, content TEXT);
"""

DEFAULT_SETTINGS = {
    "m2_code_field": "hs8",          # what goes in ID field 3: hs8 | hs12
    "line_numbering": "per_invoice",  # per_invoice | continuous
    "decimal_units": "kg",            # units whose qty is written with 4 decimals
    "max_lines_per_file": "0",        # 0 = no split
    "company_name": "My Logistics Co.",
    "default_currency": "USD",
}

INCOTERMS = [("EXW", "EXW (Ex Works)"), ("FCA", "FCA (Free Carrier)"), ("CPT", "CPT (Carriage Paid To)"),
             ("CIP", "CIP (Carriage and Insurance Paid To)"), ("DAP", "DAP (Delivered At Place)"),
             ("DPU", "DPU (Delivered at Place Unloaded)"), ("DDP", "DDP (Delivered Duty Paid)"),
             ("FAS", "FAS (Free Alongside Ship)"), ("FOB", "FOB (Free On Board)"),
             ("CFR", "CFR (Cost and Freight)"), ("CIF", "CIF (Cost, Insurance and Freight)")]
EXTRA_LABELS = {
    "regime": ["Import", "Export", "Re-export", "Transit", "Transshipment", "Temporary admission", "Warehousing", "Free zone import", "Free zone export", "GCC transit"],
    "declaration": ["Import", "Export", "Transit", "FZ Transit Out", "FZ Transit In", "Re-export", "Courier"],
    "payment": ["Bank Transfer", "Cash", "Cheque", "Credit", "Letter of Credit", "Advance Payment", "Open Account", "Free of Charge"],
    "invoice_type": ["Commercial", "Proforma", "Sample", "Return", "Gift", "Free of Charge"],
}
CURRENCIES = ["USD", "EUR", "AED", "GBP", "CNY", "INR", "JPY", "SAR", "CHF", "KRW", "SGD", "HKD", "TRY", "CAD", "AUD"]


def now():
    return datetime.now().isoformat(timespec="seconds")


def init():
    with _lock, conn() as c:
        c.executescript(SCHEMA)
        for k, v in DEFAULT_SETTINGS.items():
            c.execute("INSERT OR IGNORE INTO settings VALUES(?,?)", (k, v))
        if c.execute("SELECT COUNT(*) FROM code_tables").fetchone()[0] == 0:
            seed = []
            # Codes below come from the sample M2 file. Labels from the UI screenshots have NO code yet:
            # set them in Settings > Code tables (blank code blocks generation until filled).
            seed += [("regime", "10", "Regime 10 (from sample file)")]
            seed += [("declaration", "1", "Declaration type 1 (from sample file)")]
            seed += [("payment", "7", "Payment type 7 (from sample file)")]
            for k, labels in EXTRA_LABELS.items():
                seed += [(k, "", l) for l in labels]
            seed += [("incoterm", a, b) for a, b in INCOTERMS]
            seed += [("currency", a, a) for a in CURRENCIES]
            c.executemany("INSERT INTO code_tables(kind,code,label) VALUES(?,?,?)", seed)
        else:  # top-up labels added in later versions, never touches existing rows
            for k, labels in EXTRA_LABELS.items():
                for l in labels:
                    if not c.execute("SELECT 1 FROM code_tables WHERE kind=? AND lower(label)=lower(?)", (k, l)).fetchone():
                        c.execute("INSERT INTO code_tables(kind,code,label) VALUES(?,?,?)", (k, "", l))


def setting(key=None):
    with conn() as c:
        rows = {r["key"]: r["value"] for r in c.execute("SELECT * FROM settings")}
    return rows if key is None else rows.get(key, DEFAULT_SETTINGS.get(key))


def audit(decl_id, action, detail=""):
    with _lock, conn() as c:
        c.execute("INSERT INTO audit(ts,decl_id,action,detail) VALUES(?,?,?,?)", (now(), decl_id, action, detail))

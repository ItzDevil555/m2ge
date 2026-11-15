# M2Gen Pro

Customs-declaration / M2 text-file generator. Upload invoices (Excel, CSV or an existing M2 text file), resolve HS codes
against the Dubai HS master, distribute weights, validate, and generate the M2 `.txt`.

## Run
    pip install -r requirements.txt
    python -m uvicorn app.main:app --port 8000      # then open http://localhost:8000
(Windows: double-click `start.bat`.) The HS master (`data/Hs_Code_Dhabi_12_Digit.xlsx`, 13,449 rows) loads automatically on first start.
Docker: `docker build -t m2gen . && docker run -p 8000:8000 -v m2data:/app m2gen`.

## Test
    python -m pytest tests      # includes the golden test: HELLMAN-LOGISTICS.txt -> import -> regenerate == byte-identical

## First-time setup (important)
Settings → Code tables: the sample file proves regime `10`, declaration type `1`, payment type `7`, but not what they mean.
Labels from your screenshots (Transit, FZ Transit Out, Bank Transfer, Commercial…) are seeded **with blank codes**; fill in the real
codes. Entries with blank codes block generation.

## Known open points
* `PD` records (`"PD","","23","N"`) are preserved exactly on M2 import, but their meaning is undocumented, so they are NOT invented for Excel imports.
* ID field 3 = 8-digit tariff code (matches 219/220 lines of the sample against the master). Switch to the 12-digit code in Settings → M2 writer profile.
* Multi-invoice files: one IH+ID block per invoice, line numbers restart per invoice (switchable). Confirm with Dubai Customs.
* No login/roles, no PDF extraction, English UI only in this build.

## Layout
app/ (main.py routes · hs.py master+matching · m2.py parser/writer · importer.py · validate.py · weights.py · reports.py) · static/ (SPA) · tests/ · data/

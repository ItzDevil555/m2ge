"""Rule engine: returns issues [{level: error|warning|info, invoice, line, field, msg}]."""
import re
from datetime import date, datetime, timedelta
from . import hs as hsm


def run(decl, codes_tbl, hs_unit_lookup=None):
    iss = []
    h = decl["header"]

    def add(level, msg, inv=None, line=None, field=None):
        iss.append({"level": level, "msg": msg, "invoice": inv, "line": line, "field": field})

    for k, lab in (("regime_id", "Regime type"), ("declaration_id", "Declaration type"), ("payment_id", "Payment type")):
        kind = k.replace("_id", "")
        if not h.get(k):
            add("error", f"{lab} is required", field=k)
        elif not codes_tbl.get(kind, {}).get(str(h.get(k))):
            add("error", f"{lab}: the selected entry has no code yet — set it in Settings → Code tables", field=k)
    for k, lab in (("shipper", "Shipper"), ("currency", "Currency"), ("incoterm", "IncoTerm")):
        if not str(h.get(k, "")).strip():
            add("error", f"{lab} is required", field=k)
    if not decl["invoices"]:
        add("error", "No invoices in this declaration")
    seen = {}
    for ii, inv in enumerate(decl["invoices"]):
        tag = inv.get("number") or f"#{ii + 1}"
        if not str(inv.get("number", "")).strip():
            add("error", f"Invoice #{ii + 1}: number is required", ii, None, "number")
        elif inv["number"] in seen:
            add("error", f"Duplicate invoice number {inv['number']}", ii, None, "number")
        seen[inv.get("number")] = 1
        try:
            d = datetime.strptime(inv.get("date", ""), "%Y-%m-%d").date()
            if d > date.today() + timedelta(days=365):
                add("warning", f"Invoice {tag}: date {d} is more than a year ahead", ii, None, "date")
        except ValueError:
            add("error", f"Invoice {tag}: date must be YYYY-MM-DD", ii, None, "date")
        if not inv["lines"]:
            add("error", f"Invoice {tag} has no lines", ii)
        dup = {}
        for li, l in enumerate(inv["lines"]):
            def a(level, msg, field=None):
                add(level, f"Line {li + 1}: {msg}", ii, li, field)
            if not hsm.digits(l.get("hs_inv")) and not l.get("hs8"):
                a("error", "HS code is missing", "hs_inv")
            elif l.get("hs_status") == "ambiguous":
                a("error", f"HS {l.get('hs_inv')} matches several master codes — choose one", "hs8")
            elif l.get("hs_status") == "missing" or not l.get("hs8"):
                a("error", f"HS {l.get('hs_inv')} not found in the HS master — pick a code", "hs8")
            if (l.get("qty") or 0) <= 0:
                a("error", "quantity must be > 0", "qty")
            if (l.get("weight") or 0) <= 0:
                a("error", "net weight must be > 0", "weight")
            if (l.get("value") or 0) <= 0:
                a("error", "value must be > 0", "value")
            c = l.get("country") or ""
            if not re.fullmatch(r"[A-Z]{2}", c):
                a("error", f"country '{c}' is not a valid ISO-2 code", "country")
            if hs_unit_lookup and l.get("hs8"):
                mu = hs_unit_lookup(l["hs8"])
                if mu and l.get("unit") and mu != l["unit"]:
                    a("warning", f"unit '{l['unit']}' differs from the master's statistical unit '{mu}'", "unit")
            if l.get("unit") == "kg" and abs((l.get("qty") or 0) - (l.get("weight") or 0)) > 1e-4:
                a("info", "unit is kg but quantity ≠ net weight", "qty")
            key = (hsm.digits(l.get("hs_inv")), round(l.get("qty") or 0, 4), round(l.get("value") or 0, 3), l.get("country"))
            if key in dup and key[0]:
                a("warning", f"looks like a duplicate of line {dup[key] + 1}")
            dup.setdefault(key, li)
    tw = h.get("declared_weight")
    if tw not in (None, "", 0):
        sw = sum((l.get("weight") or 0) for inv in decl["invoices"] for l in inv["lines"])
        if abs(float(tw) - sw) > 0.0005:
            add("error", f"Sum of line weights {sw:,.4f} ≠ declared total weight {float(tw):,.4f} — use Distribute Weight", field="declared_weight")
    return iss

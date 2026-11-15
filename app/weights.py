"""Weight distribution with the largest-remainder method so the total is exact at the chosen step."""
from decimal import Decimal, ROUND_HALF_UP


def distribute(lines, total, basis="value", step=0.001, minimum=0.0, locked=None):
    """lines: list of dicts (qty,value,weight). Returns list of new weights (floats), exact sum == total."""
    locked = set(locked or [])
    st = Decimal(str(step))
    tot_units = int((Decimal(str(total)) / st).to_integral_value(ROUND_HALF_UP))
    n = len(lines)
    free = [i for i in range(n) if i not in locked]
    if not free:
        raise ValueError("All lines are locked")
    locked_units = sum(int((Decimal(str(lines[i].get("weight") or 0)) / st).to_integral_value(ROUND_HALF_UP)) for i in locked)
    min_u = int((Decimal(str(minimum)) / st).to_integral_value(ROUND_HALF_UP))
    remaining = tot_units - locked_units - min_u * len(free)
    if remaining < 0:
        raise ValueError("Total weight is too small for the minimum per line / locked lines")
    if basis == "equal":
        w = [1.0] * len(free)
    else:
        w = [max(float(lines[i].get(basis) or 0), 0.0) for i in free]
        if sum(w) <= 0:
            w = [1.0] * len(free)
    sw = sum(w)
    raw = [remaining * x / sw for x in w]
    base = [int(r) for r in raw]
    left = remaining - sum(base)
    order = sorted(range(len(free)), key=lambda k: -(raw[k] - base[k]))
    for k in order[:left]:
        base[k] += 1
    out = [float(lines[i].get("weight") or 0) for i in range(n)]
    for k, i in enumerate(free):
        out[i] = float((Decimal(base[k] + min_u) * st).quantize(Decimal("0.0001")))
    return out

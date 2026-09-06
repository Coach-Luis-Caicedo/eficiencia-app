"""
motor-ifd/oraculo_bridge.py — Fase 1+

Puente al motor de referencia (docs/ifd_v1_2_1_engine_atribucion_categorica.py)
para contraste con la implementación JS. Lee un caso JSON por stdin, corre
run_epd(), y devuelve por stdout los campos comparables.

ALCANCE: solo admisibilidad, FEP, nivel de salida, status y alertas. NO se
usa para ver/roi/contención — el engine los calcula pero v1.2.2 §24 los
dejó PENDIENTE DE AUDITORÍA (ver README).
"""
import sys, json, os

_here = os.path.dirname(os.path.abspath(__file__))
_engine_path = os.path.normpath(os.path.join(_here, "..", "docs", "ifd_v1_2_1_engine_atribucion_categorica.py"))

import importlib.util
_spec = importlib.util.spec_from_file_location("ifd_engine", _engine_path)
_engine = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_engine)


def run(case: dict) -> dict:
    # El engine exige varios campos; se completan con defaults inocuos los
    # que la comparación de Fase 1 no toca.
    defaults = dict(
        epd_id=case.get("epd_id", "ORACLE"),
        deterioration_sustained=True, evidence_present=True, mechanism_traceable=True,
        horizon_defined=True, assumptions_declared=True,
        Q=3, C=3, T=3, R=3,
        variable_type="V1", evolution_type="EV-A", series_sufficiency=3,
        horizon=6, hms=12,
        events_obs=504, exposure_obs=12000, exposure_future=72000, lower_bound=0,
        unit_value=None, economic_traceability=False, attribution_category="UNRESOLVED",
    )
    defaults.update({k: v for k, v in case.items() if k in _engine.EPDInput.__dataclass_fields__})
    inp = _engine.EPDInput(**defaults)
    out = _engine.run_epd(inp)
    return dict(
        admissible=out.admissible,
        FEP=out.FEP,
        output_level=out.output_level,
        status=out.status,
        # códigos: el engine usa "A01_ADMISIBILIDAD_INSUFICIENTE"; se devuelve
        # solo el prefijo "A01" para comparar con el JS.
        alert_codes=[a.split("_")[0] for a in out.alerts],
        projection_base=out.projection_base,
        projection_lower=out.projection_lower,
        projection_upper=out.projection_upper,
        # §23.2 — EEB. El engine modela 2 condiciones de puerta (unit_value +
        # economic_traceability); el motor JS modela 3 (§23.1 agrega `unit`).
        # Los casos economicos del contraste llevan `unit` -> ambos coinciden.
        economic_base=out.economic_base,
        economic_lower=out.economic_lower,
        economic_upper=out.economic_upper,
        attribution_category=out.attribution_category,
    )


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    cases = payload if isinstance(payload, list) else [payload]
    print(json.dumps([run(c) for c in cases]))

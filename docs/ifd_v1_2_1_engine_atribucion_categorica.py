from dataclasses import dataclass
from typing import Optional, List

ATTRIBUTION_CATEGORIES = {"CONFIRMED", "SUPPORTED", "UNRESOLVED", "N_A"}

@dataclass
class EPDInput:
    epd_id: str
    deterioration_sustained: bool
    evidence_present: bool
    mechanism_traceable: bool
    horizon_defined: bool
    assumptions_declared: bool
    Q: int
    C: int
    T: int
    R: int
    variable_type: str
    evolution_type: str
    series_sufficiency: int
    horizon: float
    hms: Optional[float]
    baseline: Optional[float] = None
    exposure_obs: Optional[float] = None
    events_obs: Optional[float] = None
    exposure_future: Optional[float] = None
    trend_a: Optional[float] = None
    trend_b: Optional[float] = None
    growth_rate: Optional[float] = None
    delta: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    unit_value: Optional[float] = None
    economic_traceability: bool = False
    attribution_category: str = "UNRESOLVED"
    containment_factor: Optional[float] = None
    containment_evidence_level: int = 0
    intervention_cost: Optional[float] = None

@dataclass
class EPDOutput:
    epd_id: str
    admissible: bool
    FEP: int
    output_level: str
    status: str
    projection_base: Optional[float]
    projection_lower: Optional[float]
    projection_upper: Optional[float]
    economic_base: Optional[float]
    economic_lower: Optional[float]
    economic_upper: Optional[float]
    attribution_category: str
    VER: Optional[float]
    ROI_P: Optional[float]
    alerts: List[str]
    notes: List[str]

def clamp(x, lo=None, hi=None):
    if x is None:
        return None
    if lo is not None:
        x = max(lo, x)
    if hi is not None:
        x = min(hi, x)
    return x

def output_level(fep):
    return {0:"S0", 1:"S1", 2:"S2", 3:"S3"}[fep]

def run_epd(x: EPDInput) -> EPDOutput:
    alerts, notes = [], []

    if x.attribution_category not in ATTRIBUTION_CATEGORIES:
        raise ValueError(
            "attribution_category must be one of "
            "CONFIRMED | SUPPORTED | UNRESOLVED | N_A"
        )

    admissible = all([
        x.deterioration_sustained,
        x.evidence_present,
        x.mechanism_traceable,
        x.horizon_defined,
        x.assumptions_declared,
    ])
    fep = min(x.Q, x.C, x.T, x.R)

    if not admissible:
        return EPDOutput(
            x.epd_id, False, fep, "S0", "NO_PROYECTABLE",
            None, None, None, None, None, None,
            x.attribution_category, None, None,
            ["A01_ADMISIBILIDAD_INSUFICIENTE"], []
        )

    if fep == 0:
        code = "A03_TRAZABILIDAD_INSUFICIENTE" if x.R == 0 \
               else "A02_EVIDENCIA_CONTRADICTORIA_O_INSUFICIENTE"
        return EPDOutput(
            x.epd_id, True, fep, "S0", "NO_PROYECTABLE",
            None, None, None, None, None, None,
            x.attribution_category, None, None, [code], []
        )

    effective_fep = fep
    if x.hms is not None and x.horizon > x.hms:
        alerts.append("A07_HORIZONTE_EXCEDIDO")
        effective_fep = max(1, effective_fep - 1)
        notes.append("Salida degradada por exceder el horizonte sustentable.")

    if x.variable_type == "V5":
        return EPDOutput(
            x.epd_id, True, fep, "S1", "CUALITATIVO",
            None, None, None, None, None, None,
            x.attribution_category, None, None, alerts,
            ["V5: no se fabrica una cifra para una capacidad latente."]
        )

    if effective_fep == 1:
        return EPDOutput(
            x.epd_id, True, fep, "S1", "CUALITATIVO",
            None, None, None, None, None, None,
            x.attribution_category, None, None, alerts,
            ["La fuerza de evidencia limita la salida a escenario cualitativo."]
        )

    if x.series_sufficiency < 2 and x.variable_type in {"V1","V2","V3","V4"}:
        alerts.append("A04_SERIE_INSUFICIENTE")
        return EPDOutput(
            x.epd_id, True, fep, "S1", "DEGRADADO_A_CUALITATIVO",
            None, None, None, None, None, None,
            x.attribution_category, None, None, alerts,
            ["Serie insuficiente para modelación cuantitativa."]
        )

    proj = None
    if x.variable_type == "V1" and x.events_obs is not None and x.exposure_obs and x.exposure_future is not None:
        proj = (x.events_obs / x.exposure_obs) * x.exposure_future
    elif x.trend_a is not None and x.trend_b is not None:
        proj = x.trend_a + x.trend_b * x.horizon
    elif x.growth_rate is not None and x.baseline is not None and "EV-M" in x.evolution_type:
        proj = x.baseline * ((1 + x.growth_rate) ** x.horizon)
    elif x.delta is not None and x.baseline is not None and "EV-A" in x.evolution_type:
        proj = x.baseline + x.delta * x.horizon
    elif x.baseline is not None:
        proj = x.baseline
        notes.append("Continuidad basada en baseline/estabilidad.")
    else:
        alerts.append("A05_METODO_INCOMPATIBLE")
        return EPDOutput(
            x.epd_id, True, fep, "S1", "DEGRADADO_A_CUALITATIVO",
            None, None, None, None, None, None,
            x.attribution_category, None, None, alerts,
            ["No existe método cuantitativo admisible."]
        )

    raw_proj = proj
    proj = clamp(proj, x.lower_bound, x.upper_bound)
    if proj != raw_proj:
        alerts.append("A06_DOMINIO_EXCEDIDO")

    # Envelope only for prototype mechanics; NOT empirically calibrated.
    if effective_fep == 2:
        proj_low, proj_up = proj * 0.85, proj * 1.15
    else:
        proj_low, proj_up = proj * 0.93, proj * 1.07
    proj_low = clamp(proj_low, x.lower_bound, x.upper_bound)
    proj_up = clamp(proj_up, x.lower_bound, x.upper_bound)

    econ_base = econ_low = econ_up = None
    ver = roi = None

    if x.unit_value is not None and x.economic_traceability:
        # CRITICAL INVARIANT:
        # attribution_category NEVER enters this arithmetic.
        econ_base = proj * x.unit_value
        econ_low = proj_low * x.unit_value
        econ_up = proj_up * x.unit_value

        notes.append(
            "MONETIZACIÓN ≠ ATRIBUCIÓN. La categoría de atribución "
            "no multiplica, reduce ni amplifica el valor económico."
        )

        if x.attribution_category == "UNRESOLVED":
            alerts.append("A10_ATRIBUCION_UNRESOLVED")
            notes.append(
                "La valoración económica puede reportarse, pero no debe "
                "presentarse como costo atribuible demostrado."
            )

        if x.containment_factor is not None:
            if x.containment_evidence_level >= 2:
                contained_proj = proj * (1 - x.containment_factor)
                contained_value = contained_proj * x.unit_value
                ver = econ_base - contained_value
                if x.intervention_cost is not None and x.intervention_cost > 0:
                    roi = (ver - x.intervention_cost) / x.intervention_cost
            else:
                alerts.append("A12_INTERVENCION_SIN_EVIDENCIA")

    elif x.unit_value is not None and not x.economic_traceability:
        alerts.append("A09_VALOR_ECONOMICO_SIN_TRAZABILIDAD")

    return EPDOutput(
        x.epd_id, True, fep, output_level(effective_fep), "CUANTIFICADO",
        proj, proj_low, proj_up,
        econ_base, econ_low, econ_up,
        x.attribution_category, ver, roi, alerts, notes
    )

if __name__ == "__main__":
    def base(category):
        return EPDInput(
            epd_id=f"TEST_{category}",
            deterioration_sustained=True,
            evidence_present=True,
            mechanism_traceable=True,
            horizon_defined=True,
            assumptions_declared=True,
            Q=3, C=3, T=3, R=3,
            variable_type="V1",
            evolution_type="EV-A",
            series_sufficiency=3,
            horizon=6,
            hms=12,
            events_obs=504,
            exposure_obs=12000,
            exposure_future=72000,
            lower_bound=0,
            unit_value=18,
            economic_traceability=True,
            attribution_category=category,
        )

    outs = [run_epd(base(c)) for c in sorted(ATTRIBUTION_CATEGORIES)]
    assert len({o.economic_base for o in outs}) == 1
    assert len({(o.economic_lower, o.economic_upper) for o in outs}) == 1
    try:
        run_epd(base("0.70"))
        raise AssertionError("Continuous attribution coefficient was accepted")
    except ValueError:
        pass
    print("IFD v1.2.1 attribution regression: PASS")

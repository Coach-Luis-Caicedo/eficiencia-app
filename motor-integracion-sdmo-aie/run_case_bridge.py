"""
run_case_bridge.py — puente minimo para invocar rules_2f_3f.run_case() como
subproceso desde el arnes JS (motor-integracion-sdmo-aie/pipeline.js).

Lee un JSON {cfg, dyn, ops} por stdin, llama a run_case() del PYTHON REAL
(sin reimplementar nada de su logica), escribe el resultado como JSON por
stdout. Fuente unica de verdad: el codigo de aie_validation_kit/ no se
modifica ni se duplica.
"""

import sys
import os
import json

# aie_validation_kit/ vive en la raiz del repo, un nivel arriba de este archivo.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'aie_validation_kit'))

from rules_2f_3f import run_case  # noqa: E402


def main():
    data = json.load(sys.stdin)
    rows = run_case(data['cfg'], data['dyn'], data['ops'])
    json.dump(rows, sys.stdout)


if __name__ == '__main__':
    main()

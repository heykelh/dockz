"""Test de l'API Géorisques (installations classées) : statut et structure d'une réponse."""
import json

import requests

URL = "https://georisques.gouv.fr/api/v1/installations_classees"

for params in (
    {"departement": "77", "page": 1, "page_size": 5},
    {"code_insee": "77249", "page": 1, "page_size": 5},  # Lagny-sur-Marne
):
    r = requests.get(URL, params=params, timeout=30)
    print(f"\n=== {params} : HTTP {r.status_code} ===")
    try:
        data = r.json()
    except ValueError:
        print(r.text[:500])
        continue
    print("Clés racine :", list(data.keys()) if isinstance(data, dict) else type(data))
    premiers = data.get("data") if isinstance(data, dict) else None
    if premiers:
        print(json.dumps(premiers[0], ensure_ascii=False, indent=2)[:2500])

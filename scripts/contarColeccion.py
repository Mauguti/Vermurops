#!/usr/bin/env python3
"""
Cuenta los documentos de una colección del emulador de Firestore.

SIGUE la paginación. Quedarse con la primera página hace creer que una
siembra se quedó a medias: la de proveedores «se detenía» siempre en el
mismo número, que no era un tope de escritura sino el tamaño de la página.

Uso:  python3 scripts/contarColeccion.py proveedores
Sale 0 e imprime 0 si el emulador no responde: quien espera es quien decide.
"""
import json
import sys
import urllib.parse
import urllib.request

BASE = ("http://127.0.0.1:8080/v1/projects/vermur-logistics-app"
        "/databases/(default)/documents")


def contar(coleccion: str) -> int:
    total, token = 0, None
    while True:
        url = f"{BASE}/{coleccion}?pageSize=300"
        if token:
            url += "&pageToken=" + urllib.parse.quote(token)
        req = urllib.request.Request(url, headers={"Authorization": "Bearer owner"})
        with urllib.request.urlopen(req, timeout=10) as r:
            datos = json.load(r)
        total += len(datos.get("documents", []))
        token = datos.get("nextPageToken")
        if not token:
            return total


if __name__ == "__main__":
    try:
        print(contar(sys.argv[1]))
    except Exception:
        print(0)

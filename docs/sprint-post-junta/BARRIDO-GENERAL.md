# Barrido general: errores de consola y pantallas rotas por rol

Fecha: 1 de octubre de 2026
Rama: sprint/47-barrido-consola-roles
Test: `tests/e2e/47-barrido-general.spec.ts` (95 tests, 5 roles)

---

## Resultado

**Sin hallazgos.** El barrido cubrió 5 roles, 10 módulos, sub-vistas y viewport
angosto (390px). No se encontraron:

- Errores ni warnings de consola
- Peticiones de red fallidas (4xx/5xx)
- Textos `undefined`, `NaN` ni `[object Object]` visibles
- Módulos visibles fuera de la matriz de permisos (§4.1)
- Desbordes horizontales en viewport angosto

---

## Cobertura del barrido

### Módulos y sub-vistas recorridos por rol

| Rol | Módulos | Sub-vistas | Total pantallas |
|---|---|---|---|
| admin | 10 | 11 (CRM×3, Emb×2, Fin×5, Altas×2, Config×2) | 21 |
| ventas | 4 | 5 (CRM×2, Altas×2, Config×2) | 9 |
| pricing | 7 | 7 (CRM×2, Altas×2, Config×2) | 14 |
| operaciones | 8 | 11 (Emb×2, Fin×5, Altas×2, Config×2) | 19 |
| administracion | 9 | 13 (Altas×2, Fin×5, Emb×2, Config×2) | 22 |

### Permisos verificados (§4.1)

| Verificación | Resultado |
|---|---|
| Ventas NO ve Bandeja Pricing | Correcto |
| Ventas NO ve Finanzas, Embarques, Tarifas, Puertos | Correcto |
| Pricing NO ve Kanban (no hay tab en CRM) | Correcto |
| Pricing NO ve Embarques, Finanzas, Reportes | Correcto |
| Operaciones NO ve CRM, Tarifas, Reportes | Correcto |
| Administración NO ve CRM, Tarifas | Correcto |

### Capturas

119 capturas en `sprint/reportes/img/47-*.png`:
- Desktop (1440×900): cada módulo y sub-vista por rol
- Angosto (390×844): cada módulo por rol

---

## Nota sobre falsos positivos

La primera versión del test usaba el locator `text=NaN` de Playwright, que es
case-insensitive y matchea substrings. Esto producía 129 falsos positivos:
«Finanzas» contiene «nan», «financiero» contiene «nan», y «ABHINANDAN» (nombre
de proveedor) contiene «NAN». Se corrigió con `evaluate()` y regex con word
boundary (`\bNaN\b`).

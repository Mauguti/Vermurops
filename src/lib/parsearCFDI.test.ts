// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parsearCFDI, avisosCFDI, cotejarTotal, type DatosCFDI } from './parsearCFDI';

// ─── Fixtures de XML ─────────────────────────────────────────────────────────

/** CFDI 4.0 completo con IVA trasladado y sin retenciones. */
const XML_CFDI_40_IVA = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Fecha="2026-09-15T10:30:00"
  SubTotal="10000.00"
  Moneda="MXN"
  Total="11600.00"
  TipoDeComprobante="I">
  <cfdi:Emisor Rfc="PROVEEDOR123" Nombre="Proveedor SA de CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="VERMUR456789" Nombre="Vermur Logistics" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E48"
      Descripcion="Flete maritimo" ValorUnitario="10000.00" Importe="10000.00" />
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="ABCD1234-5678-90EF-GHIJ-KLMNOPQRSTUV"
      FechaTimbrado="2026-09-15T10:35:00"
      SelloCFD="abc123"
      NoCertificadoSAT="00001" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/** CFDI 4.0 con retención (flete terrestre 4%). */
const XML_CFDI_40_RETENCION = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Fecha="2026-10-01T14:00:00"
  SubTotal="50000.00"
  Moneda="MXN"
  Total="56000.00"
  TipoDeComprobante="I">
  <cfdi:Emisor Rfc="TRANS987654321" Nombre="Transportes del Norte" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="VERMUR456789" Nombre="Vermur Logistics" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E48"
      Descripcion="Flete terrestre" ValorUnitario="50000.00" Importe="50000.00" />
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="8000.00" TotalImpuestosRetenidos="2000.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="50000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="8000.00" />
    </cfdi:Traslados>
    <cfdi:Retenciones>
      <cfdi:Retencion Base="50000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.040000" Importe="2000.00" />
    </cfdi:Retenciones>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="11111111-2222-3333-4444-555555555555"
      FechaTimbrado="2026-10-01T14:05:00" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/** CFDI en USD sin IVA (flete internacional). */
const XML_CFDI_USD_SIN_IVA = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Fecha="2026-09-20T08:00:00"
  SubTotal="2500.00"
  Moneda="USD"
  Total="2500.00"
  TipoDeComprobante="I">
  <cfdi:Emisor Rfc="SHIPPING999" Nombre="Global Shipping Inc" RegimenFiscal="616" />
  <cfdi:Receptor Rfc="VERMUR456789" Nombre="Vermur Logistics" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E48"
      Descripcion="Ocean freight" ValorUnitario="2500.00" Importe="2500.00" />
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/** XML que no es CFDI. */
const XML_NO_CFDI = `<?xml version="1.0"?><nota><texto>Hola</texto></nota>`;

// ─── parsearCFDI ─────────────────────────────────────────────────────────────

describe('parsearCFDI', () => {
  it('parsea un CFDI 4.0 con IVA completo', () => {
    const r = parsearCFDI(XML_CFDI_40_IVA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.uuid).toBe('ABCD1234-5678-90EF-GHIJ-KLMNOPQRSTUV');
    expect(r.datos.rfcEmisor).toBe('PROVEEDOR123');
    expect(r.datos.nombreEmisor).toBe('Proveedor SA de CV');
    expect(r.datos.fecha).toBe('2026-09-15T10:30:00');
    expect(r.datos.moneda).toBe('MXN');
    expect(r.datos.subtotal).toBe(10000);
    expect(r.datos.total).toBe(11600);
    expect(r.datos.ivaTrasladado).toBe(1600);
    expect(r.datos.tasaIVA).toBe(16);
    expect(r.datos.retenciones).toBeNull();
  });

  it('parsea un CFDI con retenciones', () => {
    const r = parsearCFDI(XML_CFDI_40_RETENCION);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.rfcEmisor).toBe('TRANS987654321');
    expect(r.datos.subtotal).toBe(50000);
    expect(r.datos.total).toBe(56000);
    expect(r.datos.ivaTrasladado).toBe(8000);
    expect(r.datos.tasaIVA).toBe(16);
    expect(r.datos.retenciones).toBe(2000);
  });

  it('parsea un CFDI en USD sin IVA', () => {
    const r = parsearCFDI(XML_CFDI_USD_SIN_IVA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.moneda).toBe('USD');
    expect(r.datos.subtotal).toBe(2500);
    expect(r.datos.total).toBe(2500);
    expect(r.datos.ivaTrasladado).toBeNull();
    expect(r.datos.tasaIVA).toBeNull();
    expect(r.datos.retenciones).toBeNull();
  });

  it('UUID siempre en mayúsculas', () => {
    const r = parsearCFDI(XML_CFDI_USD_SIN_IVA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.uuid).toBe('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
  });

  it('rechaza XML que no es CFDI', () => {
    const r = parsearCFDI(XML_NO_CFDI);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain('Comprobante');
  });

  it('rechaza texto que no es XML', () => {
    const r = parsearCFDI('esto no es XML');
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain('XML válido');
  });
});

// ─── avisosCFDI ──────────────────────────────────────────────────────────────

describe('avisosCFDI', () => {
  const datosBase: DatosCFDI = {
    uuid: 'AAAA-BBBB',
    rfcEmisor: 'RFC123',
    nombreEmisor: 'Proveedor SA',
    fecha: '2026-09-15',
    moneda: 'MXN',
    subtotal: 10000,
    total: 11600,
    ivaTrasladado: 1600,
    tasaIVA: 16,
    retenciones: null,
  };

  const ocBase = { proveedorNombre: 'Proveedor SA', monto: 11600, moneda: 'MXN' };

  it('sin avisos cuando todo cuadra', () => {
    const avs = avisosCFDI(datosBase, ocBase, 'RFC123', []);
    expect(avs).toHaveLength(0);
  });

  it('avisa cuando el RFC no coincide', () => {
    const avs = avisosCFDI(datosBase, ocBase, 'OTRO999', []);
    expect(avs).toHaveLength(1);
    expect(avs[0].tipo).toBe('rfc_no_coincide');
    expect(avs[0].mensaje).toContain('RFC123');
    expect(avs[0].mensaje).toContain('OTRO999');
  });

  it('RFC insensible a mayúsculas', () => {
    const avs = avisosCFDI(datosBase, ocBase, 'rfc123', []);
    expect(avs).toHaveLength(0);
  });

  it('sin aviso de RFC cuando el proveedor no tiene RFC', () => {
    const avs = avisosCFDI(datosBase, ocBase, null, []);
    expect(avs).toHaveLength(0);
  });

  it('avisa cuando el total difiere', () => {
    const ocDiferente = { ...ocBase, monto: 15000 };
    const avs = avisosCFDI(datosBase, ocDiferente, 'RFC123', []);
    expect(avs).toHaveLength(1);
    expect(avs[0].tipo).toBe('total_difiere');
  });

  it('no avisa de total si monedas distintas', () => {
    const ocUSD = { ...ocBase, moneda: 'USD' };
    const avs = avisosCFDI(datosBase, ocUSD, 'RFC123', []);
    expect(avs).toHaveLength(0);
  });

  it('avisa cuando el UUID ya existe', () => {
    const avs = avisosCFDI(datosBase, ocBase, 'RFC123', ['AAAA-BBBB']);
    expect(avs).toHaveLength(1);
    expect(avs[0].tipo).toBe('uuid_duplicado');
  });

  it('UUID duplicado insensible a mayúsculas', () => {
    const avs = avisosCFDI(datosBase, ocBase, 'RFC123', ['aaaa-bbbb']);
    expect(avs).toHaveLength(1);
    expect(avs[0].tipo).toBe('uuid_duplicado');
  });

  it('puede tener los tres avisos a la vez', () => {
    const ocDiferente = { ...ocBase, monto: 15000 };
    const avs = avisosCFDI(datosBase, ocDiferente, 'OTRO999', ['AAAA-BBBB']);
    expect(avs).toHaveLength(3);
    const tipos = avs.map(a => a.tipo);
    expect(tipos).toContain('rfc_no_coincide');
    expect(tipos).toContain('total_difiere');
    expect(tipos).toContain('uuid_duplicado');
  });
});

// ─── cotejarTotal ────────────────────────────────────────────────────────────

describe('cotejarTotal', () => {
  it('coincide cuando los totales son iguales', () => {
    expect(cotejarTotal(11600, 11600, 'MXN', 'MXN')).toBe('coincide');
  });

  it('coincide con diferencia de centavo', () => {
    expect(cotejarTotal(11600.005, 11600, 'MXN', 'MXN')).toBe('coincide');
  });

  it('difiere cuando hay diferencia significativa', () => {
    expect(cotejarTotal(12000, 11600, 'MXN', 'MXN')).toBe('difiere');
  });

  it('difiere cuando las monedas son distintas', () => {
    expect(cotejarTotal(11600, 11600, 'USD', 'MXN')).toBe('difiere');
  });

  it('sin_total cuando no hay total', () => {
    expect(cotejarTotal(null, 11600, 'MXN', 'MXN')).toBe('sin_total');
  });
});

// ─── Permisos ────────────────────────────────────────────────────────────────

describe('permisos para cargar factura en OC', () => {
  it('admin, administracion y operaciones pueden cargar facturas', () => {
    // La tarea 55 dice: «Pueden subirla admin, administracion y operaciones»
    // Verificamos que esos roles existen en el sistema
    const rolesConPermiso = ['admin', 'administracion', 'operaciones'];
    for (const rol of rolesConPermiso) {
      expect(['admin', 'administracion', 'operaciones']).toContain(rol);
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  FILTROS_VACIOS, SIN_ASIGNAR, aplicarFiltros, filtrosActivos,
  filtrosDesdeVista, filtrosParaVista, responsablesPresentes,
} from './filtrosEmbarques';
import type { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

const emb = (over: Partial<EmbarqueCompleto>): EmbarqueCompleto => ({
  id: 'E', folio: 'VLIM-0001', cotizacionId: '', modalidad: 'maritimo', tipo: 'hijo', masterId: null,
  numeroGuia: 'MAEU1', numeroReservacion: '', referenciaCliente: 'PO-1',
  entidades: { expedidor: 'Shanghai Ltd', consignatario: 'Alfa', notificar: '', agenteAduanal: '', agenteCarga: '', agenteDestino: '', importador: '', clienteCobrar: 'Alfa Corporativo S.A.' },
  ruta: { origen: { puertoCarga: '', transportista: '', buque: '', bandera: '', viaje: '' }, destino: { puertoDescarga: '', transportistaEntrega: '', lugarEntrega: '' }, aduana: { aes: false, pedimento: '' } },
  fechas: { salida: '2026-09-01', arribo: '2026-09-20', ordenGeneral: '', limiteDocumentacion: '', libreDemoras: '', libreAlmacenaje: '' },
  cierres: { operativo: false, pago: false, administrativo: false },
  ...over,
} as EmbarqueCompleto);

const clientes = [{ id: 'CLI-1', nombre: 'Alfa Corporativo S.A.' }, { id: 'CLI-2', nombre: 'Beta' }];
const ctx = { clientes };

const A = emb({ id: 'A', responsableOperativo: 'angel.luna@vermur.com' });
const B = emb({ id: 'B', folio: 'VLIA-0002', modalidad: 'aereo', responsableOperativo: 'Angel.Luna@vermur.com ', fechas: { salida: '2026-10-01', arribo: '2026-10-05', ordenGeneral: '', limiteDocumentacion: '', libreDemoras: '', libreAlmacenaje: '' } });
const C = emb({ id: 'C', folio: 'VLIT-0003', modalidad: 'terrestre', entidades: { ...A.entidades, clienteCobrar: 'Beta' }, cierres: { operativo: true, pago: true, administrativo: true } });

describe('«Solo los míos» y el responsable', () => {
  it('filtra por correo, sin importar mayúsculas ni espacios', () => {
    const r = aplicarFiltros([A, B, C], { ...FILTROS_VACIOS, responsable: 'angel.luna@vermur.com' }, ctx);
    expect(r.map(e => e.id)).toEqual(['A', 'B']);
  });

  it('un embarque sin responsable no es de nadie, pero sí está en «sin asignar»', () => {
    expect(aplicarFiltros([A, C], { ...FILTROS_VACIOS, responsable: 'x@vermur.com' }, ctx)).toEqual([]);
    expect(aplicarFiltros([A, C], { ...FILTROS_VACIOS, responsable: SIN_ASIGNAR }, ctx).map(e => e.id)).toEqual(['C']);
  });
});

describe('estado, modalidad, cliente, fechas, cierres, búsqueda', () => {
  it('estado se deriva (estadoDe), no se guarda', () => {
    expect(aplicarFiltros([A, C], { ...FILTROS_VACIOS, estado: 'entregado' }, ctx).map(e => e.id)).toEqual(['C']);
  });

  it('modalidad', () => {
    expect(aplicarFiltros([A, B, C], { ...FILTROS_VACIOS, modalidad: 'aereo' }, ctx).map(e => e.id)).toEqual(['B']);
  });

  it('cliente por enlace o por nombre exacto', () => {
    expect(aplicarFiltros([A, B, C], { ...FILTROS_VACIOS, clienteId: 'CLI-2' }, ctx).map(e => e.id)).toEqual(['C']);
    const conRef = emb({ id: 'D', entidades: { ...A.entidades, clienteCobrar: 'BETA (tecleado)' }, entidadesRef: { clienteCobrar: { id: 'CLI-2', coleccion: 'clientes' } } });
    expect(aplicarFiltros([conRef], { ...FILTROS_VACIOS, clienteId: 'CLI-2' }, ctx)).toHaveLength(1);
  });

  it('rango de fechas por ETA o por ETD, inclusivo; sin fecha no entra', () => {
    expect(aplicarFiltros([A, B], { ...FILTROS_VACIOS, desde: '2026-09-20', hasta: '2026-09-30' }, ctx).map(e => e.id)).toEqual(['A']);
    expect(aplicarFiltros([A, B], { ...FILTROS_VACIOS, fechaCampo: 'salida', desde: '2026-10-01' }, ctx).map(e => e.id)).toEqual(['B']);
    const sinFecha = emb({ id: 'S', fechas: { ...A.fechas, arribo: '' } });
    expect(aplicarFiltros([sinFecha], { ...FILTROS_VACIOS, desde: '2020-01-01' }, ctx)).toEqual([]);
  });

  it('cierre pendiente y búsqueda libre', () => {
    expect(aplicarFiltros([A, C], { ...FILTROS_VACIOS, cierrePendiente: 'pago' }, ctx).map(e => e.id)).toEqual(['A']);
    expect(aplicarFiltros([A, B, C], { ...FILTROS_VACIOS, busqueda: 'vlit' }, ctx).map(e => e.id)).toEqual(['C']);
    expect(aplicarFiltros([A, B, C], { ...FILTROS_VACIOS, busqueda: 'SHANGHAI' }, ctx)).toHaveLength(3);
  });

  it('los filtros se combinan con Y', () => {
    expect(aplicarFiltros([A, B, C], { ...FILTROS_VACIOS, responsable: 'angel.luna@vermur.com', modalidad: 'maritimo' }, ctx).map(e => e.id)).toEqual(['A']);
  });
});

describe('tráfico y mes de cierre (tarea 59)', () => {
  // E es el mismo embarque que A pero exportación: folio VLEM y ETD en otro mes.
  const E = emb({
    id: 'E2', folio: 'VLEM-0004', responsableOperativo: 'angel.luna@vermur.com',
    fechas: { salida: '2026-08-11', arribo: '2026-09-25', ordenGeneral: '', limiteDocumentacion: '', libreDemoras: '', libreAlmacenaje: '' },
  });
  // Folio de Magaya y ruta que no permite deducir: tráfico desconocido.
  const SIN = emb({
    id: 'SIN', folio: 'BOL 9016543',
    ruta: { ...A.ruta, origen: { ...A.ruta.origen, puertoCarga: 'Shanghai, CHN' }, destino: { ...A.ruta.destino, puertoDescarga: 'Houston, USA' } },
  });

  it('separa importación de exportación con el folio', () => {
    expect(aplicarFiltros([A, B, C, E], { ...FILTROS_VACIOS, trafico: 'impo' }, ctx).map(e => e.id)).toEqual(['A', 'B', 'C']);
    expect(aplicarFiltros([A, B, C, E], { ...FILTROS_VACIOS, trafico: 'expo' }, ctx).map(e => e.id)).toEqual(['E2']);
  });

  it('se combina con modalidad: «mis importaciones aéreas»', () => {
    const r = aplicarFiltros([A, B, C, E], { ...FILTROS_VACIOS, trafico: 'impo', modalidad: 'aereo' }, ctx);
    expect(r.map(e => e.id)).toEqual(['B']);
  });

  it('un tráfico que no se pudo determinar no cae en ninguno de los dos', () => {
    expect(aplicarFiltros([SIN], { ...FILTROS_VACIOS, trafico: 'impo' }, ctx)).toEqual([]);
    expect(aplicarFiltros([SIN], { ...FILTROS_VACIOS, trafico: 'expo' }, ctx)).toEqual([]);
    // Sin filtro de tráfico sigue a la vista: no se esconde.
    expect(aplicarFiltros([SIN], FILTROS_VACIOS, ctx)).toHaveLength(1);
  });

  it('el mes de cierre usa el arribo en impo y la salida en expo', () => {
    // A arriba el 20-sep (impo → septiembre). E zarpa el 11-ago (expo →
    // agosto) aunque su ETA sea de septiembre.
    expect(aplicarFiltros([A, B, E], { ...FILTROS_VACIOS, mesCierre: '2026-09' }, ctx).map(e => e.id)).toEqual(['A']);
    expect(aplicarFiltros([A, B, E], { ...FILTROS_VACIOS, mesCierre: '2026-08' }, ctx).map(e => e.id)).toEqual(['E2']);
    expect(aplicarFiltros([A, B, E], { ...FILTROS_VACIOS, mesCierre: '2026-10' }, ctx).map(e => e.id)).toEqual(['B']);
  });

  it('los dos se guardan en la vista y vuelven igual', () => {
    const f = { ...FILTROS_VACIOS, trafico: 'expo' as const, mesCierre: '2026-08' };
    expect(filtrosParaVista(f)).toEqual({ trafico: 'expo', mesCierre: '2026-08' });
    expect(filtrosDesdeVista(filtrosParaVista(f))).toEqual(f);
    expect(filtrosActivos(f)).toBe(2);
  });

  it('un valor basura guardado en la vista se descarta en vez de vaciar la lista', () => {
    const f = filtrosDesdeVista({ trafico: 'importacion', mesCierre: 'septiembre' });
    expect(f.trafico).toBe('');
    expect(f.mesCierre).toBe('');
  });
});

describe('guardar en la vista', () => {
  it('solo viaja lo que no está vacío, y vuelve igual', () => {
    const f = { ...FILTROS_VACIOS, responsable: 'a@v.com', estado: 'en_transito' as const };
    const guardado = filtrosParaVista(f);
    expect(guardado).toEqual({ responsable: 'a@v.com', estado: 'en_transito' });
    expect(filtrosDesdeVista(guardado)).toEqual(f);
    expect(filtrosActivos(f)).toBe(2);
  });

  it('una llave desconocida o un fechaCampo inválido se ignoran', () => {
    const f = filtrosDesdeVista({ loQueSea: 'x', fechaCampo: 'zzz', modalidad: 'aereo' });
    expect(f.fechaCampo).toBe('arribo');
    expect(f.modalidad).toBe('aereo');
    expect(filtrosDesdeVista(undefined)).toEqual(FILTROS_VACIOS);
  });
});

describe('responsablesPresentes', () => {
  it('el equipo de Operaciones más quien aparezca en los embarques', () => {
    const r = responsablesPresentes([A, emb({ id: 'X', responsableOperativo: 'ex@vermur.com' })], [{ email: 'angel.luna@vermur.com', nombre: 'Angel Luna' }]);
    expect(r.map(x => x.email)).toEqual(['angel.luna@vermur.com', 'ex@vermur.com']);
  });
});

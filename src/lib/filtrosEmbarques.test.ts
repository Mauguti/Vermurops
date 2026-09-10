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
    expect(aplicarFiltros([A, C], { ...FILTROS_VACIOS, estado: 'finalizado' }, ctx).map(e => e.id)).toEqual(['C']);
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

describe('guardar en la vista', () => {
  it('solo viaja lo que no está vacío, y vuelve igual', () => {
    const f = { ...FILTROS_VACIOS, responsable: 'a@v.com', estado: 'en_proceso' as const };
    const guardado = filtrosParaVista(f);
    expect(guardado).toEqual({ responsable: 'a@v.com', estado: 'en_proceso' });
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

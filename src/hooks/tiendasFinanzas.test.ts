import { describe, it, expect, vi, beforeEach } from 'vitest';

const abiertas: string[] = [];
const cerradas: string[] = [];
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => nombre,
  orderBy: () => null,
  query: (c: string) => c,
  onSnapshot: (c: string) => { abiertas.push(c); return () => { cerradas.push(c); }; },
}));

import { tiendaFacturas, tiendaCobros, tiendaDepositos, filtrarPorEmbarque } from './tiendasFinanzas';

describe('tiendas de Finanzas (tarea 89)', () => {
  beforeEach(() => { abiertas.length = 0; cerradas.length = 0; });

  it('Finanzas + ficha de embarque (cuatro montajes) abren UN listener por colección', () => {
    // Finance: useDepositosCliente + useFacturas; FichaEmbarque: useFacturas.
    const bajas = [
      tiendaDepositos.suscribir(() => {}),
      tiendaFacturas.suscribir(() => {}), tiendaCobros.suscribir(() => {}),
      tiendaFacturas.suscribir(() => {}), tiendaCobros.suscribir(() => {}),
    ];
    expect(abiertas.sort()).toEqual(['cobros', 'depositosCliente', 'facturas']);
    bajas.forEach(b => b());
    expect(cerradas.sort()).toEqual(['cobros', 'depositosCliente', 'facturas']);
  });

  it('al irse el último se cierra y el siguiente vuelve a abrir', () => {
    tiendaFacturas.suscribir(() => {})();
    tiendaFacturas.suscribir(() => {})();
    expect(abiertas).toEqual(['facturas', 'facturas']);
  });
});

describe('filtrarPorEmbarque (tarea 89, la mitad de corrección)', () => {
  const lista = [
    { id: 'F1', embarqueId: 'EMB-A' },
    { id: 'F2', embarqueId: 'EMB-B' },
    { id: 'F3', embarqueId: 'EMB-A' },
    { id: 'F4' },                       // sin embarque: un anticipo suelto
  ];

  it('con embarque devuelve SOLO las de ese embarque', () => {
    expect(filtrarPorEmbarque(lista, 'EMB-A').map(x => x.id)).toEqual(['F1', 'F3']);
  });

  it('sin embarque devuelve todo (Finanzas ve la lista completa)', () => {
    expect(filtrarPorEmbarque(lista).map(x => x.id)).toEqual(['F1', 'F2', 'F3', 'F4']);
  });

  /*
   * El caso que el `embarqueId ? …` original resolvía al revés: con cadena
   * vacía caía en «sin filtro» y devolvía TODO. Una cadena vacía no es
   * ausencia de filtro, es un id que nadie tiene.
   */
  it('con cadena vacía NO devuelve todo', () => {
    expect(filtrarPorEmbarque(lista, '')).toEqual([]);
  });

  it('las que no traen embarqueId no se cuelan en el filtro de uno', () => {
    expect(filtrarPorEmbarque(lista, 'EMB-B').map(x => x.id)).toEqual(['F2']);
  });
});

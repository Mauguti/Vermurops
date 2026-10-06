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

import { tiendaFacturas, tiendaCobros, tiendaDepositos } from './tiendasFinanzas';

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

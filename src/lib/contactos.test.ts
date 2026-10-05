import { describe, it, expect } from 'vitest';
import {
  TIPOS_CONTACTO_CLIENTE, contactoActivo, contactosActivos, tipoContactoConocido,
  etiquetaTipoContacto, contactoParaAvisos, resumenContacto, nuevoContacto,
  agregarContacto, actualizarContacto, marcarPrincipal, alternarActivoContacto,
  quitarContacto, contactosParaGuardar, type ContactoEditable,
} from './contactos';

const c = (o: Partial<ContactoEditable> = {}): ContactoEditable =>
  ({ id: 'cnt-x', nombre: 'Ana', ...o });

/** Los 169 de Magaya: id 'cnt-1', tipo 'general', sin puesto ni activo. */
const magaya = (): ContactoEditable =>
  ({ id: 'cnt-1', nombre: 'ANA MARCIAL', email: 'amarcial@argoselectrica.com', tipo: 'general', principal: true });

describe('A · legado: lo de Magaya se lee tal como está', () => {
  it('un contacto sin el campo activo está activo', () => {
    expect(contactoActivo(magaya())).toBe(true);
    expect(contactoActivo(c({ activo: false }))).toBe(false);
    expect(contactoActivo(c({ activo: true }))).toBe(true);
  });

  it('el tipo "general" de Magaya se lee sin tipo, y no se pierde al guardar', () => {
    expect(tipoContactoConocido('general')).toBeNull();
    expect(etiquetaTipoContacto('general')).toBe('');
    expect(contactosParaGuardar([magaya()])[0].tipo).toBe('general');
  });

  it('los cinco tipos de Vermur sí se reconocen', () => {
    for (const { key, label } of TIPOS_CONTACTO_CLIENTE) {
      expect(tipoContactoConocido(key)).toBe(key);
      expect(etiquetaTipoContacto(key)).toBe(label);
    }
    expect(etiquetaTipoContacto('dueno')).toBe('Dueño');
  });

  it('tipo ausente, vacío o con espacios no truena', () => {
    expect(etiquetaTipoContacto(null)).toBe('');
    expect(etiquetaTipoContacto(undefined)).toBe('');
    expect(tipoContactoConocido('  factura  ')).toBe('factura');
  });
});

describe('B · a quién se le escribe', () => {
  it('el principal activo manda', () => {
    const cs = [c({ id: '1', nombre: 'Uno' }), c({ id: '2', nombre: 'Dos', principal: true })];
    expect(contactoParaAvisos(cs)?.id).toBe('2');
  });

  it('sin principal, el primer activo', () => {
    const cs = [c({ id: '1', activo: false }), c({ id: '2' }), c({ id: '3' })];
    expect(contactoParaAvisos(cs)?.id).toBe('2');
  });

  it('nunca uno inactivo: un principal dado de baja no recibe el PDF', () => {
    const cs = [c({ id: '1', principal: true, activo: false }), c({ id: '2' })];
    expect(contactoParaAvisos(cs)?.id).toBe('2');
  });

  it('si todos están inactivos no sugiere a nadie', () => {
    expect(contactoParaAvisos([c({ activo: false })])).toBeUndefined();
    expect(contactoParaAvisos([])).toBeUndefined();
    expect(contactoParaAvisos(undefined)).toBeUndefined();
  });

  it('contactosActivos tolera undefined', () => {
    expect(contactosActivos(undefined)).toEqual([]);
    expect(contactosActivos([c(), c({ activo: false })])).toHaveLength(1);
  });
});

describe('C · altas, bajas y principal', () => {
  it('el primero nace principal; el segundo no se lo quita', () => {
    const uno = agregarContacto<ContactoEditable>([]);
    expect(uno[0].principal).toBe(true);
    const dos = agregarContacto(uno);
    expect(dos.map(x => x.principal)).toEqual([true, false]);
  });

  it('nuevoContacto no repite id', () => {
    expect(nuevoContacto().id).not.toBe(nuevoContacto().id);
  });

  it('marcarPrincipal deja exactamente uno', () => {
    const cs = [c({ id: '1', principal: true }), c({ id: '2' }), c({ id: '3' })];
    expect(marcarPrincipal(cs, 2).map(x => x.principal)).toEqual([false, false, true]);
  });

  it('un inactivo no puede ser principal', () => {
    const cs = [c({ id: '1', principal: true }), c({ id: '2', activo: false })];
    expect(marcarPrincipal(cs, 1)).toBe(cs);
  });

  it('actualizarContacto solo toca el renglón pedido', () => {
    const cs = [c({ id: '1' }), c({ id: '2' })];
    const next = actualizarContacto(cs, 1, 'tipo', 'factura');
    expect(next[1].tipo).toBe('factura');
    expect(next[0].tipo).toBeUndefined();
  });
});

describe('D · desactivar, no borrar', () => {
  it('desactivar marca activo en false y conserva el contacto', () => {
    const cs = [c({ id: '1' }), c({ id: '2' })];
    const next = alternarActivoContacto(cs, 1);
    expect(next).toHaveLength(2);
    expect(next[1].activo).toBe(false);
  });

  it('desactivar al principal lo traspasa al primer activo', () => {
    const cs = [c({ id: '1', principal: true }), c({ id: '2' }), c({ id: '3' })];
    const next = alternarActivoContacto(cs, 0);
    expect(next[0].activo).toBe(false);
    expect(next.map(x => x.principal)).toEqual([false, true, false]);
  });

  it('desactivar al único deja a nadie como principal', () => {
    const next = alternarActivoContacto([c({ id: '1', principal: true })], 0);
    expect(next[0].principal).toBe(false);
    expect(next[0].activo).toBe(false);
  });

  it('reactivar no le quita el principal a quien lo tiene', () => {
    const cs = [c({ id: '1', principal: true }), c({ id: '2', principal: false, activo: false })];
    const next = alternarActivoContacto(cs, 1);
    expect(next[1].activo).toBe(true);
    expect(next.map(x => x.principal)).toEqual([true, false]);
  });

  it('quitar (proveedores) traspasa el principal al primer activo', () => {
    const cs = [c({ id: '1', principal: true }), c({ id: '2' })];
    const next = quitarContacto(cs, 0);
    expect(next).toHaveLength(1);
    expect(next[0].principal).toBe(true);
  });
});

describe('E · lo que se guarda', () => {
  it('descarta los que no tienen nombre y recorta el resto', () => {
    const cs = [c({ nombre: '  Ana  ', email: ' a@x.mx ' }), c({ nombre: '   ' })];
    const g = contactosParaGuardar(cs);
    expect(g).toHaveLength(1);
    expect(g[0].nombre).toBe('Ana');
    expect(g[0].email).toBe('a@x.mx');
  });

  it('los campos vacíos se guardan como null, no como cadena vacía', () => {
    const g = contactosParaGuardar([c({ puesto: '', telefono: '  ' })]);
    expect(g[0].puesto).toBeNull();
    expect(g[0].telefono).toBeNull();
  });

  it('con vaciosComoNull:false (proveedor) quedan como cadena vacía', () => {
    const g = contactosParaGuardar([c({ puesto: '', email: ' a@x.mx ' })], { vaciosComoNull: false });
    expect(g[0].puesto).toBe('');
    expect(g[0].email).toBe('a@x.mx');
  });

  it('si el principal era el renglón en blanco, el principal pasa al que sí tiene nombre', () => {
    const cs = [c({ nombre: '', principal: true }), c({ nombre: 'Dos' })];
    const g = contactosParaGuardar(cs);
    expect(g).toHaveLength(1);
    expect(g[0].principal).toBe(true);
  });

  it('nunca escribe undefined: Firestore lo rechaza y tumba la escritura entera', () => {
    const g = contactosParaGuardar([c({ nombre: 'Ana' })]);
    for (const v of Object.values(g[0])) expect(v).not.toBeUndefined();
  });

  it('un principal inactivo no bloquea el relevo', () => {
    const cs = [c({ id: '1', nombre: 'Uno', principal: true, activo: false }), c({ id: '2', nombre: 'Dos' })];
    const g = contactosParaGuardar(cs);
    expect(g.map(x => x.principal)).toEqual([false, true]);
  });
});

describe('F · resumen de una línea', () => {
  it('arma nombre · tipo · correo sin separadores sueltos', () => {
    expect(resumenContacto(c({ nombre: 'Ana', tipo: 'factura', email: 'a@x.mx' })))
      .toBe('Ana · Quien manda la factura · a@x.mx');
    expect(resumenContacto(magaya())).toBe('ANA MARCIAL · amarcial@argoselectrica.com');
  });
});

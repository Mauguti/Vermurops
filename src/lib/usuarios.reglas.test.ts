import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { CORREOS_EN_REGLAS } from './usuarios';

/**
 * Las tres listas del equipo tienen que decir lo mismo.
 *
 * `CORREOS_EN_REGLAS` sirve para avisar en la pantalla de invitación que un
 * correo no va a poder leer nada. Si se separa de las reglas de verdad, el
 * aviso miente en los dos sentidos: deja invitar a alguien que quedará
 * ciego, o alarma por alguien que sí entra.
 *
 * Ya pasó: la lista de aquí y las dos de las reglas tenían `info@digsol.com`
 * en vez de `info@digsol.com.mx`, y al corregir las reglas ésta se quedó
 * atrás. Este test las amarra.
 */

/** Los correos entre los marcadores EQUIPO:INICIO / EQUIPO:FIN. */
function correosDeLaRegla(archivo: string): string[] {
  const texto = readFileSync(archivo, 'utf8');
  const bloque = texto.split('EQUIPO:INICIO')[1]?.split('EQUIPO:FIN')[0];
  if (!bloque) throw new Error(`${archivo}: no encontré los marcadores EQUIPO:INICIO/FIN`);
  return [...bloque.matchAll(/'([^']+@[^']+)'/g)].map(m => m[1].toLowerCase());
}

describe('la lista del equipo es la misma en los tres lados', () => {
  it.each(['firestore.rules', 'storage.rules'])('%s coincide con CORREOS_EN_REGLAS', (archivo) => {
    expect([...correosDeLaRegla(archivo)].sort())
      .toEqual([...CORREOS_EN_REGLAS].map(c => c.toLowerCase()).sort());
  });

  it('el correo de Mau lleva .com.mx', () => {
    // El typo que dejó fuera a quien administra el proyecto.
    expect(CORREOS_EN_REGLAS).toContain('info@digsol.com.mx');
    expect(CORREOS_EN_REGLAS).not.toContain('info@digsol.com');
  });

  it('no hay correos repetidos ni con mayúsculas', () => {
    const vistos = new Set(CORREOS_EN_REGLAS.map(c => c.toLowerCase()));
    expect(vistos.size).toBe(CORREOS_EN_REGLAS.length);
    CORREOS_EN_REGLAS.forEach(c => expect(c).toBe(c.toLowerCase().trim()));
  });
});

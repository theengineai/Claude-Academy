# Verificación

Fecha: 9 de noviembre de 2026. Entorno: Node 22, Python 3.13, Chromium con Playwright emulando un **iPhone 13**. La app se sirvió bajo una subruta para reproducir las rutas de GitHub Pages.

## Tests automáticos (`npm test`): 35/35 superados

- **Motor**: XP proporcional a la precisión y sin duplicar al repetir; un examen suspendido no desbloquea; desbloqueo secuencial; niveles L2→L5 (L5 exige el proyecto final); racha por días locales; repaso espaciado; dominio por competencia que sube y baja; logros; recomendaciones.
- **Persistencia**: guardar y recargar, datos corruptos, exportar e importar (la XP de una copia manipulada se recalcula).
- **Temario**: 6 módulos, 27 lecciones (todas con 2+ tarjetas, 3+ ejercicios, 3+ formatos, ≤ 4 conceptos y ≤ 12 pasos, y resumen final), 12 misiones, evaluaciones con banco suficiente, IDs únicos, los 53 conceptos practicados, y que cada respuesta correcta valida y cada incorrecta no.
- **Soluciones ejecutadas**: cada ejercicio de terminal se reproduce en el simulador. Se comprueba que el estado inicial **no** aprueba y la solución **sí**. Lo mismo con los editores: el texto inicial no aprueba y la solución sí.
- **PWA**: el Service Worker precachea todos los archivos de ejecución; el manifest y los iconos existen; no hay recursos externos (CDN, fuentes web); todas las importaciones JS resuelven.

## Recorrido en navegador (`npm run test:e2e`)

Pasos superados, sin errores de JavaScript:
1. Navegación por las 5 pestañas.
2. Lección con un fallo intencionado: el ejercicio fallado se repite al final, la XP es proporcional y el error queda registrado.
3. Persistencia: la XP sigue tras recargar.
4. Lecciones con terminal y evaluación del módulo 1: se desbloquea el módulo 2.
5. Una lección bloqueada no se puede abrir por URL.
6. Dos misiones completas (terminal, Git, decisiones, emparejar).
7. Repaso inteligente: aparece el error registrado y desaparece al acertarlo.
8. Laboratorio: archivos creados en la terminal siguen ahí tras recargar.
9. Reto del laboratorio.
10. **Sin conexión**: con la red cortada, la app, el mapa y una lección nueva cargan desde la caché.
11. Logros visibles y reinicio del progreso con doble confirmación.

Con `FULL=1` se recorren además **todas** las lecciones, las 6 evaluaciones, las 12 misiones, el proyecto final y los 8 retos. Resultado: **nivel L5, 2.365 XP y 13 logros**. Captura en `screenshots/perfil-l5.png`.

## Pendiente de comprobar por ti (no disponible en este entorno)

| Criterio | Estado |
|---|---|
| Abrir en Safari de iPhone | Pendiente: guía en [INSTALAR_IPHONE.md](INSTALAR_IPHONE.md) |
| Añadir a pantalla de inicio en iOS | Pendiente (metadatos iOS, manifest e iconos verificados) |
| Publicación en GitHub Pages | Workflow preparado; requiere activarlo en Settings → Pages |

La emulación de iPhone en Chromium valida el diseño, la interacción táctil y el modo offline, pero no sustituye a Safari en un iPhone real.

## Cambios posteriores a la primera entrega
- **Terminal:** botón **Enviar** y, al comprobar, se envía lo que quede escrito sin enviar (prueba de regresión del fallo reportado).
- **Ritmo y práctica realista:** lecciones divididas; ningún ejercicio obliga a escribir archivos a mano (prueba automática); Claude simulado para crear y corregir archivos (pruebas unitarias: petición clara escribe, vaga no, modo plan solo propone).
- **Avance guardado:** se descarta si el contenido de la lección cambia.

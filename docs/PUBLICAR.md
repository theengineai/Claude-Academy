# Publicar gratis en GitHub Pages

Cada vez que cambia algo en la rama `main`, el workflow `.github/workflows/pages.yml` ejecuta los tests y publica la app como sitio estático.

## Una sola vez
1. **Settings → Pages → Build and deployment → Source: GitHub Actions** (el repositorio debe ser público para que sea gratis).
2. Pestaña **Actions** → *Publicar Claude Academy* → **Run workflow** (solo si no se ha lanzado ya con el último cambio).
3. Cuando termine en verde, la app está en `https://theengineai.github.io/Claude-Academy/`.

Las rutas son relativas: funciona igual con cualquier nombre de repositorio o dominio propio.

## Si algo falla
| Síntoma | Causa probable |
|---|---|
| 404 | Pages no está en «GitHub Actions» o el workflow no ha terminado |
| Falla el paso de tests | Un JSON del temario tiene un error: el log indica archivo y ejercicio |
| El iPhone no se actualiza | Cierra la app del todo y ábrela de nuevo |

## Actualizaciones
Edita el temario o el código y haz commit en `main`: cada despliegue genera una versión de caché nueva y los dispositivos se actualizan solos.

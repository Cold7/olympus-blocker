# Olympus Biblioteca – Bloqueador de Overlays

Extensión para Chrome/Brave que bloquea los popunders, overlays invisibles y redirecciones no deseadas en [https://olympusxyz.com/](https://olympusxyz.com/).

## El problema

Después de un par de clics en cualquier parte de la página, el sitio abre una pestaña nueva con publicidad. Esto ocurre incluso usando bloqueadores de anuncios convencionales o el escudo nativo de Brave, porque el mecanismo usa técnicas que evaden la detección estándar:

- Código ofuscado evaluado dinámicamente (`eval` / `new Function`)
- Iframes `about:blank` que ejecutan `window.open` desde su propio contexto
- Overlays transparentes con `z-index` alto que capturan clics
- Scripts de las redes de ads `rtmark.net` y `734map.net`

## Qué hace la extensión

**A nivel de red** (`declarativeNetRequest`): bloquea las peticiones a `rtmark.net`, `734map.net` y patrones conocidos de popunder/clickunder antes de que lleguen al navegador.

**A nivel de página** (content script inyectado en `world: MAIN`):

- Sobreescribe `window.open` para bloquear aperturas a dominios externos
- Intercepta `eval()` y `new Function()` para neutralizar código de popunder inyectado dinámicamente
- Bloquea `.click()` y `dispatchEvent` programáticos en anchors con href externo
- Neutraliza anchors creados dinámicamente reemplazando su `href` por `javascript:void(0)`
- Parchea `contentWindow.open` en iframes `about:blank`
- Bloquea `location.assign` y `location.replace` hacia sitios externos
- Detecta y distingue clics genuinos del usuario vs clics sintéticos generados por scripts
- Elimina overlays invisibles (divs/iframes con posición fija, tamaño completo y opacidad baja o `z-index` alto)
- Usa `MutationObserver` para atrapar elementos inyectados después de la carga inicial
- Ejecuta limpieza periódica cada 1.5 segundos contra overlays que se reinsertan

## Instalación

1. Clona o descarga este repositorio
2. Abre `brave://extensions/` o `chrome://extensions/`
3. Activa el **Modo desarrollador** (interruptor arriba a la derecha)
4. Haz clic en **Cargar extensión sin empaquetar**
5. Selecciona la carpeta del repositorio

## Estructura

```
├── manifest.json    # Manifest V3, permisos y configuración
├── blocker.js       # Content script principal
├── rules.json       # Reglas declarativas de bloqueo de red
├── icon.png         # Icono de la extensión
└── README.md
```

## Diagnóstico

La extensión registra todo lo que bloquea en la consola del navegador con el prefijo `[OlympusBlocker]`. Para verificar que está funcionando:

1. Abre la consola (`F12` → Console)
2. Busca el mensaje `[OlympusBlocker] v3 cargado — protección activa.`
3. Navega por el sitio normalmente; cada bloqueo aparecerá en la consola

## Notas

- Solo se activa en `olympusbiblioteca.com`, no afecta ningún otro sitio.
- Usa `world: "MAIN"` en el manifest para que las sobreescrituras de `window.open`, `eval`, etc. se apliquen en el contexto JavaScript real de la página y no en un mundo aislado.
- Usa `match_about_blank: true` para inyectar el bloqueador dentro de iframes `about:blank`.

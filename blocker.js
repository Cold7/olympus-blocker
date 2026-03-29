// ==========================================================
// Olympus Biblioteca – Bloqueador v3
// ==========================================================
// Basado en diagnóstico real de la consola:
//   - rtmark.net y 734map.net son las redes de ads
//   - Usan iframes about:blank como vector
//   - Código eval'd (VM scripts) para click hijacking
//   - Overlays dinámicos que se reinsertan
// ==========================================================

(function () {
  "use strict";

  const DOMAIN = "olympusbiblioteca";
  const LOG = "[OlympusBlocker]";

  function isSameSite(url) {
    if (!url || url === "" || url === "#") return true;
    if (url.startsWith("/") || url.startsWith("?") || url.startsWith("#")) return true;
    if (url.startsWith("javascript:")) return true;
    try {
      const u = new URL(url, window.location.origin);
      return u.hostname.includes(DOMAIN);
    } catch {
      return true;
    }
  }

  // Lista de dominios de ads detectados en esta página
  const AD_DOMAINS = [
    "rtmark.net",
    "734map.net",
    "juicyads",
    "exoclick",
    "hilltopads",
    "monetag",
    "profitabledisplay",
    "clickadu",
    "propellerads",
    "adsterra",
    "trafficjunky",
    "trafficstars",
    "popunder",
    "popcash",
    "popads",
  ];

  function isAdDomain(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return AD_DOMAINS.some((d) => lower.includes(d));
  }

  // =====================================================
  // 1. BLOQUEAR window.open — blindado
  // =====================================================
  const _nativeOpen = window.open;
  const blockedOpen = function (...args) {
    const url = String(args[0] || "");
    if (isSameSite(url)) return _nativeOpen.apply(window, args);
    console.info(LOG, "window.open bloqueado →", url);
    // Retornar un objeto falso para no romper scripts que esperan una referencia
    return {
      closed: true,
      close: () => {},
      focus: () => {},
      blur: () => {},
      postMessage: () => {},
      document: { write: () => {}, close: () => {} },
      location: {},
    };
  };

  window.open = blockedOpen;
  try {
    Object.defineProperty(window, "open", {
      get: () => blockedOpen,
      set: () => true,
      configurable: false,
    });
  } catch {}

  // =====================================================
  // 2. BLOQUEAR about:blank iframes (vector principal)
  // =====================================================
  const _createElement = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, options) {
    const el = _createElement.call(this, tag, options);

    if (tag.toLowerCase() === "iframe") {
      // Interceptar la asignación de src
      const srcDesc = Object.getOwnPropertyDescriptor(
        HTMLIFrameElement.prototype,
        "src"
      );

      let _blockedSrc = false;

      Object.defineProperty(el, "src", {
        get() {
          return srcDesc.get.call(this);
        },
        set(val) {
          // Bloquear iframes a dominios de ads
          if (isAdDomain(val)) {
            console.info(LOG, "Iframe ad bloqueado →", val);
            _blockedSrc = true;
            return;
          }
          // Permitir about:blank pero marcarlos para vigilancia
          if (val === "about:blank" || val === "") {
            el.dataset._suspicious = "true";
          }
          srcDesc.set.call(this, val);
        },
        configurable: true,
      });

      // Interceptar contentWindow para bloquear window.open desde iframes
      const cwDesc = Object.getOwnPropertyDescriptor(
        HTMLIFrameElement.prototype,
        "contentWindow"
      );
      if (cwDesc) {
        Object.defineProperty(el, "contentWindow", {
          get() {
            const cw = cwDesc.get.call(this);
            if (cw && !cw.__patched) {
              try {
                const _iframeOpen = cw.open;
                cw.open = function (...args) {
                  const url = String(args[0] || "");
                  if (isSameSite(url)) return _iframeOpen.apply(cw, args);
                  console.info(LOG, "iframe.contentWindow.open bloqueado →", url);
                  return null;
                };
                cw.__patched = true;
              } catch (e) {
                // Cross-origin, no podemos parchear
              }
            }
            return cw;
          },
          configurable: true,
        });
      }
    }

    // Neutralizar anchors creados dinámicamente
    if (tag.toLowerCase() === "a") {
      const hrefDesc = Object.getOwnPropertyDescriptor(
        HTMLAnchorElement.prototype,
        "href"
      );
      if (hrefDesc) {
        Object.defineProperty(el, "href", {
          get: hrefDesc.get,
          set(val) {
            if (!isSameSite(val)) {
              el.dataset._blockedHref = val;
              hrefDesc.set.call(this, "javascript:void(0)");
              console.info(LOG, "Anchor externo neutralizado →", val);
              return;
            }
            hrefDesc.set.call(this, val);
          },
          configurable: true,
        });
      }
    }

    return el;
  };

  // =====================================================
  // 3. INTERCEPTAR eval y Function para detectar/bloquear
  //    código de popunder inyectado dinámicamente (VM scripts)
  // =====================================================
  const POPUP_PATTERNS = [
    /window\s*\.\s*open\s*\(/,
    /\.open\s*\(\s*['"][^'"]*['"],\s*['"]_blank['"]/,
    /popunder/i,
    /clickunder/i,
    /popUnder/,
    /rtmark/i,
    /734map/i,
  ];

  function containsPopupCode(code) {
    if (typeof code !== "string") return false;
    return POPUP_PATTERNS.some((p) => p.test(code));
  }

  // Interceptar eval
  const _eval = window.eval;
  window.eval = function (code) {
    if (containsPopupCode(code)) {
      console.info(LOG, "eval con código popup bloqueado (", code.length, "chars)");
      return undefined;
    }
    return _eval.call(window, code);
  };

  // Interceptar new Function()
  const _Function = window.Function;
  window.Function = function (...args) {
    const body = args[args.length - 1] || "";
    if (containsPopupCode(body)) {
      console.info(LOG, "new Function con código popup bloqueado");
      return function () {};
    }
    return _Function.apply(this, args);
  };
  window.Function.prototype = _Function.prototype;

  // =====================================================
  // 4. BLOQUEAR .click() y dispatchEvent en anchors externos
  // =====================================================
  const _nativeClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    if (this.tagName === "A") {
      const href = this.getAttribute("href") || "";
      if (!isSameSite(href)) {
        console.info(LOG, "anchor.click() bloqueado →", href);
        return;
      }
    }
    return _nativeClick.call(this);
  };

  const _nativeDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (event) {
    if (
      this instanceof HTMLAnchorElement &&
      event instanceof MouseEvent &&
      event.type === "click"
    ) {
      const href = this.getAttribute("href") || "";
      if (!isSameSite(href)) {
        console.info(LOG, "dispatchEvent click bloqueado →", href);
        return false;
      }
    }
    return _nativeDispatch.call(this, event);
  };

  // =====================================================
  // 5. BLOQUEAR redirecciones por location
  // =====================================================
  try {
    const _assign = window.location.assign.bind(window.location);
    const _replace = window.location.replace.bind(window.location);
    window.location.assign = function (url) {
      if (isSameSite(url)) return _assign(url);
      console.info(LOG, "location.assign bloqueado →", url);
    };
    window.location.replace = function (url) {
      if (isSameSite(url)) return _replace(url);
      console.info(LOG, "location.replace bloqueado →", url);
    };
  } catch {}

  // =====================================================
  // 6. CAPTURA DE CLICS — última línea de defensa
  // =====================================================
  // Rastrear si el usuario realmente hizo clic en un enlace visible
  let genuineUserClick = false;
  let genuineClickTarget = null;

  document.addEventListener(
    "pointerdown",
    (e) => {
      genuineUserClick = true;
      genuineClickTarget = e.target;
      setTimeout(() => {
        genuineUserClick = false;
        genuineClickTarget = null;
      }, 100);
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      const anchor = e.target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      if (isSameSite(href)) return;

      // Verificar si es un clic genuino del usuario en ese elemento
      if (!genuineUserClick || !genuineClickTarget || !anchor.contains(genuineClickTarget)) {
        console.info(LOG, "Clic sintético en anchor externo bloqueado →", href);
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }

      // Verificar si el anchor es invisible/superpuesto
      const style = window.getComputedStyle(anchor);
      if (
        parseFloat(style.opacity) < 0.2 ||
        style.visibility === "hidden" ||
        style.pointerEvents === "none" ||
        parseInt(style.zIndex) > 9000 ||
        (style.position === "fixed" &&
          parseInt(style.width) > window.innerWidth * 0.4 &&
          parseInt(style.height) > window.innerHeight * 0.4)
      ) {
        console.info(LOG, "Anchor oculto/superpuesto bloqueado →", href);
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
    },
    true
  );

  // =====================================================
  // 7. ELIMINAR overlays
  // =====================================================
  function removeOverlays() {
    document.querySelectorAll("div, a, iframe, ins, span").forEach((el) => {
      try {
        const s = window.getComputedStyle(el);
        const isFixed = s.position === "fixed" || s.position === "absolute";
        const isBig =
          (parseInt(s.width) >= window.innerWidth * 0.6 || s.width === "100%") &&
          (parseInt(s.height) >= window.innerHeight * 0.6 || s.height === "100%");
        const isInvisible =
          parseFloat(s.opacity) < 0.15 ||
          s.backgroundColor === "transparent" ||
          s.backgroundColor === "rgba(0, 0, 0, 0)";
        const highZ = parseInt(s.zIndex) > 9000;

        if (isFixed && isBig && (isInvisible || highZ)) {
          // No eliminar elementos legítimos del sitio (modals, menús, etc.)
          const hasText = (el.textContent || "").trim().length > 20;
          const hasVisibleChildren = el.querySelector(
            'img[src*="' + DOMAIN + '"], button, input, h1, h2, h3, p'
          );
          if (!hasText && !hasVisibleChildren) {
            console.info(LOG, "Overlay eliminado:", el.tagName, el.id || el.className);
            el.remove();
          }
        }
      } catch {}
    });

    // Eliminar iframes about:blank sospechosos
    document.querySelectorAll("iframe").forEach((iframe) => {
      const src = iframe.getAttribute("src") || iframe.src || "";
      if (
        src === "about:blank" ||
        src === "" ||
        (src && !isSameSite(src) && !src.startsWith("data:"))
      ) {
        // Verificar si es visible o es un iframe funcional del sitio
        try {
          const s = window.getComputedStyle(iframe);
          const isHidden =
            parseInt(s.width) <= 1 ||
            parseInt(s.height) <= 1 ||
            s.display === "none" ||
            parseFloat(s.opacity) < 0.1 ||
            s.visibility === "hidden";
          const isFixed = s.position === "fixed" || s.position === "absolute";

          if (isHidden || isFixed) {
            console.info(LOG, "Iframe sospechoso eliminado →", src || "about:blank");
            iframe.remove();
          }
        } catch {
          iframe.remove();
        }
      }
    });
  }

  // =====================================================
  // 8. MUTATION OBSERVER
  // =====================================================
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;

        // Bloquear scripts de ad networks
        if (node.tagName === "SCRIPT") {
          const src = (node.src || "").toLowerCase();
          const text = (node.textContent || "");
          if (isAdDomain(src) || containsPopupCode(text)) {
            console.info(LOG, "Script bloqueado →", src || "(inline popup code)");
            node.remove();
            continue;
          }
        }

        // Bloquear iframes externos inmediatamente
        if (node.tagName === "IFRAME") {
          const src = node.getAttribute("src") || node.src || "";
          if (isAdDomain(src) || (src && !isSameSite(src) && src !== "about:blank")) {
            console.info(LOG, "Iframe eliminado →", src);
            node.remove();
            continue;
          }
          // about:blank → parchear contentWindow
          if (src === "about:blank" || src === "") {
            try {
              const cw = node.contentWindow;
              if (cw) {
                cw.open = blockedOpen;
              }
            } catch {}
          }
        }

        // Verificar overlays con delay para que se apliquen estilos
        requestAnimationFrame(() => {
          if (!node.isConnected) return;
          try {
            const s = window.getComputedStyle(node);
            if (
              (s.position === "fixed" || s.position === "absolute") &&
              parseInt(s.zIndex) > 9000 &&
              parseInt(s.width) > window.innerWidth * 0.4 &&
              parseInt(s.height) > window.innerHeight * 0.4
            ) {
              console.info(LOG, "Overlay dinámico eliminado:", node.tagName);
              node.remove();
            }
          } catch {}
        });
      }
    }

    // Limpiar onclick en body/html
    try {
      if (document.body && document.body.onclick) document.body.onclick = null;
      if (document.documentElement && document.documentElement.onclick)
        document.documentElement.onclick = null;
    } catch {}
  });

  // =====================================================
  // 9. CSS REFUERZO
  // =====================================================
  const style = document.createElement("style");
  style.textContent = `
    /* Overlays con z-index máximo */
    div[style*="z-index: 2147483647"],
    div[style*="z-index:2147483647"] {
      display: none !important;
      pointer-events: none !important;
    }
    /* Iframes fijos */
    iframe[style*="position: fixed"],
    iframe[style*="position:fixed"] {
      display: none !important;
    }
    /* Anchors transparentes superpuestos */
    a[style*="position: fixed"][style*="opacity"],
    a[style*="position:fixed"][style*="opacity"] {
      display: none !important;
      pointer-events: none !important;
    }
    /* Contenedores de ads por clase/id */
    [id*="rtmark"], [class*="rtmark"],
    [id*="734map"], [class*="734map"] {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // =====================================================
  // 10. INICIAR
  // =====================================================
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const cleanup = () => {
    removeOverlays();
    try {
      if (document.body) document.body.onclick = null;
      if (document.documentElement) document.documentElement.onclick = null;
    } catch {}
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanup);
  } else {
    cleanup();
  }

  // Limpieza periódica
  setInterval(cleanup, 1500);

  console.info(LOG, "v3 cargado — protección activa.");
})();

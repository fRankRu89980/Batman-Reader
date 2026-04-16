const APP_VERSION = "6";
const SERVICE_WORKER_URL = `./sw.js?v=${APP_VERSION}`;
const INSTALL_DISMISS_KEY = "comic-reader-install-dismissed";
const SWIPE_INTENT_THRESHOLD = 10;
const TAP_MAX_DISTANCE = 12;
const SWIPE_TRIGGER_RATIO = 0.25;

const seasonPageSources = [
  {
    label: "Volume I - L'estate prolungata",
    folder: "Batman 1 - L'estate prolungata",
    pages: Array.from({ length: 44 }, (_, index) => `PG${index}.jpeg`)
  },
  {
    label: "Volume II - L'inverno sta arrivando",
    folder: "Batman 2 - L'inverno sta arrivando",
    pages: Array.from({ length: 53 }, (_, index) => `PG${index}.jpeg`)
  },
  {
    label: "Volume III - L'Abisso",
    folder: "Batman 3 - L'abisso",
    pages: Array.from({ length: 46 }, (_, index) => `PG${index}.jpeg`)
    
  },
  {
    label: "Volume IV - A Million Miles From Home",
    folder: "Batman 4 - A Million Miles From Home",
    pages: Array.from({ length: 9 }, (_, index) => `PG${index}.jpeg`)
  }
]

const fumetti = seasonPageSources.flatMap(season =>
  season.pages.map(fileName => encodeURI(`tavole/${season.folder}/${fileName}`))
);
const vignetteDisponibili = new Set([
  "vignette/vignetta1_0.jpeg",
  "vignette/vignetta2_0.jpeg",
  "vignette/vignetta3_0.jpeg"
]);

const seasonLabels = (() => {
  let currentStart = 1;

  return seasonPageSources.map(season => {
    const range = {
      start: currentStart,
      end: currentStart + season.pages.length - 1,
      label: season.label
    };

    currentStart = range.end + 1;
    return range;
  });
})();

const defaultLayout = [{ top: 0, left: 0, width: 100, height: 100 }];

let paginaCorrente = 0;
let modalOpen = false;
let renderToken = 0;
let deferredInstallPrompt = null;
let installPromptInFlight = false;

const pageStage = document.querySelector(".page-stage");
const prevLayer = document.querySelector(".page-layer.prev");
const currentLayer = document.querySelector(".page-layer.current");
const nextLayer = document.querySelector(".page-layer.next");
const prevComic = document.getElementById("comic-prev");
const currentComic = document.getElementById("comic-current");
const nextComic = document.getElementById("comic-next");
const pageCounter = document.getElementById("page-counter");
const modal = document.getElementById("modal");
const imgZoom = document.getElementById("img-zoom");
const seasonLinks = Array.from(document.querySelectorAll(".link"));
const wrapper = document.querySelector(".comic-wrapper");
const shadow = document.getElementById("page-shadow");
const vignetteContainer = document.getElementById("vignette-container");
const menu = document.querySelector(".menu");
const statusChip = document.getElementById("reader-status");
const titleSub = document.getElementById("title-sub");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const pageInput = document.getElementById("page-input");
const pageBtn = document.getElementById("page-btn");
const title = document.querySelector(".title-main");
const installBtn = document.getElementById("install-app-btn");
const iosInstallModal = document.getElementById("ios-install-modal");
const iosInstallCard = iosInstallModal ? iosInstallModal.querySelector(".install-modal-card") : null;
const iosInstallTitle = document.getElementById("ios-install-title");
const iosInstallDescription = document.getElementById("ios-install-description");
const iosInstallSteps = document.getElementById("ios-install-steps");
const iosInstallClose = document.getElementById("ios-install-close");
const iosInstallDismiss = document.getElementById("ios-install-dismiss");
const rouletteContainer = document.getElementById("roulette-container");
const rouletteCanvas = document.getElementById("roulette-wheel");
const rouletteBall = document.getElementById("roulette-ball");
const rouletteResult = document.getElementById("roulette-result");
const rouletteVoiceBtn = document.getElementById("roulette-voice-btn");
const seasonPopupCompact = document.getElementById("season-popup-compact");
const seasonPopupCode = document.getElementById("season-popup-code");
const seasonPopupLabel = document.getElementById("season-popup-label");
const seasonMenuClose = document.getElementById("season-menu-close");

const installUiState = {
  sessionClosed: false,
  lastFocusedElement: null
};

function updateStatus(message) {
  statusChip.textContent = message;
}

function updateNavButtons() {
  prevBtn.disabled = paginaCorrente === 0;
  nextBtn.disabled = paginaCorrente === fumetti.length - 1;
}

function getSeasonForPage(pageNumber) {
  return seasonLabels.find(season => pageNumber >= season.start && pageNumber <= season.end) || seasonLabels[0];
}

function updateSeasonUi(pageNumber) {
  const activeSeason = getSeasonForPage(pageNumber);
  titleSub.textContent = activeSeason.label;

  seasonLinks.forEach((link, index) => {
    const startPage = parseInt(link.dataset.page, 10);
    const nextStart = seasonLinks[index + 1] ? parseInt(seasonLinks[index + 1].dataset.page, 10) : fumetti.length + 1;
    const isActive = pageNumber >= startPage && pageNumber < nextStart;
    link.classList.toggle("active", isActive);
  });

  const activeLink = seasonLinks.find(link => link.classList.contains("active"));
  if(activeLink && seasonPopupCode && seasonPopupLabel) {
    seasonPopupCode.textContent = activeLink.querySelector(".link-icon")?.textContent?.trim() || "S1";
    seasonPopupLabel.textContent = activeLink.dataset.label || "Stagioni";
  }
}

function getPageWidth() {
  return pageStage.getBoundingClientRect().width || wrapper.offsetWidth || window.innerWidth;
}

function getPageSrc(index) {
  return index >= 0 && index < fumetti.length ? fumetti[index] : "";
}

function setStageAspectRatio(width, height) {
  if(width > 0 && height > 0) {
    pageStage.style.aspectRatio = `${width} / ${height}`;
  }
}

function setLayerTransitions(enabled) {
  const value = enabled ? "transform .3s ease" : "none";
  [prevLayer, currentLayer, nextLayer].forEach(layer => {
    layer.style.transition = value;
  });
}

function setLayerTransforms(deltaX) {
  const width = getPageWidth();
  const progress = width ? deltaX / width : 0;
  const limited = Math.max(-1, Math.min(progress, 1));

  prevLayer.style.transform = `translate3d(${deltaX - width}px,0,0)`;
  currentLayer.style.transform = `translate3d(${deltaX}px,0,0)`;
  nextLayer.style.transform = `translate3d(${deltaX + width}px,0,0)`;

  shadow.style.opacity = Math.min(Math.abs(limited) * 0.55, 0.55);
  shadow.style.background = limited < 0
    ? "linear-gradient(to left, rgba(0,0,0,0.5), transparent)"
    : "linear-gradient(to right, rgba(0,0,0,0.5), transparent)";
}

function setEmptyLayer(layer, image) {
  layer.classList.add("is-empty");
  image.removeAttribute("src");
}

function renderLayer(layer, image, pageIndex, token, options = {}) {
  const src = getPageSrc(pageIndex);
  if(!src) {
    setEmptyLayer(layer, image);
    return;
  }

  layer.classList.remove("is-empty");
  const preload = new Image();
  preload.onload = () => {
    if(token !== renderToken) return;
    image.src = src;
    if(options.updateRatio) {
      setStageAspectRatio(preload.naturalWidth, preload.naturalHeight);
    }
  };
  preload.onerror = () => {
    if(token !== renderToken) return;
    setEmptyLayer(layer, image);
    if(options.updateRatio) {
      updateStatus(`Immagine mancante: ${src}`);
    }
  };
  preload.src = src;
}

function renderPageLayers() {
  const token = ++renderToken;
  renderLayer(currentLayer, currentComic, paginaCorrente, token, { updateRatio: true });
  renderLayer(prevLayer, prevComic, paginaCorrente - 1, token);
  renderLayer(nextLayer, nextComic, paginaCorrente + 1, token);
  setLayerTransitions(false);
  setLayerTransforms(0);
}

function generaVignetta(pagina, index) {
  return `vignette/vignetta${pagina}_${index}.jpeg`;
}

function getVignetteLayout() {
  return defaultLayout;
}

function closeModal() {
  modal.hidden = true;
  modalOpen = false;
  imgZoom.removeAttribute("src");
}

function openVignetta(src) {
  if(modalOpen || !src) return;
  imgZoom.src = src;
  modal.hidden = false;
  modalOpen = true;
}

function createVignetteArea(pagina, index, areaData) {
  const area = document.createElement("div");
  const vignettaSrc = generaVignetta(pagina, index);
  const hasVignetta = vignetteDisponibili.has(vignettaSrc);

  area.className = "vignetta-area";
  area.style.top = `${areaData.top}%`;
  area.style.left = `${areaData.left}%`;
  area.style.width = `${areaData.width}%`;
  area.style.height = `${areaData.height}%`;
  area.dataset.vignettaSrc = vignettaSrc;
  area.dataset.hasVignetta = hasVignetta ? "true" : "false";

  area.addEventListener("click", event => {
    event.stopPropagation();
    if(!hasVignetta) {
      updateStatus(`Nessuna vignetta dedicata per la pagina ${pagina}.`);
      return;
    }
    openVignetta(vignettaSrc);
  });

  return area;
}

function creaVignette(pagina) {
  vignetteContainer.innerHTML = "";
  const layout = getVignetteLayout(pagina);
  layout.forEach((areaData, index) => {
    vignetteContainer.appendChild(createVignetteArea(pagina, index, areaData));
  });
}

function mostraPagina(index) {
  paginaCorrente = Math.max(0, Math.min(index, fumetti.length - 1));
  const pageNumber = paginaCorrente + 1;

  updateStatus(`Pagina ${pageNumber} di ${fumetti.length}`);
  updateSeasonUi(pageNumber);
  updateNavButtons();
  pageCounter.textContent = `${pageNumber} / ${fumetti.length}`;
  renderPageLayers();
  creaVignette(pageNumber);
}

function nextPage() {
  if(paginaCorrente < fumetti.length - 1) {
    mostraPagina(paginaCorrente + 1);
  }
}

function prevPage() {
  if(paginaCorrente > 0) {
    mostraPagina(paginaCorrente - 1);
  }
}

function resolveTapTarget(clientX, clientY) {
  const tapped = document.elementFromPoint(clientX, clientY);
  const vignetta = tapped && tapped.closest ? tapped.closest(".vignetta-area") : null;
  if(!vignetta) return;
  if(vignetta.dataset.hasVignetta !== "true") {
    updateStatus(`Nessuna vignetta dedicata per la pagina ${paginaCorrente + 1}.`);
    return;
  }
  openVignetta(vignetta.dataset.vignettaSrc);
}

function setupMenu() {
  if(!menu || !seasonPopupCompact) return;

  let menuOpened = false;

  function setMenuExpandedState(expanded) {
    menuOpened = expanded;
    menu.classList.toggle("is-compact-hidden", !expanded);
    menu.classList.remove("hidden");
    seasonPopupCompact.classList.toggle("is-hidden", expanded);
    seasonPopupCompact.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  setMenuExpandedState(false);

  seasonPopupCompact.addEventListener("click", () => {
    setMenuExpandedState(true);
  });

  if(seasonMenuClose) {
    seasonMenuClose.addEventListener("click", () => {
      setMenuExpandedState(false);
    });
  }

  seasonLinks.forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      const page = parseInt(link.dataset.page, 10);
      if(!Number.isNaN(page)) {
        mostraPagina(page - 1);
      }
    });
  });

  let touchTimer = null;
  seasonLinks.forEach(link => {
    link.addEventListener("touchstart", () => {
      if(link.classList.contains("expanded")) return;
      seasonLinks.forEach(item => {
        if(item !== link) item.classList.remove("expanded");
      });
      link.classList.add("expanded");
      if(touchTimer) {
        window.clearTimeout(touchTimer);
      }
      touchTimer = window.setTimeout(() => {
        link.classList.remove("expanded");
      }, 2500);
    }, { passive: true });
  });

  document.addEventListener("touchstart", event => {
    if(!event.target.closest(".menu")) {
      seasonLinks.forEach(link => link.classList.remove("expanded"));
      if(touchTimer) {
        window.clearTimeout(touchTimer);
        touchTimer = null;
      }
    }
  }, { passive: true });

  let lastScrollY = window.scrollY || 0;
  window.addEventListener("scroll", () => {
    const currentScrollY = window.scrollY || 0;
    const scrollingDown = currentScrollY > lastScrollY;

    if(menuOpened) {
      if(scrollingDown && currentScrollY > 80) {
        menu.classList.add("hidden");
      } else {
        menu.classList.remove("hidden");
      }
    }

    lastScrollY = currentScrollY;
  }, { passive: true });
}

function setupNavigation() {
  prevBtn.addEventListener("click", prevPage);
  nextBtn.addEventListener("click", nextPage);

  pageBtn.addEventListener("click", () => {
    const page = parseInt(pageInput.value, 10);
    if(!Number.isNaN(page) && page >= 1 && page <= fumetti.length) {
      mostraPagina(page - 1);
      pageInput.value = "";
    } else {
      updateStatus(`Inserisci una pagina tra 1 e ${fumetti.length}.`);
    }
  });

  pageInput.addEventListener("keydown", event => {
    if(event.key === "Enter") {
      pageBtn.click();
    }
  });

  modal.addEventListener("click", closeModal);
  imgZoom.addEventListener("error", () => {
    closeModal();
    updateStatus("La vignetta selezionata non e' disponibile.");
  });

  document.addEventListener("keydown", event => {
    if(document.activeElement && document.activeElement.tagName === "INPUT") return;
    if(event.key === "Escape" && modalOpen) {
      closeModal();
      return;
    }
    if(modalOpen) return;
    if(event.key === "ArrowRight") nextPage();
    if(event.key === "ArrowLeft") prevPage();
  });
}

function setupTitleEffects() {
  if(!title) return;

  title.setAttribute("data-text", title.textContent);
  title.animate(
    [
      { transform: "scale(1) translateY(0)" },
      { transform: "scale(1.02) translateY(-2px)" },
      { transform: "scale(1) translateY(0)" }
    ],
    { duration: 2400, iterations: 1, easing: "ease-out", delay: 200 }
  );

  function doGlitch() {
    title.classList.add("glitch");
    title.style.filter = "brightness(1.4) saturate(1.1)";
    window.setTimeout(() => {
      title.classList.remove("glitch");
      title.style.filter = "";
    }, 360);
  }

  function scheduleGlitch() {
    const delay = 6000 + Math.random() * 6000;
    window.setTimeout(() => {
      doGlitch();
      scheduleGlitch();
    }, delay);
  }

  scheduleGlitch();

  ["mouseenter", "touchstart"].forEach(eventName => {
    title.addEventListener(eventName, () => {
      title.style.transform = "translateY(-3px) scale(1.02)";
      window.setTimeout(() => {
        title.style.transform = "";
      }, 220);
    }, { passive: true });
  });
}

function setupSwipe() {
  if(!wrapper || !currentLayer || !shadow) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let touchCurrentY = 0;
  let dragging = false;
  let gestureMode = null;
  let pendingFrame = false;
  let lastDeltaX = 0;

  function canPreventTouch(event) {
    return !!event && event.cancelable === true;
  }

  function getConstrainedDelta(deltaX) {
    if(paginaCorrente === 0 && deltaX > 0) {
      return deltaX * 0.35;
    }
    if(paginaCorrente === fumetti.length - 1 && deltaX < 0) {
      return deltaX * 0.35;
    }
    return deltaX;
  }

  function resetTransform(animated = true) {
    setLayerTransitions(animated);
    setLayerTransforms(0);
    wrapper.classList.remove("is-swiping");
  }

  function scheduleDrag(deltaX) {
    lastDeltaX = getConstrainedDelta(deltaX);
    if(pendingFrame) return;
    pendingFrame = true;
    window.requestAnimationFrame(() => {
      pendingFrame = false;
      if(!dragging || gestureMode !== "swipe") return;
      setLayerTransforms(lastDeltaX);
    });
  }

  function clearGesture() {
    dragging = false;
    gestureMode = null;
    lastDeltaX = 0;
    pendingFrame = false;
    wrapper.classList.remove("is-swiping");
    vignetteContainer.querySelectorAll(".vignetta-area.active-touch").forEach(area => {
      area.classList.remove("active-touch");
    });
  }

  wrapper.addEventListener("touchstart", event => {
    if(modalOpen || event.touches.length !== 1) return;
    dragging = true;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchCurrentX = touchStartX;
    touchCurrentY = touchStartY;
    gestureMode = null;
    setLayerTransitions(false);
  }, { passive: true });

  wrapper.addEventListener("touchmove", event => {
    if(!dragging) return;

    touchCurrentX = event.touches[0].clientX;
    touchCurrentY = event.touches[0].clientY;

    const deltaX = touchCurrentX - touchStartX;
    const deltaY = touchCurrentY - touchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if(!gestureMode) {
      if(absX < SWIPE_INTENT_THRESHOLD && absY < SWIPE_INTENT_THRESHOLD) {
        return;
      }
      if(absX > absY) {
        gestureMode = "swipe";
        wrapper.classList.add("is-swiping");
      } else {
        gestureMode = "scroll";
        resetTransform(false);
        return;
      }
    }

    if(gestureMode === "swipe") {
      if(canPreventTouch(event)) {
        event.preventDefault();
      }
      scheduleDrag(deltaX);
    }
  }, { passive: false });

  wrapper.addEventListener("touchend", event => {
    if(!dragging || modalOpen) {
      clearGesture();
      return;
    }

    const deltaX = touchCurrentX - touchStartX;
    const deltaY = touchCurrentY - touchStartY;
    const constrainedDeltaX = getConstrainedDelta(deltaX);
    const absX = Math.abs(constrainedDeltaX);
    const absY = Math.abs(deltaY);
    const pageWidth = getPageWidth();
    const swipeThreshold = pageWidth * SWIPE_TRIGGER_RATIO;

    if(gestureMode === "swipe" && absX >= swipeThreshold) {
      const direction = constrainedDeltaX < 0 ? 1 : -1;
      const targetDeltaX = direction === 1 ? -pageWidth : pageWidth;
      setLayerTransitions(true);
      setLayerTransforms(targetDeltaX);
      window.setTimeout(() => {
        if(direction === 1) {
          mostraPagina(paginaCorrente + 1);
        } else {
          mostraPagina(paginaCorrente - 1);
        }
      }, 280);
    } else {
      resetTransform(true);
      if(gestureMode !== "swipe" && absX <= TAP_MAX_DISTANCE && absY <= TAP_MAX_DISTANCE) {
        const changedTouch = event.changedTouches[0];
        resolveTapTarget(changedTouch.clientX, changedTouch.clientY);
      }
    }

    clearGesture();
  }, { passive: false });

  wrapper.addEventListener("touchcancel", () => {
    resetTransform(true);
    clearGesture();
  }, { passive: true });
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  const ua = window.navigator.userAgent;
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || touchMac;
}

function isSafari() {
  const ua = window.navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
}

function isIosChrome() {
  return isIos() && /crios/i.test(window.navigator.userAgent);
}

function isIosSafari() {
  return isIos() && isSafari();
}

function isLocalDevelopmentHost() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "::1";
}

function installDismissed() {
  return window.localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
}

function logInstallDebug(message, details) {
  if(details !== undefined) {
    console.debug("[PWA install]", message, details);
    return;
  }
  console.debug("[PWA install]", message);
}

function hideInstallUi() {
  installBtn.hidden = true;
  closeInstallInstructions({ restoreFocus: false });
}

function showInstallButton(label) {
  if(isStandalone() || installDismissed()) return;
  installBtn.textContent = label;
  installBtn.setAttribute("aria-label", label);
  installBtn.hidden = false;
}

function getIosInstallContent() {
  if(isIosChrome()) {
    return {
      buttonLabel: "Aggiungi alla Home",
      title: "Aggiungi con Chrome",
      description: "Su iPhone, Chrome non mostra un prompt installabile. Puoi comunque aggiungere Comic Reader alla schermata Home dal menu di condivisione.",
      steps: [
        "Apri il menu di condivisione di Chrome.",
        "Scegli \"Aggiungi alla schermata Home\".",
        "Conferma per salvare l'app sulla Home."
      ]
    };
  }

  return {
    buttonLabel: "Aggiungi alla Home",
    title: "Aggiungi con Safari",
    description: "Su iPhone, Safari permette di aggiungere Comic Reader alla schermata Home tramite il menu Condividi.",
    steps: [
      "Tocca il pulsante Condividi di Safari.",
      "Seleziona \"Aggiungi alla schermata Home\".",
      "Conferma con \"Aggiungi\" per creare l'icona."
    ]
  };
}

function renderInstallInstructions(content) {
  if(!iosInstallTitle || !iosInstallDescription || !iosInstallSteps) return;

  iosInstallTitle.textContent = content.title;
  iosInstallDescription.textContent = content.description;
  iosInstallSteps.innerHTML = "";

  content.steps.forEach(step => {
    const item = document.createElement("li");
    item.textContent = step;
    iosInstallSteps.appendChild(item);
  });
}

function openInstallInstructions() {
  if(!iosInstallModal || installUiState.sessionClosed || isStandalone()) return;

  renderInstallInstructions(getIosInstallContent());
  installUiState.lastFocusedElement = document.activeElement;
  iosInstallModal.hidden = false;
  iosInstallModal.setAttribute("aria-hidden", "false");

  if(iosInstallCard) {
    iosInstallCard.focus();
  }
}

function closeInstallInstructions(options = {}) {
  if(!iosInstallModal) return;

  const { restoreFocus = true, rememberSessionClose = false } = options;
  iosInstallModal.hidden = true;
  iosInstallModal.setAttribute("aria-hidden", "true");

  if(rememberSessionClose) {
    installUiState.sessionClosed = true;
  }

  if(restoreFocus && installUiState.lastFocusedElement && typeof installUiState.lastFocusedElement.focus === "function") {
    installUiState.lastFocusedElement.focus();
  }
}

async function registerServiceWorker() {
  if(!("serviceWorker" in navigator)) return;
  if(!window.isSecureContext && !isLocalDevelopmentHost()) return;

  try {
    // Nota: eventuali errori WebSocket in VS Code Live Preview dipendono dal suo canale interno
    // di hot/live reload e non influiscono sul funzionamento reale della PWA.
    if(isLocalDevelopmentHost()) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));

      if("caches" in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(
          cacheKeys
            .filter(key => key.startsWith("comic-reader-"))
            .map(key => window.caches.delete(key))
        );
      }

      console.debug("[PWA] Service worker disattivato in sviluppo locale per evitare cache vecchie.");
      return;
    }

    let reloadingAfterSwUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if(reloadingAfterSwUpdate) return;
      reloadingAfterSwUpdate = true;
      window.location.reload();
    });

    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      updateViaCache: "none"
    });

    await registration.update();
  } catch (error) {
    console.warn("Service worker non registrato:", error);
  }
}

function setupInstallUi() {
  if(!installBtn || !iosInstallModal) return;

  logInstallDebug("setupInstallUi init", {
    standalone: isStandalone(),
    ios: isIos(),
    iosSafari: isIosSafari(),
    iosChrome: isIosChrome()
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installPromptInFlight = false;
    logInstallDebug("beforeinstallprompt ricevuto");
    showInstallButton("Installa App");
  });

  window.addEventListener("appinstalled", () => {
    logInstallDebug("appinstalled ricevuto");
    deferredInstallPrompt = null;
    installPromptInFlight = false;
    hideInstallUi();
  });

  installBtn.addEventListener("click", async () => {
    logInstallDebug("click sul pulsante installazione", {
      hasDeferredPrompt: !!deferredInstallPrompt,
      installPromptInFlight,
      ios: isIos(),
      standalone: isStandalone()
    });

    if(deferredInstallPrompt) {
      if(installPromptInFlight) return;

      installPromptInFlight = true;

      try {
        logInstallDebug("chiamata a deferredPrompt.prompt()");
        await deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        logInstallDebug("userChoice risolta", choiceResult);

        if(choiceResult && choiceResult.outcome === "accepted") {
          hideInstallUi();
        } else if(!isStandalone()) {
          // Dopo un dismiss il prompt corrente non e' piu' riutilizzabile:
          // nascondiamo il bottone e aspettiamo un eventuale nuovo beforeinstallprompt.
          hideInstallUi();
        }
      } catch (error) {
        console.warn("Install prompt non completato:", error);
        logInstallDebug("prompt() o userChoice hanno generato errore", error);
        if(!isStandalone()) {
          hideInstallUi();
        }
      } finally {
        deferredInstallPrompt = null;
        installPromptInFlight = false;
        logInstallDebug("stato install prompt ripulito");
      }

      return;
    }

    if(isIos() && !isStandalone()) {
      logInstallDebug("fallback iOS aperto");
      openInstallInstructions();
      return;
    }

    logInstallDebug("nessun deferredPrompt disponibile: browser non supportato o evento non ancora ricevuto");
  });

  iosInstallClose.addEventListener("click", () => {
    closeInstallInstructions({ rememberSessionClose: true });
  });

  iosInstallDismiss.addEventListener("click", () => {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    hideInstallUi();
  });

  iosInstallModal.addEventListener("click", event => {
    if(event.target === iosInstallModal) {
      closeInstallInstructions({ rememberSessionClose: true });
    }
  });

  document.addEventListener("keydown", event => {
    if(event.key === "Escape" && !iosInstallModal.hidden) {
      closeInstallInstructions({ rememberSessionClose: true });
    }
  });

  if(isStandalone()) {
    logInstallDebug("app gia' in standalone, UI install nascosta");
    hideInstallUi();
    return;
  }

  if(isIos() && !installDismissed()) {
    const content = getIosInstallContent();
    renderInstallInstructions(content);
    logInstallDebug("fallback iOS mostrato");
    showInstallButton(content.buttonLabel);
    return;
  }

  logInstallDebug("in attesa di beforeinstallprompt");
}

function setupRoulette() {
  if(!rouletteContainer || !rouletteCanvas || !rouletteBall || !rouletteResult || !rouletteVoiceBtn) {
    return;
  }

  const rouletteCtx = rouletteCanvas.getContext("2d");
  if(!rouletteCtx) return;

  const rouletteNumbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27,
    13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1,
    20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];

  const redRouletteNumbers = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
  ]);

  const rouletteNicknames = {
    0: "zero",
    1: "l'Italia",
    2: "a' criatura",
    3: "a' jatta",
    4: "o' puorco",
    5: "a' mano",
    6: "chella ca guarda nterra",
    7: "o' vase",
    8: "a' Maronna",
    9: "a' figliata",
    10: "e fasule",
    11: "e surice",
    12: "e surdate",
    13: "Sant'Antonio",
    14: "o' mbriaco",
    15: "o' guaglione",
    16: "o' culo",
    17: "a disgrazia",
    18: "o' sanghe",
    19: "a' resata",
    20: "a' festa",
    21: "a' femmena annura",
    22: "o' pazzo",
    23: "o' scemo",
    24: "e guardie",
    25: "Natale",
    26: "Nanninella",
    27: "o' cantero",
    28: "e zzizze",
    29: "o' pate d'e criature",
    30: "e palle d'o tenente",
    31: "o' padrone 'e casa",
    32: "o' capitone",
    33: "ll'anne 'e Cristo",
    34: "a' capa",
    35: "l'aucielluzzo",
    36: "e castagnelle"
  };

  let spinning = false;
  let voiceEnabled = true;
  let ballAngle = -Math.PI / 2;
  let animationId = null;
  let safetyUnlockTimer = null;

  function drawRouletteWheel() {
    const cx = rouletteCanvas.width / 2;
    const cy = rouletteCanvas.height / 2;
    const radius = 220;
    const innerRadius = 150;
    const segmentAngle = (Math.PI * 2) / rouletteNumbers.length;

    rouletteCtx.clearRect(0, 0, rouletteCanvas.width, rouletteCanvas.height);

    const outerGradient = rouletteCtx.createRadialGradient(cx, cy, 50, cx, cy, radius + 16);
    outerGradient.addColorStop(0, "#8d6b21");
    outerGradient.addColorStop(1, "#4b3308");

    rouletteCtx.beginPath();
    rouletteCtx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
    rouletteCtx.fillStyle = outerGradient;
    rouletteCtx.fill();

    for(let i = 0; i < rouletteNumbers.length; i++) {
      const start = -Math.PI / 2 + i * segmentAngle;
      const end = start + segmentAngle;
      const num = rouletteNumbers[i];
      let color = "#1f9d55";

      if(num !== 0) {
        color = redRouletteNumbers.has(num) ? "#b71c1c" : "#111111";
      }

      rouletteCtx.beginPath();
      rouletteCtx.moveTo(cx, cy);
      rouletteCtx.arc(cx, cy, radius, start, end);
      rouletteCtx.closePath();
      rouletteCtx.fillStyle = color;
      rouletteCtx.fill();

      rouletteCtx.strokeStyle = "#d4af37";
      rouletteCtx.lineWidth = 2;
      rouletteCtx.stroke();

      const textAngle = start + segmentAngle / 2;
      const tx = cx + Math.cos(textAngle) * 185;
      const ty = cy + Math.sin(textAngle) * 185;

      rouletteCtx.save();
      rouletteCtx.translate(tx, ty);
      rouletteCtx.rotate(textAngle + Math.PI / 2);
      rouletteCtx.fillStyle = "#ffffff";
      rouletteCtx.font = "bold 18px Arial";
      rouletteCtx.textAlign = "center";
      rouletteCtx.textBaseline = "middle";
      rouletteCtx.fillText(num, 0, 0);
      rouletteCtx.restore();
    }

    rouletteCtx.beginPath();
    rouletteCtx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    rouletteCtx.fillStyle = "#4b2e05";
    rouletteCtx.fill();
    rouletteCtx.strokeStyle = "#d4af37";
    rouletteCtx.lineWidth = 6;
    rouletteCtx.stroke();

    rouletteCtx.beginPath();
    rouletteCtx.arc(cx, cy, 36, 0, Math.PI * 2);
    rouletteCtx.fillStyle = "#d4af37";
    rouletteCtx.fill();
  }

  function updateRouletteBallPosition(angle) {
    const rect = rouletteCanvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const ballRadius = rect.width * 0.43;

    const x = centerX + Math.cos(angle) * ballRadius;
    const y = centerY + Math.sin(angle) * ballRadius;

    rouletteBall.style.left = `${x}px`;
    rouletteBall.style.top = `${y}px`;
  }

  function normalizeRouletteAngle(angle) {
    return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function setRouletteControlsDisabled(disabled) {
    rouletteContainer.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function setRouletteVoiceEnabled(enabled) {
    voiceEnabled = enabled;
    rouletteVoiceBtn.textContent = enabled ? "Voce attiva" : "Voce disattivata";
    rouletteVoiceBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
  }

  function speakRoulette(text) {
    if(!voiceEnabled || !("speechSynthesis" in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "it-IT";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Errore sintesi vocale roulette:", error);
    }
  }

  function buildRouletteResultText(number) {
    const nickname = rouletteNicknames[number];
    return nickname ? `${number} - ${nickname}` : `${number}`;
  }

  function spinRoulette() {
    if(spinning) return;

    spinning = true;
    setRouletteControlsDisabled(true);
    rouletteResult.textContent = "La pallina gira...";

    if(animationId) {
      window.cancelAnimationFrame(animationId);
      animationId = null;
    }

    if(safetyUnlockTimer) {
      window.clearTimeout(safetyUnlockTimer);
      safetyUnlockTimer = null;
    }

    const winningIndex = Math.floor(Math.random() * rouletteNumbers.length);
    const winningNumber = rouletteNumbers[winningIndex];
    const segmentAngle = (Math.PI * 2) / rouletteNumbers.length;
    const targetAngle = -Math.PI / 2 + winningIndex * segmentAngle + segmentAngle / 2;
    const startAngle = normalizeRouletteAngle(ballAngle);
    const normalizedTarget = normalizeRouletteAngle(targetAngle);
    const extraTurns = Math.PI * 2 * (5 + Math.floor(Math.random() * 3));

    let delta = normalizedTarget - startAngle;
    if(delta < 0) {
      delta += Math.PI * 2;
    }

    const finalAngle = startAngle + extraTurns + delta;
    const duration = 4200;
    const startTime = performance.now();

    function finishSpin() {
      ballAngle = normalizedTarget;
      updateRouletteBallPosition(ballAngle);

      const finalText = buildRouletteResultText(winningNumber);
      rouletteResult.textContent = `Numero uscito: ${finalText}`;
      speakRoulette(finalText);

      spinning = false;
      animationId = null;
      setRouletteControlsDisabled(false);
    }

    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const currentAngle = startAngle + (finalAngle - startAngle) * eased;

      updateRouletteBallPosition(currentAngle);

      if(progress < 1) {
        animationId = window.requestAnimationFrame(animate);
      } else {
        finishSpin();
      }
    }

    animationId = window.requestAnimationFrame(animate);

    safetyUnlockTimer = window.setTimeout(() => {
      if(spinning) {
        if(animationId) {
          window.cancelAnimationFrame(animationId);
          animationId = null;
        }
        finishSpin();
      }
    }, duration + 1000);
  }

  drawRouletteWheel();
  updateRouletteBallPosition(ballAngle);
  setRouletteVoiceEnabled(true);

  rouletteContainer.addEventListener("click", spinRoulette);
  rouletteContainer.addEventListener("keydown", event => {
    if(event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      spinRoulette();
    }
  });
  rouletteVoiceBtn.addEventListener("click", () => {
    setRouletteVoiceEnabled(!voiceEnabled);
  });

  window.addEventListener("resize", () => {
    updateRouletteBallPosition(ballAngle);
  });
}

function boot() {
  setupMenu();
  setupNavigation();
  setupTitleEffects();
  setupSwipe();
  setupInstallUi();
  setupRoulette();
  registerServiceWorker();
  mostraPagina(paginaCorrente);
}

boot();

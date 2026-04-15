const TOTAL_PAGES = 149;
const INSTALL_DISMISS_KEY = "comic-reader-install-dismissed";
const SWIPE_INTENT_THRESHOLD = 10;
const TAP_MAX_DISTANCE = 12;
const SWIPE_TRIGGER_RATIO = 0.25;

const fumetti = Array.from({ length: TOTAL_PAGES }, (_, index) => `tavole/tavola${index}.jpg`);
const vignetteDisponibili = new Set([
  "vignette/vignetta1_0.jpeg",
  "vignette/vignetta2_0.jpeg",
  "vignette/vignetta3_0.jpeg"
]);

const seasonLabels = [
  { start: 1, end: 44, label: "Volume I - L'estate prolungata" },
  { start: 45, end: 97, label: "Volume II - L'inverno sta arrivando" },
  { start: 98, end: 147, label: "Volume III - L'Abisso" },
  { start: 148, end: 149, label: "Volume IV - A million miles from home" }
];

const defaultLayout = [{ top: 0, left: 0, width: 100, height: 100 }];

let paginaCorrente = 0;
let modalOpen = false;
let renderToken = 0;
let deferredInstallPrompt = null;

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
    if(currentScrollY > lastScrollY && currentScrollY > 80) {
      menu.classList.add("hidden");
    } else {
      menu.classList.remove("hidden");
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

function installDismissed() {
  return window.localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
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
  if(!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Service worker non registrato:", error);
  }
}

function setupInstallUi() {
  if(!installBtn || !iosInstallModal) return;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallButton("Installa App");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideInstallUi();
  });

  installBtn.addEventListener("click", async () => {
    if(deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      try {
        const choiceResult = await deferredInstallPrompt.userChoice;
        if(choiceResult && choiceResult.outcome !== "accepted" && !isStandalone()) {
          showInstallButton("Installa App");
          return;
        }
      } catch (error) {
        console.warn("Install prompt non completato:", error);
        showInstallButton("Installa App");
        return;
      }
      deferredInstallPrompt = null;
      hideInstallUi();
      return;
    }

    if(isIos() && !isStandalone()) {
      openInstallInstructions();
    }
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
    hideInstallUi();
    return;
  }

  if(isIos() && !installDismissed()) {
    const content = getIosInstallContent();
    renderInstallInstructions(content);
    showInstallButton(content.buttonLabel);
  }
}

function boot() {
  setupMenu();
  setupNavigation();
  setupTitleEffects();
  setupSwipe();
  setupInstallUi();
  registerServiceWorker();
  mostraPagina(paginaCorrente);
}

boot();

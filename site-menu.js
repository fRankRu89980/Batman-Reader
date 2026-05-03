const secondaryHamburgerToggle = document.getElementById("hamburger-toggle");
const secondaryDrawer = document.getElementById("site-drawer");
const secondaryDrawerOverlay = document.getElementById("site-drawer-overlay");
const secondaryDrawerLinks = Array.from(document.querySelectorAll(".site-drawer-link"));
const secondaryBgVideo = document.getElementById("bg-video");

function setupSecondaryHamburgerMenu() {
  if(!secondaryHamburgerToggle || !secondaryDrawer || !secondaryDrawerOverlay) return;

  let drawerOpen = false;
  let lastFocusedElement = null;

  // Apriamo il drawer e portiamo il focus al primo link disponibile.
  function openDrawer() {
    drawerOpen = true;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : secondaryHamburgerToggle;
    secondaryHamburgerToggle.setAttribute("aria-expanded", "true");
    secondaryHamburgerToggle.setAttribute("aria-label", "Chiudi menu principale");
    secondaryDrawerOverlay.hidden = false;
    secondaryDrawer.classList.add("is-open");
    secondaryDrawer.removeAttribute("aria-hidden");
    secondaryDrawer.inert = false;
    document.body.classList.add("hamburger-open");

    const firstLink = secondaryDrawerLinks[0];
    if(firstLink && typeof firstLink.focus === "function") {
      firstLink.focus();
    }
  }

  // Chiudiamo il drawer senza lasciare il focus dentro il pannello nascosto.
  function closeDrawer() {
    drawerOpen = false;
    secondaryHamburgerToggle.setAttribute("aria-expanded", "false");
    secondaryHamburgerToggle.setAttribute("aria-label", "Apri menu principale");
    secondaryDrawer.classList.remove("is-open");
    secondaryDrawer.setAttribute("aria-hidden", "true");
    secondaryDrawer.inert = true;
    secondaryDrawerOverlay.hidden = true;
    document.body.classList.remove("hamburger-open");

    if(
      secondaryDrawer.contains(document.activeElement) &&
      lastFocusedElement &&
      typeof lastFocusedElement.focus === "function"
    ) {
      lastFocusedElement.focus();
    }
  }

  secondaryHamburgerToggle.addEventListener("click", event => {
    event.stopPropagation();
    if(drawerOpen) {
      closeDrawer();
      return;
    }

    openDrawer();
    secondaryHamburgerToggle.blur();
  });

  secondaryDrawerOverlay.addEventListener("click", closeDrawer);

  secondaryDrawerLinks.forEach(link => {
    link.addEventListener("click", closeDrawer);
  });

  document.addEventListener("keydown", event => {
    if(event.key === "Escape" && drawerOpen) {
      closeDrawer();
    }
  });
}

function setupSecondaryMediaPerformance() {
  if(!secondaryBgVideo) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveDataEnabled = navigator.connection && navigator.connection.saveData === true;
  const shouldReduceMedia = prefersReducedMotion || saveDataEnabled;

  if(shouldReduceMedia) {
    secondaryBgVideo.removeAttribute("autoplay");
    secondaryBgVideo.pause();
    secondaryBgVideo.preload = "none";
    return;
  }

  document.addEventListener("visibilitychange", () => {
    if(document.hidden) {
      secondaryBgVideo.pause();
      return;
    }

    const playPromise = secondaryBgVideo.play();
    if(playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  });
}

async function registerSecondaryServiceWorker() {
  if(!("serviceWorker" in navigator)) return;
  if(!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1" && location.hostname !== "::1") {
    return;
  }

  try {
    if(location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "::1") {
      return;
    }

    await navigator.serviceWorker.register("./sw.js?v=7", {
      updateViaCache: "none"
    });
  } catch (error) {
    console.warn("Service worker non registrato nella sezione secondaria:", error);
  }
}

function bootSecondaryPage() {
  setupSecondaryMediaPerformance();
  setupSecondaryHamburgerMenu();
  registerSecondaryServiceWorker();
}

bootSecondaryPage();


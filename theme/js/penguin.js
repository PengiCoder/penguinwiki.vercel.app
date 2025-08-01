// Penguin Theme JavaScript with Astro View Transitions Compatibility

// Core Astro-inspired constants and variables
const BEFORE_PREPARATION = "mkdocs:before-preparation";
const AFTER_PREPARATION = "mkdocs:after-preparation";
const BEFORE_SWAP = "mkdocs:before-swap";
const AFTER_SWAP = "mkdocs:after-swap";

const dispatchEvent = e => document.dispatchEvent(new Event(e));

// Enhanced page transition system inspired by Astro
class PageTransition extends Event {
    constructor(type, options, from, to, direction, navigationType, sourceElement, info) {
        super(type, options);
        this.from = from;
        this.to = to;
        this.direction = direction;
        this.navigationType = navigationType;
        this.sourceElement = sourceElement;
        this.info = info;
        
        Object.defineProperties(this, {
            from: { enumerable: true },
            to: { enumerable: true, writable: true },
            direction: { enumerable: true, writable: true },
            navigationType: { enumerable: true },
            sourceElement: { enumerable: true },
            info: { enumerable: true }
        });
    }
}

// View transition support detection
const supportsViewTransitions = !!document.startViewTransition;
const isViewTransitionsEnabled = () => !!document.querySelector('[name="mkdocs-view-transitions-enabled"]');

// Navigation state management
let currentLocation, viewTransition, skipTransition = false, finishTransition;
let navigationIndex = 0;

// History management
const originalPushState = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

const updateHistoryState = (state) => {
    if (history.state) {
        history.scrollRestoration = "manual";
        originalReplaceState({ ...history.state, ...state }, "");
    }
};

// Initialize navigation state
if (history.state) {
    navigationIndex = history.state.index;
    scrollTo({ left: history.state.scrollX, top: history.state.scrollY });
} else if (isViewTransitionsEnabled()) {
    originalReplaceState({ index: navigationIndex, scrollX: window.scrollX, scrollY: window.scrollY }, "");
    history.scrollRestoration = "manual";
}

// Enhanced page loading with prefetching
const prefetchedPages = new Set();
const observedLinks = new WeakSet();
let prefetchAll = false;
let defaultPrefetchStrategy = "hover";
let prefetchInitialized = false;

// Prefetch functionality
function initializePrefetch(options) {
    if (prefetchInitialized) return;
    prefetchInitialized = true;
    
    prefetchAll = options?.prefetchAll ?? false;
    defaultPrefetchStrategy = options?.defaultStrategy ?? "hover";
    
    setupTapPrefetch();
    setupHoverPrefetch();
    setupViewportPrefetch();
    setupLoadPrefetch();
}

function setupTapPrefetch() {
    for (const event of ["touchstart", "mousedown"]) {
        document.body.addEventListener(event, (e) => {
            if (shouldPrefetch(e.target, "tap")) {
                prefetchPage(e.target.href, { with: "fetch", ignoreSlowConnection: true });
            }
        }, { passive: true });
    }
}

function setupHoverPrefetch() {
    let hoverTimeout;
    
    document.body.addEventListener("focusin", (e) => {
        if (shouldPrefetch(e.target, "hover")) handleHover(e);
    }, { passive: true });
    
    document.body.addEventListener("focusout", handleHoverEnd, { passive: true });
    
    observeNewLinks(() => {
        for (const link of document.getElementsByTagName("a")) {
            if (!observedLinks.has(link) && shouldPrefetch(link, "hover")) {
                observedLinks.add(link);
                link.addEventListener("mouseenter", handleHover, { passive: true });
                link.addEventListener("mouseleave", handleHoverEnd, { passive: true });
            }
        }
    });
    
    function handleHover(e) {
        const href = e.target.href;
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
            prefetchPage(href, { with: "fetch" });
        }, 80);
    }
    
    function handleHoverEnd() {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = 0;
        }
    }
}

function setupViewportPrefetch() {
    let intersectionObserver;
    
    observeNewLinks(() => {
        for (const link of document.getElementsByTagName("a")) {
            if (!observedLinks.has(link) && shouldPrefetch(link, "viewport")) {
                observedLinks.add(link);
                if (!intersectionObserver) intersectionObserver = createIntersectionObserver();
                intersectionObserver.observe(link);
            }
        }
    });
}

function createIntersectionObserver() {
    const timeouts = new WeakMap();
    return new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
            const link = entry.target;
            const timeout = timeouts.get(link);
            
            if (entry.isIntersecting) {
                if (timeout) clearTimeout(timeout);
                timeouts.set(link, setTimeout(() => {
                    observer.unobserve(link);
                    timeouts.delete(link);
                    prefetchPage(link.href, { with: "link" });
                }, 300));
            } else if (timeout) {
                clearTimeout(timeout);
                timeouts.delete(link);
            }
        }
    });
}

function setupLoadPrefetch() {
    observeNewLinks(() => {
        for (const link of document.getElementsByTagName("a")) {
            if (shouldPrefetch(link, "load")) {
                prefetchPage(link.href, { with: "link" });
            }
        }
    });
}

function prefetchPage(url, options) {
    const ignoreSlowConnection = options?.ignoreSlowConnection ?? false;
    if (!canPrefetch(url, ignoreSlowConnection)) return;
    
    prefetchedPages.add(url);
    
    if ((options?.with ?? "link") === "link") {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.setAttribute("href", url);
        document.head.append(link);
    } else {
        fetch(url).catch(error => {
            console.log(`[mkdocs] Failed to prefetch ${url}`);
            console.error(error);
        });
    }
}

function canPrefetch(url, ignoreSlowConnection) {
    if (!navigator.onLine || (!ignoreSlowConnection && isSlowConnection())) return false;
    
    try {
        const targetUrl = new URL(url, location.href);
        return location.origin === targetUrl.origin &&
               (location.pathname !== targetUrl.pathname || location.search !== targetUrl.search) &&
               !prefetchedPages.has(url);
    } catch {
        return false;
    }
}

function shouldPrefetch(element, strategy) {
    if (element?.tagName !== "A") return false;
    
    const prefetchAttr = element.dataset.mkdocsPrefetch;
    if (prefetchAttr === "false") return false;
    
    if (strategy === "tap" && (prefetchAttr != null || prefetchAll) && isSlowConnection()) {
        return true;
    }
    
    if (prefetchAttr == null && prefetchAll || prefetchAttr === "") {
        return strategy === defaultPrefetchStrategy;
    }
    
    return prefetchAttr === strategy;
}

function isSlowConnection() {
    if ("connection" in navigator) {
        const connection = navigator.connection;
        return connection.saveData || /2g/.test(connection.effectiveType);
    }
    return false;
}

function observeNewLinks(callback) {
    callback();
    let hasRun = false;
    document.addEventListener("mkdocs:page-load", () => {
        if (!hasRun) {
            hasRun = true;
            return;
        }
        callback();
    });
}

// Enhanced navigation system
async function navigateToPage(direction, fromUrl, toUrl, options, scrollState) {
    if (!isViewTransitionsEnabled() || location.origin !== toUrl.origin) {
        location.href = toUrl.href;
        return;
    }
    
    const navigationType = scrollState ? "traverse" : 
                          options.history === "replace" ? "replace" : "push";
    
    if (navigationType !== "traverse") {
        updateHistoryState({ scrollX: window.scrollX, scrollY: window.scrollY });
    }
    
    // Handle same-page navigation with hash
    if (fromUrl.pathname === toUrl.pathname && fromUrl.search === toUrl.search) {
        if ((direction !== "back" && toUrl.hash) || (direction === "back" && fromUrl.hash)) {
            updateLocation(toUrl, fromUrl, options, document.title, scrollState);
            return;
        }
    }
    
    const transitionEvent = await dispatchBeforePreparation(fromUrl, toUrl, direction, navigationType, options);
    
    if (transitionEvent.defaultPrevented) {
        location.href = toUrl.href;
        return;
    }
    
    skipTransition = false;
    
    if (supportsViewTransitions) {
        viewTransition = document.startViewTransition(async () => {
            await performPageSwap(transitionEvent, options, scrollState);
        });
    } else {
        const asyncSwap = (async () => {
            await new Promise(resolve => setTimeout(resolve));
            await performPageSwap(transitionEvent, options, scrollState, getFallbackAnimation());
        })();
        
        viewTransition = {
            updateCallbackDone: asyncSwap,
            ready: asyncSwap,
            finished: new Promise(resolve => finishTransition = resolve),
            skipTransition: () => { skipTransition = true; }
        };
    }
    
    viewTransition.ready.then(async () => {
        await executeScripts();
        dispatchPageLoad();
        createRouteAnnouncer();
    });
    
    viewTransition.finished.then(() => {
        document.documentElement.removeAttribute("data-mkdocs-transition");
        document.documentElement.removeAttribute("data-mkdocs-transition-fallback");
    });
    
    await viewTransition.ready;
}

async function dispatchBeforePreparation(from, to, direction, navigationType, options) {
    const event = new PageTransition(
        BEFORE_PREPARATION,
        { cancelable: true },
        from, to, direction, navigationType,
        options.sourceElement, options.info
    );
    
    event.loader = async function() {
        const response = await fetchPage(this.to.href, options);
        if (response === null) {
            this.preventDefault();
            return;
        }
        
        if (response.redirected) {
            this.to = new URL(response.redirected);
        }
        
        this.newDocument = new DOMParser().parseFromString(response.html, response.mediaType);
        this.newDocument.querySelectorAll("noscript").forEach(el => el.remove());
        
        if (!this.newDocument.querySelector('[name="mkdocs-view-transitions-enabled"]') && !options.formData) {
            this.preventDefault();
            return;
        }
        
        const stylesheetPromises = preloadStylesheets(this.newDocument);
        if (stylesheetPromises.length) {
            await Promise.all(stylesheetPromises);
        }
    }.bind(event);
    
    if (document.dispatchEvent(event)) {
        await event.loader();
        if (!event.defaultPrevented) {
            dispatchEvent(AFTER_PREPARATION);
            if (event.navigationType !== "traverse") {
                updateHistoryState({ scrollX: window.scrollX, scrollY: window.scrollY });
            }
        }
    }
    
    return event;
}

async function fetchPage(url, options) {
    try {
        const fetchOptions = {};
        if (options.formData) {
            fetchOptions.method = "POST";
            fetchOptions.body = options.formData;
        }
        
        const response = await fetch(url, fetchOptions);
        const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim();
        
        if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
            return null;
        }
        
        return {
            html: await response.text(),
            redirected: response.redirected ? response.url : undefined,
            mediaType: contentType
        };
    } catch {
        return null;
    }
}

function preloadStylesheets(newDocument) {
    const promises = [];
    for (const link of newDocument.querySelectorAll("head link[rel=stylesheet]")) {
        const href = link.getAttribute("href");
        if (!document.querySelector(`link[rel=stylesheet][href="${href}"]`)) {
            const preloadLink = document.createElement("link");
            preloadLink.setAttribute("rel", "preload");
            preloadLink.setAttribute("as", "style");
            preloadLink.setAttribute("href", href);
            
            promises.push(new Promise(resolve => {
                ["load", "error"].forEach(event => preloadLink.addEventListener(event, resolve));
                document.head.append(preloadLink);
            }));
        }
    }
    return promises;
}

async function performPageSwap(transitionEvent, options, scrollState, fallback) {
    if (!skipTransition) {
        document.documentElement.setAttribute("data-mkdocs-transition", transitionEvent.direction);
        if (fallback === "animate") {
            await animateTransition("old");
        }
    } else {
        throw new DOMException("Transition was skipped");
    }
    
    const title = document.title;
    const swapEvent = await dispatchBeforeSwap(transitionEvent, viewTransition, swapDocument);
    
    updateLocation(swapEvent.to, swapEvent.from, options, title, scrollState);
    dispatchEvent(AFTER_SWAP);
    
    if (fallback === "animate" && !skipTransition) {
        animateTransition("new").then(() => finishTransition && finishTransition());
    }
}

async function dispatchBeforeSwap(transitionEvent, vt, swapFn) {
    const event = new PageTransition(
        BEFORE_SWAP,
        undefined,
        transitionEvent.from,
        transitionEvent.to,
        transitionEvent.direction,
        transitionEvent.navigationType,
        transitionEvent.sourceElement,
        transitionEvent.info
    );
    
    event.newDocument = transitionEvent.newDocument;
    event.viewTransition = vt;
    event.swap = swapFn.bind(event);
    
    document.dispatchEvent(event);
    event.swap();
    return event;
}

function swapDocument(event) {
    const newDocument = event.newDocument;
    const documentElement = document.documentElement;
    
    // Update document attributes
    const oldAttributes = [...documentElement.attributes].filter(({ name }) => {
        documentElement.removeAttribute(name);
        return name.startsWith("data-mkdocs-");
    });
    
    [...newDocument.documentElement.attributes, ...oldAttributes].forEach(({ name, value }) => {
        documentElement.setAttribute(name, value);
    });
    
    // Update head
    for (const child of Array.from(document.head.children)) {
        const newChild = findMatchingElement(child, newDocument);
        if (newChild) {
            newChild.remove();
        } else {
            child.remove();
        }
    }
    document.head.append(...newDocument.head.children);
    
    // Update body with preserved elements
    const oldBody = document.body;
    const activeElement = preserveActiveElement();
    
    document.body.replaceWith(newDocument.body);
    
    // Restore preserved elements
    for (const preserved of oldBody.querySelectorAll('[data-mkdocs-persist]')) {
        const id = preserved.getAttribute('data-mkdocs-persist');
        const newElement = document.querySelector(`[data-mkdocs-persist="${id}"]`);
        if (newElement) {
            newElement.replaceWith(preserved);
        }
    }
    
    restoreActiveElement(activeElement);
}

function findMatchingElement(element, newDocument) {
    const persistId = element.getAttribute('data-mkdocs-persist');
    if (persistId) {
        return newDocument.head.querySelector(`[data-mkdocs-persist="${persistId}"]`);
    }
    
    if (element.matches('link[rel=stylesheet]')) {
        const href = element.getAttribute('href');
        return newDocument.head.querySelector(`link[rel=stylesheet][href="${href}"]`);
    }
    
    return null;
}

function preserveActiveElement() {
    const activeElement = document.activeElement;
    if (activeElement?.closest('[data-mkdocs-persist]')) {
        if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
            return {
                element: activeElement,
                start: activeElement.selectionStart,
                end: activeElement.selectionEnd
            };
        }
        return { element: activeElement };
    }
    return { element: null };
}

function restoreActiveElement({ element, start, end }) {
    if (element) {
        element.focus();
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            element.selectionStart = start;
            element.selectionEnd = end;
        }
    }
}

async function animateTransition(phase) {
    function hasInfiniteAnimation(animation) {
        const effect = animation.effect;
        if (!effect || !(effect instanceof KeyframeEffect) || !effect.target) return false;
        
        const computedStyle = window.getComputedStyle(effect.target, effect.pseudoElement);
        return computedStyle.animationIterationCount === "infinite";
    }
    
    const existingAnimations = document.getAnimations();
    document.documentElement.setAttribute("data-mkdocs-transition-fallback", phase);
    
    const newAnimations = document.getAnimations().filter(animation => 
        !existingAnimations.includes(animation) && !hasInfiniteAnimation(animation)
    );
    
    return Promise.all(newAnimations.map(animation => animation.finished));
}

function updateLocation(to, from, options, title, scrollState) {
    const isSameUrl = from.pathname === to.pathname && from.search === to.search;
    const currentTitle = document.title;
    document.title = title;
    
    let scrolled = false;
    
    if (to.href !== location.href && !scrollState) {
        if (options.history === "replace") {
            const state = history.state;
            originalReplaceState({
                ...options.state,
                index: state.index,
                scrollX: state.scrollX,
                scrollY: state.scrollY
            }, "", to.href);
        } else {
            originalPushState({
                ...options.state,
                index: ++navigationIndex,
                scrollX: 0,
                scrollY: 0
            }, "", to.href);
        }
    }
    
    document.title = currentTitle;
    currentLocation = to;
    
    if (isSameUrl) return;
    
    scrollTo({ left: 0, top: 0, behavior: "instant" });
    scrolled = true;
    
    if (scrollState) {
        scrollTo(scrollState.scrollX, scrollState.scrollY);
    } else if (to.hash) {
        history.scrollRestoration = "auto";
        const state = history.state;
        location.href = to.href;
        if (!history.state) {
            originalReplaceState(state, "");
            if (isSameUrl) {
                window.dispatchEvent(new PopStateEvent("popstate"));
            }
        }
    } else if (!scrolled) {
        scrollTo({ left: 0, top: 0, behavior: "instant" });
    }
    
    history.scrollRestoration = "manual";
}

async function executeScripts() {
    let promise = Promise.resolve();
    
    for (const script of Array.from(document.scripts)) {
        if (script.dataset.mkdocsExec === "") continue;
        
        const type = script.getAttribute("type");
        if (type && type !== "module" && type !== "text/javascript") continue;
        
        const newScript = document.createElement("script");
        newScript.innerHTML = script.innerHTML;
        
        for (const attribute of script.attributes) {
            if (attribute.name === "src") {
                const loadPromise = new Promise(resolve => {
                    newScript.onload = newScript.onerror = resolve;
                });
                promise = promise.then(() => loadPromise);
            }
            newScript.setAttribute(attribute.name, attribute.value);
        }
        
        newScript.dataset.mkdocsExec = "";
        script.replaceWith(newScript);
    }
    
    return promise;
}

function dispatchPageLoad() {
    dispatchEvent("mkdocs:page-load");
}

function createRouteAnnouncer() {
    let announcer = document.createElement("div");
    announcer.setAttribute("aria-live", "assertive");
    announcer.setAttribute("aria-atomic", "true");
    announcer.className = "route-announcer";
    document.body.append(announcer);
    
    setTimeout(() => {
        let title = document.title || document.querySelector("h1")?.textContent || location.pathname;
        announcer.textContent = title;
    }, 60);
}

function getFallbackAnimation() {
    const meta = document.querySelector('[name="mkdocs-view-transitions-fallback"]');
    return meta ? meta.getAttribute("content") : "animate";
}

// Enhanced navigation with form support
async function navigate(url, options = {}) {
    await navigateToPage("forward", currentLocation, new URL(url, location.href), options);
}

// Popstate handler for browser back/forward
function handlePopState(event) {
    if (!isViewTransitionsEnabled() && event.state) {
        location.reload();
        return;
    }
    
    if (event.state === null) return;
    
    const state = history.state;
    const index = state.index;
    const direction = index > navigationIndex ? "forward" : "back";
    
    navigationIndex = index;
    navigateToPage(direction, currentLocation, new URL(location.href), {}, state);
}

// Scroll position tracking
const trackScrollPosition = () => {
    if (history.state && (window.scrollX !== history.state.scrollX || window.scrollY !== history.state.scrollY)) {
        updateHistoryState({ scrollX: window.scrollX, scrollY: window.scrollY });
    }
};

// Initialize enhanced navigation
if (supportsViewTransitions || getFallbackAnimation() !== "none") {
    currentLocation = new URL(location.href);
    addEventListener("popstate", handlePopState);
    addEventListener("load", dispatchPageLoad);
    
    // Scroll tracking
    if ("onscrollend" in window) {
        addEventListener("scrollend", trackScrollPosition);
    } else {
        let scrollTimer, lastScrollX, lastScrollY, lastIndex;
        
        const checkScrollEnd = () => {
            if (lastIndex !== history.state?.index) {
                clearInterval(scrollTimer);
                scrollTimer = undefined;
                return;
            }
            
            if (lastScrollY === window.scrollY && lastScrollX === window.scrollX) {
                clearInterval(scrollTimer);
                scrollTimer = undefined;
                trackScrollPosition();
                return;
            } else {
                lastScrollY = window.scrollY;
                lastScrollX = window.scrollX;
            }
        };
        
        addEventListener("scroll", () => {
            if (scrollTimer === undefined) {
                lastIndex = history.state.index;
                lastScrollY = window.scrollY;
                lastScrollX = window.scrollX;
                scrollTimer = window.setInterval(checkScrollEnd, 50);
            }
        }, { passive: true });
    }
    
    // Mark existing scripts as executed
    for (const script of document.scripts) {
        script.dataset.mkdocsExec = "";
    }
}

// Enhanced click and form handling
document.addEventListener("click", (event) => {
    let target = event.target;
    
    if (event.composed) {
        target = event.composedPath()[0];
    }
    
    if (target instanceof Element) {
        target = target.closest("a, area");
    }
    
    if (!(target instanceof HTMLAnchorElement) && 
        !(target instanceof SVGAElement) && 
        !(target instanceof HTMLAreaElement)) {
        return;
    }
    
    const targetAttribute = target instanceof HTMLElement ? target.target : target.target.baseVal;
    const href = target instanceof HTMLElement ? target.href : target.href.baseVal;
    const origin = new URL(href, location.href).origin;
    
    // Skip if should reload, has download, external link, or modified click
    if (target.dataset.mkdocsReload !== undefined ||
        target.hasAttribute("download") ||
        !target.href ||
        (targetAttribute && targetAttribute !== "_self") ||
        origin !== location.origin ||
        event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
        event.defaultPrevented) {
        return;
    }
    
    event.preventDefault();
    navigate(href, {
        history: target.dataset.mkdocsHistory === "replace" ? "replace" : "auto",
        sourceElement: target
    });
});

// Enhanced form handling
document.addEventListener("submit", (event) => {
    let target = event.target;
    
    if (target.tagName !== "FORM" || 
        event.defaultPrevented || 
        target.dataset.mkdocsReload !== undefined) {
        return;
    }
    
    const form = target;
    const submitter = event.submitter;
    const formData = new FormData(form, submitter);
    
    let action = submitter?.getAttribute("formaction") ?? form.action ?? location.pathname;
    const method = submitter?.getAttribute("formmethod") ?? form.method;
    
    if (method === "dialog" || location.origin !== new URL(action, location.href).origin) {
        return;
    }
    
    const options = {
        sourceElement: submitter ?? form
    };
    
    if (method === "get") {
        const searchParams = new URLSearchParams(formData);
        const url = new URL(action);
        url.search = searchParams.toString();
        action = url.toString();
    } else {
        options.formData = formData;
    }
    
    event.preventDefault();
    navigate(action, options);
});

// Initialize prefetching
initializePrefetch({ prefetchAll: true });

// MkDocs-specific enhancements
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for anchor links
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Active navigation highlighting
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.navbar a');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });

    // Search functionality enhancement
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            const content = document.querySelector('.content');
            if (content && query.length > 2) {
                highlightSearchTerms(content, query);
            }
        });
    }

    // Mobile menu toggle
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navbar = document.querySelector('.navbar ul');
    if (mobileMenuToggle && navbar) {
        mobileMenuToggle.addEventListener('click', function() {
            navbar.classList.toggle('show');
        });
    }

    // Enhanced image lazy loading
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '50px 0px',
        threshold: 0.01
    });

    images.forEach(img => imageObserver.observe(img));

    // Enhanced code block functionality
    const codeBlocks = document.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
        const container = block.parentNode;
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        
        const toolbar = document.createElement('div');
        toolbar.className = 'code-toolbar';
        
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy';
        copyButton.className = 'copy-button';
        copyButton.setAttribute('aria-label', 'Copy code to clipboard');
        
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(block.textContent);
                copyButton.textContent = 'Copied!';
                copyButton.classList.add('copied');
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                    copyButton.classList.remove('copied');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy code:', err);
                copyButton.textContent = 'Failed';
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 2000);
            }
        });
        
        toolbar.appendChild(copyButton);
        wrapper.appendChild(toolbar);
        
        container.parentNode.insertBefore(wrapper, container);
        wrapper.appendChild(container);
    });

    // Table enhancements
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
        
        // Add responsive scroll indicator
        const scrollIndicator = document.createElement('div');
        scrollIndicator.className = 'scroll-indicator';
        scrollIndicator.textContent = '← Scroll to see more →';
        wrapper.appendChild(scrollIndicator);
        
        wrapper.addEventListener('scroll', () => {
            const { scrollLeft, scrollWidth, clientWidth } = wrapper;
            const isScrollable = scrollWidth > clientWidth;
            const isAtStart = scrollLeft === 0;
            const isAtEnd = scrollLeft >= scrollWidth - clientWidth - 1;
            
            scrollIndicator.style.display = isScrollable ? 'block' : 'none';
            
            if (isScrollable) {
                if (isAtStart) {
                    scrollIndicator.textContent = 'Scroll right to see more →';
                } else if (isAtEnd) {
                    scrollIndicator.textContent = '← Scroll left to see more';
                } else {
                    scrollIndicator.textContent = '← Scroll to see more →';
                }
            }
        });
        
        // Trigger initial scroll check
        wrapper.dispatchEvent(new Event('scroll'));
    });

    // Enhanced table of contents
    const tocLinks = document.querySelectorAll('.contents a[href^="#"]');
    const sections = Array.from(tocLinks).map(link => {
        const id = link.getAttribute('href').slice(1);
        return document.getElementById(id);
    }).filter(Boolean);

    if (sections.length > 0) {
        const tocObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const id = entry.target.id;
                const tocLink = document.querySelector(`.contents a[href="#${id}"]`);
                
                if (entry.isIntersecting) {
                    tocLink?.classList.add('active');
                } else {
                    tocLink?.classList.remove('active');
                }
            });
        }, {
            rootMargin: '-20% 0px -70% 0px',
            threshold: 0
        });

        sections.forEach(section => tocObserver.observe(section));
    }

    // Keyboard navigation enhancements
    document.addEventListener('keydown', (event) => {
        // Alt + Arrow keys for page navigation
        if (event.altKey && !event.ctrlKey && !event.shiftKey) {
            const navLinks = Array.from(document.querySelectorAll('.navbar a'));
            const currentIndex = navLinks.findIndex(link => 
                link.classList.contains('active') || 
                link.href === window.location.href
            );
            
            if (event.key === 'ArrowLeft' && currentIndex > 0) {
                event.preventDefault();
                navLinks[currentIndex - 1].click();
            } else if (event.key === 'ArrowRight' && currentIndex < navLinks.length - 1) {
                event.preventDefault();
                navLinks[currentIndex + 1].click();
            }
        }
        
        // Escape key to close search or other overlays
        if (event.key === 'Escape') {
            const searchInput = document.querySelector('.search-input');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
                clearSearchHighlights();
            }
        }
    });

    // Print preparation
    window.addEventListener('beforeprint', () => {
        // Expand all collapsed sections for printing
        const details = document.querySelectorAll('details');
        details.forEach(detail => {
            detail.setAttribute('open', '');
            detail.dataset.wasOpenForPrint = 'true';
        });
        
        // Remove transitions for cleaner printing
        document.body.classList.add('printing');
    });

    window.addEventListener('afterprint', () => {
        // Restore collapsed sections
        const details = document.querySelectorAll('details[data-was-open-for-print]');
        details.forEach(detail => {
            detail.removeAttribute('open');
            detail.removeAttribute('data-was-open-for-print');
        });
        
        document.body.classList.remove('printing');
    });

    // Initial page load dispatch
    dispatchPageLoad();
});

// Enhanced search functionality
function highlightSearchTerms(element, query) {
    // Clear previous highlights
    clearSearchHighlights();
    
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                return node.parentNode.tagName === 'SCRIPT' || 
                       node.parentNode.tagName === 'STYLE' ||
                       node.parentNode.classList.contains('search-highlight')
                       ? NodeFilter.FILTER_REJECT 
                       : NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }

    let matchCount = 0;
    textNodes.forEach(textNode => {
        const text = textNode.textContent;
        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        
        if (regex.test(text)) {
            const highlightedText = text.replace(regex, '<mark class="search-highlight">$1</mark>');
            const wrapper = document.createElement('span');
            wrapper.innerHTML = highlightedText;
            textNode.parentNode.replaceChild(wrapper, textNode);
            matchCount += (text.match(regex) || []).length;
        }
    });

    // Update search results indicator
    updateSearchResults(matchCount, query);
}

function clearSearchHighlights() {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
    });
    
    updateSearchResults(0, '');
}

function updateSearchResults(count, query) {
    let indicator = document.querySelector('.search-results-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'search-results-indicator';
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.parentNode.appendChild(indicator);
        }
    }
    
    if (count > 0) {
        indicator.textContent = `${count} match${count !== 1 ? 'es' : ''} found for "${query}"`;
        indicator.style.display = 'block';
    } else if (query) {
        indicator.textContent = `No matches found for "${query}"`;
        indicator.style.display = 'block';
    } else {
        indicator.style.display = 'none';
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\        // Ad');
}

// Theme management
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Dispatch theme change event
    document.dispatchEvent(new CustomEvent('themechange', {
        detail: { theme: isDark ? 'dark' : 'light' }
    }));
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-theme');
    }
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            document.body.classList.toggle('dark-theme', e.matches);
        }
    });
}

// Initialize theme on load
initializeTheme();

// Performance monitoring
function measurePageLoadTime() {
    if ('performance' in window) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                if (perfData) {
                    console.log(`Page load time: ${Math.round(perfData.loadEventEnd - perfData.fetchStart)}ms`);
                }
            }, 0);
        });
    }
}

measurePageLoadTime();

// Export functions for external use
window.penguinTheme = {
    navigate,
    toggleTheme,
    highlightSearchTerms,
    clearSearchHighlights,
    prefetchPage
};
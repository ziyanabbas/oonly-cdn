/* ────────────────────────────────────────────────────────────
   Oonly Universal Tracker  v1.3.0  (2025-07-15)
   GA-plus + Clarity-plus *plus* full session-replay + Advanced Segmentation.
   Footprint ≈22 kB gzip (extra 4 kB for replay), zero deps, ES5-safe
────────────────────────────────────────────────────────────── */

// IMMEDIATE STUB - ensures window.oonly exists even if heavy init fails
(function (w) {
  if (!w.oonly) {
    const q = [];
    const api = function () {
      q.push(arguments);
    };
    api._q = q;
    api._ready = false;
    api.onReady = function (cb) {
      (api._cbs || (api._cbs = [])).push(cb);
      if (api._ready)
        try {
          cb();
        } catch {}
    };
    [
      "track",
      "identify",
      "set",
      "configure",
      "refreshSegments",
      "getUserProperties",
      "getActiveSegments",
      "isInSegment",
      "trackSegmentInteraction",
    ].forEach((m) => {
      api[m] = function () {
        q.push([m, Array.from(arguments)]);
      };
    });
    w.oonly = api;
  }
})(window);

(function () {
  /* ---------- Config ---------- */
  "use strict";

  // TESTING: Remove this console log when ready for production            // CFG will be defined after _ds is declared

  /* ---------- Browser Compatibility Polyfills ---------- */
  // Polyfill for Element.closest() for older browsers
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches && el.matches(selector)) {
          return el;
        }
        if (el.msMatchesSelector && el.msMatchesSelector(selector)) {
          return el;
        }
        if (el.webkitMatchesSelector && el.webkitMatchesSelector(selector)) {
          return el;
        }
        el = el.parentElement || el.parentNode;
      }
      return null;
    };
  }

  // Polyfill for Element.matches() for older browsers
  if (!Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.msMatchesSelector ||
      Element.prototype.webkitMatchesSelector;
  }

  // Safe now function with fallback
  const now = () => {
    try {
      return Date.now();
    } catch (e) {
      return new Date().getTime();
    }
  };

  // Safe DOM helper functions
  const safeClosest = (element, selector) => {
    try {
      if (!element || !element.nodeType || element.nodeType !== 1) {
        return null;
      }
      if (typeof element.closest === "function") {
        return element.closest(selector);
      }
      // Manual traversal fallback
      let el = element;
      while (el && el.nodeType === 1) {
        if (safeMatches(el, selector)) {
          return el;
        }
        el = el.parentElement || el.parentNode;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const safeMatches = (element, selector) => {
    try {
      if (!element || !element.nodeType || element.nodeType !== 1) {
        return false;
      }
      if (typeof element.matches === "function") {
        return element.matches(selector);
      }
      if (typeof element.msMatchesSelector === "function") {
        return element.msMatchesSelector(selector);
      }
      if (typeof element.webkitMatchesSelector === "function") {
        return element.webkitMatchesSelector(selector);
      }
      if (typeof element.mozMatchesSelector === "function") {
        return element.mozMatchesSelector(selector);
      }
      if (typeof element.oMatchesSelector === "function") {
        return element.oMatchesSelector(selector);
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // Safe event target helper
  const safeGetEventTarget = (event) => {
    try {
      return event.target || event.srcElement || null;
    } catch (e) {
      return null;
    }
  };

  /* ---------- Timing & Buffers (MUST BE BEFORE ANYTHING THAT CALLS queue/rec) ---------- */
  const buf = [];
  let lastFlush = now();
  let recBuf = [];
  let lastSnap = now();
  let flushTimer = null; // Timer for batched flushing
  let isFlushInProgress = false; // Prevent concurrent flushes
  let retryQueue = []; // Queue for failed requests to retry

  /* ---------- Global Data Variables ---------- */
  let geoData = null; // Will be populated when geolocation is fetched
  let isTraditionalSite = false; // Will be set based on site type detection
  let criticalEventTypes = new Set([
    "formSubmit",
    "page_view",
    "sessionStart",
    "sessionEnd",
    "purchase",
    "signup",
    "login",
  ]); // Events that need immediate flushing

  /* ✨ NEW ✨ Session-relative timing for video-like replay */
  let sessionStartTime = null; // Will be set when session starts
  const getSessionRelativeTime = () => {
    if (!sessionStartTime) return 0;
    return now() - sessionStartTime;
  };

  /* ---------- Site Type Detection ---------- */
  // Detect if this is a traditional website (page reloads) vs SPA
  function detectSiteType() {
    // Check for common SPA frameworks
    const hasReact = !!(
      window.React ||
      document.querySelector("[data-reactroot]") ||
      document.querySelector('div[id*="react"]')
    );
    const hasVue = !!(
      window.Vue ||
      document.querySelector("[data-v-]") ||
      document.querySelector('div[id*="vue"]')
    );
    const hasAngular = !!(
      window.angular ||
      window.ng ||
      document.querySelector("[ng-app]") ||
      document.querySelector("[ng-controller]")
    );
    const hasSvelte = !!(
      window.__SVELTE__ || document.querySelector("[data-svelte]")
    );
    const hasEmber = !!(
      window.Ember || document.querySelector(".ember-application")
    );
    const hasBackbone = !!window.Backbone;
    const hasNextJS = !!(
      window.__NEXT_DATA__ || document.querySelector("#__next")
    );
    const hasNuxt = !!(window.__NUXT__ || document.querySelector("#__nuxt"));
    const hasGatsby = !!(
      window.___gatsby || document.querySelector("#___gatsby")
    );

    // Check for SPA indicators
    const hasHashRouting = location.hash.includes("#/");
    const hasHistoryAPI = !!(window.history && window.history.pushState);
    const hasDynamicContent =
      document.querySelector("[data-router-view]") ||
      document.querySelector("[router-outlet]") ||
      document.querySelector("[ui-view]");

    // If any SPA framework or pattern is detected, it's likely an SPA
    const isSPA =
      hasReact ||
      hasVue ||
      hasAngular ||
      hasSvelte ||
      hasEmber ||
      hasBackbone ||
      hasNextJS ||
      hasNuxt ||
      hasGatsby ||
      hasHashRouting ||
      hasDynamicContent;

    // Traditional sites typically have full page reloads
    isTraditionalSite = !isSPA;

    console.log(
      `[oonly] Site type detected: ${isTraditionalSite ? "Traditional" : "SPA"}`
    );
    return isTraditionalSite;
  }

  /* ✨ ENHANCED SESSION RECORDING ✨ */
  let rrwebEvents = [];
  let rrwebRecorder = null;
  let sessionRecording = {
    events: [],
    snapshots: [],
    interactions: [],
    viewport: null,
    startTime: null,
    isRecording: false,
  };
  let recordingConfig = {
    captureFullPage: true,
    captureInteractions: true,
    captureViewport: true,
    captureConsole: false, // Disabled by default for privacy
    maxEvents: 10000,
    compressionEnabled: true,
  };

  // Basic queue/rec functions (will be redefined later with full logic)
  function queue(e) {
    buf.push(e);
  }
  function rec(e) {
    recBuf.push(e);
  }

  // Utility functions
  function log(message, data) {
    if (CFG.debug) {
    }
  }

  function generateId() {
    return "id_" + Math.random().toString(36).substr(2, 9);
  }

  function getProjectId() {
    const script =
      document.currentScript ||
      document.querySelector('script[src*="oonly.min.js"]');
    return script ? script.getAttribute("data-project-id") : null;
  }

  function getSessionId() {
    let sessionId = sessionStorage.getItem("oonly_session_id");
    if (!sessionId) {
      sessionId = generateId();
      sessionStorage.setItem("oonly_session_id", sessionId);
    }
    return sessionId;
  }

  function getUserId() {
    return localStorage.getItem("oonly_user_id") || generateId();
  }

  function setUserId(id) {
    localStorage.setItem("oonly_user_id", id);
  }

  // Event tracking - simplified to just queue events
  function trackEvent(eventName, properties = {}) {
    const evt = {
      t: eventName,
      ...properties,
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    };
    queue(evt);
    rec(evt);
  }

  // User identification - simplified to just queue events
  function identifyUser(userId, traits = {}) {
    if (userId) {
      setUserId(userId);
    }
    const evt = {
      t: "userIdentify",
      userId: getUserId(),
      traits,
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    };
    queue(evt);
    rec(evt);
  }

  // Page view tracking - simplified to just queue events
  function trackPageView() {
    const evt = {
      t: "page_view",
      title: document.title,
      path: location.pathname,
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    };
    queue(evt);
    rec(evt);
  }

  // Auto-initialization - simplified to just queue events
  function init() {
    log("Initializing Oonly Tracker");

    // Track initial page view
    queue({
      t: "page_view",
      title: document.title,
      path: location.pathname,
      ts: now(),
    });
    rec({
      t: "page_view",
      title: document.title,
      path: location.pathname,
      ts: now(),
    });

    // Track page visibility changes
    if (document.hidden !== undefined) {
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) {
          queue({ t: "page_visible", ts: now() });
          rec({ t: "page_visible", ts: now() });
        } else {
          queue({ t: "page_hidden", ts: now() });
          rec({ t: "page_hidden", ts: now() });
        }
      });
    }

    // Track beforeunload with immediate flush for traditional sites
    window.addEventListener("beforeunload", function () {
      const unloadEvt = { t: "page_unload", ts: now() };
      queue(unloadEvt);
      rec(unloadEvt);

      // For traditional sites, force immediate flush
      if (isTraditionalSite) {
        // Use sendBeacon for reliable delivery during page unload
        if (buf.length > 0) {
          try {
            const payload = {
              projectKey: pid,
              sessionId: sid,
              anonId: uid,
              userId: uid,
              events: [...buf],
              ingestVersion: 2,
              batchId: generateId(),
              batchTimestamp: now(),
              context: {
                url: location.href,
                referrer: document.referrer,
                scrW: screen.width,
                scrH: screen.height,
                geo: geoData,
              },
            };

            const blob = new Blob([JSON.stringify(payload)], {
              type: "application/json",
            });
            const sent = navigator.sendBeacon(
              `${CFG.baseUrl}/${CFG.apiVersion}/event/ingest`,
              blob
            );

            if (sent) {
              console.log(
                `[oonly] ✅ Emergency beacon sent ${buf.length} events on unload`
              );
              buf.length = 0; // Clear buffer after successful send
            }
          } catch (err) {
            console.warn("[oonly] ❌ Emergency beacon failed:", err);
          }
        }
      }
    });

    log("Oonly Tracker initialized successfully");
  }

  /* ---------- Project + IDs ---------- */
  // Robust project ID detection with no early return
  function getScriptEl() {
    var cs = document.currentScript;
    if (cs) return cs;
    var s = document.getElementsByTagName("script");
    return s[s.length - 1] || null;
  }
  var _el = getScriptEl();
  var _ds = (_el && _el.dataset) || {};
  var pid =
    _ds.projectId || (_el && _el.getAttribute("data-project-id")) || null;

  // Defaults that respect page protocol
  var _proto = location.protocol === "https:" ? "https" : "http";
  var _wsp = _proto === "https" ? "wss" : "ws";

  // IMPORTANT: do NOT return if !pid - just warn and continue
  if (!pid) {
  }

  // Now define CFG after _ds is available
  const CFG = {
    /* ✨ BACKEND CONFIGURATION ✨ */
    baseUrl: _ds.api || _proto + "://api.oonly.com", // Base URL for all API endpoints
    wsBaseUrl: _ds.ws || _wsp + "://api.oonly.com", // WebSocket base URL
    apiVersion: _ds.ver || "v1", // API version

    bufMax: 200, // Increased HTTP batch size for better efficiency
    flushMs: 15000, // 15 second flush interval (reduced request frequency)
    traditionalSiteFlushMs: 2000, // Fast flush for traditional sites (2 seconds)
    maxBatchSize: 500, // Maximum events per batch to prevent oversized requests
    retryAttempts: 3, // Number of retry attempts for failed requests
    retryDelay: 1000, // Base delay for retry attempts (ms)
    idleMs: 30 * 60 * 1e3, // 30 min = new session
    pointerSampleMs: 150, // heat-point throttle
    /* ✨ NEW ✨ */
    recChunkMs: 1500, // send replay chunks every 1.5 s
    snapFullMs: 30000, // full DOM snapshot every 30 s
    /* ✨ PRIVACY ✨ */
    maskInputs: true, // enable input masking
    maskChar: "*", // character to use for masking
    maskMaxLen: 8, // maximum length of masked string
    sensitiveSelectors: [], // custom CSS selectors for sensitive inputs
    /* ✨ EXTERNAL REDIRECT HANDLING ✨ */
    externalRedirectTimeout: 30 * 60 * 1e3, // 30 min timeout for external redirects
    returnUrlParam: "oonly_return", // URL parameter to track return from external sites
    externalRedirectKey: "_oo_external_redirect", // localStorage key for external redirect state
    /* ✨ SEGMENTATION HANDLING ✨ */
    segmentationEnabled: true, // enable automatic segmentation
    segmentationCheckInterval: 60000, // check for segment matches every minute
    segmentationCacheKey: "_oo_segments", // localStorage key for segment cache
    userPropertiesKey: "_oo_user_props", // localStorage key for user properties
  };

  const uidKey = "_oo_uid",
    sidKey = "_oo_sid";
  const genId = () =>
    ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16)
    );

  // User ID: persistent across browser sessions (localStorage)
  const getUserIdFromStorage = () =>
    localStorage.getItem(uidKey) ||
    (localStorage.setItem(uidKey, genId()), localStorage.getItem(uidKey));

  // Session ID: persistent across page loads for traditional sites (localStorage with timeout)
  const getSessionIdFromStorage = () => {
    let sessionId = localStorage.getItem(sidKey);
    const lastActivityTime = parseInt(
      localStorage.getItem("_oo_last_activity") || "0"
    );
    const currentTime = now();
    const timeSinceLastActivity = currentTime - lastActivityTime;

    // Check if this is a new browser session or if too much time has passed
    const isNewBrowserSession = !sessionId;
    const isExpiredSession = timeSinceLastActivity > CFG.idleMs; // Use same timeout as idle detection

    if (isNewBrowserSession || isExpiredSession) {
      // Generate new session ID
      const newSessionId = genId();
      localStorage.setItem(sidKey, newSessionId);

      if (sessionId && isExpiredSession) {
        console.log(
          `[oonly] Session expired (${Math.round(
            timeSinceLastActivity / 1000
          )}s > ${Math.round(CFG.idleMs / 1000)}s), creating new session`
        );
        // Track session end for expired session
        const sessionEndEvent = {
          t: "sessionEnd",
          reason: "session_timeout",
          oldSessionId: sessionId,
          newSessionId: newSessionId,
          timeSinceLastActivity: timeSinceLastActivity,
          ts: currentTime,
        };
        queue(sessionEndEvent);
      }

      // For traditional websites, we keep session in localStorage
      // but ensure proper session lifecycle tracking

      sessionId = newSessionId;
    }

    // Update last activity time
    localStorage.setItem("_oo_last_activity", String(currentTime));

    return sessionId;
  };

  const uid = getUserIdFromStorage();
  let sid = getSessionIdFromStorage();
  const touchSid = () => localStorage.setItem(sidKey, sid);

  /* ---------- External Redirect Handling ---------- */
  function handleExternalRedirect(href, redirectType = "external") {
    const redirectId = genId();
    const redirectData = {
      id: redirectId,
      type: redirectType,
      from: location.href,
      to: href,
      timestamp: Date.now(),
      sessionId: sid,
      anonId: uid,
    };

    // Store redirect data
    localStorage.setItem(CFG.externalRedirectKey, JSON.stringify(redirectData));

    // Track the redirect event
    const redirectEvt = {
      t: "externalRedirect",
      redirectId: redirectId,
      type: redirectType,
      from: location.href,
      to: href,
      ts: Date.now(),
    };
    queue(redirectEvt);
    rec(redirectEvt);

    // Add return URL parameter to external link
    const url = new URL(href);
    url.searchParams.set(CFG.returnUrlParam, redirectId);

    return url.toString();
  }

  function checkForReturn() {
    const urlParams = new URLSearchParams(location.search);
    const returnId = urlParams.get(CFG.returnUrlParam);

    if (returnId) {
      const redirectData = localStorage.getItem(CFG.externalRedirectKey);
      if (redirectData) {
        try {
          const data = JSON.parse(redirectData);
          if (data.id === returnId) {
            // Valid return from external site
            const returnEvt = {
              t: "externalReturn",
              redirectId: returnId,
              type: data.type,
              from: data.to,
              to: location.href,
              duration: Date.now() - data.timestamp,
              ts: Date.now(),
            };
            queue(returnEvt);
            rec(returnEvt);

            // Clean up redirect data
            localStorage.removeItem(CFG.externalRedirectKey);

            // Remove return parameter from URL
            urlParams.delete(CFG.returnUrlParam);
            const newUrl =
              location.pathname +
              (urlParams.toString() ? "?" + urlParams.toString() : "") +
              location.hash;
            history.replaceState(null, "", newUrl);
          }
        } catch (e) {
          console.warn("[oonly] Invalid redirect data:", e);
        }
      }
    }
  }

  // Check for return on page load
  checkForReturn();

  /* ---------- Segmentation System ---------- */
  let userProperties = {};
  let segmentCache = {};
  let activeSegments = new Set();

  // Load user properties from localStorage
  function loadUserProperties() {
    try {
      const stored = localStorage.getItem(CFG.userPropertiesKey);
      if (stored) {
        userProperties = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[oonly] Failed to load user properties:", e);
    }
  }

  // Save user properties to localStorage
  function saveUserProperties() {
    try {
      localStorage.setItem(
        CFG.userPropertiesKey,
        JSON.stringify(userProperties)
      );
    } catch (e) {
      console.warn("[oonly] Failed to save user properties:", e);
    }
  }

  // Load segment cache from localStorage
  function loadSegmentCache() {
    try {
      const stored = localStorage.getItem(CFG.segmentationCacheKey);
      if (stored) {
        segmentCache = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[oonly] Failed to load segment cache:", e);
    }
  }

  // Save segment cache to localStorage
  function saveSegmentCache() {
    try {
      localStorage.setItem(
        CFG.segmentationCacheKey,
        JSON.stringify(segmentCache)
      );
    } catch (e) {
      console.warn("[oonly] Failed to save segment cache:", e);
    }
  }

  // Set user properties (called automatically by the tracker)
  function setUserProperties(props) {
    Object.assign(userProperties, props);
    saveUserProperties();

    // Track user properties update
    const evt = {
      t: "userProps",
      props: props,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  }

  // Identify user (called automatically by the tracker)
  function identifyUser(userId, traits = {}) {
    if (userId) {
      userProperties.userId = userId;
    }
    if (traits) {
      Object.assign(userProperties, traits);
    }
    saveUserProperties();

    // Track user identification
    const evt = {
      t: "userIdentify",
      userId: userId || uid,
      traits: traits,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  }

  // Add user properties (called automatically by the tracker)
  function addUserProperties(traits) {
    for (const [key, value] of Object.entries(traits)) {
      if (typeof value === "number") {
        userProperties[key] = (userProperties[key] || 0) + value;
      } else if (Array.isArray(value)) {
        userProperties[key] = [...(userProperties[key] || []), ...value];
      } else {
        userProperties[key] = value;
      }
    }
    saveUserProperties();

    // Track user properties addition
    const evt = {
      t: "userAdd",
      traits: traits,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  }

  // Remove user properties (called automatically by the tracker)
  function removeUserProperties(traits) {
    for (const [key, value] of Object.entries(traits)) {
      if (Array.isArray(userProperties[key])) {
        userProperties[key] = userProperties[key].filter(
          (item) => !value.includes(item)
        );
      } else {
        delete userProperties[key];
      }
    }
    saveUserProperties();

    // Track user properties removal
    const evt = {
      t: "userRemove",
      traits: traits,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  }

  // Check if user matches segment criteria
  function checkSegmentMatch(segment) {
    const { criteria, type } = segment;

    switch (type) {
      case "behavioral":
        return checkBehavioralCriteria(criteria);
      case "demographic":
        return checkDemographicCriteria(criteria);
      case "custom":
        return checkCustomCriteria(criteria);
      case "engagement":
        return checkEngagementCriteria(criteria);
      default:
        return false;
    }
  }

  // Check behavioral criteria
  function checkBehavioralCriteria(criteria) {
    // This would be evaluated server-side based on event history
    // For now, we'll track the criteria for server-side evaluation
    return true; // Always return true to let server handle the logic
  }

  // Check demographic criteria
  function checkDemographicCriteria(criteria) {
    if (criteria.demographics) {
      const { demographics } = criteria;

      // Check device type
      if (demographics.device && demographics.device.length > 0) {
        const isMobile =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          );
        const deviceType = isMobile ? "mobile" : "desktop";
        if (!demographics.device.includes(deviceType)) {
          return false;
        }
      }

      // Check browser
      if (demographics.browser && demographics.browser.length > 0) {
        const browser = getBrowserInfo();
        if (!demographics.browser.includes(browser.name)) {
          return false;
        }
      }
    }

    if (criteria.timeBased) {
      const { timeBased } = criteria;
      const firstVisit = localStorage.getItem("_oo_firstVisit");

      if (timeBased.firstVisitAfter && firstVisit) {
        const firstVisitTime = parseInt(firstVisit);
        if (firstVisitTime < new Date(timeBased.firstVisitAfter).getTime()) {
          return false;
        }
      }
    }

    return true;
  }

  // Check custom criteria
  function checkCustomCriteria(criteria) {
    if (criteria.userProperties) {
      for (const [key, expectedValue] of Object.entries(
        criteria.userProperties
      )) {
        const actualValue = userProperties[key];
        if (actualValue !== expectedValue) {
          return false;
        }
      }
    }

    if (criteria.customProperties) {
      for (const [key, expectedValue] of Object.entries(
        criteria.customProperties
      )) {
        const actualValue = userProperties[key];
        if (actualValue !== expectedValue) {
          return false;
        }
      }
    }

    return true;
  }

  // Check engagement criteria
  function checkEngagementCriteria(criteria) {
    if (criteria.engagement) {
      const { engagement } = criteria;

      // Get session data from localStorage or calculate
      const sessionData = getSessionData();

      if (
        engagement.minSessionDuration &&
        sessionData.duration < engagement.minSessionDuration
      ) {
        return false;
      }

      if (
        engagement.minPageViews &&
        sessionData.pageViews < engagement.minPageViews
      ) {
        return false;
      }
    }

    return true;
  }

  // Get browser information
  function getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = { name: "unknown", version: "unknown" };

    if (ua.includes("Chrome")) {
      browser.name = "Chrome";
    } else if (ua.includes("Firefox")) {
      browser.name = "Firefox";
    } else if (ua.includes("Safari")) {
      browser.name = "Safari";
    } else if (ua.includes("Edge")) {
      browser.name = "Edge";
    } else if (ua.includes("MSIE") || ua.includes("Trident/")) {
      browser.name = "Internet Explorer";
    }

    return browser;
  }

  // Get session data
  function getSessionData() {
    const sessionStart = parseInt(
      localStorage.getItem("_oo_session_start") || Date.now()
    );
    const pageViews = parseInt(localStorage.getItem("_oo_page_views") || "1");
    const duration = Date.now() - sessionStart;

    return {
      duration,
      pageViews,
      startTime: sessionStart,
    };
  }

  // Get device type consistently
  function getDeviceType() {
    const ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) {
      return "mobile";
    } else if (/Tablet|iPad/i.test(ua)) {
      return "tablet";
    } else {
      return "desktop";
    }
  }

  // Get basic context information (without geo data)
  function getBasicContext() {
    return {
      url: location.href,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      title: document.title,
      referrer: document.referrer,
      timestamp: Date.now(),
    };
  }

  // Get comprehensive context information that's immediately available
  function getComprehensiveContext() {
    const context = {
      url: location.href,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      title: document.title,
      referrer: document.referrer,
      scrW: screen.width,
      scrH: screen.height,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,

      // Viewport information
      viewport: {
        width: window.innerWidth || document.documentElement.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        orientation: screen.orientation ? screen.orientation.angle : 0,
      },

      // Language information
      language: {
        primary: navigator.language ? navigator.language.split("-")[0] : "en",
        full: navigator.language || "en",
        languages: navigator.languages || [navigator.language || "en"],
      },

      // Browser information with detailed detection
      browser: getBrowserInfo(),

      // Operating system information
      os: getOSInfo(),

      // Device information with capabilities
      device: getDeviceInfo(),

      // Network information
      network: getNetworkInfo(),

      // Timezone and locale
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

      // Geo data (will be updated when available)
      geo: geoData,
    };

    // Extract UTM parameters from URL
    context.utm = getUTMParameters();

    // Extract referrer information
    context.referrerInfo = getReferrerInfo(document.referrer);

    return context;
  }

  // Detailed browser detection
  function getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = { name: "Unknown", version: "Unknown", engine: "Unknown" };

    try {
      if (ua.includes("Chrome") && !ua.includes("Edge")) {
        const match = ua.match(/Chrome\/([^\s]+)/);
        browser = {
          name: "Chrome",
          version: match ? match[1].split(".")[0] : "Unknown",
          fullVersion: match ? match[1] : "Unknown",
          engine: "Blink",
        };
      } else if (ua.includes("Firefox")) {
        const match = ua.match(/Firefox\/([^\s]+)/);
        browser = {
          name: "Firefox",
          version: match ? match[1].split(".")[0] : "Unknown",
          fullVersion: match ? match[1] : "Unknown",
          engine: "Gecko",
        };
      } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
        const match = ua.match(/Version\/([^\s]+)/);
        browser = {
          name: "Safari",
          version: match ? match[1].split(".")[0] : "Unknown",
          fullVersion: match ? match[1] : "Unknown",
          engine: "WebKit",
        };
      } else if (ua.includes("Edge")) {
        const match = ua.match(/Edge\/([^\s]+)/);
        browser = {
          name: "Edge",
          version: match ? match[1].split(".")[0] : "Unknown",
          fullVersion: match ? match[1] : "Unknown",
          engine: "EdgeHTML",
        };
      }
    } catch (e) {
      // Fallback
    }

    return browser;
  }

  // Detailed OS detection
  function getOSInfo() {
    const ua = navigator.userAgent;
    let os = { name: "Unknown", platform: "unknown" };

    try {
      if (ua.includes("Windows NT")) {
        const match = ua.match(/Windows NT ([^\s;)]+)/);
        os = {
          name: "Windows",
          version: match ? match[1] : "Unknown",
          platform: "win32",
        };
      } else if (ua.includes("Mac OS X")) {
        const match = ua.match(/Mac OS X ([^\s;)]+)/);
        os = {
          name: "macOS",
          version: match ? match[1].replace(/_/g, ".") : "Unknown",
          platform: "darwin",
        };
      } else if (ua.includes("Linux")) {
        os = { name: "Linux", platform: "linux" };
      } else if (ua.includes("Android")) {
        const match = ua.match(/Android ([^\s;)]+)/);
        os = {
          name: "Android",
          version: match ? match[1] : "Unknown",
          platform: "android",
        };
      } else if (ua.includes("iPhone OS") || ua.includes("iOS")) {
        const match = ua.match(/OS ([^\s;)]+)/);
        os = {
          name: "iOS",
          version: match ? match[1].replace(/_/g, ".") : "Unknown",
          platform: "ios",
        };
      }
    } catch (e) {
      // Fallback
    }

    return os;
  }

  // Comprehensive device information
  function getDeviceInfo() {
    const device = {
      type: getDeviceType(),
      memory: navigator.deviceMemory || null,
      cores: navigator.hardwareConcurrency || null,
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
      },
    };

    // Touch capability
    device.touchSupport =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    return device;
  }

  // Network information
  function getNetworkInfo() {
    const network = {};

    if (navigator.connection) {
      network.effectiveType = navigator.connection.effectiveType;
      network.downlink = navigator.connection.downlink;
      network.rtt = navigator.connection.rtt;
      network.saveData = navigator.connection.saveData;
    }

    return Object.keys(network).length > 0 ? network : null;
  }

  // UTM parameter extraction
  function getUTMParameters() {
    try {
      const urlParams = new URLSearchParams(location.search);
      const utm = {};
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
      ].forEach((param) => {
        const value = urlParams.get(param);
        if (value) utm[param] = value;
      });
      return Object.keys(utm).length > 0 ? utm : null;
    } catch (e) {
      return null;
    }
  }

  // Referrer analysis
  function getReferrerInfo(referrer) {
    if (!referrer) return { type: "direct" };

    try {
      const url = new URL(referrer);
      const domain = url.hostname.toLowerCase();

      let type = "referral";
      if (
        domain.includes("google") ||
        domain.includes("bing") ||
        domain.includes("yahoo")
      ) {
        type = "search";
      } else if (
        domain.includes("facebook") ||
        domain.includes("twitter") ||
        domain.includes("instagram")
      ) {
        type = "social";
      }

      return {
        url: referrer,
        domain: domain,
        type: type,
      };
    } catch (e) {
      return { type: "direct" };
    }
  }

  // Track segment view
  function trackSegmentView(segmentId, segmentName, segmentType) {
    const evt = {
      t: "segmentView",
      segmentId: segmentId,
      segmentName: segmentName,
      segmentType: segmentType,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  }

  // Track segment action
  function trackSegmentAction(segmentId, action, properties = {}) {
    const evt = {
      t: "segmentAction",
      segmentId: segmentId,
      action: action,
      properties: properties,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  }

  // Initialize segmentation
  function initSegmentation() {
    if (!CFG.segmentationEnabled) return;

    loadUserProperties();
    loadSegmentCache();

    // Set initial user properties
    const initialProps = {
      firstVisit: localStorage.getItem("_oo_firstVisit")
        ? new Date(
            parseInt(localStorage.getItem("_oo_firstVisit"))
          ).toISOString()
        : new Date().toISOString(),
      device: getDeviceType(),
      browser: getBrowserInfo().name,
      language: navigator.language,
      screenWidth: screen.width,
      screenHeight: screen.height,
    };

    setUserProperties(initialProps);

    // Start segment checking interval
    setInterval(checkForSegmentMatches, CFG.segmentationCheckInterval);
  }

  // Check for segment matches (called periodically)
  function checkForSegmentMatches() {
    if (!CFG.segmentationEnabled) return;

    // This would typically fetch segments from the server
    // For now, we'll use cached segments
    Object.values(segmentCache).forEach((segment) => {
      if (checkSegmentMatch(segment) && !activeSegments.has(segment.id)) {
        activeSegments.add(segment.id);
        trackSegmentView(segment.id, segment.name, segment.type);
      }
    });
  }

  // Initialize segmentation on page load
  initSegmentation();

  /* ---------- Automatic Form Tracking ---------- */
  // Track form submissions automatically
  function initFormTracking() {
    // Track form submissions
    document.addEventListener("submit", function (e) {
      const form = e.target;
      const formData = new FormData(form);
      const formProps = {};

      // Extract form data
      for (const [key, value] of formData.entries()) {
        if (key && value) {
          formProps[key] = value;
        }
      }

      // Track form submission
      const pairs = Array.from(formData.entries());
      const evt = {
        t: "formSubmit",
        formId: form.id || form.className || "unknown",
        formAction: form.action || "",
        formMethod: form.method || "POST",
        formData: formProps,
        fieldCount: pairs.length,
        ts: now(),
      };
      queue(evt);
      rec(evt);

      // Update user properties based on form data
      if (formProps.email) {
        setUserProperties({ email: formProps.email });
      }
      if (formProps.name) {
        setUserProperties({ name: formProps.name });
      }
      if (formProps.company) {
        setUserProperties({ company: formProps.company });
      }
      if (formProps.phone) {
        setUserProperties({ phone: formProps.phone });
      }
      if (formProps.plan) {
        setUserProperties({ plan: formProps.plan });
      }
    });

    // Track form field interactions
    document.addEventListener("focus", function (e) {
      const target = safeGetEventTarget(e);
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        const evt = {
          t: "formFieldFocus",
          fieldType: target.type || target.tagName.toLowerCase(),
          fieldName: target.name || "",
          fieldId: target.id || "",
          formId: target.form
            ? target.form.id || target.form.className || "unknown"
            : "standalone",
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(evt);
        rec(evt);
      }
    });

    // Track form field changes
    document.addEventListener("input", function (e) {
      const target = safeGetEventTarget(e);
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        const evt = {
          t: "formFieldChange",
          fieldType: target.type || target.tagName.toLowerCase(),
          fieldName: target.name || "",
          fieldId: target.id || "",
          formId: target.form
            ? target.form.id || target.form.className || "unknown"
            : "standalone",
          hasValue: !!target.value,
          valueLength: target.value ? target.value.length : 0,
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(evt);
        rec(evt);
      }
    });

    // Track form validation errors
    document.addEventListener("invalid", function (e) {
      const target = safeGetEventTarget(e);
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        const evt = {
          t: "formValidationError",
          fieldType: target.type || target.tagName.toLowerCase(),
          fieldName: target.name || "",
          fieldId: target.id || "",
          formId: target.form
            ? target.form.id || target.form.className || "unknown"
            : "standalone",
          validationMessage: target.validationMessage || "",
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(evt);
        rec(evt);
      }
    });
  }

  /* ---------- Enhanced Automatic Link Tracking ---------- */
  // Track link clicks, hover, and navigation patterns automatically
  function initLinkTracking() {
    // Track link clicks
    document.addEventListener("click", function (e) {
      const target = safeGetEventTarget(e);
      const link = safeClosest(target, "a");
      if (link) {
        const url = new URL(link.href, location.href);
        const evt = {
          t: "linkClick",
          href: link.href,
          text: link.textContent.trim(),
          target: link.target || "_self",
          isExternal: url.host !== location.host,
          isDownload:
            /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|mp[34]|mov|avi)$/i.test(
              url.pathname
            ),
          isMailto: link.href.startsWith("mailto:"),
          isTel: link.href.startsWith("tel:"),
          linkPosition: getElementPosition(link),
          ts: now(),
        };
        queue(evt);
        rec(evt);
      }
    });

    // Track link hover (for engagement analysis)
    let hoverTimeout;
    document.addEventListener("mouseenter", function (e) {
      const target = safeGetEventTarget(e);
      const link = safeClosest(target, "a");
      if (link) {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          const evt = {
            t: "linkHover",
            href: link.href,
            text: link.textContent.trim(),
            hoverDuration: 1000, // 1 second hover
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }, 1000); // Track after 1 second of hover
      }
    });

    document.addEventListener("mouseleave", function (e) {
      const target = safeGetEventTarget(e);
      const link = safeClosest(target, "a");
      if (link) {
        clearTimeout(hoverTimeout);
      }
    });
  }

  // Helper function to get element position
  function getElementPosition(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    return {
      x: Math.round(((rect.left + rect.width / 2) / viewportWidth) * 100),
      y: Math.round(((rect.top + rect.height / 2) / viewportHeight) * 100),
      inViewport: rect.top >= 0 && rect.bottom <= viewportHeight,
    };
  }

  /* ---------- Enhanced Automatic Button Tracking ---------- */
  // Track button clicks, hover, and interaction patterns automatically
  function initButtonTracking() {
    // Track button clicks
    document.addEventListener("click", function (e) {
      const target = safeGetEventTarget(e);
      const button = safeClosest(target, "button");
      if (button) {
        const evt = {
          t: "buttonClick",
          text: button.textContent.trim(),
          type: button.type || "button",
          disabled: button.disabled,
          buttonPosition: getElementPosition(button),
          buttonSize: {
            width: button.offsetWidth,
            height: button.offsetHeight,
          },
          buttonClasses: button.className || "",
          ts: now(),
        };
        queue(evt);
        rec(evt);
      }
    });

    // Track button hover (for engagement analysis)
    let buttonHoverTimeout;
    document.addEventListener("mouseenter", function (e) {
      const target = safeGetEventTarget(e);
      const button = safeClosest(target, "button");
      if (button) {
        clearTimeout(buttonHoverTimeout);
        buttonHoverTimeout = setTimeout(() => {
          const evt = {
            t: "buttonHover",
            text: button.textContent.trim(),
            type: button.type || "button",
            hoverDuration: 1000, // 1 second hover
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }, 1000); // Track after 1 second of hover
      }
    });

    document.addEventListener("mouseleave", function (e) {
      const target = safeGetEventTarget(e);
      const button = safeClosest(target, "button");
      if (button) {
        clearTimeout(buttonHoverTimeout);
      }
    });
  }

  /* ---------- Enhanced Automatic Scroll Tracking ---------- */
  // Track scroll depth, speed, and engagement patterns automatically
  let maxScrollDepth = 0;
  let scrollStartTime = now();
  let scrollDirection = "down";
  let lastScrollTop = 0;
  let scrollSpeed = 0;
  let scrollEvents = [];

  function initScrollTracking() {
    document.addEventListener("scroll", function () {
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / scrollHeight) * 100);
      const currentTime = now();

      // Calculate scroll direction and speed
      scrollDirection = scrollTop > lastScrollTop ? "down" : "up";
      scrollSpeed =
        (Math.abs(scrollTop - lastScrollTop) /
          (currentTime - scrollStartTime)) *
        1000; // pixels per second

      if (scrollPercent > maxScrollDepth) {
        maxScrollDepth = scrollPercent;

        // Track significant scroll milestones
        if (scrollPercent % 25 === 0) {
          const evt = {
            t: "scrollDepth",
            depth: scrollPercent,
            maxDepth: maxScrollDepth,
            direction: scrollDirection,
            speed: Math.round(scrollSpeed),
            timeOnPage: currentTime - scrollStartTime,
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }
      }

      // Track scroll speed changes
      if (scrollSpeed > 100) {
        // Fast scrolling
        const evt = {
          t: "scrollSpeed",
          speed: Math.round(scrollSpeed),
          direction: scrollDirection,
          depth: scrollPercent,
          ts: now(),
        };
        queue(evt);
        rec(evt);
      }

      // Track scroll engagement (time spent scrolling)
      scrollEvents.push({
        time: currentTime,
        depth: scrollPercent,
        direction: scrollDirection,
      });

      // Keep only last 50 scroll events
      if (scrollEvents.length > 50) {
        scrollEvents.shift();
      }

      lastScrollTop = scrollTop;
      scrollStartTime = currentTime;
    });

    // Track scroll engagement summary on page unload
    window.addEventListener("beforeunload", function () {
      if (scrollEvents.length > 0) {
        const totalScrollTime =
          scrollEvents[scrollEvents.length - 1].time - scrollEvents[0].time;
        const scrollEngagement = {
          t: "scrollEngagement",
          totalEvents: scrollEvents.length,
          totalTime: totalScrollTime,
          maxDepth: maxScrollDepth,
          avgSpeed:
            scrollEvents.reduce((sum, event) => sum + (event.speed || 0), 0) /
            scrollEvents.length,
          directionChanges: scrollEvents.filter(
            (event, index) =>
              index > 0 && event.direction !== scrollEvents[index - 1].direction
          ).length,
          ts: now(),
        };
        queue(scrollEngagement);
        rec(scrollEngagement);
      }
    });
  }

  /* ---------- ENHANCED SESSION RECORDING SYSTEM ---------- */
  function initSessionRecording() {
    sessionRecording.startTime = now();
    sessionRecording.isRecording = true;

    // Initialize viewport tracking
    captureInitialViewport();

    // Start rrweb recording if available
    initRRWebRecording();

    // Start custom recording for EJS/traditional websites
    initCustomRecording();

    // Start SPA-specific recording
    initSPARecording();

    console.log("[oonly] Enhanced session recording started");
  }

  function captureInitialViewport() {
    sessionRecording.viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX || window.pageXOffset,
      scrollY: window.scrollY || window.pageYOffset,
      devicePixelRatio: window.devicePixelRatio || 1,
      orientation: screen.orientation
        ? screen.orientation.angle
        : window.orientation,
    };

    // Record viewport as an event
    rec({
      t: "viewport",
      viewport: sessionRecording.viewport,
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    });
  }

  function initRRWebRecording() {
    // Check if rrweb is available
    if (typeof window.rrweb === "undefined") {
      console.warn("[oonly] rrweb not found, loading from CDN...");
      loadRRWebScript();
      return;
    }

    startRRWebRecording();
  }

  function loadRRWebScript() {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js";
    script.onload = () => {
      console.log("[oonly] rrweb loaded successfully");
      startRRWebRecording();
    };
    script.onerror = () => {
      console.warn(
        "[oonly] Failed to load rrweb, falling back to custom recording"
      );
      initFallbackRecording();
    };
    document.head.appendChild(script);
  }

  function startRRWebRecording() {
    if (!window.rrweb || rrwebRecorder) return;

    try {
      rrwebRecorder = window.rrweb.record({
        emit(event) {
          // Add relative timestamp to rrweb events
          event.relativeTimestamp = getSessionRelativeTime();
          rrwebEvents.push(event);

          // Add to session recording
          sessionRecording.events.push(event);

          // Also add to our record buffer for streaming
          rec({
            t: "rrweb",
            event: event,
            ts: now(),
            relativeTs: event.relativeTimestamp,
          });

          // Manage event buffer size
          if (sessionRecording.events.length > recordingConfig.maxEvents) {
            sessionRecording.events.splice(0, 1000); // Remove oldest 1000 events
          }
        },
        // Enhanced rrweb configuration
        checkoutEveryNms: 30 * 1000, // Full snapshot every 30 seconds
        checkoutEveryNth: 200, // Full snapshot every 200 events
        blockSelector: "[data-oonly-block], [data-rrweb-block]",
        maskTextSelector: "[data-oonly-mask], [data-rrweb-mask]",
        maskAllInputs: CFG.maskInputs, // Use our privacy settings
        recordCrossOriginIframes: false,
        collectFonts: false,
        inlineStylesheet: false,
        // Enhanced options for better EJS compatibility
        slimDOMOptions: {
          script: false,
          comment: false,
          headFavicon: false,
          headWhitespace: false,
          headMetaDescKeywords: false,
          headMetaSocial: false,
          headMetaRobots: false,
          headMetaHttpEquiv: false,
          headMetaAuthorship: false,
          headMetaVerification: false,
        },
        recordCanvas: false, // Disable canvas recording for performance
        recordCrossOriginIframes: false,
      });

      console.log("[oonly] rrweb recording started");
    } catch (error) {
      console.warn("[oonly] Failed to start rrweb recording:", error);
      initFallbackRecording();
    }
  }

  function initCustomRecording() {
    // Enhanced DOM change recording for EJS sites
    if (!window.MutationObserver) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const customEvent = {
          t: "dom_mutation",
          type: mutation.type,
          target: cssPath(mutation.target),
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };

        if (mutation.type === "childList") {
          customEvent.addedNodes = Array.from(mutation.addedNodes).map(
            (node) => ({
              type: node.nodeType,
              tagName: node.tagName,
              textContent: node.nodeType === 3 ? node.textContent : undefined,
            })
          );
          customEvent.removedNodes = Array.from(mutation.removedNodes).map(
            (node) => ({
              type: node.nodeType,
              tagName: node.tagName,
            })
          );
        } else if (mutation.type === "attributes") {
          customEvent.attributeName = mutation.attributeName;
          customEvent.oldValue = mutation.oldValue;
          customEvent.newValue = mutation.target.getAttribute(
            mutation.attributeName
          );
        }

        sessionRecording.interactions.push(customEvent);
        rec(customEvent);
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
    });
  }

  function initSPARecording() {
    // Enhanced SPA navigation recording
    let currentUrl = location.href;

    function recordNavigation(type, newUrl = location.href) {
      const navigationEvent = {
        t: "spa_navigation",
        navigationType: type,
        from: currentUrl,
        to: newUrl,
        timestamp: now(),
        relativeTs: getSessionRelativeTime(),
        viewport: {
          scrollX: window.scrollX || window.pageXOffset,
          scrollY: window.scrollY || window.pageYOffset,
        },
      };

      sessionRecording.interactions.push(navigationEvent);
      rec(navigationEvent);

      currentUrl = newUrl;

      // Capture DOM snapshot after navigation
      setTimeout(() => {
        capturePageSnapshot("spa_navigation");
      }, 100);
    }

    // Override history methods
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(this, arguments);
      recordNavigation("pushState");
    };

    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      recordNavigation("replaceState");
    };

    // Listen for popstate events
    window.addEventListener("popstate", () => {
      recordNavigation("popstate");
    });

    // Listen for hash changes
    window.addEventListener("hashchange", () => {
      recordNavigation("hashchange");
    });
  }

  function initFallbackRecording() {
    // Fallback recording when rrweb is not available
    console.log("[oonly] Starting fallback session recording");

    // Capture initial page state
    capturePageSnapshot("initial");

    // Record interactions
    ["click", "input", "change", "submit", "focus", "blur"].forEach(
      (eventType) => {
        document.addEventListener(
          eventType,
          (e) => {
            const interactionEvent = {
              t: "interaction",
              eventType: eventType,
              target: cssPath(e.target),
              timestamp: now(),
              relativeTs: getSessionRelativeTime(),
              value: e.target.value || undefined,
              checked: e.target.checked || undefined,
            };

            sessionRecording.interactions.push(interactionEvent);
            rec(interactionEvent);
          },
          true
        );
      }
    );

    // Record scroll events
    let scrollTimeout;
    window.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollEvent = {
          t: "scroll",
          scrollX: window.scrollX || window.pageXOffset,
          scrollY: window.scrollY || window.pageYOffset,
          timestamp: now(),
          relativeTs: getSessionRelativeTime(),
        };

        sessionRecording.interactions.push(scrollEvent);
        rec(scrollEvent);
      }, 100);
    });
  }

  function capturePageSnapshot(reason = "periodic") {
    if (!recordingConfig.captureFullPage) return;

    try {
      const snapshot = {
        t: "page_snapshot",
        reason: reason,
        url: location.href,
        title: document.title,
        html: sanitizeHTML(
          document.documentElement.outerHTML.slice(0, 2000000)
        ), // 2MB limit
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX || window.pageXOffset,
          scrollY: window.scrollY || window.pageYOffset,
        },
        timestamp: now(),
        relativeTs: getSessionRelativeTime(),
      };

      sessionRecording.snapshots.push(snapshot);
      rec(snapshot);

      // Manage snapshot buffer size
      if (sessionRecording.snapshots.length > 10) {
        sessionRecording.snapshots.splice(0, 5); // Keep only latest 5 snapshots
      }
    } catch (error) {
      console.warn("[oonly] Failed to capture page snapshot:", error);
    }
  }

  function stopRRWebRecording() {
    if (rrwebRecorder) {
      rrwebRecorder();
      rrwebRecorder = null;
      console.log("[oonly] rrweb recording stopped");
    }
  }

  function flushRRWebEvents() {
    if (rrwebEvents.length === 0) return;

    // Send rrweb events to backend
    const events = rrwebEvents.splice(0);
    const payload = {
      t: "rrweb_batch",
      sessionId: sid,
      events: events,
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    };

    queue(payload);
  }

  // Enhanced session recording data batching and streaming
  function flushSessionRecording() {
    if (!sessionRecording.isRecording) return;

    const batchData = {
      sessionId: sid,
      userId: uid,
      startTime: sessionRecording.startTime,
      viewport: sessionRecording.viewport,
      events: [],
      interactions: [],
      snapshots: [],
    };

    // Batch rrweb events
    if (rrwebEvents.length > 0) {
      batchData.events = rrwebEvents.splice(0);
    }

    // Batch interactions
    if (sessionRecording.interactions.length > 0) {
      batchData.interactions = sessionRecording.interactions.splice(0);
    }

    // Only send latest snapshots (not all stored ones)
    const recentSnapshots = sessionRecording.snapshots.slice(-2);
    if (recentSnapshots.length > 0) {
      batchData.snapshots = recentSnapshots;
    }

    if (
      batchData.events.length > 0 ||
      batchData.interactions.length > 0 ||
      batchData.snapshots.length > 0
    ) {
      const sessionPayload = {
        t: "session_recording_batch",
        sessionRecording: batchData,
        ts: now(),
        relativeTs: getSessionRelativeTime(),
      };

      // Send through both queue (HTTP) and rec (WebSocket) for redundancy
      queue(sessionPayload);
      rec(sessionPayload);

      console.log(
        `[oonly] Flushed session recording: ${batchData.events.length} events, ${batchData.interactions.length} interactions, ${batchData.snapshots.length} snapshots`
      );
    }
  }

  // Flush session recording data every 10 seconds
  setInterval(flushSessionRecording, 10000);

  // Enhanced streaming for real-time session replay
  function streamSessionEvents() {
    if (!sessionRecording.isRecording || !wsOpen) return;

    // Stream recent interactions for real-time viewing
    const recentInteractions = sessionRecording.interactions.slice(-50); // Last 50 interactions
    if (recentInteractions.length > 0) {
      const streamPayload = {
        t: "session_stream",
        sessionId: sid,
        interactions: recentInteractions,
        timestamp: now(),
        relativeTs: getSessionRelativeTime(),
      };

      if (wsOpen) {
        ws.send(JSON.stringify(streamPayload));
      }
    }
  }

  // Stream session events every 2 seconds for real-time monitoring
  setInterval(streamSessionEvents, 2000);

  /* ---------- Enhanced Automatic Tracking Initialization ---------- */
  function initAutomaticTracking() {
    initFormTracking();
    initLinkTracking();
    initButtonTracking();
    initScrollTracking();
    initMouseTracking();
    initKeyboardTracking();
    initResizeTracking();
    initEnhancedScrollTracking(); // Enhanced scroll tracking for session recording
    // initErrorTracking(); // Removed to prevent recursive errors
    initPerformanceTracking();
    initDeviceTracking();
    initTimeTracking();
    initSessionRecording(); // Enhanced session recording system
  }

  // Initialize automatic tracking
  initAutomaticTracking();

  // Detect site type for appropriate flushing strategy
  detectSiteType();

  // Initialize the tracker
  init();

  // Fetch geolocation data and then queue initial events
  fetchGeoLocation()
    .then(() => {
      // Queue initial events AFTER geo data is fetched
      const qp = new URLSearchParams(location.search);
      const envEvt = {
        t: "env",
        lang: navigator.language,
        scrW: screen.width,
        scrH: screen.height,
        ua: navigator.userAgent,
        geo: geoData, // Now geoData should be populated
        ts: now(),
      };
      queue(envEvt);
      rec(envEvt);

      if (
        qp.get("utm_source") ||
        qp.get("utm_medium") ||
        qp.get("utm_campaign")
      ) {
        const campaignEvt = {
          t: "campaign",
          src: qp.get("utm_source") || "",
          med: qp.get("utm_source") || "",
          cmp: qp.get("utm_campaign") || "",
          ts: now(),
        };
        queue(campaignEvt);
        rec(campaignEvt);
      }
    })
    .catch((err) => {
      console.warn(
        "[oonly] Geolocation failed, queuing events without geo data"
      );
      // Fallback: queue events without geo data
      const qp = new URLSearchParams(location.search);
      const envEvt = {
        t: "env",
        lang: navigator.language,
        scrW: screen.width,
        scrH: screen.height,
        ua: navigator.userAgent,
        geo: null,
        ts: now(),
      };
      queue(envEvt);
      rec(envEvt);

      if (
        qp.get("utm_source") ||
        qp.get("utm_source") ||
        qp.get("utm_campaign")
      ) {
        const campaignEvt = {
          t: "campaign",
          src: qp.get("utm_source") || "",
          med: qp.get("utm_source") || "",
          cmp: qp.get("utm_campaign") || "",
          ts: now(),
        };
        queue(campaignEvt);
        rec(campaignEvt);
      }
    });

  // Promote stub to real API and replay queued calls
  (function promoteAPI() {
    var stub = window.oonly,
      q = (stub && stub._q) || [],
      cbs = (stub && stub._cbs) || [];
    window.oonly = Object.assign(function () {}, {
      track: (t, p) => {
        var evt = Object.assign({ t, ts: now() }, p || {});
        queue(evt);
        rec(evt);
      },
      identify: (id, traits) => {
        identifyUser(id, traits || {});
      },
      set: (traits) => {
        setUserProperties(traits || {});
      },
      configure: window.oonly.configure,
      refreshSegments: window.oonly.refreshSegments,
      getUserProperties: () => ({ ...userProperties }),
      getActiveSegments: () => Array.from(activeSegments),
      isInSegment: (id) => activeSegments.has(id),
      trackSegmentInteraction: (id, kind, props) => {
        var evt = Object.assign(
          {
            t: "segmentInteraction",
            segmentId: id,
            interactionType: kind,
            ts: now(),
          },
          props || {}
        );
        queue(evt);
        rec(evt);
      },
      ready: true,
      onReady: (cb) => {
        try {
          cb();
        } catch {}
      },
    });
    q.forEach(function (item) {
      var m = item && item[0],
        args = item && item[1];
      if (m && typeof window.oonly[m] === "function")
        try {
          window.oonly[m].apply(null, args || []);
        } catch {}
    });
    if (stub) stub._ready = true;
    cbs.forEach(function (cb) {
      try {
        cb();
      } catch {}
    });
  })();

  /* ---------- Enhanced Mouse Tracking ---------- */
  // Track mouse movements, clicks, and interaction patterns
  function initMouseTracking() {
    let mouseEvents = [];
    let lastMouseMove = 0;
    const mouseThrottle = 100; // Throttle mouse move events

    // Track mouse movements (throttled)
    document.addEventListener("mousemove", function (e) {
      const currentTime = now();
      if (currentTime - lastMouseMove > mouseThrottle) {
        const evt = {
          t: "mouseMove",
          x: e.clientX || 0,
          y: e.clientY || 0,
          pageX: e.pageX || 0,
          pageY: e.pageY || 0,
          viewportWidth: window.innerWidth || 0,
          viewportHeight: window.innerHeight || 0,
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(evt);
        rec(evt);
        lastMouseMove = currentTime;
      }
    });

    // Track mouse clicks with context
    document.addEventListener("mousedown", function (e) {
      const target = safeGetEventTarget(e);
      const evt = {
        t: "mouseDown",
        x: e.clientX || 0,
        y: e.clientY || 0,
        button: e.button || 0, // 0=left, 1=middle, 2=right
        target: target ? target.tagName.toLowerCase() : "",
        targetId: target ? target.id || "" : "",
        targetClass: target ? target.className || "" : "",
        ts: now(),
        relativeTs: getSessionRelativeTime(),
      };
      queue(evt);
      rec(evt);
    });

    // Track double clicks
    let clickCount = 0;
    let clickTimer;
    document.addEventListener("click", function (e) {
      clickCount++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        if (clickCount === 2) {
          const target = safeGetEventTarget(e);
          const evt = {
            t: "doubleClick",
            x: e.clientX || 0,
            y: e.clientY || 0,
            target: target ? target.tagName.toLowerCase() : "",
            targetId: target ? target.id || "" : "",
            ts: now(),
            relativeTs: getSessionRelativeTime(),
          };
          queue(evt);
          rec(evt);
        }
        clickCount = 0;
      }, 300);
    });

    // Track right clicks
    document.addEventListener("contextmenu", function (e) {
      const target = safeGetEventTarget(e);
      const evt = {
        t: "rightClick",
        x: e.clientX || 0,
        y: e.clientY || 0,
        target: target ? target.tagName.toLowerCase() : "",
        targetId: target ? target.id || "" : "",
        ts: now(),
        relativeTs: getSessionRelativeTime(),
      };
      queue(evt);
      rec(evt);
    });
  }

  /* ---------- Enhanced Keyboard Tracking ---------- */
  // Track keyboard interactions and shortcuts
  function initKeyboardTracking() {
    let keySequence = [];
    const maxSequenceLength = 10;

    document.addEventListener("keydown", function (e) {
      const target = safeGetEventTarget(e);
      const key = e.key ? e.key.toLowerCase() : "";
      const evt = {
        t: "keyDown",
        key: key,
        code: e.code || "",
        ctrlKey: !!e.ctrlKey,
        altKey: !!e.altKey,
        shiftKey: !!e.shiftKey,
        metaKey: !!e.metaKey,
        target: target ? target.tagName.toLowerCase() : "",
        targetId: target ? target.id || "" : "",
        ts: now(),
        relativeTs: getSessionRelativeTime(),
      };
      queue(evt);
      rec(evt);

      // Track key sequences for shortcuts
      if (key) {
        keySequence.push(key);
        if (keySequence.length > maxSequenceLength) {
          keySequence.shift();
        }
      }

      // Track common shortcuts
      if (e.ctrlKey || e.metaKey) {
        const shortcutEvt = {
          t: "keyboardShortcut",
          shortcut: `${e.ctrlKey ? "ctrl" : "cmd"}+${key}`,
          target: target ? target.tagName.toLowerCase() : "",
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(shortcutEvt);
        rec(shortcutEvt);
      }
    });

    // Track copy/paste events
    document.addEventListener("copy", function (e) {
      const target = safeGetEventTarget(e);
      const evt = {
        t: "copy",
        target: target ? target.tagName.toLowerCase() : "",
        targetId: target ? target.id || "" : "",
        ts: now(),
        relativeTs: getSessionRelativeTime(),
      };
      queue(evt);
      rec(evt);
    });

    document.addEventListener("paste", function (e) {
      const target = safeGetEventTarget(e);
      const evt = {
        t: "paste",
        target: target ? target.tagName.toLowerCase() : "",
        targetId: target ? target.id || "" : "",
        ts: now(),
        relativeTs: getSessionRelativeTime(),
      };
      queue(evt);
      rec(evt);
    });
  }

  /* ---------- Enhanced Resize and Viewport Tracking ---------- */
  // Track window and viewport changes for session recording
  function initResizeTracking() {
    let resizeTimeout;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    window.addEventListener("resize", function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;

        if (newWidth !== lastWidth || newHeight !== lastHeight) {
          const resizeEvent = {
            t: "windowResize",
            oldWidth: lastWidth,
            oldHeight: lastHeight,
            newWidth: newWidth,
            newHeight: newHeight,
            widthChange: newWidth - lastWidth,
            heightChange: newHeight - lastHeight,
            orientation: newWidth > newHeight ? "landscape" : "portrait",
            ts: now(),
            relativeTs: getSessionRelativeTime(),
          };
          queue(resizeEvent);
          rec(resizeEvent);

          // Update session recording viewport
          if (sessionRecording.isRecording) {
            sessionRecording.viewport = {
              width: newWidth,
              height: newHeight,
              scrollX: window.scrollX || window.pageXOffset,
              scrollY: window.scrollY || window.pageYOffset,
              devicePixelRatio: window.devicePixelRatio || 1,
              orientation: screen.orientation
                ? screen.orientation.angle
                : window.orientation,
            };

            // Record viewport change for session replay
            const viewportEvent = {
              t: "viewport_change",
              viewport: sessionRecording.viewport,
              reason: "resize",
              timestamp: now(),
              relativeTs: getSessionRelativeTime(),
            };
            sessionRecording.interactions.push(viewportEvent);
            rec(viewportEvent);
          }

          lastWidth = newWidth;
          lastHeight = newHeight;
        }
      }, 250); // Debounce resize events
    });

    // Track orientation changes
    window.addEventListener("orientationchange", function () {
      setTimeout(() => {
        const orientationEvent = {
          t: "orientationChange",
          orientation: window.orientation,
          width: window.innerWidth,
          height: window.innerHeight,
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(orientationEvent);
        rec(orientationEvent);

        // Update viewport for session recording
        if (sessionRecording.isRecording) {
          sessionRecording.viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX || window.pageXOffset,
            scrollY: window.scrollY || window.pageYOffset,
            devicePixelRatio: window.devicePixelRatio || 1,
            orientation: screen.orientation
              ? screen.orientation.angle
              : window.orientation,
          };

          const viewportEvent = {
            t: "viewport_change",
            viewport: sessionRecording.viewport,
            reason: "orientation_change",
            timestamp: now(),
            relativeTs: getSessionRelativeTime(),
          };
          sessionRecording.interactions.push(viewportEvent);
          rec(viewportEvent);
        }
      }, 100);
    });
  }

  // Enhanced scroll tracking for session recording
  function initEnhancedScrollTracking() {
    let scrollTimeout;
    let lastScrollX = window.scrollX || window.pageXOffset;
    let lastScrollY = window.scrollY || window.pageYOffset;

    window.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const currentScrollX = window.scrollX || window.pageXOffset;
        const currentScrollY = window.scrollY || window.pageYOffset;

        if (currentScrollX !== lastScrollX || currentScrollY !== lastScrollY) {
          const scrollEvent = {
            t: "enhanced_scroll",
            scrollX: currentScrollX,
            scrollY: currentScrollY,
            deltaX: currentScrollX - lastScrollX,
            deltaY: currentScrollY - lastScrollY,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            timestamp: now(),
            relativeTs: getSessionRelativeTime(),
          };

          queue(scrollEvent);
          rec(scrollEvent);

          // Update session recording viewport scroll position
          if (sessionRecording.isRecording) {
            sessionRecording.viewport.scrollX = currentScrollX;
            sessionRecording.viewport.scrollY = currentScrollY;

            sessionRecording.interactions.push(scrollEvent);
          }

          lastScrollX = currentScrollX;
          lastScrollY = currentScrollY;
        }
      }, 50); // Higher frequency for smoother replay
    });
  }

  /* ---------- Enhanced Error Tracking ---------- */
  // Track JavaScript errors and console events
  function initErrorTracking() {
    // Error tracking removed to prevent recursive errors during minification
    // Can be re-enabled for development/debugging if needed
  }

  /* ---------- Enhanced Performance Tracking ---------- */
  // Track performance metrics and resource loading
  function initPerformanceTracking() {
    // Track resource loading performance
    if ("PerformanceObserver" in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === "resource") {
              const evt = {
                t: "resourceLoad",
                name: entry.name,
                type: entry.initiatorType,
                duration: Math.round(entry.duration),
                size: entry.transferSize || 0,
                ts: now(),
              };
              queue(evt);
              rec(evt);
            }
          });
        });
        resourceObserver.observe({ entryTypes: ["resource"] });
      } catch (e) {
        console.warn("[oonly] PerformanceObserver not supported");
      }
    }

    // Track long tasks
    if ("PerformanceObserver" in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === "longtask") {
              const evt = {
                t: "longTask",
                duration: Math.round(entry.duration),
                startTime: Math.round(entry.startTime),
                ts: now(),
              };
              queue(evt);
              rec(evt);
            }
          });
        });
        longTaskObserver.observe({ entryTypes: ["longtask"] });
      } catch (e) {
        console.warn("[oonly] LongTask observer not supported");
      }
    }
  }

  /* ---------- Enhanced Device Tracking ---------- */
  // Track device capabilities and characteristics
  function initDeviceTracking() {
    // Track device memory
    if ("deviceMemory" in navigator) {
      const evt = {
        t: "deviceMemory",
        memory: navigator.deviceMemory,
        ts: now(),
      };
      queue(evt);
      rec(evt);
    }

    // Track hardware concurrency
    if ("hardwareConcurrency" in navigator) {
      const evt = {
        t: "hardwareConcurrency",
        cores: navigator.hardwareConcurrency,
        ts: now(),
      };
      queue(evt);
      rec(evt);
    }

    // Track battery status
    if ("getBattery" in navigator) {
      navigator.getBattery().then((battery) => {
        const evt = {
          t: "batteryStatus",
          level: Math.round(battery.level * 100),
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
          ts: now(),
        };
        queue(evt);
        rec(evt);
      });
    }

    // Track connection info
    if ("connection" in navigator) {
      const evt = {
        t: "connectionInfo",
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData,
        ts: now(),
      };
      queue(evt);
      rec(evt);
    }
  }

  /* ---------- Enhanced Time Tracking ---------- */
  // Track time-based events and user engagement
  function initTimeTracking() {
    let pageStartTime = now();
    let lastActivityTime = now();
    let totalActiveTime = 0;
    let isPageVisible = true;

    // Track page visibility changes
    document.addEventListener("visibilitychange", function () {
      const wasVisible = isPageVisible;
      isPageVisible = document.visibilityState === "visible";

      if (wasVisible && !isPageVisible) {
        // Page became hidden
        totalActiveTime += now() - lastActivityTime;
        const evt = {
          t: "pageHidden",
          activeTime: totalActiveTime,
          totalTime: now() - pageStartTime,
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(evt);
        rec(evt);
      } else if (!wasVisible && isPageVisible) {
        // Page became visible
        lastActivityTime = now();
        const evt = {
          t: "pageVisible",
          activeTime: totalActiveTime,
          totalTime: now() - pageStartTime,
          ts: now(),
          relativeTs: getSessionRelativeTime(),
        };
        queue(evt);
        rec(evt);
      }
    });

    // Track user activity
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];
    activityEvents.forEach((eventType) => {
      document.addEventListener(
        eventType,
        function () {
          if (isPageVisible) {
            lastActivityTime = now();
          }
        },
        true
      );
    });

    // Track time-based engagement
    setInterval(() => {
      if (isPageVisible) {
        const currentTime = now();
        const activeTime = totalActiveTime + (currentTime - lastActivityTime);
        const totalTime = currentTime - pageStartTime;

        // Track engagement milestones
        if (totalTime % 30000 === 0) {
          // Every 30 seconds
          const evt = {
            t: "timeEngagement",
            activeTime: activeTime,
            totalTime: totalTime,
            engagementRate: Math.round((activeTime / totalTime) * 100),
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }
      }
    }, 1000);
  }

  /* ---------- Global API Functions (Optional) ---------- */
  // Make functions available globally for advanced users (completely optional)
  window.oonly = window.oonly || {};

  // Track function (optional - for custom events)
  window.oonly.track = function (eventType, properties = {}) {
    const evt = {
      t: eventType,
      ...properties,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  };

  // User identification (optional - for logged-in users)
  window.oonly.identify = function (userId, traits = {}) {
    identifyUser(userId, traits);
  };

  // Set user properties (optional - for custom properties)
  window.oonly.set = function (traits) {
    setUserProperties(traits);
  };

  // Get user properties (optional - for debugging)
  window.oonly.getUserProperties = function () {
    return { ...userProperties };
  };

  // Get active segments (optional - for conditional logic)
  window.oonly.getActiveSegments = function () {
    return Array.from(activeSegments);
  };

  // Check if user is in segment (optional - for conditional logic)
  window.oonly.isInSegment = function (segmentId) {
    return activeSegments.has(segmentId);
  };

  // Configure backend URLs (optional - for custom deployments)
  window.oonly.configure = function (config) {
    if (config.baseUrl) CFG.baseUrl = config.baseUrl;
    if (config.wsBaseUrl) CFG.wsBaseUrl = config.wsBaseUrl;
    if (config.apiVersion) CFG.apiVersion = config.apiVersion;

    // Reconnect WebSocket if URLs changed
    if (config.baseUrl || config.wsBaseUrl || config.apiVersion) {
      if (ws && wsOpen) {
        ws.close();
        setTimeout(openWS, 1000);
      }
    }
  };

  // Update segment cache (called by server)
  window.oonly.updateSegmentCache = function (segments) {
    segmentCache = segments;
    saveSegmentCache();
    checkForSegmentMatches();
  };

  // Update segment cache (internal function)
  function updateSegmentCache(segments) {
    segmentCache = segments;
    saveSegmentCache();
    checkForSegmentMatches();
  }

  // Force segment refresh (optional - for manual updates)
  window.oonly.refreshSegments = function () {
    fetch(
      `${CFG.baseUrl}/${CFG.apiVersion}/segments/cache?projectId=${pid}&userId=${uid}`
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          updateSegmentCache(data.segments);
        }
      })
      .catch((err) => console.warn("[oonly] Failed to refresh segments:", err));
  };

  // Reset session (optional - for manual reset)
  window.oonly.reset = function () {
    newSession("manual");
  };

  // Session management API
  window.oonly.session = {
    // Get current session information
    getInfo: function () {
      return {
        sessionId: sid,
        userId: uid,
        startTime: sessionStartTime,
        duration: sessionStartTime ? now() - sessionStartTime : 0,
        pageViews: parseInt(sessionStorage.getItem("_oo_page_views") || "0"),
        totalPageViews: parseInt(
          localStorage.getItem("_oo_total_page_views") || "0"
        ),
        lastActivity: parseInt(
          localStorage.getItem("_oo_last_activity") || "0"
        ),
      };
    },

    // Force start a new session
    startNew: function (reason = "manual") {
      newSession(reason);
      return this.getInfo();
    },

    // Check if session is active
    isActive: function () {
      const lastActivity = parseInt(
        localStorage.getItem("_oo_last_activity") || "0"
      );
      return now() - lastActivity < CFG.idleMs;
    },

    // Get time until session expires
    getTimeToExpiry: function () {
      const lastActivity = parseInt(
        localStorage.getItem("_oo_last_activity") || "0"
      );
      const timeSinceActivity = now() - lastActivity;
      return Math.max(0, CFG.idleMs - timeSinceActivity);
    },
  };

  // Set privacy settings (optional - for configuration)
  window.oonly.setPrivacy = function (settings) {
    if (settings && typeof settings === "object") {
      if (settings.maskInputs !== undefined)
        CFG.maskInputs = settings.maskInputs;
      if (settings.maskChar !== undefined) CFG.maskChar = settings.maskChar;
      if (settings.maskMaxLen !== undefined)
        CFG.maskMaxLen = settings.maskMaxLen;
      if (settings.sensitiveSelectors !== undefined)
        CFG.sensitiveSelectors = settings.sensitiveSelectors;
    }
  };

  // Get segment analytics (optional - for advanced users)
  window.oonly.getSegmentAnalytics = function (segmentId) {
    return fetch(
      `${CFG.baseUrl}/${CFG.apiVersion}/segments/${segmentId}/analytics?projectId=${pid}&userId=${uid}`
    )
      .then((response) => response.json())
      .catch((err) =>
        console.warn("[oonly] Failed to get segment analytics:", err)
      );
  };

  // Track segment interaction (optional - for custom segment events)
  window.oonly.trackSegmentInteraction = function (
    segmentId,
    interactionType,
    properties = {}
  ) {
    const evt = {
      t: "segmentInteraction",
      segmentId: segmentId,
      interactionType: interactionType,
      ...properties,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  };

  // Session Recording API
  window.oonly.sessionRecording = {
    // Start session recording
    start: function () {
      if (!sessionRecording.isRecording) {
        initSessionRecording();
      }
    },

    // Stop session recording
    stop: function () {
      sessionRecording.isRecording = false;
      stopRRWebRecording();
      console.log("[oonly] Session recording stopped");
    },

    // Get current session recording data
    getData: function () {
      return {
        events: sessionRecording.events.slice(),
        snapshots: sessionRecording.snapshots.slice(),
        interactions: sessionRecording.interactions.slice(),
        viewport: sessionRecording.viewport,
        startTime: sessionRecording.startTime,
        isRecording: sessionRecording.isRecording,
      };
    },

    // Capture a manual snapshot
    captureSnapshot: function (reason = "manual") {
      capturePageSnapshot(reason);
    },

    // Configure recording settings
    configure: function (config) {
      Object.assign(recordingConfig, config);
    },

    // Get recording configuration
    getConfig: function () {
      return { ...recordingConfig };
    },

    // Clear recording data (but keep recording)
    clear: function () {
      sessionRecording.events = [];
      sessionRecording.snapshots = [];
      sessionRecording.interactions = [];
      rrwebEvents = [];
    },
  };

  /* ---------- Buffers ---------- */
  // const buf = [], // Moved to top
  //   now = () => Date.now(); // Moved to top
  // let lastFlush = now(); // Moved to top
  /* ✨ NEW ✨ separate replay buffer streamed over WS */
  // let recBuf = []; // Moved to top
  // let lastSnap = now(); // Moved to top

  /* ---------- Streaming websocket for session replay ---------- */
  let ws,
    wsOpen = false,
    wsQueue = [];
  function openWS() {
    if (!pid) return; // Gate on project ID
    ws = new WebSocket(
      `${CFG.wsBaseUrl}/${CFG.apiVersion}/record?pid=${pid}&sid=${sid}`
    );
    ws.onopen = () => {
      wsOpen = true;
      ws.send(JSON.stringify({ t: "hello", uid, sid, ts: now() }));
      flushRec();
    };
    ws.onclose = ws.onerror = () => {
      wsOpen = false;
      setTimeout(openWS, 4000 + Math.random() * 4000); // Add jitter to reconnects
    }; // auto-reconnect
  }
  openWS();

  /* ---------- HTTP Event Ingestion with Batching & Retry Logic ---------- */
  const flush = async (forcedFlush = false) => {
    if (!pid || (!buf.length && !retryQueue.length)) return;
    if (isFlushInProgress && !forcedFlush) return;

    isFlushInProgress = true;

    try {
      // Process retry queue first
      if (retryQueue.length > 0) {
        console.log(`[oonly] Processing ${retryQueue.length} retries`);
        const retryBatch = retryQueue.splice(0, CFG.maxBatchSize);
        await sendBatch(retryBatch, true);
      }

      // Process current buffer
      if (buf.length > 0) {
        // Split into multiple batches if needed
        while (buf.length > 0) {
          const batchSize = Math.min(buf.length, CFG.maxBatchSize);
          const batchEvents = buf.splice(0, batchSize);

          const payload = {
            projectKey: pid,
            sessionId: sid,
            anonId: uid,
            userId: uid,
            events: batchEvents,
            ingestVersion: 2,
            batchId: generateId(), // Add batch ID for tracking
            batchTimestamp: now(),
            context: {
              url: location.href,
              referrer: document.referrer,
              scrW: screen.width,
              scrH: screen.height,
              geo: geoData,
            },
          };

          await sendBatch(payload);
        }
      }

      lastFlush = now();
      console.log(
        `[oonly] Batch flush completed at ${new Date().toISOString()}`
      );
    } catch (err) {
      console.warn("[oonly] Batch flush error:", err);
    } finally {
      isFlushInProgress = false;
    }
  };

  const sendBatch = async (payload, isRetry = false) => {
    const url = `${CFG.baseUrl}/${CFG.apiVersion}/event/ingest`;
    const body = JSON.stringify(payload);

    try {
      // Try sendBeacon first for better reliability
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) {
        if (!isRetry) {
          console.log(
            `[oonly] ✅ Sent ${payload.events.length} events via beacon`
          );
        }
        return;
      }

      // Fallback to fetch
      const response = await fetch(url, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "X-Batch-Size": payload.events.length.toString(),
          "X-Batch-ID": payload.batchId || generateId(),
        },
        body: body,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!isRetry) {
        console.log(
          `[oonly] ✅ Sent ${payload.events.length} events via fetch`
        );
      }
    } catch (err) {
      console.warn(`[oonly] ❌ Batch send failed:`, err);

      // Add to retry queue if not already a retry
      if (!isRetry && retryQueue.length < CFG.maxBatchSize) {
        retryQueue.push(payload);
        console.log(
          `[oonly] 🔄 Added batch to retry queue (${retryQueue.length} pending)`
        );
      }

      throw err;
    }
  };

  // Queue function redefined with improved batching logic
  function queue(e) {
    // Ensure all events have both absolute and relative timestamps
    if (!e.relativeTs && sessionStartTime) {
      e.relativeTs = getSessionRelativeTime();
    }
    if (!e.ts) {
      e.ts = now();
    }
    buf.push(e);

    // Determine if this event needs immediate flushing
    const isCriticalEvent = criticalEventTypes.has(e.t);
    const needsImmediateFlush = isCriticalEvent || isTraditionalSite;

    // For traditional sites or critical events, use shorter flush interval
    const flushInterval = needsImmediateFlush
      ? CFG.traditionalSiteFlushMs
      : CFG.flushMs;

    // Start flush timer if not already running
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, flushInterval);
    } else if (needsImmediateFlush) {
      // If there's already a timer but this is critical, reset with shorter interval
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, CFG.traditionalSiteFlushMs);
    }

    // Emergency flush if buffer gets too large (prevent memory issues)
    if (buf.length >= CFG.maxBatchSize) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush(true); // Force flush
    }

    // For extremely critical events, flush immediately (but throttled)
    if (
      (e.t === "formSubmit" || e.t === "purchase" || e.t === "signup") &&
      buf.length > 1
    ) {
      // Small delay to allow batching of related events
      setTimeout(() => {
        if (buf.length > 0) {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          flush(true);
        }
      }, 100);
    }
  }

  // Schedule automatic batch flushes - more frequent for traditional sites
  setInterval(
    () => {
      if (buf.length > 0 || retryQueue.length > 0) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flush();
      }
    },
    isTraditionalSite ? CFG.traditionalSiteFlushMs : CFG.flushMs
  );

  /* ✨ NEW ✨ replay batching & flush over WS (falls back to HTTP if WS not ready) */
  // Rec function redefined with full logic
  function rec(event) {
    // Ensure all replay events have both absolute and relative timestamps
    if (!event.relativeTs && sessionStartTime) {
      event.relativeTs = getSessionRelativeTime();
    }
    if (!event.ts) {
      event.ts = now();
    }
    recBuf.push(event);
  }
  function flushRec() {
    if (!recBuf.length) return;
    const chunk = JSON.stringify(recBuf.splice(0));
    if (wsOpen) {
      ws.send(chunk);
    } else {
      // fallback = piggy-back on HTTP
      queue({ t: "recFallback", chunk });
    }
  }
  setInterval(flushRec, CFG.recChunkMs);

  // Flush rrweb events periodically
  setInterval(flushRRWebEvents, 5000); // Every 5 seconds

  /* ---------- First-visit & session start ---------- */
  // Initialize session start time for relative timestamps
  sessionStartTime = now();

  if (!localStorage.getItem("_oo_firstVisit")) {
    const ts = now();
    const evt = { t: "firstVisit", ts, relativeTs: 0, url: location.href };
    queue(evt);
    rec(evt);
    localStorage.setItem("_oo_firstVisit", String(ts));
  }

  // Create initial session start event (context will be updated when geo data is available)
  const sessionEvt = {
    t: "sessionStart",
    ts: now(),
    relativeTs: 0,
    url: location.href,
    title: document.title,
    pathname: location.pathname,
    context: getComprehensiveContext(), // Get comprehensive context info
  };
  queue(sessionEvt);
  rec(sessionEvt);

  // Track initial page view with comprehensive data
  const initialPageView = {
    t: "page_view",
    title: document.title,
    path: location.pathname,
    url: location.href,
    search: location.search,
    hash: location.hash,
    ts: now(),
    relativeTs: getSessionRelativeTime(),
    context: getComprehensiveContext(),
  };
  queue(initialPageView);
  rec(initialPageView);

  // Send individual device capability events for backend processing
  if (navigator.deviceMemory) {
    const deviceMemoryEvt = {
      t: "deviceMemory",
      payload: { memory: navigator.deviceMemory },
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    };
    queue(deviceMemoryEvt);
    rec(deviceMemoryEvt);
  }

  if (navigator.hardwareConcurrency) {
    const hardwareConcurrencyEvt = {
      t: "hardwareConcurrency",
      payload: { cores: navigator.hardwareConcurrency },
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    };
    queue(hardwareConcurrencyEvt);
    rec(hardwareConcurrencyEvt);
  }

  // Send comprehensive user properties for backend segmentation
  const userPropsEvt = {
    t: "userProps",
    payload: {
      props: {
        device: getDeviceType(),
        browser: getBrowserInfo().name,
        language: navigator.language,
        screenWidth: screen.width,
        screenHeight: screen.height,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
    },
    ts: now(),
    relativeTs: getSessionRelativeTime(),
  };
  queue(userPropsEvt);
  rec(userPropsEvt);

  // Set session start time and increment page views (use localStorage for persistence across page loads)
  localStorage.setItem("_oo_session_start", String(now()));
  const currentPageViews =
    parseInt(localStorage.getItem("_oo_page_views_" + sid) || "0") + 1;
  localStorage.setItem("_oo_page_views_" + sid, String(currentPageViews));

  // Also maintain a global page view counter in localStorage for user lifetime stats
  localStorage.setItem(
    "_oo_total_page_views",
    String((+localStorage.getItem("_oo_total_page_views") || 0) + 1)
  );

  /* ---------- IP Geolocation ---------- */

  // Function to fetch IP geolocation
  async function fetchGeoLocation() {
    try {
      // Use reliable IP services that work consistently
      const geoUrls = [
        "https://api.ipify.org?format=json",
        "https://httpbin.org/ip",
      ];

      for (const url of geoUrls) {
        try {
          const response = await fetch(url, {
            method: "GET",
            mode: "cors",
            headers: {
              Accept: "application/json",
            },
          });

          if (response.ok) {
            const data = await response.json();

            // Get IP address
            const ip = url.includes("ipify.org") ? data.ip : data.origin;

            if (ip) {
              geoData = {
                ip: ip,
                source: url.includes("ipify.org") ? "ipify.org" : "httpbin.org",
              };

              // Try to get country info using a simple, reliable method
              try {
                // Use a simple country lookup that's more reliable
                const countryResponse = await fetch(
                  `https://ipapi.co/${ip}/country_name/`
                );
                if (countryResponse.ok) {
                  const country = await countryResponse.text();
                  geoData.country = country.trim();
                }
              } catch (countryErr) {}

              // Send updated context with geo data
              const contextUpdateEvt = {
                t: "contextUpdate",
                ts: now(),
                relativeTs: getSessionRelativeTime(),
                context: getComprehensiveContext(), // This will now include geoData
              };
              queue(contextUpdateEvt);
              rec(contextUpdateEvt);

              break; // Use first successful response
            }
          }
        } catch (err) {
          console.warn("[oonly] IP service failed:", url, err);
          continue; // Try next service
        }
      }
    } catch (err) {
      console.warn("[oonly] All IP services failed:", err);
    }
  }

  /* ---------- Env + campaign events are now queued after geolocation ---------- */

  /* ---------- Idle → new session ---------- */
  let lastAct = now();
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach((e) =>
    addEventListener(
      e,
      () => {
        lastAct = now();
        // Update last activity timestamp for session timeout detection
        localStorage.setItem("_oo_last_activity", String(lastAct));
      },
      true
    )
  );
  const idleChk = setInterval(() => {
    if (now() - lastAct > CFG.idleMs) newSession("idle");
  }, CFG.idleMs / 2);
  function newSession(reason) {
    flushSections();

    // Force flush all pending events before starting new session
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush(true); // Force flush
    flushRec();
    flushRRWebEvents(); // Flush any remaining rrweb events

    // Stop and restart rrweb recording for new session
    stopRRWebRecording();

    // Generate new session ID and update storage
    const oldSid = sid;
    sid = genId();
    localStorage.setItem(sidKey, sid); // Use localStorage for session ID to persist across page loads

    // Reset session start time for new session (relative timestamps start at 0)
    sessionStartTime = now();

    console.log(
      `[oonly] New session started: ${sid} (reason: ${reason}, previous: ${oldSid})`
    );

    const evt = {
      t: "sessionStart",
      reason,
      ts: now(),
      relativeTs: 0,
      url: location.href,
      previousSessionId: oldSid,
      context: getBasicContext(), // Include immediate context info
    };
    queue(evt);
    rec(evt);
    lastAct = now();

    // Update session tracking (use localStorage for persistence across page loads)
    localStorage.setItem("_oo_session_start", String(now()));
    localStorage.setItem("_oo_page_views_" + sid, "1"); // Reset page views for new session

    // Also maintain a global page view counter in localStorage for user lifetime stats
    localStorage.setItem(
      "_oo_total_page_views",
      String((+localStorage.getItem("_oo_total_page_views") || 0) + 1)
    );

    // Restart rrweb recording for new session
    setTimeout(startRRWebRecording, 100); // Small delay to ensure clean session boundary
  }

  /* ---------- User-engagement ping (GA4) ---------- */
  setInterval(() => {
    if (document.visibilityState === "visible" && now() - lastAct < 10000)
      queue({ t: "userEng", dur: 10000, ts: now() });
  }, 10000);

  /* ---------- Real-time heartbeat for live analytics ---------- */
  setInterval(() => {
    if (document.visibilityState === "visible") {
      const heartbeatEvt = { t: "heartbeat", ts: now() };
      queue(heartbeatEvt);
      rec(heartbeatEvt);
    }
  }, 30000); // Every 30 seconds

  /* ---------- Page view + SPA routes ---------- */
  const pageEvt = {
    t: "page",
    url: location.pathname + location.search,
    ref: document.referrer,
    ts: now(),
  };
  queue(pageEvt);
  rec(pageEvt);

  // Enhanced SPA route detection for session recording
  let previousUrl = location.href;

  ["pushState", "replaceState"].forEach((fn) => {
    const o = history[fn];
    history[fn] = function () {
      // Execute the original function first
      o.apply(this, arguments);

      // Then get the actual current URL after the change
      const newUrl = location.href;

      // Small delay to ensure URL has been updated
      setTimeout(() => {
        emitRoute(fn, newUrl);
      }, 0);
    };
  });
  addEventListener("popstate", () => {
    setTimeout(() => emitRoute("popstate", location.href), 0);
  });
  addEventListener("hashchange", () => {
    setTimeout(() => emitRoute("hashchange", location.href), 0);
  });

  function emitRoute(navigationType = "unknown", newUrl = location.href) {
    // Only emit route if URL actually changed
    if (newUrl === previousUrl) {
      return;
    }

    console.log(
      `[oonly] Route change detected: ${navigationType} from ${previousUrl} to ${newUrl}`
    );

    const routeEvent = {
      t: "route",
      navigationType: navigationType,
      from: previousUrl,
      to: newUrl,
      url: location.pathname + location.search + location.hash,
      ts: now(),
      relativeTs: getSessionRelativeTime(),
    };
    queue(routeEvent);
    rec(routeEvent);

    // Immediate page view tracking
    const pageViewEvt = {
      t: "page_view",
      title: document.title,
      path: location.pathname,
      url: location.href,
      search: location.search,
      hash: location.hash,
      referrer: previousUrl,
      navigationType: navigationType,
      ts: now(),
      relativeTs: getSessionRelativeTime(),
      context: getBasicContext(), // Use basic context to avoid geoData dependency
    };
    queue(pageViewEvt);
    rec(pageViewEvt);

    // Session recording: capture snapshot after route change
    if (sessionRecording.isRecording) {
      setTimeout(() => {
        capturePageSnapshot("route_change");

        // Record route-specific interaction
        const routeInteraction = {
          t: "spa_route_change",
          navigationType: navigationType,
          from: previousUrl,
          to: newUrl,
          title: document.title,
          path: location.pathname,
          timestamp: now(),
          relativeTs: getSessionRelativeTime(),
          viewport: {
            scrollX: window.scrollX || window.pageXOffset,
            scrollY: window.scrollY || window.pageYOffset,
            width: window.innerWidth,
            height: window.innerHeight,
          },
        };
        sessionRecording.interactions.push(routeInteraction);
        rec(routeInteraction);
      }, 100); // Wait for DOM to update
    }

    // Increment page views for navigation (use localStorage for persistence across page loads)
    const currentPageViews =
      parseInt(localStorage.getItem("_oo_page_views_" + sid) || "0") + 1;
    localStorage.setItem("_oo_page_views_" + sid, String(currentPageViews));

    // Also increment total page views for user lifetime stats
    localStorage.setItem(
      "_oo_total_page_views",
      String((+localStorage.getItem("_oo_total_page_views") || 0) + 1)
    );

    // Update previous URL for next comparison
    previousUrl = newUrl;
  }

  /* ---------- Clicks, rage clicks, outbound, downloads ---------- */
  let clickBuf = [];
  addEventListener(
    "click",
    (e) => {
      const target = safeGetEventTarget(e);
      const evt = {
        t: "click",
        x: e.clientX || 0,
        y: e.clientY || 0,
        sel: target ? cssPath(target) : "",
        ts: now(),
      };
      queue(evt);
      rec(evt);

      // outbound / download / external redirect handling
      const a = safeClosest(target, "a[href]");
      if (a) {
        const href = a.href;
        const ext = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|mp[34]|mov|avi)$/i;
        const url = new URL(href, location.href);

        if (url.host !== location.host) {
          // External link - handle redirect tracking
          const redirectType = detectRedirectType(url.href);
          const enhancedHref = handleExternalRedirect(href, redirectType);

          // Update the link href with return tracking
          if (enhancedHref !== href) {
            a.href = enhancedHref;
          }

          queue({ t: "outClick", href, redirectType, ts: now() });

          // For traditional sites, immediately flush before external navigation
          if (isTraditionalSite) {
            setTimeout(() => {
              if (buf.length > 0) {
                if (flushTimer) {
                  clearTimeout(flushTimer);
                  flushTimer = null;
                }
                flush(true);
              }
            }, 50);
          }
        } else if (ext.test(href)) {
          queue({ t: "fileDl", href, ts: now() });

          // Flush before download for traditional sites
          if (isTraditionalSite) {
            setTimeout(() => {
              if (buf.length > 0) {
                if (flushTimer) {
                  clearTimeout(flushTimer);
                  flushTimer = null;
                }
                flush(true);
              }
            }, 50);
          }
        }
      }

      // rage click detection (≥3 within 600 ms, ≤20 px)
      const clickX = e.clientX || 0;
      const clickY = e.clientY || 0;
      clickBuf.push({ x: clickX, y: clickY, ts: now() });
      clickBuf = clickBuf.filter((c) => now() - c.ts < 600);
      if (clickBuf.length >= 3) {
        const dx =
          Math.max(...clickBuf.map((c) => c.x)) -
          Math.min(...clickBuf.map((c) => c.x));
        const dy =
          Math.max(...clickBuf.map((c) => c.y)) -
          Math.min(...clickBuf.map((c) => c.y));
        if (dx < 20 && dy < 20) {
          queue({ t: "rageClick", x: clickX, y: clickY, ts: now() });
          clickBuf = [];
        }
      }
    },
    true
  );

  /* ---------- Detect redirect type based on URL patterns ---------- */
  function detectRedirectType(url) {
    const urlObj = new URL(url);
    const host = urlObj.hostname.toLowerCase();
    const path = urlObj.pathname.toLowerCase();

    // Payment gateways
    if (
      host.includes("stripe.com") ||
      host.includes("paypal.com") ||
      host.includes("checkout.stripe.com") ||
      host.includes("www.paypal.com")
    ) {
      return "payment";
    }

    // Social login - more specific to avoid false positives
    if (
      host.includes("accounts.facebook.com") ||
      host.includes("accounts.google.com") ||
      host.includes("github.com") ||
      host.includes("twitter.com") ||
      host.includes("x.com")
    ) {
      return "social_login";
    }

    // OAuth/SSO
    if (
      path.includes("/oauth/") ||
      path.includes("/auth/") ||
      host.includes("auth0.com") ||
      host.includes("okta.com")
    ) {
      return "oauth";
    }

    // External services
    if (
      host.includes("zendesk.com") ||
      host.includes("intercom.com") ||
      host.includes("calendly.com") ||
      host.includes("typeform.com")
    ) {
      return "external_service";
    }

    return "external";
  }

  /* ---------- Pointer-move heatmap (sampled) ---------- */
  let lastPt = 0;
  addEventListener(
    "mousemove",
    (e) => {
      if (now() - lastPt > CFG.pointerSampleMs) {
        lastPt = now();
        const evt = { t: "pointer", x: e.clientX, y: e.clientY, ts: now() };
        queue(evt);
        rec(evt);
      }
    },
    true
  );

  /* ---------- Text-select ---------- */
  addEventListener(
    "selectstart",
    () => {
      const evt = { t: "textSelect", ts: now() };
      queue(evt);
      rec(evt);
    },
    true
  );

  /* ---------- Section time tracking ---------- */
  const sections = [...document.querySelectorAll("[data-oonly-section]")];
  const inView = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        const id =
          en.target.getAttribute("data-oonly-section") || cssPath(en.target);
        const rec = inView.get(id) || { enter: null, total: 0 };
        if (en.isIntersecting) rec.enter = now();
        else if (rec.enter) {
          rec.total += now() - rec.enter;
          rec.enter = null;
        }
        inView.set(id, rec);
      });
    },
    { threshold: 0.25 }
  );
  sections.forEach((s) => io.observe(s));
  function flushSections() {
    inView.forEach((rec, id) => {
      if (rec.enter) {
        rec.total += now() - rec.enter;
        rec.enter = null;
      }
      if (rec.total > 0) {
        const evt = { t: "sectionTime", id, dur: rec.total, ts: now() };
        queue(evt);
        rec(evt);
      }
    });
  }

  /* ---------- DOM diff snapshots (for heat-map *and* replay) ---------- */
  const mo = new MutationObserver((list) => {
    const html = serialize(list);
    if (html) {
      const sanitizedHtml = sanitizeHTML(html);
      const evt = { t: "domDiff", html: sanitizedHtml, ts: now() };
      queue(evt);
      rec(evt);
    }
  });
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  /* ✨ ENHANCED ✨ periodic full snapshot for session replay */
  function snapFull() {
    if (!sessionRecording.isRecording) return;

    try {
      const html = document.documentElement.outerHTML.slice(0, 2_000_000); // cap 2 MB
      const sanitizedHtml = sanitizeHTML(html);

      const snapshot = {
        t: "domFull",
        html: sanitizedHtml,
        viewport: {
          scrollX: window.scrollX || window.pageXOffset,
          scrollY: window.scrollY || window.pageYOffset,
          width: window.innerWidth,
          height: window.innerHeight,
        },
        url: location.href,
        title: document.title,
        ts: now(),
        relativeTs: getSessionRelativeTime(),
      };

      rec(snapshot);
      sessionRecording.snapshots.push(snapshot);

      // Manage snapshot buffer
      if (sessionRecording.snapshots.length > 20) {
        sessionRecording.snapshots.splice(0, 10);
      }

      lastSnap = now();
    } catch (error) {
      console.warn("[oonly] Failed to capture full snapshot:", error);
    }
  }

  setInterval(() => {
    if (now() - lastSnap > CFG.snapFullMs && sessionRecording.isRecording) {
      snapFull();
    }
  }, CFG.snapFullMs);

  // Enhanced periodic snapshot capture for different triggers
  setInterval(() => {
    if (sessionRecording.isRecording) {
      capturePageSnapshot("periodic");
    }
  }, 60000); // Every minute

  /* ---------- Forms: submit, error, focus/blur, change ---------- */
  addEventListener(
    "submit",
    (e) => {
      const f = e.target;
      const evt = { t: "formSubmit", sel: cssPath(f), ts: now() };
      queue(evt);
      rec(evt);

      // For traditional sites, immediately flush after form submission
      if (isTraditionalSite) {
        setTimeout(() => {
          if (buf.length > 0) {
            if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            flush(true);
          }
        }, 50); // Small delay to capture any related events
      }

      // site-search detection (input[type=search] or name=q)
      const q = f.querySelector('input[type="search"],input[name=q]');
      if (q) {
        const term = new FormData(f).get(q.name || "q") || "";
        const searchEvt = { t: "search", term, ts: now() };
        queue(searchEvt);
        rec(searchEvt);
      }

      // Record masked form data for sensitive inputs
      const formData = new FormData(f);
      const maskedData = {};
      formData.forEach((value, key) => {
        const input = f.querySelector(`[name="${key}"]`);
        if (input && isSensitiveInput(input)) {
          maskedData[key] = maskSensitiveValue(value);
        }
      });

      if (Object.keys(maskedData).length > 0) {
        const maskedEvt = {
          t: "formMasked",
          sel: cssPath(f),
          maskedData,
          ts: now(),
        };
        rec(maskedEvt);
      }
    },
    true
  );
  addEventListener(
    "error",
    (e) => {
      if (e.target.tagName === "FORM") {
        const evt = {
          t: "formErr",
          sel: cssPath(e.target),
          msg: e.message || "client",
          ts: now(),
        };
        queue(evt);
        rec(evt);
      }
    },
    true
  );
  const focusT = new WeakMap();
  addEventListener(
    "focus",
    (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        focusT.set(e.target, now());
        const evt = { t: "inputFocus", sel: cssPath(e.target), ts: now() };
        queue(evt);
        rec(evt);
      }
    },
    true
  );
  addEventListener(
    "blur",
    (e) => {
      if (focusT.has(e.target)) {
        const evt = {
          t: "inputBlur",
          sel: cssPath(e.target),
          dur: now() - focusT.get(e.target),
          ts: now(),
        };
        queue(evt);
        rec(evt);
        focusT.delete(e.target);
      }
    },
    true
  );
  addEventListener(
    "input",
    (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        const evt = { t: "inputChange", sel: cssPath(e.target), ts: now() };
        queue(evt);
        rec(evt);

        // For sensitive inputs, also record a masked version for replay
        if (isSensitiveInput(e.target)) {
          const maskedEvt = {
            t: "inputMasked",
            sel: cssPath(e.target),
            masked: maskSensitiveValue(e.target.value),
            ts: now(),
          };
          rec(maskedEvt);
        }
      }
    },
    true
  );

  /* ---------- Media: play/pause/ended + progress ---------- */
  const progSeen = new WeakMap();
  ["play", "pause", "ended"].forEach((ev) => {
    document.addEventListener(
      ev,
      (e) => {
        if (/^(VIDEO|AUDIO)$/.test(e.target.tagName)) {
          const evt = {
            t: "media",
            act: ev,
            sel: cssPath(e.target),
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }
      },
      true
    );
  });
  document.addEventListener(
    "timeupdate",
    (e) => {
      if (!/^(VIDEO|AUDIO)$/.test(e.target.tagName)) return;
      const el = e.target,
        d = el.duration;
      if (!d || !isFinite(d)) return;
      const pct = Math.floor((el.currentTime / d) * 100);
      let mask = progSeen.get(el) || 0,
        [p25, p50, p75] = [25, 50, 75];
      [
        [p25, 1],
        [p50, 2],
        [p75, 4],
      ].forEach(([p, b]) => {
        if (pct >= p && !(mask & b)) {
          const evt = { t: "mediaProg", pct: p, sel: cssPath(el), ts: now() };
          queue(evt);
          rec(evt);
          mask |= b;
        }
      });
      progSeen.set(el, mask);
    },
    true
  );

  /* ---------- JS & resource errors ---------- */
  // Error tracking removed to prevent recursive errors during minification
  // Resource loading errors can still be tracked if needed:
  /*
  addEventListener("error", (e) => {
    if (e.target instanceof HTMLElement && e.target !== window) {
      const evt = {
        t: "resErr",
        src: e.target.src || e.target.href || "",
        sel: cssPath(e.target),
        ts: now(),
      };
      queue(evt);
      rec(evt);
    }
  });
  */

  /* ---------- Env changes ---------- */
  addEventListener("resize", () => {
    const evt = { t: "resize", w: innerWidth, h: innerHeight, ts: now() };
    queue(evt);
    rec(evt);
  });
  addEventListener("orientationchange", () => {
    const evt = {
      t: "orientation",
      ori: screen.orientation?.type || window.orientation,
      ts: now(),
    };
    queue(evt);
    rec(evt);
  });
  addEventListener("online", () => {
    const evt = { t: "online", ts: now() };
    queue(evt);
    rec(evt);
  });
  addEventListener("offline", () => {
    const evt = { t: "offline", ts: now() };
    queue(evt);
    rec(evt);
  });
  if (navigator.connection && navigator.connection.addEventListener) {
    const sendNet = () => {
      const evt = {
        t: "netInfo",
        down: navigator.connection.downlink,
        type: navigator.connection.effectiveType,
        rtt: navigator.connection.rtt,
        ts: now(),
      };
      queue(evt);
      rec(evt);
    };
    navigator.connection.addEventListener("change", sendNet);
    sendNet();
  }
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const sendBat = () => {
        const evt = { t: "battery", lvl: b.level, ch: b.charging, ts: now() };
        queue(evt);
        rec(evt);
      };
      ["levelchange", "chargingchange"].forEach((ev) =>
        b.addEventListener(ev, sendBat)
      );
      sendBat();
    });
  }

  /* ---------- Web Vitals ---------- */
  if ("PerformanceObserver" in window) {
    try {
      const po = new PerformanceObserver((l) => {
        l.getEntries().forEach((e) => {
          if (e.entryType === "largest-contentful-paint") {
            const evt = { t: "lcp", val: Math.round(e.startTime), ts: now() };
            queue(evt);
            rec(evt);
          } else if (e.entryType === "first-input") {
            const evt = {
              t: "fid",
              val: Math.round(e.processingStart - e.startTime),
              ts: now(),
            };
            queue(evt);
            rec(evt);
          } else if (e.entryType === "layout-shift" && !e.hadRecentInput) {
            const evt = { t: "cls", val: e.value, ts: now() };
            queue(evt);
            rec(evt);
          }
        });
      });
      ["largest-contentful-paint", "first-input", "layout-shift"].forEach(
        (type) => po.observe({ type, buffered: true })
      );
    } catch (_) {}
  }

  /* ---------- Navigation Timing ---------- */
  try {
    const n = performance.getEntriesByType("navigation")[0];
    if (n) {
      const evt = {
        t: "navTiming",
        dns: n.domainLookupEnd - n.domainLookupStart,
        ttfb: n.responseStart - n.requestStart,
        fcp: n.domContentLoadedEventStart,
        load: n.loadEventEnd - n.startTime,
        ts: now(),
      };
      queue(evt);
      rec(evt);
    }
  } catch (_) {}

  /* ---------- Visibility & unload ---------- */
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushSections();

      // Force flush all pending events when page becomes hidden
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush(true); // Force flush
      flushRec();
      touchSid();
    }
  });
  // Enhanced page unload handling for traditional sites
  function handlePageUnload(reason = "page_unload") {
    snapFull();
    flushSections();

    // Track session end
    const evt = {
      t: "sessionEnd",
      reason: reason,
      sessionId: sid,
      duration: sessionStartTime ? now() - sessionStartTime : 0,
      ts: now(),
    };
    queue(evt);
    rec(evt);

    // Update last activity time
    localStorage.setItem("_oo_last_activity", String(now()));

    // For traditional sites, use sendBeacon for final flush
    if (isTraditionalSite && buf.length > 0) {
      try {
        const payload = {
          projectKey: pid,
          sessionId: sid,
          anonId: uid,
          userId: uid,
          events: [...buf],
          ingestVersion: 2,
          batchId: generateId(),
          batchTimestamp: now(),
          context: {
            url: location.href,
            referrer: document.referrer,
            scrW: screen.width,
            scrH: screen.height,
            geo: geoData,
          },
        };

        const blob = new Blob([JSON.stringify(payload)], {
          type: "application/json",
        });
        const sent = navigator.sendBeacon(
          `${CFG.baseUrl}/${CFG.apiVersion}/event/ingest`,
          blob
        );

        if (sent) {
          console.log(
            `[oonly] ✅ Final beacon sent ${buf.length} events on ${reason}`
          );
          buf.length = 0; // Clear buffer after successful send
        } else {
          // Fallback to synchronous request for critical data
          try {
            const xhr = new XMLHttpRequest();
            xhr.open(
              "POST",
              `${CFG.baseUrl}/${CFG.apiVersion}/event/ingest`,
              false
            ); // Synchronous
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify(payload));
            console.log(
              `[oonly] ✅ Fallback XHR sent ${buf.length} events on ${reason}`
            );
            buf.length = 0;
          } catch (xhrErr) {
            console.warn("[oonly] ❌ All unload methods failed:", xhrErr);
          }
        }
      } catch (err) {
        console.warn("[oonly] ❌ Emergency unload flush failed:", err);
      }
    } else {
      // Force final flush for SPAs
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush(true); // Force flush
    }

    flushRec();
    clearInterval(idleChk);
  }

  // Multiple event listeners for maximum reliability
  addEventListener("pagehide", () => handlePageUnload("pagehide"));
  // Note: beforeunload handler already added in init() function above

  // Additional safety net for traditional sites
  if (isTraditionalSite) {
    addEventListener("unload", () => handlePageUnload("unload"));

    // Periodic emergency flush for traditional sites
    setInterval(() => {
      if (buf.length > 5) {
        // Only if there are significant events waiting
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flush(true);
      }
    }, 5000); // Every 5 seconds
  }

  /* ---------- Public API ---------- */
  // Add command interface without overwriting the object API
  window.oonlyCmd = function (cmd, a, b) {
    switch (cmd) {
      case "track":
        const evt = { t: "custom", name: a, props: b || {}, ts: now() };
        queue(evt);
        rec(evt);
        break;
      case "identify":
        localStorage.setItem(uidKey, a);
        break;
      case "setUserProps":
        const userEvt = { t: "userProps", props: a, ts: now() };
        queue(userEvt);
        rec(userEvt);
        break;
      case "reset":
        newSession("manual");
        break;
      case "setPrivacy":
        if (a && typeof a === "object") {
          if (a.maskInputs !== undefined) CFG.maskInputs = a.maskInputs;
          if (a.maskChar !== undefined) CFG.maskChar = a.maskChar;
          if (a.maskMaxLen !== undefined) CFG.maskMaxLen = a.maskMaxLen;
          if (a.sensitiveSelectors !== undefined)
            CFG.sensitiveSelectors = a.sensitiveSelectors;
        }
        break;

      /* ---------- E-commerce helper ---------- */
      case "ecommerce":
        /* Usage: oonly('ecommerce', 'addToCart', {id:'123',price:9.99}) */
        if (typeof a === "string") {
          const ecEvt = { t: a, ...(b || {}), ts: now() };
          queue(ecEvt);
          rec(ecEvt);
        }
        break;

      /* ---------- Real-time analytics helper ---------- */
      case "realtime":
        /* Usage: oonly('realtime', 'heartbeat') - sends activity ping */
        if (a === "heartbeat") {
          const heartbeatEvt = { t: "heartbeat", ts: now() };
          queue(heartbeatEvt);
          rec(heartbeatEvt);
        }
        break;
    }
  };

  /* ---------- Privacy Protection ---------- */
  // Configure method to update settings after load
  window.oonly.configure = function (cfg) {
    if (cfg.projectId) pid = cfg.projectId;
    if (cfg.baseUrl) CFG.baseUrl = cfg.baseUrl;
    if (cfg.wsBaseUrl) CFG.wsBaseUrl = cfg.wsBaseUrl;
    if (cfg.apiVersion) CFG.apiVersion = cfg.apiVersion;
    if (ws && wsOpen) {
      ws.close();
      setTimeout(openWS, 1000);
    } else {
      openWS();
    }
  };

  function isSensitiveInput(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;

    // Check custom selectors first
    if (CFG.sensitiveSelectors.length > 0) {
      for (let selector of CFG.sensitiveSelectors) {
        try {
          if (safeMatches(el, selector)) return true;
        } catch (e) {
          // Invalid selector, skip
        }
      }
    }

    // Check for sensitive input types
    const sensitiveTypes = [
      "password",
      "email",
      "tel",
      "number",
      "search",
      "url",
      "text",
    ];
    const sensitiveNames = [
      "password",
      "pass",
      "pwd",
      "email",
      "mail",
      "phone",
      "tel",
      "mobile",
      "card",
      "cc",
      "cvv",
      "ssn",
      "social",
      "account",
      "username",
      "user",
      "login",
      "secret",
      "key",
      "token",
      "auth",
      "credential",
    ];
    const sensitiveIds = [
      "password",
      "pass",
      "pwd",
      "email",
      "mail",
      "phone",
      "tel",
      "mobile",
      "card",
      "cc",
      "cvv",
      "ssn",
      "social",
      "account",
      "username",
      "user",
      "login",
      "secret",
      "key",
      "token",
      "auth",
      "credential",
    ];

    // Check input type
    if (el.type && sensitiveTypes.includes(el.type)) return true;

    // Check name attribute
    if (
      el.name &&
      sensitiveNames.some((name) => el.name.toLowerCase().includes(name))
    )
      return true;

    // Check id attribute
    if (el.id && sensitiveIds.some((id) => el.id.toLowerCase().includes(id)))
      return true;

    // Check placeholder for hints
    if (
      el.placeholder &&
      sensitiveNames.some((name) => el.placeholder.toLowerCase().includes(name))
    )
      return true;

    // Check aria-label
    if (
      el.getAttribute("aria-label") &&
      sensitiveNames.some((name) =>
        el.getAttribute("aria-label").toLowerCase().includes(name)
      )
    )
      return true;

    return false;
  }

  function maskSensitiveValue(value) {
    if (!value || typeof value !== "string") return value;
    if (!CFG.maskInputs) return value;
    return CFG.maskChar.repeat(Math.min(value.length, CFG.maskMaxLen));
  }

  function sanitizeHTML(html) {
    if (!html || typeof html !== "string") return html;

    // Create a temporary div to parse HTML
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Find all input elements and mask sensitive values
    const inputs = temp.querySelectorAll("input, textarea, select");
    inputs.forEach((input) => {
      if (isSensitiveInput(input)) {
        if (input.value) {
          input.value = maskSensitiveValue(input.value);
        }
        if (input.defaultValue) {
          input.defaultValue = maskSensitiveValue(input.defaultValue);
        }
        // Also mask placeholder if it contains sensitive info
        if (
          input.placeholder &&
          input.placeholder !== input.getAttribute("data-original-placeholder")
        ) {
          input.setAttribute("data-original-placeholder", input.placeholder);
          input.placeholder = "***";
        }
      }
    });

    return temp.innerHTML;
  }

  /* ---------- Utilities ---------- */
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    let p = "",
      cur = el;
    while (cur && cur.nodeType === 1 && p.length < 200) {
      const id = cur.id ? "#" + cur.id : "";
      const cls =
        cur.className && typeof cur.className === "string"
          ? "." + cur.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      p = cur.nodeName.toLowerCase() + id + cls + (p ? ">" + p : "");
      if (cur.id) break;
      cur = cur.parentElement;
    }
    return p;
  }
  function serialize(muts) {
    if (muts.length > 10) return "";
    return muts.map((m) => m.target.outerHTML?.slice(0, 100)).join("|");
  }
})();

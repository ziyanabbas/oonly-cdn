/* ────────────────────────────────────────────────────────────
   Oonly Universal Tracker  v1.3.0  (2025-07-15)
   GA-plus + Clarity-plus *plus* full session-replay + Advanced Segmentation.
   Footprint ≈22 kB gzip (extra 4 kB for replay), zero deps, ES5-safe
────────────────────────────────────────────────────────────── */
(function () {
    /* ---------- Config ---------- */
    "use strict";
  
    // TESTING: Remove this console log when ready for production
    console.log("🚀 Oonly Tracker loaded successfully! Version:", "1.0.0");
    const CFG = {
      /* ✨ BACKEND CONFIGURATION ✨ */
      baseUrl: "http://localhost:5000", // Base URL for all API endpoints
      wsBaseUrl: "ws://localhost:5000", // WebSocket base URL
      apiVersion: "v1", // API version
  
      bufMax: 60, // HTTP batch size
      flushMs: 2000, // HTTP flush interval
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
  
    /* ---------- Project + IDs ---------- */
    const pid = document.currentScript.dataset.projectId;
    if (!pid) {
      console.error("[oonly] missing data-project-id");
      return;
    }
  
    const uidKey = "_oo_uid",
      sidKey = "_oo_sid";
    const genId = () =>
      ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        (
          c ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16)
      );
    const getId = (k) =>
      localStorage.getItem(k) ||
      (localStorage.setItem(k, genId()), localStorage.getItem(k));
    const uid = getId(uidKey);
    let sid = getId(sidKey);
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
                location.hash +
                (urlParams.toString() ? "?" + urlParams.toString() : "");
              history.replaceState(null, "", newUrl);
  
              console.log("[oonly] External return detected:", data.type);
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
        device:
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          )
            ? "mobile"
            : "desktop",
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
        const evt = {
          t: "formSubmit",
          formId: form.id || form.className || "unknown",
          formAction: form.action || "",
          formMethod: form.method || "POST",
          formData: formProps,
          fieldCount: formData.entries().length,
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
        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT"
        ) {
          const evt = {
            t: "formFieldFocus",
            fieldType: e.target.type || e.target.tagName.toLowerCase(),
            fieldName: e.target.name || "",
            fieldId: e.target.id || "",
            formId: e.target.form
              ? e.target.form.id || e.target.form.className || "unknown"
              : "standalone",
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }
      });
  
      // Track form field changes
      document.addEventListener("input", function (e) {
        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT"
        ) {
          const evt = {
            t: "formFieldChange",
            fieldType: e.target.type || e.target.tagName.toLowerCase(),
            fieldName: e.target.name || "",
            fieldId: e.target.id || "",
            formId: e.target.form
              ? e.target.form.id || e.target.form.className || "unknown"
              : "standalone",
            hasValue: !!e.target.value,
            valueLength: e.target.value ? e.target.value.length : 0,
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }
      });
  
      // Track form validation errors
      document.addEventListener("invalid", function (e) {
        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT"
        ) {
          const evt = {
            t: "formValidationError",
            fieldType: e.target.type || e.target.tagName.toLowerCase(),
            fieldName: e.target.name || "",
            fieldId: e.target.id || "",
            formId: e.target.form
              ? e.target.form.id || e.target.form.className || "unknown"
              : "standalone",
            validationMessage: e.target.validationMessage || "",
            ts: now(),
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
        const link = e.target.closest("a");
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
        const link = e.target.closest("a");
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
        const link = e.target.closest("a");
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
        const button = e.target.closest("button");
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
        const button = e.target.closest("button");
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
        const button = e.target.closest("button");
        if (button) {
          clearTimeout(buttonHoverTimeout);
        }
      });
    }
  
    /* ---------- Enhanced Automatic Scroll Tracking ---------- */
    // Track scroll depth, speed, and engagement patterns automatically
    let maxScrollDepth = 0;
    let scrollStartTime = Date.now();
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
        const currentTime = Date.now();
  
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
  
    /* ---------- Enhanced Automatic Tracking Initialization ---------- */
    function initAutomaticTracking() {
      initFormTracking();
      initLinkTracking();
      initButtonTracking();
      initScrollTracking();
      initMouseTracking();
      initKeyboardTracking();
      initResizeTracking();
      initErrorTracking();
      initPerformanceTracking();
      initDeviceTracking();
      initTimeTracking();
    }
  
    // Initialize automatic tracking
    initAutomaticTracking();
  
    /* ---------- Enhanced Mouse Tracking ---------- */
    // Track mouse movements, clicks, and interaction patterns
    function initMouseTracking() {
      let mouseEvents = [];
      let lastMouseMove = 0;
      const mouseThrottle = 100; // Throttle mouse move events
  
      // Track mouse movements (throttled)
      document.addEventListener("mousemove", function (e) {
        const now = Date.now();
        if (now - lastMouseMove > mouseThrottle) {
          const evt = {
            t: "mouseMove",
            x: e.clientX,
            y: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            ts: now(),
          };
          queue(evt);
          rec(evt);
          lastMouseMove = now;
        }
      });
  
      // Track mouse clicks with context
      document.addEventListener("mousedown", function (e) {
        const evt = {
          t: "mouseDown",
          x: e.clientX,
          y: e.clientY,
          button: e.button, // 0=left, 1=middle, 2=right
          target: e.target.tagName.toLowerCase(),
          targetId: e.target.id || "",
          targetClass: e.target.className || "",
          ts: now(),
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
            const evt = {
              t: "doubleClick",
              x: e.clientX,
              y: e.clientY,
              target: e.target.tagName.toLowerCase(),
              targetId: e.target.id || "",
              ts: now(),
            };
            queue(evt);
            rec(evt);
          }
          clickCount = 0;
        }, 300);
      });
  
      // Track right clicks
      document.addEventListener("contextmenu", function (e) {
        const evt = {
          t: "rightClick",
          x: e.clientX,
          y: e.clientY,
          target: e.target.tagName.toLowerCase(),
          targetId: e.target.id || "",
          ts: now(),
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
        const key = e.key.toLowerCase();
        const evt = {
          t: "keyDown",
          key: key,
          code: e.code,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          target: e.target.tagName.toLowerCase(),
          targetId: e.target.id || "",
          ts: now(),
        };
        queue(evt);
        rec(evt);
  
        // Track key sequences for shortcuts
        keySequence.push(key);
        if (keySequence.length > maxSequenceLength) {
          keySequence.shift();
        }
  
        // Track common shortcuts
        if (e.ctrlKey || e.metaKey) {
          const shortcutEvt = {
            t: "keyboardShortcut",
            shortcut: `${e.ctrlKey ? "ctrl" : "cmd"}+${key}`,
            target: e.target.tagName.toLowerCase(),
            ts: now(),
          };
          queue(shortcutEvt);
          rec(shortcutEvt);
        }
      });
  
      // Track copy/paste events
      document.addEventListener("copy", function (e) {
        const evt = {
          t: "copy",
          target: e.target.tagName.toLowerCase(),
          targetId: e.target.id || "",
          ts: now(),
        };
        queue(evt);
        rec(evt);
      });
  
      document.addEventListener("paste", function (e) {
        const evt = {
          t: "paste",
          target: e.target.tagName.toLowerCase(),
          targetId: e.target.id || "",
          ts: now(),
        };
        queue(evt);
        rec(evt);
      });
    }
  
    /* ---------- Enhanced Resize Tracking ---------- */
    // Track window and viewport changes
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
            const evt = {
              t: "windowResize",
              oldWidth: lastWidth,
              oldHeight: lastHeight,
              newWidth: newWidth,
              newHeight: newHeight,
              widthChange: newWidth - lastWidth,
              heightChange: newHeight - lastHeight,
              orientation: newWidth > newHeight ? "landscape" : "portrait",
              ts: now(),
            };
            queue(evt);
            rec(evt);
  
            lastWidth = newWidth;
            lastHeight = newHeight;
          }
        }, 250); // Debounce resize events
      });
  
      // Track orientation changes
      window.addEventListener("orientationchange", function () {
        setTimeout(() => {
          const evt = {
            t: "orientationChange",
            orientation: window.orientation,
            width: window.innerWidth,
            height: window.innerHeight,
            ts: now(),
          };
          queue(evt);
          rec(evt);
        }, 100);
      });
    }
  
    /* ---------- Enhanced Error Tracking ---------- */
    // Track JavaScript errors and console events
    function initErrorTracking() {
      // Track JavaScript errors
      window.addEventListener("error", function (e) {
        const evt = {
          t: "jsError",
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          error: e.error ? e.error.stack : "",
          url: location.href,
          ts: now(),
        };
        queue(evt);
        rec(evt);
      });
  
      // Track unhandled promise rejections
      window.addEventListener("unhandledrejection", function (e) {
        const evt = {
          t: "promiseRejection",
          reason: e.reason ? e.reason.toString() : "Unknown",
          url: location.href,
          ts: now(),
        };
        queue(evt);
        rec(evt);
      });
  
      // Track console errors (optional)
      const originalConsoleError = console.error;
      console.error = function (...args) {
        const evt = {
          t: "consoleError",
          message: args.join(" "),
          url: location.href,
          ts: now(),
        };
        queue(evt);
        rec(evt);
        originalConsoleError.apply(console, args);
      };
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
      let pageStartTime = Date.now();
      let lastActivityTime = Date.now();
      let totalActiveTime = 0;
      let isPageVisible = true;
  
      // Track page visibility changes
      document.addEventListener("visibilitychange", function () {
        const wasVisible = isPageVisible;
        isPageVisible = document.visibilityState === "visible";
  
        if (wasVisible && !isPageVisible) {
          // Page became hidden
          totalActiveTime += Date.now() - lastActivityTime;
          const evt = {
            t: "pageHidden",
            activeTime: totalActiveTime,
            totalTime: Date.now() - pageStartTime,
            ts: now(),
          };
          queue(evt);
          rec(evt);
        } else if (!wasVisible && isPageVisible) {
          // Page became visible
          lastActivityTime = Date.now();
          const evt = {
            t: "pageVisible",
            activeTime: totalActiveTime,
            totalTime: Date.now() - pageStartTime,
            ts: now(),
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
              lastActivityTime = Date.now();
            }
          },
          true
        );
      });
  
      // Track time-based engagement
      setInterval(() => {
        if (isPageVisible) {
          const currentTime = Date.now();
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
  
      console.log("[oonly] Configuration updated:", {
        baseUrl: CFG.baseUrl,
        wsBaseUrl: CFG.wsBaseUrl,
        apiVersion: CFG.apiVersion,
      });
    };
  
    // Update segment cache (called by server)
    window.oonly.updateSegmentCache = function (segments) {
      segmentCache = segments;
      saveSegmentCache();
      checkForSegmentMatches();
    };
  
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
  
    /* ---------- Buffers ---------- */
    const buf = [],
      now = () => Date.now();
    let lastFlush = now();
    /* ✨ NEW ✨ separate replay buffer streamed over WS */
    let recBuf = [];
    let lastSnap = now();
  
    /* ---------- Streaming websocket for session replay ---------- */
    let ws,
      wsOpen = false,
      wsQueue = [];
    function openWS() {
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
        setTimeout(openWS, 5000);
      }; // auto-reconnect
    }
    openWS();
  
    /* ---------- HTTP Event Ingestion ---------- */
    const flush = () => {
      if (!buf.length) return;
      const payload = {
        projectKey: pid,
        sessionId: sid,
        anonId: uid,
        userId: uid,
        events: buf.splice(0),
        ingestVersion: 2,
        context: {
          url: location.href,
          referrer: document.referrer,
          scrW: screen.width,
          scrH: screen.height,
        },
      };
  
      const p = JSON.stringify(payload);
      if (
        navigator.sendBeacon &&
        navigator.sendBeacon(`${CFG.baseUrl}/${CFG.apiVersion}/event/ingest`, p)
      ) {
        lastFlush = now();
        return;
      }
  
      fetch(`${CFG.baseUrl}/${CFG.apiVersion}/event/ingest`, {
        method: "POST",
        body: p,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch((err) => console.warn("[oonly] HTTP flush failed:", err));
  
      lastFlush = now();
    };
  
    const queue = (e) => {
      buf.push(e);
      if (now() - lastFlush > CFG.flushMs || buf.length > CFG.bufMax) flush();
    };
  
    /* ✨ NEW ✨ replay batching & flush over WS (falls back to HTTP if WS not ready) */
    function rec(event) {
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
  
    /* ---------- First-visit & session start ---------- */
    if (!localStorage.getItem("_oo_firstVisit")) {
      const evt = { t: "firstVisit", ts: now(), url: location.href };
      queue(evt);
      rec(evt);
      localStorage.setItem("_oo_firstVisit", "1");
    }
    const sessionEvt = { t: "sessionStart", ts: now(), url: location.href };
    queue(sessionEvt);
    rec(sessionEvt);
  
    /* ---------- Env + campaign once ---------- */
    const qp = new URLSearchParams(location.search);
    const envEvt = {
      t: "env",
      lang: navigator.language,
      scrW: screen.width,
      scrH: screen.height,
      ua: navigator.userAgent,
      ts: now(),
    };
    queue(envEvt);
    rec(envEvt);
    if (qp.get("utm_source") || qp.get("utm_medium") || qp.get("utm_campaign")) {
      const campaignEvt = {
        t: "campaign",
        src: qp.get("utm_source") || "",
        med: qp.get("utm_medium") || "",
        cmp: qp.get("utm_campaign") || "",
        ts: now(),
      };
      queue(campaignEvt);
      rec(campaignEvt);
    }
  
    /* ---------- Idle → new session ---------- */
    let lastAct = now();
    ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach((e) =>
      addEventListener(e, () => (lastAct = now()), true)
    );
    const idleChk = setInterval(() => {
      if (now() - lastAct > CFG.idleMs) newSession("idle");
    }, CFG.idleMs / 2);
    function newSession(reason) {
      flushSections();
      flush();
      flushRec();
      sid = genId();
      touchSid();
      const evt = { t: "sessionStart", reason, ts: now(), url: location.href };
      queue(evt);
      rec(evt);
      lastAct = now();
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
  
    // Detect page-based funnel steps
  
    ["pushState", "replaceState"].forEach((fn) => {
      const o = history[fn];
      history[fn] = function () {
        o.apply(this, arguments);
        emitRoute();
      };
    });
    addEventListener("popstate", emitRoute);
    addEventListener("hashchange", emitRoute);
    function emitRoute() {
      const evt = {
        t: "route",
        url: location.pathname + location.search + location.hash,
        ts: now(),
      };
      queue(evt);
      rec(evt);
  
      // Track funnel steps on route changes
    }
  
    /* ---------- Clicks, rage clicks, outbound, downloads ---------- */
    let clickBuf = [];
    addEventListener(
      "click",
      (e) => {
        const evt = {
          t: "click",
          x: e.clientX,
          y: e.clientY,
          sel: cssPath(e.target),
          ts: now(),
        };
        queue(evt);
        rec(evt);
  
        // outbound / download / external redirect handling
        if (e.target.closest) {
          const a = e.target.closest("a[href]");
          if (a) {
            const href = a.href;
            const ext =
              /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|mp[34]|mov|avi)$/i;
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
            } else if (ext.test(href)) {
              queue({ t: "fileDl", href, ts: now() });
            }
          }
        }
        // rage click detection (≥3 within 600 ms, ≤20 px)
        clickBuf.push({ x: e.clientX, y: e.clientY, ts: now() });
        clickBuf = clickBuf.filter((c) => now() - c.ts < 600);
        if (clickBuf.length >= 3) {
          const dx =
            Math.max(...clickBuf.map((c) => c.x)) -
            Math.min(...clickBuf.map((c) => c.x));
          const dy =
            Math.max(...clickBuf.map((c) => c.y)) -
            Math.min(...clickBuf.map((c) => c.y));
          if (dx < 20 && dy < 20) {
            queue({ t: "rageClick", x: e.clientX, y: e.clientY, ts: now() });
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
  
      // Social login
      if (
        host.includes("facebook.com") ||
        host.includes("google.com") ||
        host.includes("github.com") ||
        host.includes("twitter.com")
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
  
    /* ---------- Scroll depth & section time ---------- */
    let maxScroll = 0;
    addEventListener(
      "scroll",
      () => {
        const pct = Math.round(
          ((scrollY + innerHeight) / document.documentElement.scrollHeight) * 100
        );
        if (pct > maxScroll) {
          maxScroll = pct;
          const evt = { t: "scrollDepth", pct, ts: now() };
          queue(evt);
          rec(evt);
          if (pct >= 90) {
            const evt90 = { t: "scroll90", ts: now() };
            queue(evt90);
            rec(evt90);
          }
        }
      },
      { passive: true }
    );
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
  
    /* ✨ NEW ✨ periodic full snapshot for loss-less replay */
    function snapFull() {
      const html = document.documentElement.outerHTML.slice(0, 2_000_000); // cap 2 MB
      const sanitizedHtml = sanitizeHTML(html);
      rec({
        t: "domFull",
        html: sanitizedHtml,
        scrollX: scrollX,
        scrollY: scrollY,
        ts: now(),
      });
      lastSnap = now();
    }
    setInterval(() => {
      if (now() - lastSnap > CFG.snapFullMs) snapFull();
    }, CFG.snapFullMs);
  
    /* ---------- Forms: submit, error, focus/blur, change ---------- */
    addEventListener(
      "submit",
      (e) => {
        const f = e.target;
        const evt = { t: "formSubmit", sel: cssPath(f), ts: now() };
        queue(evt);
        rec(evt);
  
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
      } else {
        const evt = {
          t: "jsErr",
          msg: e.message,
          src: e.filename,
          ln: e.lineno,
          col: e.colno,
          ts: now(),
        };
        queue(evt);
        rec(evt);
      }
    });
    addEventListener("unhandledrejection", (e) => {
      const evt = {
        t: "promiseRej",
        msg: (e.reason && e.reason.message) || "unhandled",
        ts: now(),
      };
      queue(evt);
      rec(evt);
    });
  
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
        flush();
        flushRec();
        touchSid();
      }
    });
    addEventListener("pagehide", () => {
      snapFull();
      flushSections();
      const evt = { t: "sessionEnd", ts: now() };
      queue(evt);
      rec(evt);
      flush();
      flushRec();
      clearInterval(idleChk);
    });
  
    /* ---------- Public API ---------- */
    window.oonly =
      window.oonly ||
      function (cmd, a, b) {
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
    function isSensitiveInput(el) {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
  
      // Check custom selectors first
      if (CFG.sensitiveSelectors.length > 0) {
        for (let selector of CFG.sensitiveSelectors) {
          try {
            if (el.matches(selector)) return true;
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
  
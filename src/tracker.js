(function() {
    'use strict';
    
    // TESTING: Remove this console log when ready for production
    console.log('🚀 Oonly Tracker loaded successfully! Version:', '1.0.0');
    
    // Configuration
    const CONFIG = {
        apiUrl: 'https://api.oonly.com', // Replace with your actual API endpoint
        version: '1.0.0',
        debug: false
    };
    
    // Utility functions
    function log(message, data) {
        if (CONFIG.debug) {
            console.log('[Oonly]', message, data);
        }
    }
    
    function generateId() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    }
    
    function getProjectId() {
        const script = document.currentScript || document.querySelector('script[src*="oonly.min.js"]');
        return script ? script.getAttribute('data-project-id') : null;
    }
    
    function getSessionId() {
        let sessionId = sessionStorage.getItem('oonly_session_id');
        if (!sessionId) {
            sessionId = generateId();
            sessionStorage.setItem('oonly_session_id', sessionId);
        }
        return sessionId;
    }
    
    function getUserId() {
        return localStorage.getItem('oonly_user_id') || generateId();
    }
    
    function setUserId(id) {
        localStorage.setItem('oonly_user_id', id);
    }
    
    // Event tracking
    function trackEvent(eventName, properties = {}) {
        const projectId = getProjectId();
        if (!projectId) {
            log('No project ID found');
            return;
        }
        
        const eventData = {
            event: eventName,
            properties: properties,
            timestamp: Date.now(),
            sessionId: getSessionId(),
            userId: getUserId(),
            projectId: projectId,
            url: window.location.href,
            userAgent: navigator.userAgent,
            referrer: document.referrer
        };
        
        log('Tracking event:', eventData);
        
        // Send to your API
        sendToAPI('/track', eventData);
    }
    
    // User identification
    function identifyUser(userId, traits = {}) {
        if (userId) {
            setUserId(userId);
        }
        
        const projectId = getProjectId();
        if (!projectId) {
            log('No project ID found');
            return;
        }
        
        const userData = {
            userId: getUserId(),
            traits: traits,
            timestamp: Date.now(),
            sessionId: getSessionId(),
            projectId: projectId,
            url: window.location.href
        };
        
        log('Identifying user:', userData);
        
        // Send to your API
        sendToAPI('/identify', userData);
    }
    
    // Page view tracking
    function trackPageView() {
        trackEvent('page_view', {
            title: document.title,
            path: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash
        });
    }
    
    // API communication
    function sendToAPI(endpoint, data) {
        // Use fetch with fallback to XMLHttpRequest
        if (window.fetch) {
            fetch(CONFIG.apiUrl + endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            }).catch(error => {
                log('API request failed:', error);
            });
        } else {
            // Fallback for older browsers
            const xhr = new XMLHttpRequest();
            xhr.open('POST', CONFIG.apiUrl + endpoint, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(data));
        }
    }
    
    // Auto-initialization
    function init() {
        const projectId = getProjectId();
        if (!projectId) {
            log('No project ID found in script tag');
            return;
        }
        
        log('Initializing Oonly Tracker for project:', projectId);
        
        // Track initial page view
        trackPageView();
        
        // Track page visibility changes
        if (document.hidden !== undefined) {
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) {
                    trackEvent('page_visible');
                } else {
                    trackEvent('page_hidden');
                }
            });
        }
        
        // Track beforeunload
        window.addEventListener('beforeunload', function() {
            trackEvent('page_unload');
        });
        
        // Auto-track clicks on buttons and links
        document.addEventListener('click', function(e) {
            const target = e.target;
            if (target.tagName === 'BUTTON' || target.tagName === 'A') {
                const properties = {
                    element: target.tagName.toLowerCase(),
                    text: target.textContent?.trim().substring(0, 50),
                    href: target.href || null,
                    className: target.className || null
                };
                trackEvent('element_click', properties);
            }
        });
        
        // Auto-track form submissions
        document.addEventListener('submit', function(e) {
            trackEvent('form_submit', {
                form: e.target.action || 'unknown',
                method: e.target.method || 'unknown'
            });
        });
        
        log('Oonly Tracker initialized successfully');
    }
    
    // Public API
    window.oonly = {
        // Core methods
        track: trackEvent,
        identify: identifyUser,
        
        // Utility methods
        getProjectId: getProjectId,
        getSessionId: getSessionId,
        getUserId: getUserId,
        
        // Configuration
        config: CONFIG,
        
        // Version
        version: CONFIG.version
    };
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();

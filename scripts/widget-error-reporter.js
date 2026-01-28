/**
 * Widget Error Reporter v1.0
 * Include this script in any widget to automatically report errors to the parent portal.
 * 
 * Usage: Add <script src="../scripts/widget-error-reporter.js"></script> to your widget HTML
 * 
 * The widget name is auto-detected from the URL, or you can set it manually:
 * window.WIDGET_NAME = 'my-widget-name';
 */

(function() {
    'use strict';
    
    // Auto-detect widget name from URL
    function getWidgetName() {
        if (window.WIDGET_NAME) return window.WIDGET_NAME;
        
        const path = window.location.pathname;
        if (path.includes('lmp-comparison')) return 'lmp-comparison';
        if (path.includes('lmp-analytics')) return 'lmp-analytics';
        if (path.includes('data-manager')) return 'data-manager';
        if (path.includes('arcadia')) return 'arcadia-fetcher';
        
        // Extract from filename
        const match = path.match(/([^\/]+)\.html$/);
        return match ? match[1] : 'unknown-widget';
    }
    
    const WIDGET_NAME = getWidgetName();
    
    /**
     * Report an error to the parent portal
     */
    function reportError(error) {
        const errorData = {
            type: 'WIDGET_ERROR',
            widget: WIDGET_NAME,
            errorType: error.type || 'error',
            message: error.message || String(error),
            source: error.source || error.filename || null,
            line: error.line || error.lineno || null,
            column: error.column || error.colno || null,
            stack: error.stack || null,
            context: error.context || null,
            timestamp: new Date().toISOString()
        };
        
        // Send to parent window (the portal)
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage(errorData, '*');
                console.log('[WidgetErrorReporter] Reported to portal:', errorData.message);
            } catch (e) {
                console.error('[WidgetErrorReporter] Failed to report:', e);
            }
        }
        
        // Also log locally
        console.error(`[${WIDGET_NAME}] Error:`, error.message || error);
    }
    
    /**
     * Set up global error handlers
     */
    function setupHandlers() {
        // Catch unhandled errors
        window.onerror = function(message, source, lineno, colno, error) {
            reportError({
                type: 'javascript',
                message: message,
                source: source,
                line: lineno,
                column: colno,
                stack: error?.stack
            });
            return false; // Don't suppress the error
        };
        
        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', function(event) {
            reportError({
                type: 'promise',
                message: event.reason?.message || String(event.reason),
                stack: event.reason?.stack
            });
        });
        
        console.log(`[WidgetErrorReporter] Initialized for: ${WIDGET_NAME}`);
    }
    
    /**
     * Manual error reporting function for widgets to use
     * Usage: window.reportWidgetError({ message: 'Something went wrong', context: { action: 'save' } });
     */
    window.reportWidgetError = function(error) {
        reportError({
            type: error.type || 'manual',
            message: error.message || String(error),
            source: error.source,
            line: error.line,
            stack: error.stack,
            context: error.context
        });
    };
    
    /**
     * Wrap a function to automatically catch and report errors
     * Usage: const safeFunction = window.wrapWithErrorReporting(myFunction, 'myFunction');
     */
    window.wrapWithErrorReporting = function(fn, name) {
        return function(...args) {
            try {
                const result = fn.apply(this, args);
                // Handle promises
                if (result && typeof result.catch === 'function') {
                    return result.catch(error => {
                        reportError({
                            type: 'async',
                            message: error.message || String(error),
                            stack: error.stack,
                            context: { function: name }
                        });
                        throw error; // Re-throw so the caller knows it failed
                    });
                }
                return result;
            } catch (error) {
                reportError({
                    type: 'sync',
                    message: error.message || String(error),
                    stack: error.stack,
                    context: { function: name }
                });
                throw error; // Re-throw so the caller knows it failed
            }
        };
    };
    
    /**
     * Log an info/warning message (not an error, but useful for debugging)
     */
    window.reportWidgetWarning = function(message, context) {
        reportError({
            type: 'warning',
            message: message,
            context: context
        });
    };
    
    /**
     * Report a network/API error
     */
    window.reportNetworkError = function(url, status, message) {
        reportError({
            type: 'network',
            message: message || `HTTP ${status} for ${url}`,
            context: { url: url, status: status }
        });
    };
    
    // Initialize
    setupHandlers();
    
})();

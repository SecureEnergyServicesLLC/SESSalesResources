/**
 * Widget Communication System
 * Handles cross-iframe messaging between portal and widgets
 */

class WidgetManager {
    constructor() {
        this.widgets = new Map();
        this.messageHandlers = new Map();
        this.init();
    }

    init() {
        this.setupMessageListener();
        console.log('[WidgetManager] Initialized');
    }

    /**
     * Setup cross-origin message listener
     */
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            this.handleMessage(event.data, event.source);
        });
    }

    /**
     * Handle incoming messages from widgets
     */
    handleMessage(data, source) {
        if (!data || !data.type) return;

        console.log('[WidgetManager] Received:', data.type);

        switch (data.type) {
            case 'WIDGET_READY':
                this.registerWidget(data.widgetId, source);
                break;
            case 'LMP_DATA_REQUEST':
                this.sendLMPData(source);
                break;
            case 'LMP_DATA_UPDATE':
            case 'LMP_BULK_UPDATE':
                this.broadcastToWidgets(data);
                break;
            case 'LMP_ANALYSIS_COMPLETE':
                // Forward to main portal for logging
                window.postMessage(data, '*');
                break;
            default:
                // Forward to custom handlers
                const handler = this.messageHandlers.get(data.type);
                if (handler) handler(data, source);
        }
    }

    /**
     * Register a widget
     */
    registerWidget(widgetId, source) {
        this.widgets.set(widgetId, source);
        console.log('[WidgetManager] Registered widget:', widgetId);
        
        // Send initial data
        this.sendLMPData(source);
    }

    /**
     * Send LMP data to a widget
     */
    sendLMPData(target) {
        if (typeof SecureEnergyData !== 'undefined') {
            target.postMessage({
                type: 'LMP_DATA_RESPONSE',
                data: SecureEnergyData.data,
                stats: SecureEnergyData.getStats()
            }, '*');
        }
    }

    /**
     * Broadcast message to all registered widgets
     */
    broadcastToWidgets(data) {
        this.widgets.forEach((source, widgetId) => {
            try {
                source.postMessage(data, '*');
            } catch (e) {
                console.warn('[WidgetManager] Failed to send to widget:', widgetId);
            }
        });
    }

    /**
     * Register a custom message handler
     */
    onMessage(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    /**
     * Send message to specific widget
     */
    sendToWidget(widgetId, data) {
        const source = this.widgets.get(widgetId);
        if (source) {
            source.postMessage(data, '*');
        }
    }
}

// Initialize widget manager
window.widgetManager = new WidgetManager();

/**
 * Widget Helper (for use inside widgets)
 * Include this in widget HTML files
 */
const WidgetHelper = {
    widgetId: null,
    dataCallback: null,

    /**
     * Initialize widget communication
     */
    init(widgetId) {
        this.widgetId = widgetId;
        
        window.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });

        // Notify parent that widget is ready
        this.notifyReady();
    },

    /**
     * Notify parent that widget is ready
     */
    notifyReady() {
        window.parent.postMessage({
            type: 'WIDGET_READY',
            widgetId: this.widgetId
        }, '*');
    },

    /**
     * Request LMP data from parent
     */
    requestData() {
        window.parent.postMessage({
            type: 'LMP_DATA_REQUEST',
            widgetId: this.widgetId
        }, '*');
    },

    /**
     * Handle incoming messages
     */
    handleMessage(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'LMP_DATA_RESPONSE':
                if (this.dataCallback) {
                    this.dataCallback(data.data, data.stats);
                }
                break;
            case 'LMP_DATA_UPDATE':
            case 'LMP_BULK_UPDATE':
                // Re-request data when updates occur
                this.requestData();
                break;
        }
    },

    /**
     * Set callback for when data is received
     */
    onData(callback) {
        this.dataCallback = callback;
    },

    /**
     * Send analysis complete notification
     */
    notifyAnalysisComplete(analysisData) {
        window.parent.postMessage({
            type: 'LMP_ANALYSIS_COMPLETE',
            widgetId: this.widgetId,
            data: analysisData
        }, '*');
    },

    /**
     * Send data update notification
     */
    notifyDataUpdate(data) {
        window.parent.postMessage({
            type: 'LMP_DATA_UPDATE',
            widgetId: this.widgetId,
            data: data
        }, '*');
    }
};

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WidgetManager, WidgetHelper };
}

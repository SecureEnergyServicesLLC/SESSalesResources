/**
 * Secure Energy Analytics Portal - Help System
 * Provides hover tooltips, contextual help, and enhanced AI assistant
 */

// =====================================================
// HELP CONTENT DATABASE
// =====================================================
const HELP_CONTENT = {
    // Widget help
    widgets: {
        'user-admin': {
            title: 'User Administration',
            desc: 'Create and manage user accounts, set permissions, and view activity logs.',
            tips: ['Only administrators can access this widget', 'Use Activity tab to audit user actions']
        },
        'ai-assistant': {
            title: 'AI Assistant',
            desc: 'Ask questions about the portal, your data, or get help navigating features.',
            tips: ['Try "help" for command list', 'Ask "what is LMP?" for explanations']
        },
        'lmp-analytics': {
            title: 'LMP Analytics Dashboard',
            desc: 'Visualize historical LMP trends, compare zones, and identify pricing patterns.',
            tips: ['Load data in Data Manager first', 'Use date filters to focus on specific periods']
        },
        'lmp-comparison': {
            title: 'LMP Comparison Portal',
            desc: 'Compare index vs fixed pricing to calculate potential savings for clients.',
            tips: ['Enter client usage in MWh', 'Results save to Analysis History automatically']
        },
        'data-manager': {
            title: 'LMP Data Manager',
            desc: 'Import, export, and manage LMP pricing data from CSV or JSON files.',
            tips: ['CSV needs: ISO, Zone, Date, LMP columns', 'Data is shared across all widgets']
        },
        'arcadia-fetcher': {
            title: 'Arcadia LMP Fetcher',
            desc: 'Fetch current LMP data from Arcadia API.',
            tips: ['Requires API credentials', 'Schedule regular fetches for current data']
        },
        'analysis-history': {
            title: 'My Analysis History',
            desc: 'View and reload past LMP analyses. Admins see all user analyses.',
            tips: ['Click Reload to restore an analysis', 'Filter by client, ISO, or user']
        }
    },
    
    // Glossary / Concepts
    glossary: {
        'lmp': {
            term: 'Locational Marginal Pricing (LMP)',
            definition: 'The cost of supplying the next MW of electricity at a specific location, including energy, congestion, and loss components.'
        },
        'iso': {
            term: 'Independent System Operator',
            definition: 'Regional organizations (PJM, ISONE, NYISO, CAISO, ERCOT, MISO) that manage electricity grid operations and wholesale markets.'
        },
        'zone': {
            term: 'Pricing Zone',
            definition: 'Geographic area within an ISO with distinct LMP values based on local generation, demand, and transmission.'
        },
        'index': {
            term: 'Index Pricing',
            definition: 'Paying real-time or day-ahead market prices that fluctuate with supply and demand.'
        },
        'fixed': {
            term: 'Fixed Pricing',
            definition: 'Locked-in rate that doesn\'t change regardless of market conditions.'
        },
        'congestion': {
            term: 'Congestion Cost',
            definition: 'Price component reflecting transmission constraints when power can\'t flow freely.'
        }
    }
};

// =====================================================
// TOOLTIP SYSTEM
// =====================================================
const HelpTooltip = {
    tooltip: null,
    activeTarget: null,
    hideTimeout: null,
    
    init() {
        this.createTooltip();
        this.attachTriggers();
        this.addGlobalListeners();
    },
    
    createTooltip() {
        const el = document.createElement('div');
        el.id = 'helpTooltip';
        el.className = 'help-tooltip';
        el.innerHTML = `
            <div class="help-tooltip-arrow"></div>
            <div class="help-tooltip-title"></div>
            <div class="help-tooltip-desc"></div>
            <div class="help-tooltip-tips"></div>
        `;
        document.body.appendChild(el);
        this.tooltip = el;
        
        // Keep tooltip open when hovering over it
        el.addEventListener('mouseenter', () => this.cancelHide());
        el.addEventListener('mouseleave', () => this.scheduleHide());
    },
    
    attachTriggers() {
        // Wait for widgets to render, then attach
        setTimeout(() => {
            document.querySelectorAll('[data-widget-id]').forEach(widget => {
                const id = widget.dataset.widgetId;
                const help = HELP_CONTENT.widgets[id];
                if (!help) return;
                
                const header = widget.querySelector('.widget-header');
                if (!header || header.querySelector('.help-icon')) return;
                
                // Add help icon
                const icon = document.createElement('button');
                icon.className = 'help-icon';
                icon.setAttribute('aria-label', 'Help');
                icon.dataset.helpFor = id;
                icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>`;
                
                icon.addEventListener('mouseenter', (e) => this.show(id, e.target));
                icon.addEventListener('mouseleave', () => this.scheduleHide());
                icon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggle(id, e.target);
                });
                
                // Insert before widget actions or at end of header
                const actions = header.querySelector('.widget-actions');
                if (actions) {
                    header.insertBefore(icon, actions);
                } else {
                    header.appendChild(icon);
                }
            });
        }, 500);
    },
    
    addGlobalListeners() {
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.help-tooltip') && !e.target.closest('.help-icon')) {
                this.hide();
            }
        });
        
        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });
    },
    
    show(helpId, anchor) {
        this.cancelHide();
        const help = HELP_CONTENT.widgets[helpId];
        if (!help) return;
        
        this.activeTarget = anchor;
        
        // Populate content
        this.tooltip.querySelector('.help-tooltip-title').textContent = help.title;
        this.tooltip.querySelector('.help-tooltip-desc').textContent = help.desc;
        
        const tipsEl = this.tooltip.querySelector('.help-tooltip-tips');
        if (help.tips?.length) {
            tipsEl.innerHTML = help.tips.map(t => `<span class="tip-item">💡 ${t}</span>`).join('');
            tipsEl.style.display = 'flex';
        } else {
            tipsEl.style.display = 'none';
        }
        
        // Position
        this.position(anchor);
        this.tooltip.classList.add('visible');
    },
    
    position(anchor) {
        const rect = anchor.getBoundingClientRect();
        const tt = this.tooltip;
        const ttRect = tt.getBoundingClientRect();
        
        let top = rect.bottom + 8;
        let left = rect.left + (rect.width / 2) - 140;
        
        // Keep on screen
        left = Math.max(10, Math.min(left, window.innerWidth - 300));
        if (top + 200 > window.innerHeight) {
            top = rect.top - ttRect.height - 8;
            tt.classList.add('above');
        } else {
            tt.classList.remove('above');
        }
        
        tt.style.top = `${top}px`;
        tt.style.left = `${left}px`;
    },
    
    hide() {
        this.tooltip.classList.remove('visible');
        this.activeTarget = null;
    },
    
    scheduleHide() {
        this.hideTimeout = setTimeout(() => this.hide(), 200);
    },
    
    cancelHide() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    },
    
    toggle(helpId, anchor) {
        if (this.tooltip.classList.contains('visible') && this.activeTarget === anchor) {
            this.hide();
        } else {
            this.show(helpId, anchor);
        }
    }
};

// =====================================================
// ENHANCED AI ASSISTANT
// =====================================================
const EnhancedAI = {
    // Override the default processAIQuery
    process(query) {
        const q = query.toLowerCase().trim();
        
        // Greeting
        if (/^(hi|hello|hey|howdy)/.test(q)) {
            return this.greeting();
        }
        
        // Glossary / "What is" queries
        if (q.includes('what is') || q.includes('what\'s') || q.includes('explain') || q.includes('define')) {
            const glossaryMatch = this.matchGlossary(q);
            if (glossaryMatch) return glossaryMatch;
        }
        
        // How-to queries
        if (q.includes('how do i') || q.includes('how to') || q.includes('how can i')) {
            return this.howTo(q);
        }
        
        // Tour / Getting started
        if (q.includes('tour') || q.includes('walkthrough') || q.includes('getting started') || q.includes('new here')) {
            this.startTour();
            return `<strong>Starting guided tour!</strong> I'll walk you through each widget step by step.`;
        }
        
        // Quick actions
        if (q.includes('load') && q.includes('data')) {
            scrollToWidget('data-manager');
            return `Opening the <strong>Data Manager</strong> where you can import CSV or JSON files.`;
        }
        
        if (q.includes('run') && (q.includes('analysis') || q.includes('comparison'))) {
            scrollToWidget('lmp-comparison');
            return `Opening the <strong>LMP Comparison Portal</strong>. Enter client details and click Calculate!`;
        }
        
        // Help command
        if (q === 'help' || q === '?' || q.includes('what can you')) {
            return this.helpMenu();
        }
        
        // Fall back to original processor if it exists
        if (typeof window.originalProcessAIQuery === 'function') {
            return window.originalProcessAIQuery(query);
        }
        
        return this.fallback();
    },
    
    greeting() {
        const user = typeof currentUser !== 'undefined' ? currentUser : null;
        const name = user ? user.firstName : 'there';
        const stats = typeof SecureEnergyData !== 'undefined' ? SecureEnergyData.getStats() : { totalRecords: 0 };
        
        let msg = `<strong>Hi ${name}!</strong> I'm here to help you navigate the portal.`;
        
        if (stats.totalRecords > 0) {
            msg += ` You have <strong>${stats.totalRecords.toLocaleString()}</strong> LMP records loaded.`;
        } else {
            msg += ` <em>Tip: Start by loading data in the <a href="#" onclick="scrollToWidget('data-manager')">Data Manager</a>.</em>`;
        }
        
        return msg;
    },
    
    matchGlossary(q) {
        for (const [key, item] of Object.entries(HELP_CONTENT.glossary)) {
            if (q.includes(key)) {
                return `<strong>${item.term}</strong><p style="margin-top:8px">${item.definition}</p>`;
            }
        }
        return null;
    },
    
    howTo(q) {
        const guides = [
            { match: ['upload', 'import', 'load', 'csv', 'data'], widget: 'data-manager', 
              text: 'To load data, open the <strong>LMP Data Manager</strong>, click "Choose File" to select a CSV or JSON, then click Import.' },
            { match: ['compare', 'analysis', 'calculate', 'savings'], widget: 'lmp-comparison',
              text: 'To run a comparison: open <strong>LMP Comparison Portal</strong>, enter client name, select ISO/Zone, set term length, enter monthly usage (MWh), then click Calculate.' },
            { match: ['user', 'account', 'create user'], widget: 'user-admin',
              text: 'To create a user: open <strong>User Administration</strong> (admin only), fill in the Create User form, set permissions, and click Create.' },
            { match: ['export', 'download'], widget: 'data-manager',
              text: 'To export data: open <strong>LMP Data Manager</strong>, select your format (CSV/JSON), and click Export.' },
            { match: ['history', 'past', 'previous'], widget: 'analysis-history',
              text: 'To view past work: open <strong>Analysis History</strong>. Click "Reload" on any analysis to restore it to the Comparison Portal.' },
            { match: ['theme', 'dark', 'light', 'color'], widget: null,
              text: 'To change theme: click the colored dots in the top-right corner of the portal. Your choice is saved automatically.' }
        ];
        
        for (const guide of guides) {
            if (guide.match.some(m => q.includes(m))) {
                let response = guide.text;
                if (guide.widget) {
                    response += `<p style="margin-top:10px"><a href="#" onclick="scrollToWidget('${guide.widget}')">Go to ${guide.widget} →</a></p>`;
                }
                return response;
            }
        }
        
        return `I'm not sure about that specific task. Try asking about: loading data, running comparisons, creating users, or exporting data. Type <strong>help</strong> for full options.`;
    },
    
    helpMenu() {
        return `<strong>I can help with:</strong>
        <div class="ai-help-grid">
            <div class="ai-help-item" onclick="document.getElementById('aiAssistantInput').value='what is LMP?';sendAIQuery();">📖 "What is LMP?"</div>
            <div class="ai-help-item" onclick="document.getElementById('aiAssistantInput').value='how to load data';sendAIQuery();">📥 "How to load data"</div>
            <div class="ai-help-item" onclick="document.getElementById('aiAssistantInput').value='run analysis';sendAIQuery();">📊 "Run analysis"</div>
            <div class="ai-help-item" onclick="document.getElementById('aiAssistantInput').value='show users';sendAIQuery();">👥 "Show users"</div>
            <div class="ai-help-item" onclick="document.getElementById('aiAssistantInput').value='tour';sendAIQuery();">🚀 "Take a tour"</div>
            <div class="ai-help-item" onclick="document.getElementById('aiAssistantInput').value='data status';sendAIQuery();">📈 "Data status"</div>
        </div>
        <p style="margin-top:12px;font-size:12px;color:var(--text-tertiary)">Click any option above or type your own question!</p>`;
    },
    
    fallback() {
        return `I'm not sure about that. Try:
        <ul class="ai-result-list">
            <li><strong>Concepts:</strong> "What is LMP?", "Explain zones"</li>
            <li><strong>How-to:</strong> "How to load data", "How to export"</li>
            <li><strong>Navigate:</strong> "Open comparison", "Go to data manager"</li>
            <li><strong>Status:</strong> "Show users", "Data status"</li>
        </ul>
        Type <strong>help</strong> for clickable options.`;
    },
    
    // Guided tour
    startTour() {
        const steps = [
            { widget: 'data-manager', title: 'Step 1: Load Data', msg: 'Start here! Upload LMP data from CSV or JSON files. This data powers all other widgets.' },
            { widget: 'lmp-analytics', title: 'Step 2: Analyze Trends', msg: 'View LMP trends over time. Filter by ISO, zone, and date range.' },
            { widget: 'lmp-comparison', title: 'Step 3: Compare Pricing', msg: 'The main tool! Compare index vs fixed pricing to show client savings.' },
            { widget: 'analysis-history', title: 'Step 4: Track History', msg: 'All your analyses are saved here. Reload any past analysis instantly.' }
        ];
        
        let current = 0;
        
        const showStep = () => {
            // Clean up previous
            document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
            document.querySelectorAll('.tour-popup').forEach(el => el.remove());
            
            if (current >= steps.length) {
                if (typeof showNotification === 'function') {
                    showNotification('Tour complete! Ask me anytime for help.', 'success');
                }
                return;
            }
            
            const step = steps[current];
            const widget = document.querySelector(`[data-widget-id="${step.widget}"]`);
            
            if (widget) {
                widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                widget.classList.add('tour-highlight');
                
                // Add popup
                const popup = document.createElement('div');
                popup.className = 'tour-popup';
                popup.innerHTML = `
                    <div class="tour-popup-title">${step.title}</div>
                    <div class="tour-popup-msg">${step.msg}</div>
                    <div class="tour-popup-nav">
                        <span>${current + 1} / ${steps.length}</span>
                        <button class="tour-next-btn">${current < steps.length - 1 ? 'Next →' : 'Finish'}</button>
                    </div>
                `;
                widget.style.position = 'relative';
                widget.appendChild(popup);
                
                popup.querySelector('.tour-next-btn').addEventListener('click', () => {
                    current++;
                    showStep();
                });
            }
        };
        
        showStep();
    }
};

// =====================================================
// INITIALIZATION
// =====================================================
function initHelpSystem() {
    console.log('[HelpSystem] Initializing...');
    
    // Initialize tooltip system
    HelpTooltip.init();
    
    // Hook into AI query processing
    if (typeof window.processAIQuery === 'function') {
        window.originalProcessAIQuery = window.processAIQuery;
    }
    
    window.processAIQuery = function(query) {
        return EnhancedAI.process(query);
    };
    
    console.log('[HelpSystem] Ready');
}

// Auto-init when DOM ready, or if already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initHelpSystem, 100));
} else {
    setTimeout(initHelpSystem, 100);
}

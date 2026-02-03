/**
 * SES Portal - API Key Setup
 * 
 * Add this script after azure-data-service.js
 * Handles API key entry for portal access
 */

const APIKeySetup = (function() {
    'use strict';

    // Your valid API keys (role-based)
    // In production, you'd validate these server-side only
    const ROLE_NAMES = {
        'admin': 'Administrator',
        'ae': 'Account Executive',
        'widget': 'Widget Access',
        'readonly': 'Read Only'
    };

    function getRoleFromKey(apiKey) {
        if (!apiKey) return null;
        const parts = apiKey.split('-');
        if (parts.length >= 2 && parts[0] === 'ses') {
            return parts[1];
        }
        return null;
    }

    function showSetupModal() {
        // Check if already configured
        if (AzureDataService.isConfigured()) {
            return;
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'api-key-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        overlay.innerHTML = `
            <div style="
                background: #1a1a2e;
                border-radius: 12px;
                padding: 40px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                border: 1px solid #333;
            ">
                <h2 style="
                    color: #fff;
                    margin: 0 0 10px 0;
                    font-size: 24px;
                    font-weight: 600;
                ">🔐 Portal Access</h2>
                
                <p style="
                    color: #888;
                    margin: 0 0 25px 0;
                    font-size: 14px;
                    line-height: 1.5;
                ">Enter your API key to access the secure portal data.</p>
                
                <input 
                    type="password" 
                    id="api-key-input" 
                    placeholder="ses-admin-xxxxxxxxxxxxx"
                    style="
                        width: 100%;
                        padding: 14px 16px;
                        border: 1px solid #444;
                        border-radius: 8px;
                        background: #0d0d1a;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                        margin-bottom: 15px;
                        outline: none;
                        transition: border-color 0.2s;
                    "
                    onfocus="this.style.borderColor='#4a9eff'"
                    onblur="this.style.borderColor='#444'"
                />
                
                <div id="api-key-error" style="
                    color: #ff6b6b;
                    font-size: 13px;
                    margin-bottom: 15px;
                    display: none;
                "></div>
                
                <button 
                    id="api-key-submit"
                    style="
                        width: 100%;
                        padding: 14px;
                        background: linear-gradient(135deg, #4a9eff, #2d7dd2);
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        font-size: 15px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: transform 0.1s, box-shadow 0.2s;
                    "
                    onmouseover="this.style.boxShadow='0 4px 20px rgba(74, 158, 255, 0.4)'"
                    onmouseout="this.style.boxShadow='none'"
                >Connect to Portal</button>
                
                <label style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 15px;
                    color: #888;
                    font-size: 13px;
                    cursor: pointer;
                ">
                    <input type="checkbox" id="api-key-remember" checked style="
                        width: 16px;
                        height: 16px;
                        cursor: pointer;
                    "/>
                    Remember me on this device
                </label>
            </div>
        `;

        document.body.appendChild(overlay);

        // Handle submit
        const input = document.getElementById('api-key-input');
        const submit = document.getElementById('api-key-submit');
        const error = document.getElementById('api-key-error');
        const remember = document.getElementById('api-key-remember');

        async function handleSubmit() {
            const apiKey = input.value.trim();
            
            if (!apiKey) {
                error.textContent = 'Please enter an API key';
                error.style.display = 'block';
                return;
            }

            // Check format
            const role = getRoleFromKey(apiKey);
            if (!role) {
                error.textContent = 'Invalid API key format';
                error.style.display = 'block';
                return;
            }

            // Disable button
            submit.disabled = true;
            submit.textContent = 'Connecting...';

            // Try to use the key
            AzureDataService.setApiKey(apiKey, remember.checked);

            try {
                // Test the connection
                await AzureDataService.getClients({ bypassCache: true });
                
                // Success - remove modal
                overlay.remove();
                
                // Trigger event for the app to know we're ready
                window.dispatchEvent(new CustomEvent('azureDataReady', { 
                    detail: { role: role, roleName: ROLE_NAMES[role] || role }
                }));
                
                console.log(`[APIKeySetup] Connected as ${ROLE_NAMES[role] || role}`);
                
            } catch (err) {
                AzureDataService.clearApiKey();
                
                if (err.status === 401) {
                    error.textContent = 'Invalid API key. Please check and try again.';
                } else if (err.status === 403) {
                    error.textContent = 'This API key does not have access to client data.';
                } else {
                    error.textContent = 'Connection failed. Please try again.';
                }
                error.style.display = 'block';
                
                submit.disabled = false;
                submit.textContent = 'Connect to Portal';
            }
        }

        submit.addEventListener('click', handleSubmit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSubmit();
        });

        // Focus input
        setTimeout(() => input.focus(), 100);
    }

    function checkAndPrompt() {
        if (!AzureDataService.isConfigured()) {
            showSetupModal();
            return false;
        }
        return true;
    }

    function logout() {
        AzureDataService.clearApiKey();
        location.reload();
    }

    return {
        showSetupModal,
        checkAndPrompt,
        logout,
        getRoleFromKey
    };
})();

window.APIKeySetup = APIKeySetup;

// Auto-check on page load
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure AzureDataService is loaded
    setTimeout(() => {
        APIKeySetup.checkAndPrompt();
    }, 100);
});

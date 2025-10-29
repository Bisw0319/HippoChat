/**
 * SecureChat Application Entry Point
 * Initializes all modules and manages the application lifecycle
 */

class SecureChatApp {
    constructor() {
        this.initialized = false;
        this.crypto = null;
        this.storage = null;
        this.messaging = null;
        this.ui = null;
        
        // Auto-deletion management
        this.deletionTimers = new Map();
        this.cleanupInterval = null;
    }

    /**
     * Initialize the application - FIXED VERSION
     */
    async initialize() {
        // Check if terms have been accepted
        if (!window.termsManager || !window.termsManager.termsAccepted) {
            console.log('⏳ Terms not accepted yet, waiting...');
            
            // Set up a listener for when terms are accepted
            const checkTermsInterval = setInterval(() => {
                if (window.termsManager && window.termsManager.termsAccepted) {
                    clearInterval(checkTermsInterval);
                    console.log('✅ Terms accepted, initializing app...');
                    this.continueInitialization();
                }
            }, 500);
            
            return;
        }
        
        // If terms are already accepted, initialize directly
        await this.continueInitialization();
    }

    /**
     * Continue with app initialization after terms are accepted
     */
    async continueInitialization() {
        try {
            console.log('🚀 Initializing SecureChat...');

            // Check browser compatibility
            if (!this.checkBrowserSupport()) {
                throw new Error('Your browser does not support the required cryptographic features');
            }

            // Initialize modules
            this.initializeModules();
            
            // Set up auto-deletion system
            this.setupAutoDeletion();
            
            // Set up UI event handlers
            this.setupUIHandlers();
            
            // Set up application lifecycle handlers
            this.setupLifecycleHandlers();
            
            this.initialized = true;
            console.log('✅ SecureChat initialized successfully');
            
            // Show welcome message
            this.showWelcomeMessage();
            
        } catch (error) {
            console.error('❌ Failed to initialize SecureChat:', error);
            this.showFatalError(error.message);
        }
    }

    /**
     * Check if browser supports required features
     */
    checkBrowserSupport() {
        const requirements = [
            'crypto' in window,
            'subtle' in window.crypto,
            'localStorage' in window,
            'addEventListener' in window
        ];
        
        return requirements.every(req => req);
    }

    /**
     * Initialize all application modules
     */
    initializeModules() {
        // Initialize crypto module
        this.crypto = new SecureCrypto();
        window.secureCrypto = this.crypto; // Global access
        
        // Initialize storage module
        this.storage = new SecureStorage();
        window.secureStorage = this.storage; // Global access
        
        // Initialize messaging module
        this.messaging = new SecureMessaging(this.crypto, this.storage);
        window.secureMessaging = this.messaging; // Global access
        
        // Initialize UI module
        this.ui = new SecureUI();
        window.secureUI = this.ui; // Global access
        
        console.log('📦 All modules initialized');
    }

    /**
     * Setup auto-deletion system for ephemeral chats
     */
    setupAutoDeletion() {
        // Monitor room creation and setup deletion timers
        const originalCreateRoom = this.messaging.createRoom.bind(this.messaging);
        this.messaging.createRoom = async (...args) => {
            const result = await originalCreateRoom(...args);
            this.scheduleRoomDeletion(result.roomId, result.roomData.autoDeleteMinutes);
            return result;
        };

        // Start periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, 60000); // Check every minute

        console.log('🗑️ Auto-deletion system active');
    }

    /**
     * Schedule room deletion
     */
    scheduleRoomDeletion(roomId, minutes) {
        const deletionTime = Date.now() + (minutes * 60 * 1000);
        
        // Clear any existing timer
        if (this.deletionTimers.has(roomId)) {
            clearTimeout(this.deletionTimers.get(roomId));
        }
        
        // Set new timer
        const timer = setTimeout(() => {
            this.deleteRoom(roomId);
        }, minutes * 60 * 1000);
        
        this.deletionTimers.set(roomId, {
            timer,
            deletionTime,
            roomId
        });
        
        console.log(`⏰ Room ${roomId} scheduled for deletion in ${minutes} minutes`);
    }

    /**
     * Delete room and all its data
     */
    deleteRoom(roomId) {
        try {
            // Get room data for cleanup
            const roomData = this.storage.getRoomData(roomId);
            
            if (roomData) {
                // Clear all messages
                this.storage.clearMessages(roomId);
                
                // Remove all participants
                if (roomData.participants) {
                    roomData.participants.forEach(participant => {
                        this.storage.removeParticipant(roomId, participant.username);
                    });
                }
                
                // Delete room data
                this.storage.sessionData.delete(`room_${roomId}`);
                
                console.log(`🗑️ Room ${roomId} deleted (auto-deletion)`);
                
                // Notify if user is currently in this room
                if (this.messaging.currentRoom === roomId) {
                    this.ui.handleRoomExpired();
                }
            }
            
            // Clean up timer
            this.deletionTimers.delete(roomId);
            
        } catch (error) {
            console.error('❌ Error deleting room:', error);
        }
    }

    /**
     * Perform periodic cleanup
     */
    performCleanup() {
        const now = Date.now();
        
        // Check for expired rooms
        for (const [roomId, timerData] of this.deletionTimers.entries()) {
            if (now >= timerData.deletionTime) {
                this.deleteRoom(roomId);
            }
        }
        
        // Clean up expired session data
        this.storage.cleanupExpiredData();
    }

    /**
     * Setup UI event handlers
     */
    setupUIHandlers() {
        if (this.ui) {
            this.ui.setupMessageHandlers();
        }
    }

    /**
     * Setup application lifecycle handlers
     */
    setupLifecycleHandlers() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('📱 App went to background');
            } else {
                console.log('📱 App came to foreground');
                // Refresh UI state
                this.refreshUIState();
            }
        });

        // Handle beforeunload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Handle unload
        window.addEventListener('unload', () => {
            this.cleanup();
        });

        // Handle online/offline status
        window.addEventListener('online', () => {
            console.log('🌐 Connection restored');
            this.ui.showToast('Connection restored', 'success');
        });

        window.addEventListener('offline', () => {
            console.log('📵 Connection lost');
            this.ui.showToast('Connection lost - working offline', 'warning');
        });
    }

    /**
     * Refresh UI state (useful when app comes back to foreground)
     */
    refreshUIState() {
        if (this.messaging.currentRoom) {
            // Update participants
            this.ui.updateParticipants();
            
            // Reload messages
            this.ui.loadMessages();
        }
    }

    /**
     * Show welcome message with security info
     */
    showWelcomeMessage() {
        console.log(`
🔒 SecureChat Ready!
• End-to-end encryption using Web Crypto API
• Ephemeral messages (auto-delete)
• No server storage - everything is local
• Anonymous - no registration required
        `);
    }

    /**
     * Show fatal error message
     */
    showFatalError(message) {
        const errorHtml = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--bg-card);
                padding: 2rem;
                border-radius: 1rem;
                border: 1px solid var(--border-color);
                text-align: center;
                z-index: 9999;
                max-width: 500px;
                width: 90%;
            ">
                <h2 style="color: var(--danger-color); margin-bottom: 1rem;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Application Error
                </h2>
                <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">
                    ${message}
                </p>
                <p style="font-size: 0.875rem; color: var(--text-muted);">
                    Please try refreshing the page or use a modern browser.
                </p>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', errorHtml);
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            browserSupported: this.checkBrowserSupport(),
            crypto: this.crypto?.getStatus(),
            messaging: this.messaging?.getConnectionStatus(),
            storage: this.storage?.getStorageStats(),
            activeRooms: this.deletionTimers.size
        };
    }

    /**
     * Cleanup application resources
     */
    cleanup() {
        try {
            // Clear all deletion timers
            for (const [roomId, timerData] of this.deletionTimers.entries()) {
                clearTimeout(timerData.timer);
            }
            this.deletionTimers.clear();

            // Clear cleanup interval
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }

            // Leave current room if connected
            if (this.messaging?.currentRoom) {
                this.messaging.leaveRoom();
            }

            // Cleanup modules
            this.messaging?.destroy();
            this.crypto?.cleanup();
            this.storage?.destroy();

            console.log('🧹 Application cleanup completed');
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }

    /**
     * Force delete all rooms (for development/testing)
     */
    forceCleanupAllRooms() {
        console.log('🧹 Force cleaning up all rooms...');
        
        for (const roomId of this.deletionTimers.keys()) {
            this.deleteRoom(roomId);
        }
        
        this.storage.clearAllSessionData();
        this.ui.showToast('All rooms cleared', 'info');
    }
}

// Application instance
let app = null;

// Initialize application when DOM is ready - FIXED VERSION
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Terms Manager first
        const termsManager = new TermsManager();
        termsManager.init();
        window.termsManager = termsManager;
        
        // Then initialize the main app
        app = new SecureChatApp();
        await app.initialize();
        
        // Make app globally available for debugging
        window.app = app;
        
    } catch (error) {
        console.error('❌ Failed to start application:', error);
    }
});

// Development helper functions (available in console)
window.devHelpers = {
    getStatus: () => app?.getStatus(),
    clearAllRooms: () => app?.forceCleanupAllRooms(),
    simulateRoomExpiry: (roomId) => app?.deleteRoom(roomId),
    getStorageData: () => {
        const data = {};
        for (const [key, value] of app?.storage?.sessionData?.entries() || []) {
            data[key] = value;
        }
        return data;
    }
};

console.log('🛠️  Development helpers available: window.devHelpers');


// Discord Bug Report Magic - WITH BRAVE BROWSER DETECTION
document.addEventListener('DOMContentLoaded', function() {
    const floatingBug = document.getElementById('floating-bug');
    const bugModal = document.getElementById('bug-modal');
    const closeBugModal = document.getElementById('close-bug-modal');
    const cancelBugReport = document.getElementById('cancel-bug-report');
    const bugForm = document.getElementById('bug-form');
    
    // Open bug modal
    function openBugModal() {
        bugModal.classList.add('active');
        bugModal.setAttribute('aria-hidden', 'false');
        document.getElementById('bug-description').focus();
        document.body.style.overflow = 'hidden';
    }
    
    // Close bug modal
    function closeBugModalFunc() {
        bugModal.classList.remove('active');
        bugModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    
    // Event listeners
    floatingBug.addEventListener('click', openBugModal);
    floatingBug.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            openBugModal();
        }
    });
    
    closeBugModal.addEventListener('click', closeBugModalFunc);
    cancelBugReport.addEventListener('click', closeBugModalFunc);
    
    // Discord Magic Submit - WITH BRAVE DETECTION
    bugForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const description = document.getElementById('bug-description').value.trim();
        
        if (!description) {
            showToast('🔮 Write your magical message first!', 'warning');
            return;
        }
        
        // Show magical sending animation
        const submitBtn = bugForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-hat-wizard fa-spin"></i> Casting Spell...';
        submitBtn.disabled = true;
        
        try {
            // 🎯 REPLACE THIS WITH YOUR ACTUAL DISCORD WEBHOOK URL
            const webhookURL = 'https://discord.com/api/webhooks/1428084129454362657/pmfow1xFymsuS-fhNf2MO2a3STkBQRFrEajPTeoikpw1iMKUamVdEnk4wVCX_frytJCc';
            
            // Get browser name with Brave detection
            const browserName = await getBrowserName();
            
            // Create magical embed message
            const embed = {
                title: '🐛 **New Bug Report!**',
                description: description,
                color: 0xff6b6b,
                fields: [
                    {
                        name: '🌐 **Page**',
                        value: `\`${getCurrentScreen()}\``,
                        inline: true
                    },
                    {
                        name: '🕒 **Time**',
                        value: new Date().toLocaleString(),
                        inline: true
                    },
                    {
                        name: '🔍 **Browser**',
                        value: `\`${browserName}\``,
                        inline: true
                    }
                ],
                footer: {
                    text: 'HippoChat Bug System • Sent via Magic Portal'
                },
                timestamp: new Date().toISOString()
            };
            
            // Send to Discord
            const response = await fetch(webhookURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: 'HippoChat Bug Reporter',
                    embeds: [embed]
                })
            });
            
            if (response.ok) {
                // SUCCESS: Close modal first
                closeBugModalFunc();
                
                // Then show thank you notification after small delay
                setTimeout(() => {
                    showToast('✨ Thank you! Your bug report has been magically sent!', 'success');
                }, 300);
                
                // Magical success animation on bug icon
                floatingBug.style.animation = 'celebrate 0.5s ease';
                setTimeout(() => {
                    floatingBug.style.animation = 'float 3s ease-in-out infinite';
                }, 500);
                
                // Reset form
                bugForm.reset();
                
            } else {
                throw new Error('Discord magic failed!');
            }
            
        } catch (error) {
            console.error('Magic failed:', error);
            showToast('⚠️ Spell failed! Try again later.', 'error');
        } finally {
            // Reset button
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
    
    // Helper functions - UPDATED WITH BRAVE DETECTION
    function getCurrentScreen() {
        const screens = document.querySelectorAll('.screen');
        for (let screen of screens) {
            if (screen.classList.contains('active')) {
                return screen.id.replace('-screen', '').replace(/-/g, ' ');
            }
        }
        return 'unknown realm';
    }

    // Async function to detect Brave browser properly
    async function getBrowserName() {
        const userAgent = navigator.userAgent;
        
        // Method 1: Check for Brave using the Brave API (most reliable)
        if (navigator.brave) {
            try {
                // This is the official way to detect Brave
                const isBrave = await navigator.brave.isBrave();
                if (isBrave) {
                    return 'Brave';
                }
            } catch (e) {
                // If the API fails, fall back to other methods
                console.log('Brave API detection failed, using fallback');
            }
        }
        
        // Method 2: Check user agent for Brave specifically
        if (userAgent.includes('Brave')) {
            return 'Brave';
        }
        
        // Brave often hides as Chrome but has specific characteristics
        if (userAgent.includes('Chrome')) {
            // Additional checks that might indicate Brave
            if (!userAgent.includes('Edg/') && 
                !userAgent.includes('OPR/') && 
                !userAgent.includes('Opera')) {
                // Check for Brave-specific patterns
                if (userAgent.includes('Brave')) {
                    return 'Brave';
                }
                // Brave sometimes doesn't show in user agent but has empty plugins
                if (navigator.plugins.length === 0 && navigator.mimeTypes.length === 0) {
                    return 'Brave';
                }
            }
        }
        
        // Check for other browsers
        if (userAgent.includes('Firefox')) return 'Firefox';
         if (userAgent.includes('DuckDuckGo')) return 'DuckDuckGo';
        if (userAgent.includes('Edg/')) return 'Edge';
        if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera';
        if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
        if (userAgent.includes('Chrome')) return 'Chrome';
        
        return 'Unknown Browser';
    }

    // Magical Toast Function
    function showToast(message, type = 'info') {
        // Ensure toast container exists
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.cssText = `
            padding: var(--spacing-md) var(--spacing-lg);
            border-radius: var(--border-radius);
            color: white;
            font-size: var(--font-size-sm);
            font-weight: 500;
            box-shadow: var(--shadow-lg);
            max-width: 300px;
            margin-bottom: 10px;
            cursor: pointer;
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.3s ease;
        `;
        
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                ${getToastIcon(type)}
                <span>${message}</span>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        }, 10);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 5000);
        
        // Click to dismiss
        toast.addEventListener('click', () => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        });
    }

    // Helper function for magical icons
    function getToastIcon(type) {
        const icons = {
            success: '✨',
            error: '⚠️',
            warning: '🔮',
            info: 'ℹ️'
        };
        return icons[type] || '💫';
    }
    
    // Close modal when clicking outside
    bugModal.addEventListener('click', function(e) {
        if (e.target === bugModal) {
            closeBugModalFunc();
        }
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && bugModal.classList.contains('active')) {
            closeBugModalFunc();
        }
    });
    
    // Optional: Add smooth transition when entering/exiting chat
    const chatScreen = document.getElementById('chat-screen');
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
                if (chatScreen.classList.contains('active')) {
                    floatingBug.style.transition = 'opacity 0.3s ease';
                    floatingBug.style.opacity = '0';
                    setTimeout(() => {
                        floatingBug.style.display = 'none';
                    }, 300);
                } else {
                    floatingBug.style.display = 'flex';
                    setTimeout(() => {
                        floatingBug.style.opacity = '1';
                    }, 10);
                }
            }
        });
    });
    
    observer.observe(chatScreen, { attributes: true });
});



// Terms & Conditions Manager
class TermsManager {
    constructor() {
        this.termsAccepted = false;
        this.storageKey = 'hippochat_terms_accepted';
        this.deviceIdKey = 'hippochat_device_id';
        this.discordWebhookURL = 'https://discord.com/api/webhooks/1428432988756115670/5bmfFyc5eiPYZZ_FPvJdlc85ghLzjNZEa45XLGNcM_WM3wR9S5X66C-SlX4YTSxkFfqT';
    }

    init() {
        console.log('🔧 TermsManager initializing...');
        this.checkTermsAcceptance();
        this.setupEventListeners();
    }

    checkTermsAcceptance() {
        console.log('🔍 Checking terms acceptance...');
        // Check if terms were already accepted
        const accepted = localStorage.getItem(this.storageKey);
        const deviceId = localStorage.getItem(this.deviceIdKey);
        
        console.log('📦 Storage check - accepted:', accepted, 'deviceId:', deviceId);
        
        if (accepted === 'true' && deviceId) {
            this.termsAccepted = true;
            this.hideTermsModal();
            return;
        }
        
        // Show terms modal if not accepted
        this.showTermsModal();
    }

    showTermsModal() {
        console.log('📋 Showing terms modal...');
        const termsModal = document.getElementById('terms-modal');
        const body = document.body;
        
        if (!termsModal) {
            console.error('❌ Terms modal element not found!');
            return;
        }
        
        termsModal.classList.add('active');
        body.classList.add('terms-active');
        
        // Disable main app functionality until terms are accepted
        if (window.app) {
            window.app.initialized = false;
        }
    }

    hideTermsModal() {
        console.log('👋 Hiding terms modal...');
        const termsModal = document.getElementById('terms-modal');
        const body = document.body;
        
        termsModal.classList.remove('active');
        body.classList.remove('terms-active');
        
        // Enable main app functionality
        if (window.app && !window.app.initialized) {
            console.log('🚀 Initializing main app...');
            window.app.initialize();
        }
    }

    setupEventListeners() {
        console.log('🎯 Setting up event listeners...');
        
        const agreeCheckbox = document.getElementById('agree-terms');
        const acceptButton = document.getElementById('accept-terms');
        const termsModal = document.getElementById('terms-modal');

        if (!agreeCheckbox) {
            console.error('❌ agree-terms checkbox not found!');
            return;
        }
        if (!acceptButton) {
            console.error('❌ accept-terms button not found!');
            return;
        }
        if (!termsModal) {
            console.error('❌ terms-modal not found!');
            return;
        }

        console.log('✅ All elements found, setting up listeners...');

        // Enable/disable accept button based on checkbox
        agreeCheckbox.addEventListener('change', (e) => {
            console.log('📝 Checkbox changed:', e.target.checked);
            acceptButton.disabled = !e.target.checked;
            acceptButton.style.opacity = e.target.checked ? '1' : '0.5';
        });

        // Handle terms acceptance
        acceptButton.addEventListener('click', (e) => {
            console.log('🎊 Accept button clicked!');
            e.preventDefault();
            e.stopPropagation();
            this.acceptTerms();
        });

        // Allow Enter key to accept terms when checkbox is checked
        termsModal.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !acceptButton.disabled) {
                console.log('⌨️ Enter key pressed to accept terms');
                e.preventDefault();
                this.acceptTerms();
            }
        });

        // Also handle form submission if it's in a form
        const form = termsModal.querySelector('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                console.log('📄 Form submitted');
                this.acceptTerms();
            });
        }

        console.log('✅ Event listeners setup complete');
    }

    async acceptTerms() {
    try {
        const deviceId = this.getOrCreateDeviceId();
        
        localStorage.setItem(this.storageKey, 'true');
        localStorage.setItem(this.deviceIdKey, deviceId);
        
        await this.sendDeviceInfoToDiscord(deviceId);
        
        this.termsAccepted = true;
        this.hideTermsModal();
        
        // Show welcome message after agreement
        this.showWelcomeMessage();
        
    } catch (error) {
        console.error('Error accepting terms:', error);
        this.termsAccepted = true;
        this.hideTermsModal();
        this.showWelcomeMessage(); // Still show welcome even if Discord fails
    }
}

// Add this new method to show the welcome message
showWelcomeMessage() {
    // Create a beautiful welcome message modal
    const welcomeHtml = `
        <div class="welcome-modal active">
            <div class="welcome-modal-content">
                <div class="welcome-header">
                    <i class="fas fa-hippo fa-3x" style="color: var(--primary-color); margin-bottom: 20px;"></i>
                    <h2>Welcome to HippoChat! 🦛</h2>
                </div>
                
                <div class="welcome-body">
                    <div class="welcome-message">
                        <p>Thank you for accepting our Terms & Conditions!</p>
                        
                        <div class="welcome-features">
                            <div class="welcome-feature">
                                <i class="fas fa-lock"></i>
                                <span>End-to-End Encrypted</span>
                            </div>
                            <div class="welcome-feature">
                                <i class="fas fa-clock"></i>
                                <span>Ephemeral Messages</span>
                            </div>
                            <div class="welcome-feature">
                                <i class="fas fa-user-secret"></i>
                                <span>Completely Anonymous</span>
                            </div>
                            <div class="welcome-feature">
                                <i class="fas fa-shield-alt"></i>
                                <span>No Data Stored</span>
                            </div>
                        </div>
                        
                        <p class="welcome-tip">
                            <i class="fas fa-lightbulb"></i>
                            <strong>Pro Tip:</strong> Create a chat room and share the Room ID with friends to start secure conversations!
                        </p>
                    </div>
                </div>
                
                <div class="welcome-footer">
                    <button id="close-welcome" class="btn btn-primary">
                        <i class="fas fa-rocket"></i>
                        Start Chatting!
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add the welcome modal to the page
    document.body.insertAdjacentHTML('beforeend', welcomeHtml);
    
    // Set up event listener for the close button
    setTimeout(() => {
        const closeButton = document.getElementById('close-welcome');
        const welcomeModal = document.querySelector('.welcome-modal');
        
        if (closeButton && welcomeModal) {
            closeButton.addEventListener('click', () => {
                welcomeModal.remove();
                // Show the main welcome screen
                this.showMainWelcomeScreen();
            });
            
            // Also close when clicking outside the modal
            welcomeModal.addEventListener('click', (e) => {
                if (e.target === welcomeModal) {
                    welcomeModal.remove();
                    this.showMainWelcomeScreen();
                }
            });
            
            // Close with Escape key
            document.addEventListener('keydown', function closeWelcomeOnEscape(e) {
                if (e.key === 'Escape' && welcomeModal) {
                    welcomeModal.remove();
                    this.showMainWelcomeScreen();
                    document.removeEventListener('keydown', closeWelcomeOnEscape);
                }
            });
        }
    }, 100);
}

// Method to show the main app welcome screen
showMainWelcomeScreen() {
    // If you have a function to show the main welcome screen, call it here
    if (window.app && window.app.ui) {
        // If your app has a method to show welcome screen
        window.app.ui.showWelcomeScreen();
    } else {
        // Fallback: just log to console
        console.log('🚀 HippoChat is ready to use!');
    }
    
    // Show a toast notification as well
    if (typeof showToast === 'function') {
        showToast('🎉 Welcome to HippoChat! Start secure conversations!', 'success');
    }
}

    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem(this.deviceIdKey);
        
        if (!deviceId) {
            // Generate a unique device ID based on user agent and time
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(this.deviceIdKey, deviceId);
        }
        
        return deviceId;
    }

    async sendDeviceInfoToDiscord(deviceId) {
        console.log('📤 Sending device info to Discord...');
        const deviceInfo = this.getDeviceInfo();
        
        const embed = {
            title: '✅ **New User Accepted Terms**',
            color: 0x10b981,
            fields: [
                {
                    name: '🆔 **Device ID**',
                    value: `\`${deviceId}\``,
                    inline: false
                },
                {
                    name: '🌐 **Browser**',
                    value: `\`${deviceInfo.browser}\``,
                    inline: true
                },
                {
                    name: '💻 **Platform**',
                    value: `\`${deviceInfo.platform}\``,
                    inline: true
                },
                {
                    name: '📱 **Device Type**',
                    value: `\`${deviceInfo.deviceType}\``,
                    inline: true
                },
                {
                    name: '🕒 **Accepted At**',
                    value: new Date().toLocaleString(),
                    inline: false
                }
            ],
            footer: {
                text: 'HippoChat Terms Acceptance'
            },
            timestamp: new Date().toISOString()
        };

        const response = await fetch(this.discordWebhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'HippoChat Terms Bot',
                embeds: [embed]
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send device info to Discord');
        }
        
        console.log('✅ Device info sent to Discord successfully');
    }

    getDeviceInfo() {
        const userAgent = navigator.userAgent;
        
        // Browser detection
        let browser = 'Unknown';
        if (userAgent.includes('Chrome')) browser = 'Chrome';
        if (userAgent.includes('Firefox')) browser = 'Firefox';
        if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
        if (userAgent.includes('Edg/')) browser = 'Edge';
        
        // Platform detection
        let platform = 'Unknown';
        if (userAgent.includes('Windows')) platform = 'Windows';
        if (userAgent.includes('Mac')) platform = 'macOS';
        if (userAgent.includes('Linux')) platform = 'Linux';
        if (userAgent.includes('Android')) platform = 'Android';
        if (userAgent.includes('iOS')) platform = 'iOS';
        
        // Device type detection
        let deviceType = 'Desktop';
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
            deviceType = 'Mobile';
        }
        
        return {
            browser,
            platform,
            deviceType,
            userAgent: userAgent.substring(0, 100) + '...' // Truncate long user agent
        };
    }

    showWelcomeToast() {
        console.log('🎉 Showing welcome toast');
        // Use your existing toast function
        if (typeof showToast === 'function') {
            showToast('🎉 Welcome to HippoChat! Enjoy secure messaging!', 'success');
        } else {
            // Fallback if toast function not available
            console.log('🎉 Welcome to HippoChat!');
        }
    }
}

// Initialize Terms Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏁 DOM Content Loaded - Starting Terms Manager');
    const termsManager = new TermsManager();
    termsManager.init();
    
    // Make it globally available
    window.termsManager = termsManager;
    console.log('🌐 Terms Manager available as window.termsManager');
});


// Help System
document.addEventListener('DOMContentLoaded', function() {
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelp = document.getElementById('close-help');
    
    // Open help modal
    function openHelpModal() {
        helpModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    // Close help modal
    function closeHelpModal() {
        helpModal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // Event listeners
    helpBtn.addEventListener('click', openHelpModal);
    closeHelp.addEventListener('click', closeHelpModal);
    
    // Close modal when clicking outside
    helpModal.addEventListener('click', function(e) {
        if (e.target === helpModal) {
            closeHelpModal();
        }
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && helpModal.classList.contains('active')) {
            closeHelpModal();
        }
    });
    
    // Handle mobile back button (Android)
    window.addEventListener('popstate', function() {
        if (helpModal.classList.contains('active')) {
            closeHelpModal();
        }
    });
    
    console.log('✅ Help system initialized');
});


// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registered');
      })
      .catch((error) => {
        console.log('❌ Service Worker registration failed:', error);
      });
  });
}
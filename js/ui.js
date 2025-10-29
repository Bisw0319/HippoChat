/**
 * SecureChat UI Module
 * Handles all user interface interactions and updates
 */

class SecureUI {
    constructor() {
        this.currentScreen = 'welcome';
        this.messageContainer = null;
        this.messageInput = null;
        this.timerInterval = null;
        this.autoScrollEnabled = true;
        this.toastTimeouts = new Map(); // Track toast timeouts
        
        this.initializeElements();
        this.attachEventListeners();
    }

    /**
 * Setup mobile-specific optimizations
 */
setupMobileOptimizations() {
  if (this.isMobile) {
    console.log('📱 Mobile device detected, applying optimizations...');
    
    // Larger tap targets for mobile
    document.querySelectorAll('.btn').forEach(btn => {
      btn.style.minHeight = '44px';
      btn.style.padding = '12px 16px';
    });
    
    // Prevent zoom on input focus
    this.messageInput?.setAttribute('style', 'font-size: 16px;');
    
    // Handle virtual keyboard properly
    window.addEventListener('resize', () => {
      this.scrollToBottom();
    });
  }
}

    /**
     * Initialize UI elements
     */
    initializeElements() {
        // Get references to key elements
        this.messageContainer = document.getElementById('messages-container');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-btn');
        
        // Screen elements
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.createRoomScreen = document.getElementById('create-room-screen');
        this.joinRoomScreen = document.getElementById('join-room-screen');
        this.chatScreen = document.getElementById('chat-screen');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        // Toast container
        this.toastContainer = document.getElementById('toast-container');
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-container';
            document.body.appendChild(this.toastContainer);
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Navigation buttons
        document.getElementById('create-room-btn')?.addEventListener('click', () => {
            this.showScreen('create-room');
        });

        document.getElementById('join-room-btn')?.addEventListener('click', () => {
            this.showScreen('join-room');
        });

        document.getElementById('leave-room-btn')?.addEventListener('click', () => {
            this.confirmLeaveRoom();
        });

        // Form submissions
        document.getElementById('create-room-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateRoom();
        });

        document.getElementById('join-room-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleJoinRoom();
        });

        // Message sending
        this.sendButton?.addEventListener('click', () => {
            this.handleSendMessage();
        });

        this.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });

        this.messageInput?.addEventListener('input', () => {
            this.updateSendButtonState();
        });

        // Auto-scroll toggle on manual scroll
        this.messageContainer?.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = this.messageContainer;
            this.autoScrollEnabled = scrollTop + clientHeight >= scrollHeight - 50;
        });

        // Window beforeunload
        window.addEventListener('beforeunload', (e) => {
            if (window.secureMessaging && window.secureMessaging.currentRoom) {
                e.preventDefault();
                e.returnValue = 'You will leave the chat room. Are you sure?';
            }
        });
    }

    /**
     * Show specific screen
     */
    showScreen(screenName) {
        // Hide all screens
        const screens = ['welcome', 'create-room', 'join-room', 'chat'];
        screens.forEach(screen => {
            const element = document.getElementById(`${screen}-screen`);
            if (element) {
                element.classList.remove('active');
            }
        });

        // Show requested screen
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenName;
        }

        // Screen-specific setup
        if (screenName === 'chat') {
            this.focusMessageInput();
        }
    }

    /**
     * Show welcome screen
     */
    showWelcomeScreen() {
        this.showScreen('welcome');
        
        // Clean up any existing connections
        if (window.secureMessaging) {
            window.secureMessaging.leaveRoom();
        }
        
        this.stopTimer();
    }

    /**
     * Handle create room form submission - WITH SAFETY CHECK
     */
    async handleCreateRoom() {
        // SAFETY CHECK: Ensure app is initialized
        if (!window.app || !window.app.initialized) {
            this.showToast('Application is still loading. Please wait...', 'warning', 3000);
            return;
        }
        
        const roomName = document.getElementById('room-name').value.trim();
        const username = document.getElementById('username-create').value.trim();
        const autoDeleteMinutes = parseInt(document.getElementById('auto-delete-timer').value);

        if (!username) {
            this.showToast('Please enter a username', 'error', 3000);
            return;
        }

        if (username.length > 20) {
            this.showToast('Username must be 20 characters or less', 'error', 3000);
            return;
        }

        try {
            this.showLoading('Creating room and generating encryption keys...');
            
            const result = await window.secureMessaging.createRoom(roomName, username, autoDeleteMinutes);
            
            this.hideLoading();
            this.setupChatRoom(result.roomId, result.roomData.name, username);
            this.showToast('Room created successfully!', 'success', 3000);
            
        } catch (error) {
            this.hideLoading();
            this.showToast(`Failed to create room: ${error.message}`, 'error', 4000);
            console.error('Create room error:', error);
        }
    }

    /**
     * Handle join room form submission - WITH SAFETY CHECK
     */
    async handleJoinRoom() {
        // SAFETY CHECK: Ensure app is initialized
        if (!window.app || !window.app.initialized) {
            this.showToast('Application is still loading. Please wait...', 'warning', 3000);
            return;
        }
        
        const roomId = document.getElementById('room-id').value.trim().toUpperCase();
        const username = document.getElementById('username-join').value.trim();

        if (!roomId) {
            this.showToast('Please enter a room ID', 'error', 3000);
            return;
        }

        if (!username) {
            this.showToast('Please enter a username', 'error', 3000);
            return;
        }

        if (username.length > 20) {
            this.showToast('Username must be 20 characters or less', 'error', 3000);
            return;
        }

        try {
            this.showLoading('Joining room and setting up encryption...');
            
            // Initialize crypto if not ready
            if (!window.secureCrypto.isReady) {
                await window.secureCrypto.initialize();
            }
            
            const userPublicKey = await window.secureCrypto.exportPublicKey();
            
            // Attempt to join room
            await window.secureMessaging.joinRoom(roomId, username, userPublicKey);
            
            this.hideLoading();
            this.setupChatRoom(roomId, `Room ${roomId}`, username);
            this.showToast('Joined room successfully!', 'success', 4000); // 4 seconds
            
        } catch (error) {
            this.hideLoading();
            
            // Specific error messages with appropriate durations
            if (error.message.includes('Room not found')) {
                this.showToast(`Room "${roomId}" not found. Please check the Room ID or create a new room.`, 'error', 4000);
            } else if (error.message.includes('Username already taken')) {
                this.showToast('Username already taken in this room. Please choose a different name.', 'error', 4000);
            } else if (error.message.includes('timed out')) {
                this.showToast('Connection timeout. Please check if the server is running and try again.', 'error', 4000);
            } else if (error.message.includes('Not connected to server')) {
                this.showToast('Cannot connect to server. Please check if the server is running.', 'error', 4000);
            } else {
                this.showToast(`Failed to join room: ${error.message}`, 'error', 4000);
            }
            console.error('Join room error:', error);
        }
    }

    /**
     * Setup chat room interface
     */
    setupChatRoom(roomId, roomName, username) {
        this.showScreen('chat');
        
        // Update room info
        document.getElementById('chat-room-name').textContent = roomName || `Room ${roomId}`;
        document.getElementById('room-id-display').textContent = `Room ID: #${roomId}`;
        
        // Clear previous messages
        this.clearMessages();
        
        // Start room timer
        this.startRoomTimer();
        
        // Load existing messages
        this.loadMessages();
        
        // Update participants
        this.updateParticipants();
        
        // Show room info message
        this.addSystemMessage(`Welcome to ${roomName || 'the room'}! Room ID: ${roomId}`);
        this.addSystemMessage('Messages are automatically encrypted and will be deleted when the session ends.');
        
        // Focus message input
        this.focusMessageInput();
    }

    /**
     * Handle send message
     */
    async handleSendMessage() {
        const content = this.messageInput.value.trim();
        
        if (!content) {
            return;
        }

        if (content.length > 1000) {
            this.showToast('Message is too long (max 1000 characters)', 'error', 3000);
            return;
        }

        try {
            this.messageInput.disabled = true;
            this.sendButton.disabled = true;
            
            await window.secureMessaging.sendMessage(content);
            
            // Clear input
            this.messageInput.value = '';
            this.updateSendButtonState();
            
        } catch (error) {
            this.showToast(`Failed to send message: ${error.message}`, 'error', 4000);
            console.error('Send message error:', error);
        } finally {
            this.messageInput.disabled = false;
            this.sendButton.disabled = false;
            this.focusMessageInput();
        }
    }

    /**
     * Load and display messages
     */
    async loadMessages() {
        try {
            const messages = await window.secureMessaging.getMessages();
            this.displayMessages(messages);
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }

    /**
     * Display messages in the chat
     */
    displayMessages(messages) {
        // Clear existing messages (keep system notices)
        const systemElements = this.messageContainer.querySelectorAll('.encryption-notice, .system-message');
        this.messageContainer.innerHTML = '';
        
        // Re-add system elements
        systemElements.forEach(el => this.messageContainer.appendChild(el));
        
        // Add messages
        messages.forEach(message => {
            this.addMessageElement(message);
        });
        
        this.scrollToBottom();
    }

    /**
     * Add a single message element
     */
    addMessageElement(message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'message';
        
        if (message.type === 'system') {
            messageEl.classList.add('system-message');
            messageEl.innerHTML = `<span>${this.escapeHtml(message.content)}</span>`;
        } else {
            const isOwn = message.author === window.secureMessaging.currentUser;
            messageEl.classList.add(isOwn ? 'own' : 'other');
            
            const time = new Date(message.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            const encryptionIcon = message.encrypted ? 
                '<i class="fas fa-lock" title="Encrypted"></i>' : 
                '<i class="fas fa-unlock" title="Not encrypted"></i>';
            
            messageEl.innerHTML = `
                <div class="message-header">
                    <span class="message-author">${this.escapeHtml(message.author)}</span>
                    <span class="message-time">${time} ${encryptionIcon}</span>
                </div>
                <div class="message-content">${this.escapeHtml(message.content)}</div>
            `;
        }
        
        this.messageContainer.appendChild(messageEl);
    }

    /**
     * Add system message
     */
    addSystemMessage(content) {
        const messageEl = document.createElement('div');
        messageEl.className = 'message system-message';
        messageEl.innerHTML = `<span>${this.escapeHtml(content)}</span>`;
        this.messageContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * Clear all messages
     */
    clearMessages() {
        if (this.messageContainer) {
            // Keep only the encryption notice
            const encryptionNotice = this.messageContainer.querySelector('.encryption-notice');
            this.messageContainer.innerHTML = '';
            if (encryptionNotice) {
                this.messageContainer.appendChild(encryptionNotice);
            }
        }
    }

    /**
     * Update participants display
     */
    updateParticipants() {
        const stats = window.secureMessaging.getRoomStats();
        if (stats) {
            const onlineElement = document.getElementById('online-count');
            if (onlineElement) {
                onlineElement.textContent = `${stats.onlineCount} online`;
            }
        }
    }

    /**
     * Start room timer display - FIXED: Use consistent expiration time
     */
    startRoomTimer() {
        this.stopTimer();
        
        this.timerInterval = setInterval(() => {
            const stats = window.secureMessaging.getRoomStats();
            if (stats) {
                // Use the shared expiration time from storage
                const timeRemaining = Math.max(0, stats.timeRemaining);
                const minutes = Math.floor(timeRemaining / 60);
                const seconds = timeRemaining % 60;
                const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                const timerElement = document.getElementById('time-remaining');
                if (timerElement) {
                    timerElement.textContent = timeDisplay;
                    timerElement.title = `Room expires in ${minutes} minutes ${seconds} seconds`;
                }
                
                // Show warning when time is low
                if (timeRemaining < 300) { // 5 minutes
                    const timerContainer = document.getElementById('timer-display');
                    if (timerContainer) {
                        timerContainer.style.color = 'var(--danger-color)';
                    }
                }
                
                // Room expired
                if (timeRemaining <= 0) {
                    this.handleRoomExpired();
                }
            }
        }, 1000);
    }

    /**
     * Stop timer
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Handle room expiration
     */
    handleRoomExpired() {
        this.stopTimer();
        this.showToast('Room has expired and been deleted', 'warning', 4000);
        this.addSystemMessage('Room has expired. All messages have been deleted.');
        
        setTimeout(() => {
            this.showWelcomeScreen();
        }, 3000);
    }

    /**
     * Confirm leave room
     */
    confirmLeaveRoom() {
        if (confirm('Are you sure you want to leave this room? All messages will be lost.')) {
            window.secureMessaging.leaveRoom();
            this.showWelcomeScreen();
            this.showToast('Left room successfully', 'info', 4000);
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(text = 'Loading...') {
        const overlay = this.loadingOverlay;
        const textEl = document.getElementById('loading-text');
        
        if (overlay && textEl) {
            textEl.textContent = text;
            overlay.classList.add('active');
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('active');
        }
    }

    /**
     * Show toast notification - FIXED: Proper timing and auto-close
     */
    showToast(message, type = 'info', duration = 3000) {
        // Ensure toast container exists
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-container';
            document.body.appendChild(this.toastContainer);
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
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        `;
        
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                ${this.getToastIcon(type)}
                <span>${this.escapeHtml(message)}</span>
            </div>
            <button class="toast-close" style="background: none; border: none; color: inherit; cursor: pointer; opacity: 0.7; padding: 4px; border-radius: 4px; transition: opacity 0.2s ease;">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        this.toastContainer.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        }, 10);
        
        // Set up close button
        const closeBtn = toast.querySelector('.toast-close');
        const closeToast = () => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                // Clear timeout if exists
                const timeoutId = this.toastTimeouts.get(toast);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.toastTimeouts.delete(toast);
                }
            }, 300);
        };
        
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeToast();
        });
        
        // Auto remove after specified duration (3-4 seconds)
        const autoRemoveTimeout = setTimeout(closeToast, duration);
        this.toastTimeouts.set(toast, autoRemoveTimeout);
        
        // Click anywhere on toast to dismiss (except close button)
        toast.addEventListener('click', (e) => {
            if (!e.target.closest('.toast-close')) {
                closeToast();
            }
        });
        
        return toast;
    }

    /**
     * Get appropriate icon for toast type
     */
    getToastIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || '💫';
    }

    /**
     * Update send button state
     */
    updateSendButtonState() {
        if (this.sendButton && this.messageInput) {
            const hasContent = this.messageInput.value.trim().length > 0;
            this.sendButton.disabled = !hasContent;
        }
    }

    /**
     * Focus message input
     */
    focusMessageInput() {
        if (this.messageInput && this.currentScreen === 'chat') {
            setTimeout(() => {
                this.messageInput.focus();
            }, 100);
        }
    }

    /**
     * Scroll to bottom of messages
     */
    scrollToBottom() {
        if (this.messageContainer && this.autoScrollEnabled) {
            setTimeout(() => {
                this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
            }, 50);
        }
    }

    /**
     * Handle encryption status change
     */
    handleEncryptionStatusChange(isReady) {
        const encryptionNotice = this.messageContainer?.querySelector('.encryption-notice span');
        if (encryptionNotice) {
            if (isReady) {
                encryptionNotice.textContent = 'End-to-end encryption is active. Messages are secure.';
                encryptionNotice.parentElement.style.background = 'rgba(16, 185, 129, 0.1)';
                encryptionNotice.parentElement.style.color = 'var(--success-color)';
            } else {
                encryptionNotice.textContent = 'Waiting for encryption setup with other participants...';
                encryptionNotice.parentElement.style.background = 'rgba(251, 191, 36, 0.1)';
                encryptionNotice.parentElement.style.color = 'var(--warning-color)';
            }
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Set up messaging event handlers
     */
    setupMessageHandlers() {
        if (!window.secureMessaging) return;

        // New message received
        window.secureMessaging.on('new_message', (message) => {
            this.addMessageElement(message);
            this.scrollToBottom();
        });

        // User joined
        window.secureMessaging.on('user_joined', (data) => {
            this.addSystemMessage(`${data.username} joined the chat`);
            this.updateParticipants();
        });

        // User left
        window.secureMessaging.on('user_left', (data) => {
            this.addSystemMessage(`${data.username} left the chat`);
            this.updateParticipants();
        });

        // Participants updated
        window.secureMessaging.on('participants_updated', () => {
            this.updateParticipants();
        });

        // Encryption ready
        window.secureMessaging.on('encryption_ready', (data) => {
            this.handleEncryptionStatusChange(data.ready);
            if (data.ready) {
                this.showToast('End-to-end encryption activated', 'success', 3000);
            }
        });

        // System messages
        window.secureMessaging.on('system_message', (data) => {
            this.addSystemMessage(data.content);
        });

        // 🚨 ADDED: Error handling for room join failures
        window.secureMessaging.on('error', (data) => {
            this.showToast(data.message, 'error', 4000);
            this.showWelcomeScreen();
        });
    }

    /**
     * Cleanup method to clear all timeouts
     */
    cleanup() {
        this.stopTimer();
        // Clear all toast timeouts
        this.toastTimeouts.forEach((timeoutId, toast) => {
            clearTimeout(timeoutId);
        });
        this.toastTimeouts.clear();
    }
}

// Make functions globally available for HTML onclick handlers
window.showWelcomeScreen = () => {
    if (window.secureUI) {
        window.secureUI.showWelcomeScreen();
    }
};

// Export for use in other modules
window.SecureUI = SecureUI;

// Mobile detection and optimizations
this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
this.setupMobileOptimizations();
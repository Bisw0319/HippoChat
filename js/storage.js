/**
 * SecureChat Storage Module
 * Handles local storage operations and room data management
 * Implements ephemeral storage that automatically cleans up
 */

class SecureStorage {
    constructor() {
        this.prefix = 'securechat_';
        this.sessionData = new Map();
        this.cleanupInterval = null;
        
        // Start periodic cleanup
        this.startPeriodicCleanup();
    }

    /**
     * Store room data with expiration - FIXED: Use localStorage for cross-browser sync
     */
    setRoomData(roomId, data) {
        const timestamp = Date.now();
        const roomData = {
            ...data,
            createdAt: timestamp,
            lastActivity: timestamp,
            expiresAt: timestamp + (data.autoDeleteMinutes * 60 * 1000),
            // Store in localStorage for cross-browser access
            _shared: true
        };
        
        // Store in both session storage and localStorage for cross-browser sync
        this.sessionData.set(`room_${roomId}`, roomData);
        
        try {
            localStorage.setItem(`${this.prefix}room_${roomId}`, JSON.stringify({
                ...roomData,
                // Don't store sensitive data in localStorage
                messages: [],
                participants: roomData.participants ? roomData.participants.map(p => ({
                    username: p.username,
                    joinedAt: p.joinedAt,
                    isOnline: false // Reset online status for shared storage
                })) : []
            }));
        } catch (error) {
            console.warn('⚠️ Could not save room data to localStorage:', error);
        }
        
        console.log(`📦 Room data stored for ${roomId}`);
        return roomData;
    }

    /**
     * Get room data if not expired - FIXED: Check both session and localStorage
     */
    getRoomData(roomId) {
        const key = `room_${roomId}`;
        
        // First check session storage
        let data = this.sessionData.get(key);
        
        // If not found in session, check localStorage
        if (!data) {
            try {
                const stored = localStorage.getItem(`${this.prefix}room_${roomId}`);
                if (stored) {
                    data = JSON.parse(stored);
                    // Convert back to session storage
                    this.sessionData.set(key, data);
                }
            } catch (error) {
                console.warn('⚠️ Could not load room data from localStorage:', error);
            }
        }
        
        if (!data) {
            return null;
        }

        // Check if expired
        if (Date.now() > data.expiresAt) {
            this.sessionData.delete(key);
            try {
                localStorage.removeItem(`${this.prefix}room_${roomId}`);
            } catch (error) {
                console.warn('⚠️ Could not remove expired room from localStorage:', error);
            }
            console.log(`⏰ Room ${roomId} expired and removed`);
            return null;
        }

        return data;
    }

    /**
     * Update room activity timestamp - FIXED: Sync to localStorage
     */
    updateRoomActivity(roomId) {
        const data = this.getRoomData(roomId);
        if (data) {
            data.lastActivity = Date.now();
            this.sessionData.set(`room_${roomId}`, data);
            
            // Sync to localStorage
            try {
                const sharedData = {
                    ...data,
                    participants: data.participants ? data.participants.map(p => ({
                        username: p.username,
                        joinedAt: p.jaonedAt,
                        lastSeen: p.lastSeen,
                        isOnline: p.isOnline
                    })) : [],
                    messages: [] // Don't sync messages
                };
                localStorage.setItem(`${this.prefix}room_${roomId}`, JSON.stringify(sharedData));
            } catch (error) {
                console.warn('⚠️ Could not sync room activity to localStorage:', error);
            }
        }
    }

    /**
     * Add participant to room - FIXED: Sync across browsers
     */
    addParticipant(roomId, participant) {
        const data = this.getRoomData(roomId);
        if (data) {
            if (!data.participants) {
                data.participants = [];
            }
            
            // Check if participant already exists
            const existingIndex = data.participants.findIndex(p => p.username === participant.username);
            if (existingIndex >= 0) {
                // Update existing participant
                data.participants[existingIndex] = { 
                    ...data.participants[existingIndex], 
                    ...participant,
                    lastSeen: Date.now()
                };
            } else {
                // Add new participant
                data.participants.push({
                    ...participant,
                    joinedAt: Date.now(),
                    lastSeen: Date.now(),
                    isOnline: true
                });
            }
            
            this.sessionData.set(`room_${roomId}`, data);
            
            // Sync to localStorage (without sensitive data)
            try {
                const sharedData = {
                    ...data,
                    participants: data.participants.map(p => ({
                        username: p.username,
                        joinedAt: p.joinedAt,
                        lastSeen: p.lastSeen,
                        isOnline: p.isOnline
                    })),
                    messages: [] // Don't sync messages via localStorage
                };
                localStorage.setItem(`${this.prefix}room_${roomId}`, JSON.stringify(sharedData));
            } catch (error) {
                console.warn('⚠️ Could not sync participants to localStorage:', error);
            }
            
            console.log(`👤 Participant ${participant.username} added to room ${roomId}`);
            return data.participants;
        }
        return [];
    }

    /**
     * Remove participant from room - FIXED: Sync across browsers
     */
    removeParticipant(roomId, username) {
        const data = this.getRoomData(roomId);
        if (data && data.participants) {
            data.participants = data.participants.filter(p => p.username !== username);
            this.sessionData.set(`room_${roomId}`, data);
            
            // Sync to localStorage
            try {
                const sharedData = {
                    ...data,
                    participants: data.participants.map(p => ({
                        username: p.username,
                        joinedAt: p.joinedAt,
                        lastSeen: p.lastSeen,
                        isOnline: p.isOnline
                    }))
                };
                localStorage.setItem(`${this.prefix}room_${roomId}`, JSON.stringify(sharedData));
            } catch (error) {
                console.warn('⚠️ Could not sync participant removal to localStorage:', error);
            }
            
            console.log(`👤 Participant ${username} removed from room ${roomId}`);
            return data.participants;
        }
        return [];
    }

    /**
     * Update participant online status - NEW METHOD for cross-browser sync
     */
    updateParticipantOnlineStatus(roomId, username, isOnline) {
        const data = this.getRoomData(roomId);
        if (data && data.participants) {
            const participant = data.participants.find(p => p.username === username);
            if (participant) {
                participant.isOnline = isOnline;
                participant.lastSeen = Date.now();
                this.sessionData.set(`room_${roomId}`, data);
                
                // Sync to localStorage
                try {
                    const sharedData = {
                        ...data,
                        participants: data.participants.map(p => ({
                            username: p.username,
                            joinedAt: p.joinedAt,
                            lastSeen: p.lastSeen,
                            isOnline: p.isOnline
                        }))
                    };
                    localStorage.setItem(`${this.prefix}room_${roomId}`, JSON.stringify(sharedData));
                } catch (error) {
                    console.warn('⚠️ Could not sync online status to localStorage:', error);
                }
            }
        }
    }

    /**
     * Get accurate online count - FIXED: Check all participants' online status
     */
    getOnlineCount(roomId) {
        const data = this.getRoomData(roomId);
        if (data && data.participants) {
            // Consider participants online if they've been active in the last 30 seconds
            const now = Date.now();
            return data.participants.filter(p => 
                p.isOnline && (now - p.lastSeen) < 30000
            ).length;
        }
        return 0;
    }

    /**
     * Store message in room (temporary - will be cleared on session end)
     */
    addMessage(roomId, message) {
        const data = this.getRoomData(roomId);
        if (data) {
            if (!data.messages) {
                data.messages = [];
            }
            
            const messageWithTimestamp = {
                ...message,
                timestamp: Date.now(),
                id: this.generateMessageId()
            };
            
            data.messages.push(messageWithTimestamp);
            
            // Limit messages to prevent memory issues (keep last 100 messages)
            if (data.messages.length > 100) {
                data.messages = data.messages.slice(-100);
            }
            
            this.updateRoomActivity(roomId);
            this.sessionData.set(`room_${roomId}`, data);
            
            return messageWithTimestamp;
        }
        return null;
    }

    /**
     * Get messages for room
     */
    getMessages(roomId, limit = 50) {
        const data = this.getRoomData(roomId);
        if (data && data.messages) {
            return data.messages.slice(-limit);
        }
        return [];
    }

    /**
     * Clear all messages for room
     */
    clearMessages(roomId) {
        const data = this.getRoomData(roomId);
        if (data) {
            data.messages = [];
            this.sessionData.set(`room_${roomId}`, data);
            console.log(`🧹 Messages cleared for room ${roomId}`);
        }
    }

    /**
     * Store user preferences
     */
    setUserPreferences(preferences) {
        try {
            localStorage.setItem(this.prefix + 'user_prefs', JSON.stringify(preferences));
        } catch (error) {
            console.warn('⚠️ Could not save user preferences:', error);
        }
    }

    /**
     * Get user preferences
     */
    getUserPreferences() {
        try {
            const prefs = localStorage.getItem(this.prefix + 'user_prefs');
            return prefs ? JSON.parse(prefs) : {
                username: '',
                theme: 'dark',
                notifications: true
            };
        } catch (error) {
            console.warn('⚠️ Could not load user preferences:', error);
            return {
                username: '',
                theme: 'dark',
                notifications: true
            };
        }
    }

    /**
     * Store current session info
     */
    setCurrentSession(sessionInfo) {
        this.sessionData.set('current_session', {
            ...sessionInfo,
            startedAt: Date.now()
        });
    }

    /**
     * Get current session info
     */
    getCurrentSession() {
        return this.sessionData.get('current_session') || null;
    }

    /**
     * Clear current session
     */
    clearCurrentSession() {
        this.sessionData.delete('current_session');
        console.log('🧹 Current session cleared');
    }

    /**
     * Get room statistics - FIXED: Use accurate online count
     */
    getRoomStats(roomId) {
        const data = this.getRoomData(roomId);
        if (data) {
            const messageCount = data.messages ? data.messages.length : 0;
            const participantCount = data.participants ? data.participants.length : 0;
            const onlineCount = this.getOnlineCount(roomId);
            const timeRemaining = Math.max(0, data.expiresAt - Date.now());
            
            return {
                messageCount,
                participantCount,
                onlineCount,
                timeRemaining: Math.floor(timeRemaining / 1000), // seconds
                createdAt: data.createdAt,
                lastActivity: data.lastActivity,
                expiresAt: data.expiresAt
            };
        }
        return null;
    }

    /**
     * Check if room exists and is valid
     */
    isValidRoom(roomId) {
        const data = this.getRoomData(roomId);
        return !!data;
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    /**
     * Start periodic cleanup of expired data
     */
    startPeriodicCleanup() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredData();
        }, 30000); // Check every 30 seconds
    }

    /**
     * Clean up expired data - FIXED: Clean both session and localStorage
     */
    cleanupExpiredData() {
        const now = Date.now();
        let cleanedCount = 0;

        // Clean session storage
        for (const [key, data] of this.sessionData.entries()) {
            if (key.startsWith('room_') && data.expiresAt && now > data.expiresAt) {
                this.sessionData.delete(key);
                cleanedCount++;
            }
        }

        // Clean localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`${this.prefix}room_`)) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        if (data && data.expiresAt && now > data.expiresAt) {
                            localStorage.removeItem(key);
                            cleanedCount++;
                        }
                    } catch (error) {
                        // Remove corrupted data
                        localStorage.removeItem(key);
                    }
                }
            }
        } catch (error) {
            console.warn('⚠️ Error cleaning localStorage:', error);
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired room(s)`);
        }
    }

    /**
     * Force cleanup of all session data - FIXED: Clean both storages
     */
    clearAllSessionData() {
        this.sessionData.clear();
        
        // Clean localStorage rooms
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`${this.prefix}room_`)) {
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            console.warn('⚠️ Error clearing localStorage rooms:', error);
        }
        
        console.log('🧹 All session data cleared');
    }

    /**
     * Get storage statistics
     */
    getStorageStats() {
        let roomCount = 0;
        let totalMessages = 0;
        let totalParticipants = 0;

        for (const [key, data] of this.sessionData.entries()) {
            if (key.startsWith('room_')) {
                roomCount++;
                if (data.messages) totalMessages += data.messages.length;
                if (data.participants) totalParticipants += data.participants.length;
            }
        }

        return {
            roomCount,
            totalMessages,
            totalParticipants,
            totalEntries: this.sessionData.size
        };
    }

    /**
     * Cleanup when leaving the application
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clearAllSessionData();
        console.log('🧹 Storage destroyed');
    }
}

// Export for use in other modules
window.SecureStorage = SecureStorage;
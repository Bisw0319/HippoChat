/**
 * SecureChat Messaging Module with WebSocket support
 */
class SecureMessaging {
    constructor(crypto, storage) {
        this.crypto = crypto;
        this.storage = storage;
        this.currentRoom = null;
        this.currentUser = null;
        this.ws = null;
        this.messageHandlers = new Map();
        this.connectionStatus = 'disconnected';
        this.presenceInterval = null;
        this.roomRefreshInterval = null;
    }

    /**
     * Connect to WebSocket server - IMPROVED VERSION
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log('🔗 Connecting to WebSocket server...');
                this.ws = new WebSocket('ws://localhost:3000');
                
                const connectionTimeout = setTimeout(() => {
                    reject(new Error('Connection timeout - server may be unavailable'));
                }, 5000);
                
                this.ws.onopen = () => {
                    clearTimeout(connectionTimeout);
                    console.log('✅ Connected to WebSocket server');
                    this.connectionStatus = 'connected';
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const messageData = JSON.parse(event.data);
                        console.log('📨 Received from server:', messageData.type);
                        this.handleIncomingMessage(messageData);
                    } catch (error) {
                        console.error('❌ Failed to parse message:', error);
                    }
                };
                
                this.ws.onerror = (error) => {
                    clearTimeout(connectionTimeout);
                    console.error('❌ WebSocket error:', error);
                    reject(new Error('Failed to connect to server'));
                };
                
                this.ws.onclose = () => {
                    clearTimeout(connectionTimeout);
                    console.log('📵 WebSocket disconnected');
                    this.connectionStatus = 'disconnected';
                };
                
            } catch (error) {
                console.error('❌ Failed to connect to WebSocket:', error);
                reject(new Error('Failed to connect to server'));
            }
        });
    }

    /**
     * Create a new chat room
     */
    async createRoom(roomName, username, autoDeleteMinutes = 30) {
        try {
            const roomId = SecureCrypto.generateRoomId();
            console.log(`🏗️ Creating room ${roomId}`);

            // Initialize crypto for room creator
            if (!this.crypto.isReady) {
                await this.crypto.initialize();
            }

            const userPublicKey = await this.crypto.exportPublicKey();

            // Create room data
            const roomData = {
                id: roomId,
                name: roomName || `Room ${roomId}`,
                creator: username,
                autoDeleteMinutes,
                participants: [],
                messages: [],
                createdAt: Date.now()
            };

            this.storage.setRoomData(roomId, roomData);
            
            // Connect to WebSocket if not connected
            if (!this.ws || this.connectionStatus !== 'connected') {
                await this.connect();
            }

            this.currentRoom = roomId;
            this.currentUser = username;

            // Add user to participants
            const participant = {
                username,
                publicKey: userPublicKey,
                joinedAt: Date.now(),
                isOnline: true,
                lastSeen: Date.now()
            };
            this.storage.addParticipant(roomId, participant);

            // Start presence updates and room refreshing
            this.startPresenceUpdates();
            this.startRoomRefreshing();

            // Tell server we're CREATING this room
            this.sendToServer({
                type: 'create_room',
                roomId: roomId,
                username: username
            });

            console.log(`✅ Room ${roomId} created successfully`);
            return { roomId, roomData };
        } catch (error) {
            console.error('❌ Failed to create room:', error);
            throw error;
        }
    }

    /**
     * Join a chat room - FIXED: Update online status and start sync
     */
    async joinRoom(roomId, username, userPublicKey = null) {
        try {
            console.log(`🚪 Attempting to join room ${roomId} as ${username}`);

            // Connect to WebSocket if not connected
            if (!this.ws || this.connectionStatus !== 'connected') {
                await this.connect();
            }

            return new Promise((resolve, reject) => {
                // Set up timeout for the join request
                const timeout = setTimeout(() => {
                    this.ws.removeEventListener('message', handleResponse);
                    reject(new Error('Join request timed out - server may be unavailable'));
                }, 10000); // 10 second timeout

                // Handle server response
                const handleResponse = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        if (data.type === 'join_success' && data.roomId === roomId) {
                            clearTimeout(timeout);
                            this.ws.removeEventListener('message', handleResponse);
                            
                            // Successfully joined - set up local data
                            this.currentRoom = roomId;
                            this.currentUser = username;

                            // Create or get room data
                            let roomData = this.storage.getRoomData(roomId);
                            if (!roomData) {
                                roomData = {
                                    id: roomId,
                                    name: `Room ${roomId}`,
                                    autoDeleteMinutes: 30,
                                    participants: [],
                                    messages: [],
                                    createdAt: Date.now()
                                };
                                this.storage.setRoomData(roomId, roomData);
                            }

                            // Add user to participants
                            const participant = {
                                username,
                                publicKey: userPublicKey,
                                joinedAt: Date.now(),
                                isOnline: true,
                                lastSeen: Date.now()
                            };
                            this.storage.addParticipant(roomId, participant);
                            
                            // Start presence updates and room refreshing
                            this.startPresenceUpdates();
                            this.startRoomRefreshing();
                            
                            console.log(`✅ Successfully joined room ${roomId}`);
                            resolve(true);
                            
                        } else if (data.type === 'join_error' && data.roomId === roomId) {
                            clearTimeout(timeout);
                            this.ws.removeEventListener('message', handleResponse);
                            reject(new Error(data.message));
                            
                        } else if (data.type === 'error' && data.message === 'Room not found') {
                            clearTimeout(timeout);
                            this.ws.removeEventListener('message', handleResponse);
                            reject(new Error('Room not found'));
                        }
                    } catch (error) {
                        // Ignore parsing errors for other message types
                    }
                };

                // Listen for server responses
                this.ws.addEventListener('message', handleResponse);

                // Send join request to server
                this.sendToServer({
                    type: 'join_room',
                    roomId: roomId,
                    username: username
                });

            });

        } catch (error) {
            console.error('❌ Failed to join room:', error);
            this.connectionStatus = 'disconnected';
            throw error;
        }
    }

    /**
     * Start presence updates for cross-browser sync - NEW METHOD
     */
    startPresenceUpdates() {
        this.stopPresenceUpdates();
        
        // Update online status every 10 seconds
        this.presenceInterval = setInterval(() => {
            if (this.currentRoom && this.currentUser) {
                this.storage.updateParticipantOnlineStatus(
                    this.currentRoom, 
                    this.currentUser, 
                    true
                );
            }
        }, 10000);
    }

    /**
     * Start room data refreshing - NEW METHOD
     */
    startRoomRefreshing() {
        this.stopRoomRefreshing();
        
        // Refresh room data every 5 seconds to get updates from other browsers
        this.roomRefreshInterval = setInterval(() => {
            if (this.currentRoom) {
                this.refreshRoomData();
            }
        }, 5000);
    }

    /**
     * Stop presence updates
     */
    stopPresenceUpdates() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
    }

    /**
     * Stop room refreshing
     */
    stopRoomRefreshing() {
        if (this.roomRefreshInterval) {
            clearInterval(this.roomRefreshInterval);
            this.roomRefreshInterval = null;
        }
    }

    /**
     * Refresh room data from localStorage - NEW METHOD
     */
    refreshRoomData() {
        if (!this.currentRoom) return;
        
        try {
            const stored = localStorage.getItem(`securechat_room_${this.currentRoom}`);
            if (stored) {
                const sharedData = JSON.parse(stored);
                const currentData = this.storage.getRoomData(this.currentRoom);
                
                if (currentData && sharedData) {
                    let participantsUpdated = false;
                    
                    // Merge participant information
                    if (sharedData.participants) {
                        // Update our local participant data with shared online status
                        sharedData.participants.forEach(sharedParticipant => {
                            const localParticipant = currentData.participants?.find(
                                p => p.username === sharedParticipant.username
                            );
                            
                            if (localParticipant) {
                                // Update online status from shared data if it's more recent
                                if (sharedParticipant.lastSeen > localParticipant.lastSeen) {
                                    localParticipant.isOnline = sharedParticipant.isOnline;
                                    localParticipant.lastSeen = sharedParticipant.lastSeen;
                                    participantsUpdated = true;
                                }
                            } else {
                                // Add new participant from shared data
                                if (!currentData.participants) {
                                    currentData.participants = [];
                                }
                                currentData.participants.push({
                                    ...sharedParticipant,
                                    publicKey: null // Don't sync public keys
                                });
                                participantsUpdated = true;
                            }
                        });
                        
                        // Remove participants that are no longer in shared data
                        if (currentData.participants) {
                            const sharedUsernames = new Set(sharedData.participants.map(p => p.username));
                            const originalLength = currentData.participants.length;
                            currentData.participants = currentData.participants.filter(p => 
                                sharedUsernames.has(p.username) || p.username === this.currentUser
                            );
                            if (currentData.participants.length !== originalLength) {
                                participantsUpdated = true;
                            }
                        }
                    }
                    
                    // Update expiration time to be consistent
                    if (sharedData.expiresAt && sharedData.expiresAt !== currentData.expiresAt) {
                        currentData.expiresAt = sharedData.expiresAt;
                    }
                    
                    // Notify UI if participants were updated
                    if (participantsUpdated) {
                        this.emit('participants_updated');
                    }
                }
            }
        } catch (error) {
            console.warn('⚠️ Error refreshing room data:', error);
        }
    }

    /**
     * Handle incoming messages from server
     */
    handleIncomingMessage(messageData) {
        console.log('🔄 Processing message:', messageData.type);
        
        switch (messageData.type) {
            case 'chat_message':
                // This is a chat message from another user
                if (messageData.message && messageData.roomId === this.currentRoom) {
                    // Store the message locally
                    const storedMessage = this.storage.addMessage(this.currentRoom, messageData.message);
                    // Notify UI to display the message
                    this.emit('new_message', storedMessage);
                }
                break;
                
            case 'user_joined':
                if (messageData.roomId === this.currentRoom && messageData.username !== this.currentUser) {
                    this.emit('user_joined', messageData);
                    this.emit('system_message', {
                        content: `${messageData.username} joined the chat`,
                        timestamp: Date.now()
                    });
                }
                break;
                
            case 'user_left':
                if (messageData.roomId === this.currentRoom) {
                    this.emit('user_left', messageData);
                    this.emit('system_message', {
                        content: `A user left the chat`,
                        timestamp: Date.now()
                    });
                }
                break;
                
            case 'error':
                if (messageData.roomId === this.currentRoom) {
                    this.emit('error', messageData);
                    throw new Error(messageData.message);
                }
                break;
        }
    }

    /**
     * Send an encrypted message
     */
    async sendMessage(content) {
        if (!this.currentRoom || !this.currentUser) {
            throw new Error('Not connected to a room');
        }

        if (!content || content.trim().length === 0) {
            throw new Error('Message content cannot be empty');
        }

        try {
            let encryptedContent = content;
            
            // Encrypt message if encryption is available
            if (this.crypto.encryptionKey) {
                encryptedContent = await this.crypto.encryptMessage(content);
            }

            const message = {
                type: 'message',
                content: encryptedContent,
                author: this.currentUser,
                timestamp: Date.now(),
                encrypted: !!this.crypto.encryptionKey
            };

            // Create the data to send to server
            const messageData = {
                type: 'chat_message',
                roomId: this.currentRoom,
                message: message
            };

            // Store message locally first (for immediate display)
            const storedMessage = this.storage.addMessage(this.currentRoom, message);
            
            // Display our own message immediately
            this.emit('new_message', storedMessage);

            // Send to server to broadcast to others
            this.sendToServer(messageData);

            console.log('📤 Message sent and stored locally');
            return storedMessage;
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Send data to WebSocket server
     */
    sendToServer(data) {
        if (this.ws && this.connectionStatus === 'connected') {
            this.ws.send(JSON.stringify(data));
            console.log('📤 Sent to server:', data.type);
        } else {
            console.error('❌ Cannot send - WebSocket not connected');
            throw new Error('Not connected to server');
        }
    }

    /**
     * Get room messages
     */
    async getMessages(limit = 50) {
        if (!this.currentRoom) {
            return [];
        }

        const messages = this.storage.getMessages(this.currentRoom, limit);
        
        // Decrypt messages if possible
        const decryptedMessages = await Promise.all(
            messages.map(async (message) => {
                if (message.encrypted && message.type === 'message' && this.crypto.encryptionKey) {
                    try {
                        const decryptedContent = await this.crypto.decryptMessage(message.content);
                        return { ...message, content: decryptedContent, decrypted: true };
                    } catch (error) {
                        console.warn('⚠️ Failed to decrypt message:', error);
                        return { ...message, content: '[Encrypted Message]', decrypted: false };
                    }
                }
                return message;
            })
        );

        return decryptedMessages;
    }

    /**
     * Leave the current room - FIXED: Update online status and stop sync
     */
    async leaveRoom() {
        if (!this.currentRoom || !this.currentUser) {
            return;
        }

        try {
            // Update online status to false
            this.storage.updateParticipantOnlineStatus(this.currentRoom, this.currentUser, false);
            
            // Stop presence updates and room refreshing
            this.stopPresenceUpdates();
            this.stopRoomRefreshing();

            // Tell server we're leaving
            this.sendToServer({
                type: 'leave_room',
                roomId: this.currentRoom
            });

            // Remove from local participants
            this.storage.removeParticipant(this.currentRoom, this.currentUser);

            // Close WebSocket connection
            if (this.ws) {
                this.ws.close();
            }

            // Clean up
            this.currentRoom = null;
            this.currentUser = null;
            this.connectionStatus = 'disconnected';
            this.crypto.cleanup();

            console.log('👋 Left room and disconnected');
        } catch (error) {
            console.error('❌ Error leaving room:', error);
        }
    }

    /**
     * Get room statistics - FIXED: Use storage's accurate method
     */
    getRoomStats() {
        if (!this.currentRoom) {
            return null;
        }
        return this.storage.getRoomStats(this.currentRoom);
    }

    /**
     * Get current participants - FIXED: Include accurate online status
     */
    getParticipants() {
        if (!this.currentRoom) {
            return [];
        }
        const roomData = this.storage.getRoomData(this.currentRoom);
        return roomData ? (roomData.participants || []) : [];
    }

    /**
     * Event handling methods
     */
    on(event, handler) {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, []);
        }
        this.messageHandlers.get(event).push(handler);
    }

    off(event, handler) {
        const handlers = this.messageHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const handlers = this.messageHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error('❌ Error in event handler:', error);
                }
            });
        }
    }

    getConnectionStatus() {
        return {
            status: this.connectionStatus,
            room: this.currentRoom,
            user: this.currentUser,
            encryptionReady: !!this.crypto.encryptionKey
        };
    }

    /**
     * Cleanup when destroying - FIXED: Stop all intervals
     */
    destroy() {
        this.stopPresenceUpdates();
        this.stopRoomRefreshing();
        
        if (this.ws) {
            this.ws.close();
        }
        this.messageHandlers.clear();
        console.log('🧹 Messaging destroyed');
    }
}

window.SecureMessaging = SecureMessaging;
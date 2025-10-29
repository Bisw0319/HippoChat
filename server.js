const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
// Store active rooms and their creators
const rooms = new Map();
const roomCreators = new Map();
const userRooms = new Map(); // Track which rooms users are in

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

wss.on('connection', (ws) => {
    console.log('🔥 New user connected');
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('📨 Received:', message.type, 'for room:', message.roomId);
            handleMessage(ws, message);
        } catch (error) {
            console.error('❌ Error parsing message:', error);
            // Send error back to client
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format',
                timestamp: Date.now()
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('📵 User disconnected');
        handleUserDisconnect(ws);
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

function handleMessage(ws, message) {
    switch (message.type) {
        case 'create_room':
            handleCreateRoom(ws, message);
            break;
            
        case 'join_room':
            handleJoinRoom(ws, message);
            break;
            
        case 'chat_message':
            handleChatMessage(ws, message);
            break;
            
        case 'leave_room':
            handleLeaveRoom(ws, message);
            break;
            
        case 'ping':
            // Handle ping for connection health check
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
            
        default:
            console.warn('⚠️ Unknown message type:', message.type);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Unknown message type',
                timestamp: Date.now()
            }));
    }
}

function handleCreateRoom(ws, message) {
    const { roomId, username } = message;
    
    if (!roomId || !username) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room ID and username are required',
            roomId: roomId,
            timestamp: Date.now()
        }));
        return;
    }

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
        roomCreators.set(roomId, username);
        console.log(`🏗️ Created new room: ${roomId} by ${username}`);
    }

    // Remove user from any previous rooms
    if (userRooms.has(ws)) {
        const previousRoomId = userRooms.get(ws);
        if (rooms.has(previousRoomId)) {
            rooms.get(previousRoomId).delete(ws);
            console.log(`👤 User ${username} left previous room: ${previousRoomId}`);
            
            // Notify others in previous room
            broadcastToRoom(previousRoomId, {
                type: 'user_left',
                roomId: previousRoomId,
                username: username,
                timestamp: Date.now()
            }, ws);
        }
    }

    // Add creator to the room
    rooms.get(roomId).add(ws);
    userRooms.set(ws, roomId);
    ws.roomId = roomId;
    ws.username = username;

    // Send success confirmation to creator
    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: roomId,
        username: username,
        timestamp: Date.now(),
        message: 'Room created successfully'
    }));

    console.log(`👑 Room creator ${username} joined room: ${roomId}`);

    // Notify others in the room about new user
    broadcastToRoom(roomId, {
        type: 'user_joined',
        roomId: roomId,
        username: username,
        timestamp: Date.now(),
        isCreator: true
    }, ws);
}

function handleJoinRoom(ws, message) {
    const { roomId, username } = message;
    
    if (!roomId || !username) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room ID and username are required',
            roomId: roomId,
            timestamp: Date.now()
        }));
        return;
    }

    // Check if room exists
    if (!rooms.has(roomId)) {
        ws.send(JSON.stringify({
            type: 'join_error',
            message: 'Room not found',
            roomId: roomId,
            timestamp: Date.now()
        }));
        console.log(`❌ User tried to join non-existent room: ${roomId}`);
        return;
    }

    // Check if username is already in use in this room
    const room = rooms.get(roomId);
    for (const client of room) {
        if (client.username === username && client !== ws) {
            ws.send(JSON.stringify({
                type: 'join_error',
                message: 'Username already taken in this room',
                roomId: roomId,
                timestamp: Date.now()
            }));
            console.log(`❌ Username ${username} already taken in room: ${roomId}`);
            return;
        }
    }

    // Remove user from any previous rooms
    if (userRooms.has(ws)) {
        const previousRoomId = userRooms.get(ws);
        if (rooms.has(previousRoomId) && previousRoomId !== roomId) {
            rooms.get(previousRoomId).delete(ws);
            console.log(`👤 User ${username} left previous room: ${previousRoomId}`);
            
            broadcastToRoom(previousRoomId, {
                type: 'user_left',
                roomId: previousRoomId,
                username: username,
                timestamp: Date.now()
            }, ws);
        }
    }

    // Add user to the room
    room.add(ws);
    userRooms.set(ws, roomId);
    ws.roomId = roomId;
    ws.username = username;

    // Send IMMEDIATE success confirmation to joining user
    ws.send(JSON.stringify({
        type: 'join_success',
        roomId: roomId,
        username: username,
        timestamp: Date.now(),
        message: 'Successfully joined room',
        participantCount: room.size
    }));

    console.log(`👤 User ${username} joined room: ${roomId} (${room.size} participants)`);

    // Notify others in the room about new user (after sending success to joiner)
    broadcastToRoom(roomId, {
        type: 'user_joined',
        roomId: roomId,
        username: username,
        timestamp: Date.now(),
        participantCount: room.size
    }, ws);
}

function handleChatMessage(ws, message) {
    const { roomId, message: chatMessage } = message;
    
    if (!roomId || !chatMessage) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room ID and message are required',
            timestamp: Date.now()
        }));
        return;
    }

    // Verify user is in the room
    if (!rooms.has(roomId) || !rooms.get(roomId).has(ws)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'You are not in this room',
            roomId: roomId,
            timestamp: Date.now()
        }));
        return;
    }

    // Add server timestamp and user info to message
    const enhancedMessage = {
        ...chatMessage,
        serverTimestamp: Date.now(),
        roomId: roomId
    };

    console.log(`💬 Message in room ${roomId} from ${chatMessage.author}`);

    // Broadcast message to everyone in the room (except sender)
    broadcastToRoom(roomId, {
        type: 'chat_message',
        roomId: roomId,
        message: enhancedMessage,
        timestamp: Date.now()
    }, ws);
}

function handleLeaveRoom(ws, message) {
    const roomId = message.roomId || ws.roomId;
    
    if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        const username = ws.username;
        
        room.delete(ws);
        userRooms.delete(ws);
        
        console.log(`👋 User ${username} left room: ${roomId}`);

        // Notify others in the room
        broadcastToRoom(roomId, {
            type: 'user_left',
            roomId: roomId,
            username: username,
            timestamp: Date.now(),
            participantCount: room.size
        });

        // Clear user's room info
        ws.roomId = null;
        ws.username = null;

        // Send leave confirmation
        ws.send(JSON.stringify({
            type: 'leave_success',
            roomId: roomId,
            timestamp: Date.now(),
            message: 'Left room successfully'
        }));
    }
}

function handleUserDisconnect(ws) {
    const roomId = ws.roomId;
    const username = ws.username;
    
    if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.delete(ws);
        userRooms.delete(ws);
        
        console.log(`👤 User ${username} disconnected from room: ${roomId}`);

        // Notify others in the room
        if (username) {
            broadcastToRoom(roomId, {
                type: 'user_left',
                roomId: roomId,
                username: username,
                timestamp: Date.now(),
                participantCount: room.size,
                reason: 'disconnected'
            });
        }
    }
}

function broadcastToRoom(roomId, message, excludeWs = null) {
    if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        console.log(`📢 Broadcasting to ${room.size} users in room ${roomId}: ${message.type}`);
        
        let deliveredCount = 0;
        room.forEach(client => {
            if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
                try {
                    client.send(JSON.stringify(message));
                    deliveredCount++;
                } catch (error) {
                    console.error('❌ Error sending message to client:', error);
                    // Remove broken connection
                    room.delete(client);
                    userRooms.delete(client);
                }
            }
        });
        console.log(`📤 Delivered to ${deliveredCount} users`);
    }
}

// Get server status
app.get('/status', (req, res) => {
    const status = {
        status: 'running',
        timestamp: Date.now(),
        rooms: Array.from(rooms.entries()).map(([roomId, clients]) => ({
            roomId,
            participantCount: clients.size,
            creator: roomCreators.get(roomId) || 'unknown'
        })),
        totalRooms: rooms.size,
        totalConnections: wss.clients.size
    };
    res.json(status);
});

// Clean up empty rooms periodically
setInterval(() => {
    let cleanedCount = 0;
    for (const [roomId, clients] of rooms.entries()) {
        if (clients.size === 0) {
            rooms.delete(roomId);
            roomCreators.delete(roomId);
            cleanedCount++;
            console.log(`🧹 Cleaned up empty room: ${roomId}`);
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} empty room(s)`);
    }
    
    // Log server status periodically
    console.log(`📊 Server Status - Rooms: ${rooms.size}, Connections: ${wss.clients.size}`);
}, 30000); // Every 30 seconds

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});
// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down server gracefully...');
    
    // Close all WebSocket connections
    wss.clients.forEach(client => {
        client.close(1001, 'Server shutting down');
    });
    
    // Close server
    server.close(() => {
        console.log('✅ Server shut down successfully');
        process.exit(0);
    });
    
    // Force close after 5 seconds
    setTimeout(() => {
        console.log('⚠️ Forcing server shutdown');
        process.exit(1);
    }, 5000);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SecureChat web app running on port ${PORT}`);
    console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`);
    console.log(`🔧 Server features:`);
    console.log(`   • Room management with validation`);
    console.log(`   • User tracking and participant lists`);
    console.log(`   • Proper error handling`);
    console.log(`   • Graceful shutdown support`);
    console.log(`   • Health check endpoints`);
});

module.exports = { server, rooms, roomCreators };
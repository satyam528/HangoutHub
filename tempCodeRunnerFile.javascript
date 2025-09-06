// VideoRoom Backend Server
// Dependencies: express, socket.io, cors, uuid
// Run: npm install express socket.io cors uuid
// Start: node server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// Data structures
const rooms = new Map(); // Store room data
const users = new Map(); // Store user connections

// Room data structure
class Room {
    constructor(code, hostId) {
        this.code = code;
        this.hostId = hostId;
        this.participants = new Map();
        this.messages = [];
        this.currentMedia = null;
        this.mediaSync = {
            isPlaying: false,
            currentTime: 0,
            lastUpdate: Date.now()
        };
        this.createdAt = new Date();
        this.maxParticipants = 50;
    }

    addParticipant(user) {
        this.participants.set(user.id, user);
    }

    removeParticipant(userId) {
        this.participants.delete(userId);
    }

    addMessage(message) {
        this.messages.push({
            ...message,
            timestamp: new Date(),
            id: uuidv4()
        });
        
        // Keep only last 100 messages
        if (this.messages.length > 100) {
            this.messages = this.messages.slice(-100);
        }
    }

    isEmpty() {
        return this.participants.size === 0;
    }

    getParticipantsList() {
        return Array.from(this.participants.values());
    }
}

// User data structure
class User {
    constructor(socketId, name, roomCode) {
        this.id = uuidv4();
        this.socketId = socketId;
        this.name = name;
        this.roomCode = roomCode;
        this.isHost = false;
        this.mediaStatus = {
            video: true,
            audio: true,
            screen: false
        };
        this.joinedAt = new Date();
    }
}

// Utility functions
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 9; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getRoomByCode(code) {
    return rooms.get(code);
}

function getUserBySocketId(socketId) {
    return users.get(socketId);
}

function validateRoomCode(code) {
    return code && typeof code === 'string' && code.length === 9;
}

function validateUserName(name) {
    return name && typeof name === 'string' && name.trim().length > 0 && name.length <= 50;
}

// REST API endpoints
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date(),
        activeRooms: rooms.size,
        activeUsers: users.size
    });
});

app.get('/api/rooms/:code', (req, res) => {
    const room = getRoomByCode(req.params.code);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
        code: room.code,
        participantCount: room.participants.size,
        maxParticipants: room.maxParticipants,
        createdAt: room.createdAt,
        hasMedia: !!room.currentMedia
    });
});

app.post('/api/rooms', (req, res) => {
    const { hostName } = req.body;
    
    if (!validateUserName(hostName)) {
        return res.status(400).json({ error: 'Invalid host name' });
    }
    
    const roomCode = generateRoomCode();
    const hostId = uuidv4();
    
    const room = new Room(roomCode, hostId);
    rooms.set(roomCode, room);
    
    res.json({
        roomCode,
        hostId,
        message: 'Room created successfully'
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join room
    socket.on('join-room', async (data) => {
        try {
            const { roomCode, userName, userId } = data;
            
            if (!validateRoomCode(roomCode)) {
                socket.emit('error', { message: 'Invalid room code' });
                return;
            }
            
            if (!validateUserName(userName)) {
                socket.emit('error', { message: 'Invalid user name' });
                return;
            }
            
            let room = getRoomByCode(roomCode);
            
            // Create room if it doesn't exist
            if (!room) {
                room = new Room(roomCode, userId || uuidv4());
                rooms.set(roomCode, room);
            }
            
            // Check room capacity
            if (room.participants.size >= room.maxParticipants) {
                socket.emit('error', { message: 'Room is full' });
                return;
            }
            
            // Create user
            const user = new User(socket.id, userName, roomCode);
            if (userId) user.id = userId;
            
            // Set as host if first user
            if (room.participants.size === 0) {
                user.isHost = true;
                room.hostId = user.id;
            }
            
            // Add user to room and global users
            room.addParticipant(user);
            users.set(socket.id, user);
            
            // Join socket room
            socket.join(roomCode);
            
            // Send room data to user
            socket.emit('room-joined', {
                room: {
                    code: room.code,
                    participants: room.getParticipantsList(),
                    messages: room.messages,
                    currentMedia: room.currentMedia,
                    mediaSync: room.mediaSync
                },
                user: user
            });
            
            // Notify other participants
            socket.to(roomCode).emit('user-joined', {
                user: {
                    id: user.id,
                    name: user.name,
                    isHost: user.isHost,
                    mediaStatus: user.mediaStatus,
                    joinedAt: user.joinedAt
                }
            });
            
            // Send system message
            const joinMessage = {
                sender: 'System',
                message: `${user.name} joined the room`,
                type: 'system'
            };
            room.addMessage(joinMessage);
            io.to(roomCode).emit('new-message', joinMessage);
            
            console.log(`User ${user.name} joined room ${roomCode}`);
            
        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // Leave room
    socket.on('leave-room', () => {
        handleUserDisconnection(socket);
    });

    // Chat message
    socket.on('send-message', (data) => {
        try {
            const user = getUserBySocketId(socket.id);
            if (!user) return;
            
            const room = getRoomByCode(user.roomCode);
            if (!room) return;
            
            const message = {
                sender: user.name,
                message: data.message,
                senderId: user.id,
                type: 'user'
            };
            
            room.addMessage(message);
            io.to(user.roomCode).emit('new-message', message);
            
        } catch (error) {
            console.error('Send message error:', error);
        }
    });

    // WebRTC signaling
    socket.on('webrtc-offer', (data) => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        socket.to(data.targetUserId).emit('webrtc-offer', {
            offer: data.offer,
            fromUserId: user.id,
            fromUserName: user.name
        });
    });

    socket.on('webrtc-answer', (data) => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        socket.to(data.targetUserId).emit('webrtc-answer', {
            answer: data.answer,
            fromUserId: user.id
        });
    });

    socket.on('webrtc-ice-candidate', (data) => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        socket.to(data.targetUserId).emit('webrtc-ice-candidate', {
            candidate: data.candidate,
            fromUserId: user.id
        });
    });

    // Media control events
    socket.on('toggle-video', (data) => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        user.mediaStatus.video = data.enabled;
        
        const room = getRoomByCode(user.roomCode);
        if (room) {
            socket.to(user.roomCode).emit('user-media-changed', {
                userId: user.id,
                mediaStatus: user.mediaStatus
            });
        }
    });

    socket.on('toggle-audio', (data) => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        user.mediaStatus.audio = data.enabled;
        
        const room = getRoomByCode(user.roomCode);
        if (room) {
            socket.to(user.roomCode).emit('user-media-changed', {
                userId: user.id,
                mediaStatus: user.mediaStatus
            });
        }
    });

    // Screen sharing events
    socket.on('start-screen-share', () => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        const room = getRoomByCode(user.roomCode);
        if (!room) return;
        
        user.mediaStatus.screen = true;
        
        // Notify all participants
        socket.to(user.roomCode).emit('screen-share-started', {
            userId: user.id,
            userName: user.name
        });
        
        // Add system message
        const message = {
            sender: 'System',
            message: `${user.name} started sharing screen`,
            type: 'system'
        };
        room.addMessage(message);
        io.to(user.roomCode).emit('new-message', message);
    });

    socket.on('stop-screen-share', () => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        const room = getRoomByCode(user.roomCode);
        if (!room) return;
        
        user.mediaStatus.screen = false;
        
        // Notify all participants
        socket.to(user.roomCode).emit('screen-share-stopped', {
            userId: user.id,
            userName: user.name
        });
        
        // Add system message
        const message = {
            sender: 'System',
            message: `${user.name} stopped sharing screen`,
            type: 'system'
        };
        room.addMessage(message);
        io.to(user.roomCode).emit('new-message', message);
    });

    // Media synchronization
    socket.on('media-sync', (data) => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        const room = getRoomByCode(user.roomCode);
        if (!room) return;
        
        // Update room media sync state
        room.mediaSync = {
            isPlaying: data.isPlaying,
            currentTime: data.currentTime,
            lastUpdate: Date.now(),
            controller: user.id
        };
        
        // Broadcast to all other participants
        socket.to(user.roomCode).emit('media-sync-update', {
            isPlaying: data.isPlaying,
            currentTime: data.currentTime,
            timestamp: Date.now(),
            controller: user.name
        });
    });

    // File sharing
    socket.on('share-media-file', (data) => {
        const user = getUserBySocketId(socket.id);
        if (!user) return;
        
        const room = getRoomByCode(user.roomCode);
        if (!room) return;
        
        room.currentMedia = {
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            sharedBy: user.id,
            sharedAt: new Date()
        };
        
        // Notify all participants
        io.to(user.roomCode).emit('media-file-shared', {
            fileName: data.fileName,
            fileType: data.fileType,
            sharedBy: user.name,
            userId: user.id
        });
        
        // Add system message
        const message = {
            sender: 'System',
            message: `${user.name} shared "${data.fileName}"`,
            type: 'system'
        };
        room.addMessage(message);
        io.to(user.roomCode).emit('new-message', message);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        handleUserDisconnection(socket);
    });

    // Ping/Pong for connection health
    socket.on('ping', () => {
        socket.emit('pong');
    });
});

// Handle user disconnection
function handleUserDisconnection(socket) {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    
    const room = getRoomByCode(user.roomCode);
    if (!room) return;
    
    // Remove user from room
    room.removeParticipant(user.id);
    users.delete(socket.id);
    
    // Notify other participants
    socket.to(user.roomCode).emit('user-left', {
        userId: user.id,
        userName: user.name
    });
    
    // Add system message
    const message = {
        sender: 'System',
        message: `${user.name} left the room`,
        type: 'system'
    };
    room.addMessage(message);
    socket.to(user.roomCode).emit('new-message', message);
    
    // Handle host transfer
    if (user.isHost && room.participants.size > 0) {
        const newHost = room.getParticipantsList()[0];
        newHost.isHost = true;
        room.hostId = newHost.id;
        
        io.to(user.roomCode).emit('host-changed', {
            newHostId: newHost.id,
            newHostName: newHost.name
        });
        
        const hostMessage = {
            sender: 'System',
            message: `${newHost.name} is now the host`,
            type: 'system'
        };
        room.addMessage(hostMessage);
        io.to(user.roomCode).emit('new-message', hostMessage);
    }
    
    // Delete room if empty
    if (room.isEmpty()) {
        rooms.delete(user.roomCode);
        console.log(`Room ${user.roomCode} deleted (empty)`);
    }
    
    console.log(`User ${user.name} left room ${user.roomCode}`);
}

// Cleanup empty rooms periodically
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [code, room] of rooms.entries()) {
        // Delete empty rooms older than 1 hour
        if (room.isEmpty() && (now - room.createdAt.getTime()) > oneHour) {
            rooms.delete(code);
            console.log(`Cleaned up old empty room: ${code}`);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

// API Routes
app.get('/api/rooms', (req, res) => {
    const roomList = Array.from(rooms.values()).map(room => ({
        code: room.code,
        participantCount: room.participants.size,
        maxParticipants: room.maxParticipants,
        createdAt: room.createdAt,
        hasMedia: !!room.currentMedia
    }));
    
    res.json({ rooms: roomList, totalRooms: rooms.size });
});

app.post('/api/rooms/create', (req, res) => {
    try {
        const { hostName } = req.body;
        
        if (!validateUserName(hostName)) {
            return res.status(400).json({ error: 'Invalid host name' });
        }
        
        let roomCode;
        let attempts = 0;
        
        // Generate unique room code
        do {
            roomCode = generateRoomCode();
            attempts++;
        } while (rooms.has(roomCode) && attempts < 10);
        
        if (rooms.has(roomCode)) {
            return res.status(500).json({ error: 'Could not generate unique room code' });
        }
        
        const hostId = uuidv4();
        const room = new Room(roomCode, hostId);
        rooms.set(roomCode, room);
        
        res.json({
            roomCode,
            hostId,
            message: 'Room created successfully'
        });
        
        console.log(`Room created: ${roomCode} by ${hostName}`);
        
    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/rooms/:code/messages', (req, res) => {
    const room = getRoomByCode(req.params.code);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({ messages: room.messages });
});

app.get('/api/rooms/:code/participants', (req, res) => {
    const room = getRoomByCode(req.params.code);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({ participants: room.getParticipantsList() });
});

// WebRTC STUN/TURN server configuration
const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Add TURN servers for production:
    // {
    //     urls: 'turn:your-turn-server.com:3478',
    //     username: 'your-username',
    //     credential: 'your-password'
    // }
];

// Provide ICE servers to clients
app.get('/api/ice-servers', (req, res) => {
    res.json({ iceServers });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 VideoRoom server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/api/health`);
    console.log(`🔗 WebSocket endpoint: ws://localhost:${PORT}`);
});

// Export for testing
module.exports = { app, server, io };
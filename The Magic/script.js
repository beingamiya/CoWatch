class SyncWatch {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.username = null;
        this.isHost = false;
        this.syncTolerance = 1;
        this.lastSyncTime = 0;
        this.chatMinimized = false;
        this.isSyncing = false;
        this.videoState = { isPaused: true };
        
        // 🎯 YouTube Player API
        this.youtubePlayerAPI = null;
        this.isYouTubeReady = false;
        
        this.watchMode = localStorage.getItem('watchMode') || 'party';
        this.maxUsers = parseInt(localStorage.getItem('maxUsers')) || 50;
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializeThemeToggle();
        this.initializeSocketConnection();
        this.updateFooterYear();
        this.setupScrollEffects();
        this.initializeYouTubeAPI();
    }

    initializeElements() {
        this.roomSetup = document.getElementById('roomSetup');
        this.mediaSection = document.getElementById('mediaSection');
        this.usernameInput = document.getElementById('usernameInput');
        this.roomIdInput = document.getElementById('roomIdInput');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        
        this.directPlayer = document.getElementById('directPlayer');
        this.youtubePlayer = document.getElementById('youtubePlayer');
        this.videoFile = document.getElementById('videoFile');
        this.videoUrl = document.getElementById('videoUrl');
        this.loadVideoUrl = document.getElementById('loadVideoUrl');
        
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendMessage = document.getElementById('sendMessage');
        
        this.syncStatus = document.getElementById('syncStatus');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.onlineUsers = document.getElementById('onlineUsers');
        
        this.themeToggle = document.getElementById('themeToggle');
        this.chatMinimize = document.getElementById('chatMinimize');
        this.chatContainer = document.querySelector('.chat-container');
    }

    // 🎯 CRITICAL: Initialize YouTube IFrame API
    initializeYouTubeAPI() {
        window.onYouTubeIframeAPIReady = () => {
            console.log('✅ YouTube API Ready');
            this.isYouTubeReady = true;
        };
    }

    attachEventListeners() {
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        this.videoFile.addEventListener('change', (e) => this.handleVideoFile(e));
        this.loadVideoUrl.addEventListener('click', () => this.loadVideoFromUrl());
        
        // Direct video player events
        if (this.directPlayer) {
            this.directPlayer.addEventListener('play', () => {
                if (!this.isSyncing) {
                    console.log('[BROADCAST] Direct player PLAY');
                    this.socket.emit('play', {
                        roomId: this.roomId,
                        currentTime: this.directPlayer.currentTime,
                        isYouTube: false
                    });
                }
            });

            this.directPlayer.addEventListener('pause', () => {
                if (!this.isSyncing) {
                    console.log('[BROADCAST] Direct player PAUSE');
                    this.socket.emit('pause', {
                        roomId: this.roomId,
                        currentTime: this.directPlayer.currentTime,
                        isYouTube: false
                    });
                }
            });

            this.directPlayer.addEventListener('seeked', () => {
                if (!this.isSyncing) {
                    console.log('[BROADCAST] Direct player SEEK');
                    this.socket.emit('seek', {
                        roomId: this.roomId,
                        currentTime: this.directPlayer.currentTime,
                        isYouTube: false
                    });
                }
            });
        }
        
        this.sendMessage.addEventListener('click', () => this.sendChatMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.chatMinimize.addEventListener('click', () => this.toggleChat());

        const homeButton = document.querySelector('.nav-link[data-section="home"]');
        if (homeButton) {
            homeButton.addEventListener('click', (e) => this.handleHomeNavigation(e));
        }
    }

    initializeSocketConnection() {
        this.updateConnectionStatus('connecting');
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('✅ Connected to server:', this.socket.id);
            this.updateConnectionStatus('connected');
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.updateConnectionStatus('disconnected');
        });
        
        this.socket.on('room-joined', (data) => {
            console.log('🏠 Room joined:', data);
            
            const roomIdDisplay = document.querySelector('.room-id-display');
            const userCountDisplay = document.querySelector('.user-count-display');
            
            if (roomIdDisplay) roomIdDisplay.textContent = `Room: ${data.roomId}`;
            if (userCountDisplay) userCountDisplay.textContent = `Users: ${data.userCount}`;
            
            if (this.watchMode === 'couple' && data.userCount > 2) {
                alert('⚠️ Couple Mode only allows 2 users. This room is full!');
                this.clearApplicationState();
                window.location.reload();
                return;
            }
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('👤 User joined:', data);
            const userCountDisplay = document.querySelector('.user-count-display');
            if (userCountDisplay) userCountDisplay.textContent = `Users: ${data.userCount}`;
            this.onlineUsers.textContent = `${data.users.join(', ')} online`;
            
            const modeEmoji = this.watchMode === 'couple' ? '💕' : '🎉';
            this.addChatMessage('System', `${modeEmoji} ${data.username} joined the room`, 'system');
        });
        
        this.socket.on('user-left', (data) => {
            console.log('👋 User left:', data);
            const userCountDisplay = document.querySelector('.user-count-display');
            if (userCountDisplay) userCountDisplay.textContent = `Users: ${data.userCount}`;
            this.onlineUsers.textContent = `${data.users.join(', ')} online`;
            this.addChatMessage('System', `${data.username} left the room`, 'system');
        });
        
        this.socket.on('room-full', (data) => {
            alert(`❌ Room is full! ${this.watchMode === 'couple' ? 'Couple Mode' : 'Watch Party'} limit: ${data.maxUsers} users`);
            this.clearApplicationState();
            window.location.reload();
        });
        
        // 🎯 FIXED: Handle media sync for both direct video AND YouTube
        this.socket.on('media-sync', (data) => {
            console.log('🔄 [SYNC] Received:', data);
            
            if (data.username === this.username) {
                console.log('⏭️ [SYNC] Ignoring own event');
                return;
            }
            
            this.isSyncing = true;
            
            // Check if it's YouTube or direct video
            if (data.isYouTube && this.youtubePlayerAPI) {
                console.log('📺 [SYNC] YouTube player');
                this.syncYouTubePlayer(data);
            } else if (!this.directPlayer.classList.contains('hidden')) {
                console.log('🎬 [SYNC] Direct player');
                this.syncDirectPlayer(data);
            }
            
            setTimeout(() => {
                this.isSyncing = false;
            }, 500);
            
            this.addChatMessage('System', `${data.username} ${data.action}ed the video`, 'system');
        });
        
        this.socket.on('media-loaded', (data) => {
            console.log('🎬 Media loaded by other user:', data);
            this.handleRemoteMediaLoad(data);
        });
        
        this.socket.on('sync-check', (data) => {
            if (this.isSyncing) return;
            
            // Auto-correct for direct player only
            if (!this.directPlayer.classList.contains('hidden')) {
                const timeDiff = Math.abs(this.directPlayer.currentTime - data.currentTime);
                const playStateDiff = this.directPlayer.paused === data.isPlaying;
                
                if (timeDiff > 2 || playStateDiff) {
                    console.log('🔧 Auto-correcting direct player sync...');
                    this.isSyncing = true;
                    
                    this.directPlayer.currentTime = data.currentTime;
                    
                    if (data.isPlaying && this.directPlayer.paused) {
                        this.directPlayer.play().catch(e => console.log('Auto-play blocked:', e));
                    } else if (!data.isPlaying && !this.directPlayer.paused) {
                        this.directPlayer.pause();
                    }
                    
                    setTimeout(() => this.isSyncing = false, 500);
                }
            }
        });
        
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data.username, data.message, 'other');
        });
    }

    // 🎯 NEW: Sync YouTube player using API
    syncYouTubePlayer(data) {
        if (!this.youtubePlayerAPI) return;
        
        try {
            const currentTime = this.youtubePlayerAPI.getCurrentTime();
            const timeDiff = Math.abs(currentTime - data.currentTime);
            
            // Seek if difference > 2 seconds
            if (timeDiff > 2 || data.action === 'seek' || data.forceSeek) {
                console.log(`📺 [YOUTUBE] Seeking to ${data.currentTime}s`);
                this.youtubePlayerAPI.seekTo(data.currentTime, true);
            }
            
            // Apply play/pause
            if (data.action === 'play') {
                console.log('▶️ [YOUTUBE] Playing');
                this.youtubePlayerAPI.playVideo();
            } else if (data.action === 'pause') {
                console.log('⏸️ [YOUTUBE] Pausing');
                this.youtubePlayerAPI.pauseVideo();
            }
        } catch (error) {
            console.error('YouTube sync error:', error);
        }
    }

    // 🎯 Sync direct video player
    syncDirectPlayer(data) {
        const timeDiff = Math.abs(this.directPlayer.currentTime - data.currentTime);
        
        if (timeDiff > 1 || data.action === 'seek' || data.forceSeek) {
            console.log(`⏭️ [DIRECT] Seeking to ${data.currentTime}s`);
            this.directPlayer.currentTime = data.currentTime;
        }
        
        if (data.action === 'play') {
            console.log('▶️ [DIRECT] Playing');
            if (this.directPlayer.paused) {
                this.directPlayer.play().catch(e => console.log('Play blocked:', e));
            }
        } else if (data.action === 'pause') {
            console.log('⏸️ [DIRECT] Pausing');
            if (!this.directPlayer.paused) {
                this.directPlayer.pause();
            }
        }
    }

    joinRoom() {
        const username = this.usernameInput.value.trim();
        const roomId = this.roomIdInput.value.trim();
        
        if (!username) {
            alert('Please enter your name');
            return;
        }
        
        if (roomId && !/^[A-Za-z0-9]{4,10}$/.test(roomId)) {
            alert('Invalid Room ID format. Must be 4-10 alphanumeric characters.');
            return;
        }
        
        this.watchMode = localStorage.getItem('watchMode') || 'party';
        this.maxUsers = parseInt(localStorage.getItem('maxUsers')) || 50;
        
        this.username = username;
        
        if (!roomId) {
            this.roomId = this.generateRoomId();
            this.isHost = true;
            this.completeRoomJoin();
        } else {
            this.validateAndJoinRoom(roomId, username);
        }
    }
    
    async validateAndJoinRoom(roomId, username) {
        try {
            const response = await fetch(`/api/room/${roomId}/validate`);
            const data = await response.json();
            
            if (!data.exists) {
                alert(`Room "${roomId}" does not exist. Please check the Room ID.`);
                return;
            }
            
            this.roomId = roomId;
            this.isHost = false;
            this.completeRoomJoin();
        } catch (error) {
            console.error('Room validation failed:', error);
            alert('Unable to validate room. Please try again.');
        }
    }
    
    completeRoomJoin() {
        this.roomSetup.classList.add('hidden');
        this.mediaSection.classList.remove('hidden');
        
        const roomIdDisplay = document.querySelector('.room-id-display');
        const userCountDisplay = document.querySelector('.user-count-display');
        
        if (roomIdDisplay) roomIdDisplay.textContent = `Room: ${this.roomId}`;
        if (userCountDisplay) userCountDisplay.textContent = 'Users: 1';
        
        const roomNavLink = document.querySelector('.room-nav-link');
        const usersNavLink = document.querySelector('.users-nav-link');
        
        if (roomNavLink) roomNavLink.setAttribute('data-status', 'connected');
        if (usersNavLink) usersNavLink.setAttribute('data-status', 'connected');
        
        if (this.isHost) {
            const modeEmoji = this.watchMode === 'couple' ? '💕' : '🎉';
            const modeName = this.watchMode === 'couple' ? 'Couple Mode' : 'Watch Party';
            this.addChatMessage('System', `${modeEmoji} Welcome, ${this.username}! ${modeName} created: ${this.roomId}`, 'system');
            this.copyRoomDetails();
        } else {
            const modeEmoji = this.watchMode === 'couple' ? '💕' : '🎉';
            this.addChatMessage('System', `${modeEmoji} Welcome, ${this.username}! Joined room: ${this.roomId}`, 'system');
        }
        
        if (this.socket) {
            this.socket.emit('join-room', {
                roomId: this.roomId,
                username: this.username,
                watchMode: this.watchMode,
                maxUsers: this.maxUsers
            });
        }
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    copyRoomDetails() {
        const showToast = (message) => {
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 20px;background:rgba(0,0,0,0.8);color:white;border-radius:5px;z-index:9999;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(this.roomId)
                .then(() => {
                    showToast('Room ID copied!');
                    this.addChatMessage('System', 'Room ID copied! Share with friends.', 'system');
                })
                .catch(err => console.error('Copy failed:', err));
        }
    }

    async handleVideoFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const maxSize = 5 * 1024 * 1024 * 1024;
        if (file.size > maxSize) {
            this.addChatMessage('System', `File too large. Max: 5GB`, 'system');
            return;
        }
        
        this.addChatMessage('System', `Uploading ${file.name}...`, 'system');
        
        try {
            const formData = new FormData();
            formData.append('video', file);
            
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.loadDirectVideo(result.url);
                this.socket.emit('media-load', {
                    roomId: this.roomId,
                    type: 'video',
                    source: result.url,
                    isYouTube: false
                });
                
                this.addChatMessage('System', `${this.username} loaded: ${file.name}`, 'system');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.addChatMessage('System', `Upload failed: ${error.message}`, 'system');
        }
    }

    loadVideoFromUrl() {
        const url = this.videoUrl.value.trim();
        if (!url) return;
        
        const videoId = this.extractYouTubeId(url);
        
        if (videoId) {
            this.loadYouTubeVideo(videoId);
            this.socket.emit('media-load', {
                roomId: this.roomId,
                type: 'video',
                source: videoId,
                isYouTube: true
            });
            this.addChatMessage('System', `${this.username} loaded YouTube video`, 'system');
        } else {
            this.loadDirectVideo(url);
            this.socket.emit('media-load', {
                roomId: this.roomId,
                type: 'video',
                source: url,
                isYouTube: false
            });
            this.addChatMessage('System', `${this.username} loaded video`, 'system');
        }
        
        this.videoUrl.value = '';
    }

    // 🎯 NEW: Load YouTube with API
    loadYouTubeVideo(videoId) {
        this.directPlayer.classList.add('hidden');
        this.youtubePlayer.classList.remove('hidden');
        
        // Destroy old player if exists
        if (this.youtubePlayerAPI) {
            this.youtubePlayerAPI.destroy();
        }
        
        // Create new YouTube player with API
        this.youtubePlayerAPI = new YT.Player(this.youtubePlayer, {
            videoId: videoId,
            playerVars: {
                autoplay: 0,
                controls: 1,
                enablejsapi: 1,
                modestbranding: 1,
                rel: 0
            },
            events: {
                onReady: (event) => {
                    console.log('✅ YouTube player ready');
                },
                onStateChange: (event) => {
                    if (this.isSyncing) return;
                    
                    const state = event.data;
                    const currentTime = this.youtubePlayerAPI.getCurrentTime();
                    
                    // YT.PlayerState: PLAYING = 1, PAUSED = 2
                    if (state === 1) { // Playing
                        console.log('[BROADCAST] YouTube PLAY');
                        this.socket.emit('play', {
                            roomId: this.roomId,
                            currentTime: currentTime,
                            isYouTube: true
                        });
                    } else if (state === 2) { // Paused
                        console.log('[BROADCAST] YouTube PAUSE');
                        this.socket.emit('pause', {
                            roomId: this.roomId,
                            currentTime: currentTime,
                            isYouTube: true
                        });
                    }
                }
            }
        });
    }

    loadDirectVideo(url) {
        this.youtubePlayer.classList.add('hidden');
        this.directPlayer.classList.remove('hidden');
        this.directPlayer.src = url;
        
        // Destroy YouTube player if exists
        if (this.youtubePlayerAPI) {
            this.youtubePlayerAPI.destroy();
            this.youtubePlayerAPI = null;
        }
    }

    extractYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    handleRemoteMediaLoad(data) {
        const { type, source, username, isYouTube } = data;
        
        if (username === this.username) return;
        if (type !== 'video') return;
        
        let videoSource = typeof source === 'object' ? source.source : source;
        
        if (!videoSource) {
            console.error('Invalid source:', source);
            return;
        }
        
        if (isYouTube) {
            this.loadYouTubeVideo(videoSource);
        } else {
            this.loadDirectVideo(videoSource);
        }
        
        this.addChatMessage('System', `${username} loaded a video`, 'system');
    }

    sendChatMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;
        
        this.addChatMessage(this.username, message, 'own');
        this.messageInput.value = '';
        
        this.socket.emit('chat-message', {
            roomId: this.roomId,
            message: message
        });
    }

    addChatMessage(username, message, type = 'other') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        if (type === 'system') {
            messageDiv.innerHTML = `
                <div class="message-content">${message}</div>
                <div class="timestamp">${timestamp}</div>
            `;
            messageDiv.style.background = '#e3f2fd';
            messageDiv.style.color = '#1976d2';
            messageDiv.style.alignSelf = 'center';
            messageDiv.style.fontStyle = 'italic';
        } else {
            messageDiv.innerHTML = `
                ${type === 'other' ? `<div class="username">${username}</div>` : ''}
                <div class="message-content">${message}</div>
                <div class="timestamp">${timestamp}</div>
            `;
        }
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    updateConnectionStatus(status) {
        this.connectionStatus.className = `connection-status ${status}`;
        
        switch (status) {
            case 'connecting':
                this.connectionStatus.innerHTML = '<i class="fa-solid fa-circle-nodes"></i> Connecting...';
                break;
            case 'connected':
                this.connectionStatus.innerHTML = '<i class="fa-solid fa-wifi"></i> Connected';
                break;
            case 'disconnected':
                this.connectionStatus.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnected';
                break;
        }
    }    
    
    initializeThemeToggle() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }
    
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }
    
    updateThemeIcon(theme) {
        const icon = this.themeToggle.querySelector('i');
        if (theme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
    
    toggleChat() {
        this.chatMinimized = !this.chatMinimized;
        if (this.chatMinimized) {
            this.chatContainer.classList.add('minimized');
            this.chatMinimize.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>';
        } else {
            this.chatContainer.classList.remove('minimized');
            this.chatMinimize.innerHTML = '<i class="fa-solid fa-down-left-and-up-right-to-center"></i>';
        }
    }

    handleHomeNavigation(event) {
        event.preventDefault();
        if (!this.mediaSection.classList.contains('hidden')) {
            if (confirm('Return home? All current states will be cleared.')) {
                this.clearApplicationState();
                window.location.href = 'index.html';
            }
        } else {
            window.location.href = 'index.html';
        }
    }

    clearApplicationState() {
        this.roomId = null;
        this.username = null;
        this.isHost = false;
        localStorage.removeItem('videoState');
        if (this.youtubePlayerAPI) {
            this.youtubePlayerAPI.destroy();
            this.youtubePlayerAPI = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
    
    updateFooterYear() {
        const yearElement = document.getElementById('currentYear');
        if (yearElement) yearElement.textContent = new Date().getFullYear();
    }

    setupScrollEffects() {
        const header = document.querySelector('.header');
        if (!header) return;

        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new SyncWatch();
    window.app = app;
    initializeNavigation();
});

function initializeNavigation() {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    
    if (mobileMenuToggle && navMenu) {
        mobileMenuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            const icon = mobileMenuToggle.querySelector('i');
            if (navMenu.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }
    
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (navMenu && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
            }
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
}
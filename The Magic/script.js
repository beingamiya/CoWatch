class SyncWatch {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.username = null;
        this.isHost = false;
        this.syncTolerance = 1; // seconds
        this.lastSyncTime = 0;
        this.youtubeStartTime = 0; // Track when YouTube video started playing
        this.chatMinimized = false;
        this.isSyncing = false; // Flag to prevent sync loops
        this.videoState = { isPaused: true }; // Track video state
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializeThemeToggle();
        this.initializeSocketConnection();
        this.updateFooterYear();
        this.setupScrollEffects();
    }

    initializeElements() {
        // Room setup elements
        this.roomSetup = document.getElementById('roomSetup');
        this.mediaSection = document.getElementById('mediaSection');
        this.usernameInput = document.getElementById('usernameInput');
        this.roomIdInput = document.getElementById('roomIdInput');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        
        // Media elements - using correct HTML IDs
        this.directPlayer = document.getElementById('directPlayer');
        this.youtubePlayer = document.getElementById('youtubePlayer');
        this.videoFile = document.getElementById('videoFile');
        this.videoUrl = document.getElementById('videoUrl');
        this.loadVideoUrl = document.getElementById('loadVideoUrl');
        
        // Chat elements
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendMessage = document.getElementById('sendMessage');
        
        // Status elements (using navigation elements instead of removed room info elements)
        this.syncStatus = document.getElementById('syncStatus');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.onlineUsers = document.getElementById('onlineUsers');
        
        // New elements for theme and chat
        this.themeToggle = document.getElementById('themeToggle');
        this.chatMinimize = document.getElementById('chatMinimize');
        this.chatContainer = document.querySelector('.chat-container');
        
        // Handle external links to open in new tab while preserving video state
        document.querySelectorAll('a[target="_blank"]').forEach(link => {
            link.addEventListener('click', (e) => {
                // Store current video state before opening link
                if (this.directPlayer && !this.directPlayer.classList.contains('hidden')) {
                    localStorage.setItem('videoState', JSON.stringify({
                        currentTime: this.directPlayer.currentTime,
                        isPaused: this.directPlayer.paused
                    }));
                }
            });
        });
    }

    attachEventListeners() {
        // Room setup
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Media file uploads
        this.videoFile.addEventListener('change', (e) => this.handleVideoFile(e));
        
        // URL loading
        this.loadVideoUrl.addEventListener('click', () => this.loadVideoFromUrl());
        
        // Media player events - for both direct video and YouTube players
        if (this.directPlayer) {
            this.directPlayer.addEventListener('play', () => {
                console.log(`[EVENT] Direct player play event, isSyncing: ${this.isSyncing}`);
                // Only broadcast if this is a user-initiated play (not from sync)
                if (!this.isSyncing) {
                    console.log(`[EVENT] Broadcasting play event`);
                    this.onMediaPlay('video');
                } else {
                    console.log(`[EVENT] Skipping play broadcast - isSyncing is true`);
                }
            });
            this.directPlayer.addEventListener('pause', () => {
                console.log(`[EVENT] Direct player pause event, isSyncing: ${this.isSyncing}`);
                // Only broadcast if this is a user-initiated pause (not from sync)
                if (!this.isSyncing) {
                    console.log(`[EVENT] Broadcasting pause event`);
                    this.onMediaPause('video');
                } else {
                    console.log(`[EVENT] Skipping pause broadcast - isSyncing is true`);
                }
            });
            this.directPlayer.addEventListener('seeked', () => {
                console.log(`[EVENT] Direct player seeked event, isSyncing: ${this.isSyncing}, currentTime: ${this.directPlayer.currentTime}`);
                // Only broadcast if this is a user-initiated seek (not from sync)
                if (!this.isSyncing) {
                    console.log(`[EVENT] Broadcasting seek event`);
                    this.onMediaSeek('video');
                } else {
                    console.log(`[EVENT] Skipping seek broadcast - isSyncing is true`);
                }
            });
            this.directPlayer.addEventListener('timeupdate', () => this.onTimeUpdate('video'));
        }
        

        
        // Chat
        this.sendMessage.addEventListener('click', () => this.sendChatMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        
        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // Chat minimize/maximize
        this.chatMinimize.addEventListener('click', () => this.toggleChat());

        // Home button confirmation
        const homeButton = document.querySelector('.nav-link[data-section="home"]');
        if (homeButton) {
            homeButton.addEventListener('click', (e) => this.handleHomeNavigation(e));
        }
        

    }

    initializeSocketConnection() {
        this.updateConnectionStatus('connecting');
        
        // Connect to real Socket.IO server
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server:', this.socket.id);
            this.updateConnectionStatus('connected');
            
            // Restore video state if returning from external link
            this.restoreVideoState();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
        });
        
        // Handle room events
        this.socket.on('room-joined', (data) => {
            console.log('Room joined:', data);
            
            // Update room ID display
            const roomIdDisplay = document.querySelector('.room-id-display');
            if (roomIdDisplay && data.roomId) {
                roomIdDisplay.textContent = `Room: ${data.roomId}`;
            }
            
            // Update user count display
            const userCountDisplay = document.querySelector('.user-count-display');
            if (userCountDisplay) {
                userCountDisplay.textContent = `Users: ${data.userCount}`;
            }
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('User joined:', data);
            const userCountDisplay = document.querySelector('.user-count-display');
            if (userCountDisplay) {
                userCountDisplay.textContent = `Users: ${data.userCount}`;
            }
            this.onlineUsers.textContent = `${data.users.join(', ')} online`;
            this.addChatMessage('System', `${data.username} joined the room`, 'system');
        });
        
        this.socket.on('user-left', (data) => {
            console.log('User left:', data);
            const userCountDisplay = document.querySelector('.user-count-display');
            if (userCountDisplay) {
                userCountDisplay.textContent = `Users: ${data.userCount}`;
            }
            this.onlineUsers.textContent = `${data.users.join(', ')} online`;
            this.addChatMessage('System', `${data.username} left the room`, 'system');
        });
        
        // Handle media synchronization
        this.socket.on('media-sync', (data) => {
            console.log('Media sync received:', data);
            this.handleMediaSync(data);
        });
        
        this.socket.on('media-loaded', (data) => {
            console.log('Media loaded by other user:', data);
            this.handleRemoteMediaLoad(data);
        });
        
        // Handle room state updates (for late joiners)
        this.socket.on('room-state', (data) => {
            console.log('Room state received:', data);
            
            // Update user count from room state
            const userCountDisplay = document.querySelector('.user-count-display');
            if (userCountDisplay && data.userCount) {
                userCountDisplay.textContent = `Users: ${data.userCount}`;
            }
            
            // Update online users list
            if (data.users && this.onlineUsers) {
                this.onlineUsers.textContent = `${data.users.join(', ')} online`;
            }
            
            if (data.currentMedia && data.currentMedia.video) {
                console.log('Room has existing media, loading...');
                this.handleRemoteMediaLoad({
                    type: 'video',
                    source: data.currentMedia.video,
                    username: 'System',
                    currentTime: data.mediaState.currentTime || 0
                });
                
                // Apply current play state after a delay
                setTimeout(() => {
                    if (data.mediaState) {
                        console.log(`Applying media state: ${data.mediaState.isPlaying ? 'play' : 'pause'} at ${data.mediaState.currentTime}s`);
                        this.handleMediaSync({
                            action: data.mediaState.isPlaying ? 'play' : 'pause',
                            type: 'video',
                            currentTime: data.mediaState.currentTime,
                            timestamp: data.mediaState.lastUpdate,
                            username: 'System'
                        });
                    }
                }, 3000);
            }
        });
        
        // Handle media state requests from late joiners
        this.socket.on('request-media-state', (data) => {
            const { username } = data;
            if (this.isHost) {
                // Only host responds to media state requests
                this.sendCurrentMediaState(username);
            }
        });
        
        // Listen for request-media-state-trigger events (server-initiated)
        this.socket.on('request-media-state-trigger', (data) => {
            console.log('Server triggered media state request for room:', data.roomId);
            // Request media state from all users in the room (host will respond)
            this.socket.emit('request-media-state', {
                roomId: this.roomId,
                username: this.username
            });
        });
        
        // Handle chat messages
        this.socket.on('chat-message', (data) => {
            console.log('Chat message received:', data);
            this.addChatMessage(data.username, data.message, 'other');
        });
    }

    joinRoom() {
        const username = this.usernameInput.value.trim();
        const roomId = this.roomIdInput.value.trim();
        
        if (!username) {
            alert('Please enter your name');
            return;
        }
        
        // Validate room ID format if provided (only allow alphanumeric and 4-10 characters)
        if (roomId && !/^[A-Za-z0-9]{4,10}$/.test(roomId)) {
            alert('Invalid Room ID format. Room ID must be 4-10 characters long and contain only letters and numbers.');
            return;
        }
        
        this.username = username;
        
        // If no room ID provided, create a new one
        if (!roomId) {
            this.roomId = this.generateRoomId();
            this.isHost = true;
        } else {
            // Validate that the room exists on server before joining
            this.validateAndJoinRoom(roomId, username);
            return;
        }
        
        // Continue with room creation (host flow)
        this.completeRoomJoin();
    }
    
    async validateAndJoinRoom(roomId, username) {
        try {
            // Check if room exists on server
            const response = await fetch(`/api/room/${roomId}/validate`);
            const data = await response.json();
            
            if (!data.exists) {
                alert(`Room "${roomId}" does not exist. Please check the Room ID and try again.`);
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
        // Hide room setup and show media section
        this.roomSetup.classList.add('hidden');
        this.mediaSection.classList.remove('hidden');
        
        // Update UI - use navigation elements instead of removed room info elements
        const roomIdDisplay = document.querySelector('.room-id-display');
        const userCountDisplay = document.querySelector('.user-count-display');
        
        if (roomIdDisplay) {
            roomIdDisplay.textContent = `Room: ${this.roomId}`;
        }
        if (userCountDisplay) {
            userCountDisplay.textContent = 'Users: 1';
        }
        
        // Update connection status styling
        const roomNavLink = document.querySelector('.room-nav-link');
        const usersNavLink = document.querySelector('.users-nav-link');
        
        if (roomNavLink) {
            roomNavLink.setAttribute('data-status', 'connected');
        }
        if (usersNavLink) {
            usersNavLink.setAttribute('data-status', 'connected');
        }
        
        // Add welcome message and copy room details if host
       if (this.isHost) {
    this.addChatMessage(
        'System',
        `✨ Welcome, ${this.username}! You've created a CoWatch room — <strong>${this.roomId}</strong>. Share this ID with friends to start watching together!`,
        'system'
    );
    
    // Automatically copy room details to clipboard
    this.copyRoomDetails();
} else {
    this.addChatMessage(
        'System',
        `👋 Welcome, ${this.username}! You've joined CoWatch room <strong>${this.roomId}</strong>. Sit back and enjoy the show!`,
        'system'
    );
}

        
        // Simulate joining room
        if (this.socket) {
            console.log(`Joining room ${this.roomId} as ${this.username}`);
            this.socket.emit('join-room', {
                roomId: this.roomId,
                username: this.username
            });
            
            // Request current media state when joining (for late joiners)
            if (!this.isHost) {
                console.log('Late joiner detected, requesting media state...');
                setTimeout(() => {
                    this.socket.emit('request-media-state', {
                        roomId: this.roomId,
                        username: this.username
                    });
                    this.addChatMessage('System', 'Requesting current media state from host...', 'system');
                }, 3000);
            }
        }
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    copyRoomDetails() {
    const showToast = (message) => {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.padding = '10px 20px';
        toast.style.backgroundColor = 'rgba(0,0,0,0.8)';
        toast.style.color = 'white';
        toast.style.borderRadius = '5px';
        toast.style.zIndex = '9999';
        toast.style.fontFamily = 'Arial, sans-serif';
        toast.style.fontSize = '14px';
        toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 2000); // disappears after 2 seconds
    };

    // Only copy the room ID
    const roomId = this.roomId;

    // Try to copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(roomId)
            .then(() => {
                showToast('Room ID copied to clipboard!');
                this.addChatMessage('System', 'Room ID copied to clipboard! Share with friends to join.', 'system');
            })
            .catch(err => {
                console.error('Failed to copy room ID:', err);
                this.addChatMessage('System', 'Room ID: ' + roomId, 'system');
            });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = roomId;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Room ID copied to clipboard!');
            this.addChatMessage('System', 'Room ID copied to clipboard! Share with friends to join.', 'system');
        } catch (err) {
            console.error('Failed to copy room ID (fallback):', err);
            this.addChatMessage('System', 'Room ID: ' + roomId, 'system');
        }
        document.body.removeChild(textArea);
    }
}


    async handleVideoFile(event) {
        const file = event.target.files[0];
        if (file) {
            // Client-side file size check (5GB limit)
            const maxSize = 5 * 1024 * 1024 * 1024; // 5GB in bytes
            if (file.size > maxSize) {
                this.addChatMessage('System', `File too large: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB). Maximum file size is 5GB.`, 'system');
                return;
            }
            
            // Show upload progress
            this.addChatMessage('System', `Uploading ${file.name}...`, 'system');
            
            try {
                // Upload file to server
                const formData = new FormData();
                formData.append('video', file);
                
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Upload failed');
                }
                
                const result = await response.json();
                
                if (result.success) {
                    // Use the server URL for the video
                    this.directPlayer.src = result.url;
                    this.directPlayer.classList.remove('hidden');
                    this.youtubePlayer.classList.add('hidden');
                    
                    // Broadcast the server URL so other users can access it
                    this.broadcastMediaLoad('video', result.url);
                    this.addChatMessage('System', `${this.username} loaded video: ${file.name}`, 'system');
                    
                    console.log('File uploaded successfully:', result.url);
                } else {
                    throw new Error(result.error || 'Upload failed');
                }
            } catch (error) {
                console.error('Upload error:', error);
                this.addChatMessage('System', `Upload failed: ${error.message}`, 'system');
                
                // Fallback to local blob URL (only works for current user)
                const url = URL.createObjectURL(file);
                this.directPlayer.src = url;
                this.directPlayer.classList.remove('hidden');
                this.youtubePlayer.classList.add('hidden');
                this.addChatMessage('System', `${this.username} loaded video locally (not shared)`, 'system');
            }
        }
    }



    loadVideoFromUrl() {
        const url = this.videoUrl.value.trim();
        if (url) {
            // Extract video ID from YouTube URL
            const videoId = this.extractYouTubeId(url);
            
            if (videoId) {
                // Create embedded YouTube URL with API parameters
                const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&modestbranding=1&rel=0&fs=1`;
                this.youtubePlayer.src = embedUrl;
                this.youtubePlayer.classList.remove('hidden');
                this.directPlayer.classList.add('hidden');
                this.broadcastMediaLoad('video', embedUrl);
                this.addChatMessage('System', `${this.username} loaded YouTube video`, 'system');
            } else {
                // Handle non-YouTube URLs
                this.directPlayer.src = url;
                this.directPlayer.classList.remove('hidden');
                this.youtubePlayer.classList.add('hidden');
                this.broadcastMediaLoad('video', url);
                this.addChatMessage('System', `${this.username} loaded video from URL`, 'system');
            }
            this.videoUrl.value = '';
        }
    }

    extractYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }


    onMediaPlay(type) {
        const currentTime = this.getCurrentPlayerTime();
        this.broadcastMediaEvent('play', type, currentTime);
        this.updateSyncStatus('synced');
        this.videoState.isPaused = false;
        this.updateSyncedUI(false);
    }

    onMediaPause(type) {
        const currentTime = this.getCurrentPlayerTime();
        this.broadcastMediaEvent('pause', type, currentTime);
        this.updateSyncStatus('synced');
        this.videoState.isPaused = true;
        this.updateSyncedUI(true);
    }

    onMediaSeek(type) {
        const currentTime = this.getCurrentPlayerTime();
        this.broadcastMediaEvent('seek', type, currentTime);
        this.updateSyncStatus('synced');
    }

    getCurrentPlayerTime() {
        // Check which player is active and return its current time
        const isYouTubeActive = !this.youtubePlayer.classList.contains('hidden');
        const isDirectVideoActive = !this.directPlayer.classList.contains('hidden');
        
        if (isYouTubeActive) {
            // For YouTube, we'll estimate time based on when the video started playing
            // This is a simplified approach - in a real implementation you'd use the YouTube API
            return this.youtubeStartTime || 0;
        } else if (isDirectVideoActive) {
            return this.directPlayer.currentTime;
        }
        
        return 0;
    }

    onTimeUpdate(type) {
        // Periodically check sync status
        const now = Date.now();
        if (now - this.lastSyncTime > 5000) { // Check every 5 seconds
            this.checkSyncStatus(type);
            this.lastSyncTime = now;
        }
    }

    broadcastMediaEvent(action, type, currentTime) {
        if (this.socket) {
            this.socket.emit('media-event', {
                roomId: this.roomId,
                action: action,
                type: type,
                currentTime: currentTime,
                timestamp: Date.now(),
                username: this.username
            });
        }
    }

    broadcastMediaLoad(type, source) {
        if (this.socket) {
            this.socket.emit('media-load', {
                roomId: this.roomId,
                type: type,
                source: source,
                username: this.username
            });
        }
    }

    handleMediaSync(data) {
        const { action, type, currentTime, username } = data;
        
        console.log(`[SYNC] Received sync event: ${action}, currentTime: ${currentTime}, isSyncing: ${this.isSyncing}`);
        
        // Don't sync our own events
        if (username === this.username) return;
        
        // Only handle video sync (audio removed)
        if (type !== 'video') return;
        
        // Check which player is currently active
        const isYouTubeActive = !this.youtubePlayer.classList.contains('hidden');
        const isDirectVideoActive = !this.directPlayer.classList.contains('hidden');
        
        // Prevent rapid sync events (debounce)
        const now = Date.now();
        if (this.lastSyncTime && (now - this.lastSyncTime) < 500) {
            console.log(`[SYNC] Skipping sync event - debounce`);
            return; // Ignore sync events within 500ms
        }
        this.lastSyncTime = now;
        
        if (this.isSyncing) {
            console.log(`[SYNC] Skipping sync event - isSyncing is true`);
            return;
        }
        
        // Reset seek flag for seek actions to ensure they're processed
        if (action === 'seek') {
            this.hasPerformedInitialSeek = false;
        }
        
        // Set sync flag to prevent event loops
        this.isSyncing = true;
        
        // Update UI to show sync status
        this.updateSyncedUI(action === 'pause');
        
        if (isYouTubeActive) {
            // Handle YouTube synchronization
            if (this.youtubePlayer.contentWindow) {
                switch (action) {
                    case 'play':
                        this.youtubePlayer.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                        this.youtubeStartTime = Date.now() - (currentTime * 1000); // Estimate start time based on sync time
                        break;
                    case 'pause':
                        this.youtubePlayer.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                        break;
                    case 'seek':
                        // YouTube seek command (convert to seconds if needed)
                        this.youtubePlayer.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${currentTime}, true]}`, '*');
                        this.youtubeStartTime = Date.now() - (currentTime * 1000); // Update estimated start time
                        break;
                }
            }
        } else if (isDirectVideoActive) {
            // Handle direct video synchronization with tolerance
            const currentVideoTime = this.directPlayer.currentTime;
            const timeDifference = Math.abs(currentVideoTime - currentTime);
            
            // Always seek for explicit seek actions, or if time difference is significant
            if (action === 'seek' || timeDifference > 2) {
                console.log(`[SYNC] Setting video time to ${currentTime}`);
                this.directPlayer.currentTime = currentTime;
            }
            
            switch (action) {
                case 'play':
                    if (this.directPlayer.paused) {
                        this.directPlayer.play().catch(e => console.log('Play failed:', e));
                    }
                    break;
                case 'pause':
                    if (!this.directPlayer.paused) {
                        this.directPlayer.pause();
                    }
                    break;
            }
        }
        
        // Clear sync flag after longer delay to prevent race conditions
        setTimeout(() => {
            console.log(`[SYNC] Clearing isSyncing flag`);
            this.isSyncing = false;
        }, 1000); // Increased from 100ms to 1000ms to allow video operations to complete
        
        this.addChatMessage('System', `${username} ${action}ed the ${type}`, 'system');
    }
    
    handleRemoteMediaLoad(data) {
        const { type, source, username, currentTime = 0 } = data;
        
        if (username === this.username) return;
        
        // Only handle video (audio removed)
        if (type !== 'video') return;
        
        console.log(`[MEDIA] Received media load: type=${type}, source=${source}, username=${username}, currentTime=${currentTime}`);
        console.log(`[MEDIA] Data object:`, data);
        
        // Reset the seek flag for new media loads
        this.hasPerformedInitialSeek = false;
        
        // Handle source parameter which might be an object or string
        let videoSource = source;
        
        // If source is an object (from room.currentMedia.video), extract the source property
        if (typeof source === 'object' && source !== null) {
            console.log('[MEDIA] Source is an object, extracting source property');
            videoSource = source.source || '';
            console.log(`[MEDIA] Extracted source: ${videoSource}`);
        }
        
        // Validate the extracted source
        if (!videoSource || typeof videoSource !== 'string') {
            console.error('[ERROR] Invalid source parameter after extraction:', videoSource);
            console.error('[ERROR] Full data object:', data);
            return;
        }
        
        // Check if it's a YouTube URL
        if (videoSource.includes('youtube.com/embed')) {
            console.log(`[SYNC] Loading YouTube video: ${videoSource}`);
            this.youtubePlayer.src = videoSource;
            this.youtubePlayer.classList.remove('hidden');
            this.directPlayer.classList.add('hidden');
            this.youtubeStartTime = 0; // Reset start time for new video
            
            // Set up multiple attempts for YouTube player
            const setupYouTubePlayer = () => {
                setTimeout(() => {
                    if (this.youtubePlayer.contentWindow) {
                        console.log(`[SYNC] YouTube player ready, currentTime: ${currentTime}`);
                        
                        // First pause any existing playback and wait for it to complete
                        this.youtubePlayer.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                        
                        // Wait a bit after pausing before seeking
                        setTimeout(() => {
                            // If currentTime is provided, seek to that position
                            if (currentTime && currentTime > 0) {
                                console.log(`[SYNC] Seeking YouTube to ${currentTime}`);
                                this.youtubePlayer.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${currentTime}, true]}`, '*');
                                this.youtubeStartTime = Date.now() - (currentTime * 1000);
                                
                                // Verify the seek worked after a delay
                                setTimeout(() => {
                                    console.log(`[SYNC] YouTube seek completed to ${currentTime}`);
                                }, 1000);
                            }
                            
                            this.addChatMessage('System', 'YouTube video loaded.', 'system');
                        }, 1000);
                    } else {
                        console.log(`[SYNC] YouTube player not ready, retrying...`);
                        setupYouTubePlayer(); // Retry
                    }
                }, 3000);
            };
            
            this.youtubePlayer.onload = setupYouTubePlayer;
            // Fallback in case onload doesn't fire
            setTimeout(setupYouTubePlayer, 4000);
            
        } else {
            console.log(`[SYNC] Loading direct video: ${videoSource}`);
            // Handle direct video file - now using server URLs
            this.directPlayer.src = videoSource;
            this.directPlayer.classList.remove('hidden');
            this.youtubePlayer.classList.add('hidden');
            

            
            // Flag to track if seeking has been performed
            this.hasPerformedInitialSeek = false;
            
            // Set up comprehensive loading and seeking logic
            const seekAndSetup = () => {
                // Only perform the seek once to avoid repeated attempts
                if (!this.hasPerformedInitialSeek && this.directPlayer.readyState >= 1) {
                    console.log(`[SYNC] Performing one-time seek to ${currentTime}`);
                    
                    // Try to seek if currentTime is provided
                    if (currentTime && currentTime > 0) {
                        this.directPlayer.currentTime = currentTime;
                    }
                    
                    // Mark that we've performed the seek
                    this.hasPerformedInitialSeek = true;
                    
                    // Try to play
                    this.directPlayer.play().catch(e => {
                        console.log('Auto-play failed:', e);
                        this.addChatMessage('System', 'Click play on the video controls to start watching', 'system');
                    });
                }
            };
            
            // Set up multiple event listeners for robust loading, but only one will actually perform the seek
            this.directPlayer.onloadedmetadata = () => {
                console.log(`[SYNC] Metadata loaded`);
                seekAndSetup();
            };
            
            this.directPlayer.onloadeddata = () => {
                console.log(`[SYNC] Data loaded`);
                seekAndSetup();
            };
            
            this.directPlayer.oncanplay = () => {
                console.log(`[SYNC] Can play`);
                seekAndSetup();
            };
            
            this.directPlayer.oncanplaythrough = () => {
                console.log(`[SYNC] Can play through`);
                seekAndSetup();
            };
            
            // Final fallback after maximum delay
            setTimeout(() => {
                console.log(`[SYNC] Final seek attempt`);
                seekAndSetup();
                
                this.addChatMessage('System', 'Video loaded. Use the video controls to play.', 'system');
            }, 5000);
        }
        
        // Update sync status after loading media
        this.updateSyncStatus('synced');
        
        // Safely extract filename for chat message
        let filename = 'media';
        try {
            filename = videoSource.split('/').pop() || 'media';
        } catch (e) {
            console.warn('Could not extract filename from source:', e);
        }
        this.addChatMessage('System', `${username} loaded ${type}: ${filename}`, 'system');
    }
    
    checkSyncStatus(type) {
        // Only check video sync (audio removed)
        if (type !== 'video') return;
        
        // Simple sync check - in a real implementation this would compare with server state
        const isInSync = Math.abs(this.directPlayer.currentTime - this.directPlayer.currentTime) < this.syncTolerance;
        this.updateSyncStatus(isInSync ? 'synced' : 'out-of-sync');
    }

    updateSyncStatus(status) {
        this.syncStatus.className = `sync-status ${status}`;
        if (status === 'synced') {
            this.syncStatus.innerHTML = '<i class="fa-solid fa-eye"></i> Synced';
        } else {
            this.syncStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Out of Sync';
        }
    }
    
    updateSyncedUI(isPaused) {
        this.videoState.isPaused = isPaused;
        const syncedIndicator = document.querySelector('.synced-indicator') || this.createSyncedIndicator();
        
        if (isPaused) {
            syncedIndicator.innerHTML = '<i class="fa-solid fa-pause"></i> Synced';
            syncedIndicator.classList.add('paused');
        } else {
            syncedIndicator.innerHTML = '<i class="fa-solid fa-play"></i> Synced';
            syncedIndicator.classList.remove('paused');
        }
        
        syncedIndicator.classList.remove('hidden');
        setTimeout(() => syncedIndicator.classList.add('visible'), 10);
        
        // Hide after 3 seconds
        clearTimeout(this.syncedIndicatorTimeout);
        this.syncedIndicatorTimeout = setTimeout(() => {
            syncedIndicator.classList.remove('visible');
            setTimeout(() => syncedIndicator.classList.add('hidden'), 300);
        }, 3000);
    }
    
    createSyncedIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'synced-indicator hidden';
        document.querySelector('.video-container').appendChild(indicator);
        return indicator;
    }
    
    restoreVideoState() {
        // Check if we have stored video state
        const savedState = localStorage.getItem('videoState');
        if (savedState && this.roomId) {
            try {
                const videoState = JSON.parse(savedState);
                console.log('[RESTORE] Found saved video state:', videoState);
                
                // Wait for video player to be ready
                const checkInterval = setInterval(() => {
                    if (!this.directPlayer.classList.contains('hidden') && this.directPlayer.readyState >= 2) {
                        clearInterval(checkInterval);
                        
                        // Restore time position
                        this.directPlayer.currentTime = videoState.currentTime;
                        
                        // Restore play/pause state
                        if (videoState.isPaused) {
                            this.directPlayer.pause();
                        } else {
                            this.directPlayer.play().catch(e => console.warn('Could not autoplay:', e));
                        }
                        
                        // Clear saved state
                        localStorage.removeItem('videoState');
                        console.log('[RESTORE] Video state restored successfully');
                    }
                }, 500);
                
                // Set timeout to prevent infinite checking
                setTimeout(() => clearInterval(checkInterval), 10000);
            } catch (e) {
                console.error('[RESTORE] Error restoring video state:', e);
                localStorage.removeItem('videoState');
            }
        }
    }
    
    sendCurrentMediaState(targetUsername) {
        console.log(`[SYNC] Sending current media state to ${targetUsername}`);
        
        // Check which player is active
        const isYouTubeActive = !this.youtubePlayer.classList.contains('hidden');
        const isDirectVideoActive = !this.directPlayer.classList.contains('hidden');
        
        if (isYouTubeActive && this.youtubePlayer.src) {
            const currentTime = this.getCurrentPlayerTime();
            console.log(`[SYNC] Sending YouTube state, currentTime: ${currentTime}`);
            
            // Send current YouTube video state
            this.socket.emit('media-load', {
                roomId: this.roomId,
                type: 'video',
                source: this.youtubePlayer.src,
                username: this.username,
                targetUsername: targetUsername,
                currentTime: currentTime
            });
            
            // Also send current play/pause state
            setTimeout(() => {
                const isPaused = !this.youtubeStartTime || (Date.now() - this.youtubeStartTime) < 0;
                this.socket.emit('media-event', {
                    roomId: this.roomId,
                    action: isPaused ? 'pause' : 'play',
                    type: 'video',
                    currentTime: this.getCurrentPlayerTime(),
                    timestamp: Date.now(),
                    username: this.username,
                    targetUsername: targetUsername
                });
            }, 1000);
            
        } else if (isDirectVideoActive && this.directPlayer.src) {
            const currentTime = this.directPlayer.currentTime;
            console.log(`[SYNC] Sending direct video state, currentTime: ${currentTime}, paused: ${this.directPlayer.paused}`);
            
            // Send current direct video state
            this.socket.emit('media-load', {
                roomId: this.roomId,
                type: 'video',
                source: this.directPlayer.src,
                username: this.username,
                targetUsername: targetUsername,
                currentTime: currentTime
            });
            
            // Also send current play/pause state
            setTimeout(() => {
                this.socket.emit('media-event', {
                    roomId: this.roomId,
                    action: this.directPlayer.paused ? 'pause' : 'play',
                    type: 'video',
                    currentTime: this.directPlayer.currentTime,
                    timestamp: Date.now(),
                    username: this.username,
                    targetUsername: targetUsername
                });
            }, 1000);
        } else {
            console.log('[SYNC] No active media to share');
        }
    }

    sendChatMessage() {
        const message = this.messageInput.value.trim();
        if (message) {
            this.addChatMessage(this.username, message, 'own');
            this.messageInput.value = '';
            
            if (this.socket) {
                this.socket.emit('chat-message', {
                    roomId: this.roomId,
                    username: this.username,
                    message: message,
                    timestamp: Date.now()
                });
            }
        }
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
                this.connectionStatus.innerHTML = '<i class="fa-solid fa-globe"></i>';
                break;
            case 'disconnected':
                this.connectionStatus.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnected';
                break;
        }
    }    
    
    // Theme toggle functionality
    initializeThemeToggle() {
        // Check for saved theme preference or default to light theme
        const savedTheme = localStorage.getItem('theme') || 'light';
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
    
    // Chat minimize/maximize functionality
    toggleChat() {
        this.chatMinimized = !this.chatMinimized;

        if (this.chatMinimized) {
            this.chatContainer.classList.add('minimized');
            this.chatMinimize.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>'; // maximize icon
        } else {
            this.chatContainer.classList.remove('minimized');
            this.chatMinimize.innerHTML = '<i class="fa-solid fa-down-left-and-up-right-to-center"></i>'; // minimize icon
        }
    }

    handleHomeNavigation(event) {
        event.preventDefault();

        // Check if user is currently in a room (media section is visible)
        if (!this.mediaSection.classList.contains('hidden')) {
            // Show confirmation dialog
            const confirmed = confirm('You will be redirected to the Home menu. All current states will be cleared.');

            if (confirmed) {
                // Clear all application states
                this.clearApplicationState();

                // Redirect to homepage
                window.location.href = 'index.html';
            }
        } else {
            // User is already on home page, just navigate normally
            window.location.href = 'index.html';
        }
    }

    clearApplicationState() {
        // Clear room and user data
        this.roomId = null;
        this.username = null;
        this.isHost = false;

        // Clear any stored video state
        localStorage.removeItem('videoState');

        // Disconnect from socket if connected
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // Clear chat messages
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '';
        }

        // Reset UI elements
        const roomIdDisplay = document.querySelector('.room-id-display');
        const userCountDisplay = document.querySelector('.user-count-display');

        if (roomIdDisplay) {
            roomIdDisplay.textContent = 'Not Connected';
        }
        if (userCountDisplay) {
            userCountDisplay.textContent = 'Users: 0';
        }

        // Reset navigation link statuses
        const roomNavLink = document.querySelector('.room-nav-link');
        const usersNavLink = document.querySelector('.users-nav-link');

        if (roomNavLink) {
            roomNavLink.setAttribute('data-status', 'disconnected');
        }
        if (usersNavLink) {
            usersNavLink.setAttribute('data-status', 'disconnected');
        }

        console.log('Application state cleared successfully');
    }

    
    // Footer Year Update
    updateFooterYear() {
        const yearElement = document.getElementById('currentYear');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    // Scroll Effects
    setupScrollEffects() {
        const header = document.querySelector('.header');
        if (!header) return;

        let lastScrollY = window.scrollY;
        
        window.addEventListener('scroll', () => {
            const currentScrollY = window.scrollY;
            
            if (currentScrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            
            lastScrollY = currentScrollY;
        });
    }
    
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new SyncWatch();
    
    // Add some demo functionality hints
    setTimeout(() => {
        if (!app.roomId) {
            app.addChatMessage('System', 'Welcome to CoWatch!', 'system');
        }
    }, 1000);
    
    // Initialize navigation functionality
    initializeNavigation();
});

// Navigation functionality
function initializeNavigation() {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    const roomIdDisplay = document.querySelector('.room-id-display');
    const userCountDisplay = document.querySelector('.user-count-display');
    
    // Update room information in navigation
    function updateNavigationRoomInfo() {
        const roomNavLink = document.querySelector('.room-nav-link');
        const usersNavLink = document.querySelector('.users-nav-link');
        
        // Get current values from navigation display elements
        let roomId = 'Not Connected';
        let userCount = '0';
        let isConnected = false;
        
        if (roomIdDisplay) {
            const roomText = roomIdDisplay.textContent.trim();
            // Extract room ID from "Room: ABC123" format
            const roomMatch = roomText.match(/Room:\s*(.+)/);
            if (roomMatch && roomMatch[1] && roomMatch[1] !== 'Not Connected') {
                roomId = roomMatch[1];
                isConnected = true;
            }
        }
        
        if (userCountDisplay) {
            const userText = userCountDisplay.textContent.trim();
            // Extract number from "Users: X" format
            const userMatch = userText.match(/Users:\s*(\d+)/);
            if (userMatch && userMatch[1]) {
                userCount = userMatch[1];
            }
        }
        
        // Update connection status styling based on current values
        if (roomNavLink) {
            roomNavLink.setAttribute('data-status', isConnected ? 'connected' : 'disconnected');
        }
        if (usersNavLink) {
            usersNavLink.setAttribute('data-status', isConnected ? 'connected' : 'disconnected');
        }
    }
    
    // Initial update
    updateNavigationRoomInfo();
    
    // Update every 2 seconds to sync with room info
    setInterval(updateNavigationRoomInfo, 2000);
    
    // Mobile menu toggle
    if (mobileMenuToggle && navMenu) {
        mobileMenuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            const icon = mobileMenuToggle.querySelector('i');
            if (navMenu.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
                mobileMenuToggle.style.transform = 'rotate(90deg)';
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
                mobileMenuToggle.style.transform = 'rotate(0deg)';
            }
        });
    }
    
    // Close mobile menu when clicking on nav links
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (navMenu && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                if (mobileMenuToggle) {
                    const icon = mobileMenuToggle.querySelector('i');
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                    mobileMenuToggle.style.transform = 'rotate(0deg)';
                }
            }
            
            // Add active state to clicked link
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        if (navMenu && navMenu.classList.contains('active')) {
            const isClickInsideMenu = navMenu.contains(event.target);
            const isClickOnToggle = mobileMenuToggle && mobileMenuToggle.contains(event.target);
            
            if (!isClickInsideMenu && !isClickOnToggle) {
                navMenu.classList.remove('active');
                if (mobileMenuToggle) {
                    const icon = mobileMenuToggle.querySelector('i');
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                    mobileMenuToggle.style.transform = 'rotate(0deg)';
                }
            }
        }
    });
    
    // Smooth scrolling for navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href && href.startsWith('#') && href.length > 1) {
                    e.preventDefault();
                    const targetElement = document.querySelector(href);
                    if (targetElement) {
                        targetElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                }
            });
    });
}

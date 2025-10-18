# 🎬 CoWatch - Watch Together

A real-time synchronized media sharing application where two or more people can watch videos together, no matter where they are!

## ✨ Features

- **Real-time Synchronization**: Watch videos and listen to audio in perfect sync with friends
- **Room-based Sessions**: Create or join rooms with unique room IDs
- **Multiple Media Support**: 
  - Upload local video/audio files(5GB)
- **Live Chat**: Chat with other viewers while watching
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI**: Beautiful, intuitive interface with smooth animations

## 🚀 Quick Start

### Option 1: Run with Node.js Server (Recommended)

1. **Install Node.js** (if not already installed)
   - Download from [nodejs.org](https://nodejs.org/)

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Open Your Browser**
   - Navigate to `http://localhost:3000`
   - Share the URL with friends to watch together!

### Option 2: Simple File Opening (Demo Mode)

1. **Open the HTML File**
   - Simply double-click `index.html` to open in your browser
   - This runs in demo mode without real-time sync

## 🎯 How to Use

### Creating a Room
1. Enter your name
2. Leave the "Room ID" field empty
3. Click "Join Room"
4. Share the generated Room ID with friends

### Joining a Room
1. Enter your name
2. Enter the Room ID shared by your friend
3. Click "Join Room"

### Loading Media
- **Local Files**: Click "Load Video" or "Load Audio" to upload files (up to 5GB)
- **URLs**: Paste video/audio URLs and click "Load Video" or "Load Audio"
- **Supported Sources**: Local files, direct media URLs, YouTube, and more

### Synchronized Playback
- When anyone plays, pauses, or seeks the media, it syncs for everyone
- The sync status indicator shows if you're in sync with other viewers
- Chat with other viewers using the chat panel

## 🛠️ Technical Details

### Built With
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Media Support**: HTML5 Video/Audio APIs

### Architecture
- **Client-Side**: Responsive web application with real-time media synchronization
- **Server-Side**: WebSocket server handling room management and event broadcasting
- **Synchronization**: Event-driven architecture ensuring all users stay in sync

### Browser Compatibility
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 📁 Project Structure

```
syncwatch/
├── index.html          # Main application page
├── styles.css          # Styling and responsive design
├── script.js           # Client-side JavaScript logic
├── server.js           # Node.js server with Socket.IO
├── package.json        # Node.js dependencies
└── README.md          # This file
```

## 🔧 Development

### Running in Development Mode
```bash
npm run dev
```
This uses nodemon for automatic server restarts during development.

### API Endpoints
- `GET /api/rooms` - List all active rooms
- `GET /api/room/:id` - Get specific room information

### Socket Events
- `join-room` - Join a room
- `media-event` - Sync media playback events
- `media-load` - Share loaded media with room
- `chat-message` - Send chat messages

## 🌟 Features in Detail

### Real-time Synchronization
- **Play/Pause Sync**: When one user plays or pauses, everyone's media syncs
- **Seek Sync**: Jumping to different timestamps syncs across all viewers
- **Tolerance Handling**: Smart sync with configurable tolerance for network delays

### Room Management
- **Unique Room IDs**: 6-character alphanumeric room codes
- **User Tracking**: See who's online in your room
- **Automatic Cleanup**: Empty rooms are automatically deleted

### Chat System
- **Real-time Messaging**: Instant chat with other viewers
- **System Messages**: Notifications for user joins/leaves and media changes
- **Timestamps**: All messages include timestamps

### Media Support
- **Local Files**: Upload and share local video/audio files
- **URL Loading**: Load media from direct URLs
- **Format Support**: MP4, WebM, MP3, WAV, and more
- **Cross-platform**: Works across different devices and browsers

## 🚀 Deployment

### Local Network
The server runs on `localhost:3000` by default. To share with others on your local network:
1. Find your local IP address
2. Share `http://YOUR_IP:3000` with friends on the same network

### Cloud Deployment
Deploy to platforms like:
- Heroku
- Vercel
- Railway
- DigitalOcean

Make sure to set the `PORT` environment variable for cloud deployments.

## 🤝 Contributing

Feel free to contribute to this project! Some ideas for improvements:
- User authentication
- Playlist support
- Screen sharing
- Voice chat

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎉 Enjoy Watching Together!

Have fun watching movies and listening to music with your friends, no matter the distance! 🍿🎵
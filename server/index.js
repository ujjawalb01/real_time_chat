require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

// Ensure uploads directory exists
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath);
}


// Socket.io setup
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', credentials: true },
});

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5000;

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,
});
const User = mongoose.model('User', UserSchema);

const MessageSchema = new mongoose.Schema({
  roomId: String,
  sender: String,
  content: String,
  createdAt: { type: Date, default: Date.now },
  type: { type: String, default: 'text' },
  fileUrl: String,
});
const Message = mongoose.model('Message', MessageSchema);

const ChatRoomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true },
  members: [String],
});
const ChatRoom = mongoose.model('ChatRoom', ChatRoomSchema);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/chatapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// Authentication APIs
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username/password required' });

    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash });
    await user.save();
    res.json({ message: 'User created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username/password required' });

    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ error: 'Invalid username or password' });

    const passOk = await bcrypt.compare(password, user.passwordHash);
    if (!passOk)
      return res.status(400).json({ error: 'Invalid username or password' });

    const token = jwt.sign({ username }, JWT_SECRET);
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.io Auth Middleware
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const user = jwt.verify(token, JWT_SECRET);
    socket.user = user;
    return next();
  } catch (err) {
    return next(new Error('Authentication error'));
  }
};

// Multer Config
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  res.json({ fileUrl });
});

// Chatroom APIs
app.post('/api/create_room', async (req, res) => {
  try {
    const { roomId, members } = req.body;
    if (!roomId || !Array.isArray(members) || members.length === 0)
      return res.status(400).json({ error: 'roomId and members required' });

    const exists = await ChatRoom.findOne({ roomId });
    if (exists)
      return res.status(400).json({ error: 'Room already exists' });

    const room = new ChatRoom({ roomId, members });
    await room.save();
    res.json({ message: 'Room created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/rooms/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const rooms = await ChatRoom.find({ members: username });
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const messages = await Message.find({ roomId }).sort({ createdAt: 1 }).limit(100);
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// User search API
app.get('/api/users/search/:q', async (req, res) => {
  try {
    const q = req.params.q || '';
    if (q.length < 1) return res.json([]);
    const users = await User.find({
      username: { $regex: q, $options: 'i' }
    }, { username: 1, _id: 0 }).limit(10);
    res.json(users.map(u => u.username));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Socket.io Chat Logic ---

const onlineUsers = new Map();
const typingUsers = new Map();

io.use(authenticateSocket);

io.on('connection', (socket) => {
  const username = socket.user.username;
  onlineUsers.set(username, socket.id);
  io.emit('user_online', username);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
  });

  socket.on('send_message', async ({ roomId, content, type, fileUrl }) => {
    const message = new Message({
      roomId,
      sender: username,
      content,
      type: type || 'text',
      fileUrl: fileUrl || '',
    });
    await message.save();
    io.to(roomId).emit('message', message);
  });

  socket.on('typing', ({ roomId, typing }) => {
    if (!typingUsers.has(roomId)) typingUsers.set(roomId, new Set());
    const set = typingUsers.get(roomId);
    typing ? set.add(username) : set.delete(username);
    io.to(roomId).emit('typing_users', Array.from(set));
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(username);
    io.emit('user_offline', username);
    typingUsers.forEach(set => set.delete(username));
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

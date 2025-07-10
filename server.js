const http = require('http');
const express = require('express');
const expressFileUpload = require('express-fileupload');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const dotenv = require('dotenv');

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Validate environment variables
const requiredEnvVars = ['PORT', 'MONGO_URL', 'CLOUD_NAME', 'CLOUD_API_KEY', 'CLOUD_API_SECRET', 'JWT_SECRET_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`Xato: Quyidagi muhit o‘zgaruvchilari topilmadi: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['odil-post-app-zor.netlify.app'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: true,
    },
    transports: ['websocket', 'polling'],
});

// CORS configuration
const allowedOrigins = ['odil-post-app-zor.netlify.app'];
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            callback(new Error('CORS tomonidan ruxsat berilmagan'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// File upload middleware
app.use(
    expressFileUpload({
        useTempFiles: true,
        tempFileDir: path.join(__dirname, 'tmp'),
        createParentPath: true,
    })
);

// Other middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Attach `io` to request object for use in controllers
app.use((req, res, next) => {
    req.io = io; // Make Socket.IO instance available in all routes
    next();
});

// Routes
app.use('/api', require('./src/Router/authRouter'));
app.use('/api/user', require('./src/Router/userRouter'));
app.use('/api/admin', require('./src/Router/adminRouter'));
app.use('/api/post', require('./src/Router/postRouter'));
app.use('/api/comment', require('./src/Router/commentRouter'));
app.use('/api/notifications', require('./src/Router/notlificationRouter')); // Note: Typo in 'notlificationRouter', should be 'notificationRouter'

// Socket.IO authentication
io.use((socket, next) => {
    const token = socket.handshake.query.token;
    if (!token || token === 'null') {
        return next(new Error('Autentifikatsiya xatosi: Token yo‘q yoki noto‘g‘ri'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        socket.userId = decoded.id;
        next();
    } catch (err) {
        next(new Error('Autentifikatsiya xatosi: Noto‘g‘ri token'));
    }
});

// Online users tracking
global.onlineUsers = new Map();
io.on('connection', (socket) => {
    console.log('Yangi socket ulanishi:', socket.id);

    socket.on('join', (userId) => {
        console.log(`Foydalanuvchi ${userId} xonaga qo‘shildi`);
        socket.join(userId.toString());
        global.onlineUsers.set(userId.toString(), socket.id);
    });

    socket.on('notificationRead', (data) => {
        console.log('Bildirishnoma o‘qildi:', data);
        io.to(data.userId).emit('notificationUpdated', data);
    });

    socket.on('newNotification', (data) => {
        console.log('Yangi bildirishnoma:', data);
        io.to(data.receiverId).emit('newNotification', data);
    });

    socket.on('newComment', (comment) => {
        console.log('Yangi komment:', comment);
        io.emit('newComment', comment);
    });

    socket.on('deleteComment', (data) => {
        console.log('Komment o‘chirildi:', data);
        io.emit('deletedComment', data);
    });

    socket.on('updateComment', (data) => {
        console.log('Komment yangilandi:', data);
        io.emit('updatedComment', data);
    });

    socket.on('disconnect', () => {
        console.log('Socket uzildi:', socket.id);
        for (let [userId, socketId] of global.onlineUsers.entries()) {
            if (socketId === socket.id) {
                global.onlineUsers.delete(userId);
                console.log(`Foydalanuvchi ${userId} oflayn bo‘ldi`);
            }
        }
    });
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log('MongoDB ulanishi muvaffaqiyatli');
    server.listen(process.env.PORT || 4000, () =>
      console.log(`Server ${process.env.PORT || 4000} portida ishga tushdi`)
    );
  })
  .catch((err) => {
    console.error('MongoDB ulanish xatosi:', err.message, err.stack);
    process.exit(1);
  });

app.use((err, req, res, next) => {
  res.status(500).json({ message: 'Server xatosi', error: err.message });
});
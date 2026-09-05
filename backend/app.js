import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import studentRoutes from './routes/studentRoutes.js';
import advisorRoutes from './routes/advisorRoutes.js';
import registrarRoutes from './routes/registrarRoutes.js';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import { initializeKeyManagement } from './lib/security/keyManagementService.js';
import { deleteExpiredComments } from './models/commentModel.js';

const app = express();
const PORT = process.env.PORT || 5050;

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from backend API!');
});

app.use('/students', studentRoutes);
app.use('/advisors', advisorRoutes);
app.use('/registrars', registrarRoutes);
app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);
app.use('/comments', commentRoutes);

async function startServer() {
  await initializeKeyManagement();
  await deleteExpiredComments();
  setInterval(() => {
    deleteExpiredComments().catch((error) => {
      console.error('Failed to remove expired comments:', error.message);
    });
  }, 10 * 60 * 1000);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

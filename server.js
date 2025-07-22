import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { ACRCloudRecognizer } from 'acrcloud';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/m4a', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|m4a|ogg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload an audio file.'), false);
    }
  }
});

// ACRCloud configuration
const acrConfig = {
  host: process.env.ACR_HOST || 'identify-us-west-2.acrcloud.com',
  access_key: process.env.ACR_ACCESS_KEY,
  access_secret: process.env.ACR_ACCESS_SECRET,
  timeout: 10000 // 10 seconds timeout
};

let acrClient;

// Initialize ACRCloud client
function initializeACRClient() {
  if (!acrConfig.access_key || !acrConfig.access_secret) {
    console.warn('⚠️  ACRCloud credentials not found. Please set ACR_ACCESS_KEY and ACR_ACCESS_SECRET in .env file');
    return null;
  }
  
  try {
    acrClient = new ACRCloudRecognizer(acrConfig);
    console.log('✅ ACRCloud client initialized successfully');
    return acrClient;
  } catch (error) {
    console.error('❌ Failed to initialize ACRCloud client:', error.message);
    return null;
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'ClipFinder API is running!',
    version: '1.0.0',
    endpoints: {
      '/api/health': 'Health check',
      '/api/identify': 'POST - Identify music from audio file',
      '/api/test-acr': 'GET - Test ACRCloud connection'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    acrcloud: {
      configured: !!(acrConfig.access_key && acrConfig.access_secret),
      client_ready: !!acrClient
    }
  });
});

app.get('/api/test-acr', async (req, res) => {
  try {
    if (!acrClient) {
      return res.status(500).json({
        success: false,
        error: 'ACRCloud client not initialized. Please check your credentials.'
      });
    }

    // Test with a small buffer (this will likely return no match, but tests connectivity)
    const testBuffer = Buffer.alloc(1024);
    const result = await new Promise((resolve, reject) => {
      acrClient.recognize(testBuffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    res.json({
      success: true,
      message: 'ACRCloud API is working!',
      test_result: result,
      config: {
        host: acrConfig.host,
        has_credentials: !!(acrConfig.access_key && acrConfig.access_secret)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'ACRCloud API test failed'
    });
  }
});

app.post('/api/identify', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided'
      });
    }

    if (!acrClient) {
      return res.status(500).json({
        success: false,
        error: 'ACRCloud service not available. Please check configuration.'
      });
    }

    console.log(`🎵 Processing audio file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Recognize the audio
    const result = await new Promise((resolve, reject) => {
      acrClient.recognize(req.file.buffer, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    console.log('🔍 ACRCloud result:', JSON.stringify(result, null, 2));

    // Parse the result
    if (result && result.status && result.status.code === 0) {
      // Success - music identified
      const music = result.metadata.music[0];
      const response = {
        success: true,
        identified: true,
        data: {
          title: music.title,
          artist: music.artists[0].name,
          album: music.album ? music.album.name : null,
          duration: music.duration_ms,
          release_date: music.release_date,
          genres: music.genres || [],
          external_ids: music.external_ids || {},
          score: music.score
        }
      };
      
      res.json(response);
    } else if (result && result.status && result.status.code === 1001) {
      // No result found
      res.json({
        success: true,
        identified: false,
        message: 'No music identified in the audio clip'
      });
    } else {
      // Other error
      res.status(400).json({
        success: false,
        error: result.status ? result.status.msg : 'Unknown error occurred'
      });
    }

  } catch (error) {
    console.error('❌ Error identifying music:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

// Initialize ACRCloud client on startup
initializeACRClient();

app.listen(PORT, () => {
  console.log(`🚀 ClipFinder server running on port ${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}`);
  
  if (!acrConfig.access_key || !acrConfig.access_secret) {
    console.log('\n⚠️  To use ACRCloud features, create a .env file with:');
    console.log('ACR_ACCESS_KEY=your_access_key');
    console.log('ACR_ACCESS_SECRET=your_access_secret');
    console.log('ACR_HOST=identify-us-west-2.acrcloud.com');
  }
});
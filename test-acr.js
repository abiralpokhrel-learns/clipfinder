import { ACRCloudRecognizer } from 'acrcloud';
import dotenv from 'dotenv';

dotenv.config();

async function testACRCloud() {
  console.log('🧪 Testing ACRCloud API connection...\n');

  // Check environment variables
  const accessKey = process.env.ACR_ACCESS_KEY;
  const accessSecret = process.env.ACR_ACCESS_SECRET;
  const host = process.env.ACR_HOST || 'identify-us-west-2.acrcloud.com';

  if (!accessKey || !accessSecret) {
    console.error('❌ Missing ACRCloud credentials!');
    console.log('Please create a .env file with:');
    console.log('ACR_ACCESS_KEY=your_access_key');
    console.log('ACR_ACCESS_SECRET=your_access_secret');
    console.log('\nGet your credentials from: https://console.acrcloud.com/');
    return;
  }

  console.log('✅ Credentials found');
  console.log(`📡 Host: ${host}`);
  console.log(`🔑 Access Key: ${accessKey.substring(0, 8)}...`);

  try {
    // Initialize ACRCloud client
    const acrClient = new ACRCloudRecognizer({
      host: host,
      access_key: accessKey,
      access_secret: accessSecret,
      timeout: 10000
    });

    console.log('✅ ACRCloud client initialized');

    // Test with empty buffer (will return "no result" but tests connectivity)
    const testBuffer = Buffer.alloc(1024);
    
    console.log('🔍 Testing API connection...');
    
    const result = await new Promise((resolve, reject) => {
      acrClient.recognize(testBuffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    console.log('📊 API Response:');
    console.log(JSON.stringify(result, null, 2));

    if (result && result.status) {
      if (result.status.code === 1001) {
        console.log('\n✅ ACRCloud API is working! (No music found in test buffer - this is expected)');
      } else if (result.status.code === 0) {
        console.log('\n✅ ACRCloud API is working and found music!');
      } else {
        console.log(`\n⚠️  API returned status code: ${result.status.code} - ${result.status.msg}`);
      }
    }

  } catch (error) {
    console.error('\n❌ ACRCloud API test failed:');
    console.error(error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 This might be a network connectivity issue.');
    } else if (error.message.includes('unauthorized') || error.message.includes('403')) {
      console.log('\n💡 Please check your ACRCloud credentials.');
    }
  }
}

testACRCloud();
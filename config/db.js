const mongoose = require('mongoose');
const dns = require('dns');

// Windows sometimes reports Node's DNS resolver as 127.0.0.1 even when the
// OS network config uses a real DNS server, which breaks the SRV lookup
// mongodb+srv:// needs. Force known-good resolvers so the lookup succeeds.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
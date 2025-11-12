const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 4000;                   
const FILE_DIR = path.join(__dirname, 'server_files');
const LOG_FILE = path.join(__dirname, 'server_logs.txt');
const STATS_FILE = path.join(__dirname, 'server_stats.txt');
const MAX_CONNECTIONS = 6;
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

if (!fs.existsSync(FILE_DIR)) {
    fs.mkdirSync(FILE_DIR, { recursive: true });
}
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
    fs.mkdirSync(path.join(__dirname, 'logs'));
}

let connections = new Map();
let totalBytesReceived = 0;
let totalBytesSent = 0;
let messagesPerUser = {};

function now() {
    return new Date().toISOString();
}

function logLine(line) {
    const full = `[${now()}] ${line}${os.EOL}`;
    fs.appendFile(LOG_FILE, full, () => {});
    console.log(full.trim());
}

function writeStatsToFile() {
    const active = Array.from(connections.values()).map(info => ({
        username: info.username,
        ip: info.remoteAddress,
        port: info.remotePort,
        connectedAt: info.connectedAt,
        messages: info.msgCount,
        bytesReceived: info.bytesReceived,
        bytesSent: info.bytesSent
    }));

    const stats = {
        timestamp: now(),
        activeConnections: connections.size,
        clientIPs: [...new Set(Array.from(connections.values()).map(c => c.remoteAddress))],
        messagesPerUser,
        totalBytesReceived,
        totalBytesSent,
        active
    };
    
    fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), err => {
        if (err) console.error('Error writing stats file', err);
    });
}
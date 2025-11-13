const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 4000;
const FILE_DIR = path.join(__dirname, 'server_files');
const LOG_FILE = path.join(__dirname, 'server_logs.txt');

if (!fs.existsSync(FILE_DIR)) fs.mkdirSync(FILE_DIR, { recursive: true });

const server = dgram.createSocket('udp4');
let clients = {};

const now = () => new Date().toISOString();
const log = msg => { fs.appendFile(LOG_FILE, `[${now()}] ${msg}${os.EOL}`, () => {}); console.log(msg); };

const send = (clientKey, obj) => {
    const msg = Buffer.from(JSON.stringify(obj));
    const [ip, port] = clientKey.split(':');
    server.send(msg, parseInt(port), ip, err => err && console.error('Send error:', err.message));
};

const sendError = (clientKey, message) => send(clientKey, { type: 'error', message });
const safePath = fname => path.join(FILE_DIR, path.basename(fname));
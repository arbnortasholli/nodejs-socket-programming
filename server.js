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

server.on('message', (msgBuffer, rinfo) => {
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    if (!clients[clientKey]) clients[clientKey] = {};
    const client = clients[clientKey];

    let msg;
    try { 
        msg = JSON.parse(msgBuffer.toString()); 
    } catch { 
        return log(`Malformed message from ${clientKey}`); 
    }

    if (msg.type === 'HELLO') {
        client.username = msg.username || clientKey;
        client.role = msg.role === 'admin' ? 'admin' : 'read';
        log(`HELLO from ${client.username} (${client.role})`);
        return send(clientKey, { type: 'HELLO_ACK', message: 'WELCOME', role: client.role });
    }

    if (!client.username) return sendError(clientKey, 'SEND_HELLO_FIRST');
});
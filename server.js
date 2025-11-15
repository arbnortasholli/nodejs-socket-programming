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

    if (!client.username) {
        return sendError(clientKey, 'SEND_HELLO_FIRST');
    }
    
    if (msg.type === 'COMMAND') {
        const command = msg.command;
        switch (command) {
            case '/list': {
                const files = fs.readdirSync(FILE_DIR).map(f => {
                    const st = fs.statSync(safePath(f));
                    return { name: f, size: st.size, mtime: st.mtime };
                });
                return send(clientKey, { type: 'RESPONSE', command: '/list', files });
            }
            case '/info': {
                const fname = msg.filename;
                if (!fname) return sendError(clientKey, 'MISSING_FILENAME');
                const fp = safePath(fname);
                if (!fs.existsSync(fp)) return sendError(clientKey, 'NOT_FOUND');
                const st = fs.statSync(fp);
                return send(clientKey, { type: 'RESPONSE', command: '/info', filename: fname, size: st.size, createdAt: st.birthtime, modifiedAt: st.mtime });
            }
            case '/read': {
                const fname = msg.filename;
                if (!fname) return sendError(clientKey, 'MISSING_FILENAME');
                const fp = safePath(fname);
                if (!fs.existsSync(fp)) return sendError(clientKey, 'NOT_FOUND');
                const content = fs.readFileSync(fp).toString('base64');
                return send(clientKey, { type: 'RESPONSE', command: '/read', filename: fname, content, encoding: 'base64' });
            }
            case '/delete': {
                const fname = msg.filename;
                if (!fname) return sendError(clientKey, 'MISSING_FILENAME');
                const fp = safePath(fname);
                if (!fs.existsSync(fp)) return sendError(clientKey, 'NOT_FOUND');
                fs.unlinkSync(fp);
                log(`${client.username} deleted ${fname}`);
                return send(clientKey, { type: 'RESPONSE', command: '/delete', filename: fname, message: 'DELETED' });
            }
            case '/search': {
                const term = msg.keyword;
                if (!term) {
                    return sendError(clientKey, 'MISSING_KEYWORD');
                }
                const files = fs.readdirSync(FILE_DIR).filter(f => f.includes(term));
                return send(clientKey, { type: 'RESPONSE', command: '/search', files });
            }
            case '/upload': {
                const fname = msg.filename;
                const size = msg.size;
                if (!fname || !size) {
                    return sendError(clientKey, 'MISSING_FILENAME_OR_SIZE');
                }
                const fp = safePath(fname);
                client.upload = { filename: fname, size, received: 0, stream: fs.createWriteStream(fp) };
                log(`${client.username} started upload ${fname} (${size} bytes)`);
                return send(clientKey, { type: 'RESPONSE', command: '/upload', message: 'READY' });
            }
            case '/download': {
                const fname = msg.filename;
                if (!fname) {
                    return sendError(clientKey, 'MISSING_FILENAME');
                }
                const fp = safePath(fname);
                if (!fs.existsSync(fp)) {
                    return sendError(clientKey, 'NOT_FOUND');
                }
                const rs = fs.createReadStream(fp, { highWaterMark: 16 * 1024 });
                rs.on('data', chunk => 
                    send(clientKey, { type: 'FILE_DATA', filename: fname, chunk: chunk.toString('base64'), final: false })
                );
                rs.on('end', () => {
                    send(clientKey, { type: 'FILE_DATA', filename: fname, chunk: '', final: true });
                    log(`${client.username} completed download ${fname}`);
                });
                break;
            }
            default: return sendError(clientKey, `UNKNOWN_COMMAND ${command}`);
        }
    }
});

server.on('listening', () => {
    const addr = server.address();
    const nets = require('os').networkInterfaces();
    let localIp = '127.0.0.1';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
                break;
            }
        }
    }
    console.log(`UDP server listening on ${localIp}:${addr.port}`);
});

server.on('error', err => log(`Server error: ${err.message}`));
server.bind(PORT);
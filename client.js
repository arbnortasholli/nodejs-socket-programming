const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

let SERVER_IP, SERVER_PORT, USERNAME, ROLE;
let client = dgram.createSocket('udp4');
let expectedFileDownload = null;

function send(obj) {
    const msg = Buffer.from(JSON.stringify(obj));
    client.send(msg, SERVER_PORT, SERVER_IP, err => err && console.error('Send failed:', err.message));
}

function askConnectionInfo() {
    rl.question('Enter server IP: ', ip => {
        SERVER_IP = ip || '127.0.0.1';
        rl.question('Enter server port: ', port => {
            SERVER_PORT = parseInt(port) || 4000;
            rl.question('Enter username: ', uname => {
                USERNAME = uname || `user_${Math.floor(Math.random() * 1000)}`;
                rl.question('Enter role (admin/read): ', role => {
                    ROLE = role?.toLowerCase() === 'admin' ? 'admin' : 'read';
                    send({ type: 'HELLO', username: USERNAME, role: ROLE });
                    rl.setPrompt(`${USERNAME}> `);
                    rl.prompt();
                });
            });
        });
    });
}

function handleServerMessage(msg) {
    if (msg.type === 'HELLO_ACK') {
        console.log('Server welcome. Role:', msg.role);
        return;
    }
}
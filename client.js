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
    if (msg.type === "ADMIN_PASSWORD_REQUIRED") {
        rl.question("Enter admin password: ", pwd => {
            send({ type: "ADMIN_PASSWORD", password: pwd });
        });
        return;
    }

    if (msg.type === 'HELLO_ACK') {
        console.log('Server:', msg.message);

        if (msg.role === 'admin') {
            ROLE = 'admin';
            console.log("You are now admin.");
        } else {
            ROLE = 'read';
            console.log("You are in read-only mode.");
        }

        return;
    }

    if (msg.type === 'RESPONSE') {
        switch (msg.command) {
            case '/list':
                console.log('Server files:');
                msg.files.forEach(f => console.log(`- ${f.name} (${f.size} bytes)`));
                break;
            case '/read':
                console.log(`${msg.filename} contents (base64):\n${msg.content}`);
                break;
            case '/info':
                console.log(`Info ${msg.filename} - Size: ${msg.size}, Created: ${msg.createdAt}, Modified: ${msg.modifiedAt}`);
                break;
            default:
                console.log('Server response:', msg);
        }
        return;
    }
    if (msg.type === 'FILE_DATA') {
        const fname = msg.filename;
        if (!expectedFileDownload || expectedFileDownload.filename !== fname) {
            expectedFileDownload = {
                filename: fname,
                stream: fs.createWriteStream(path.join(DOWNLOAD_DIR, path.basename(fname)))
            };
        }
        if (!msg.final) expectedFileDownload.stream.write(Buffer.from(msg.chunk, 'base64'));
        else {
            expectedFileDownload.stream.end();
            console.log(`Download complete: ${expectedFileDownload.filename}`);
            expectedFileDownload = null;
        }
        return;
    }
    if (msg.type === 'error') console.log('ERROR:', msg.message);

    if (msg.type === "ERROR" && msg.message === "MAX_CONNECTIONS_REACHED") {
        console.log("Server is full. Maximum connections reached.");
        console.log("Try again later.");
        process.exit(0);
    }

    if (msg.type === "DISCONNECTED") {
        console.log(`Disconnected from server. Reason: ${msg.reason}`);
        console.log("Closing client...");
        process.exit(0);
    }
}

client.on('message', buf => {
    try { handleServerMessage(JSON.parse(buf.toString())); } 
    catch { console.log('Malformed server message'); }
});

rl.on('line', async line => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }
    const parts = text.split(' ').filter(Boolean);
    const cmd = parts[0];

    if (cmd === '/upload') {
        if (ROLE !== 'admin') { console.log('Upload requires admin'); rl.prompt(); return; }
        const localPath = parts.slice(1).join(' ');
        if (!fs.existsSync(localPath)) { console.log('File not found'); rl.prompt(); return; }

        const filename = path.basename(localPath);
        const size = fs.statSync(localPath).size;

        send({ type: 'COMMAND', command: '/upload', filename, size });

        await new Promise(r => setTimeout(r, 100));

        const rs = fs.createReadStream(localPath, { highWaterMark: 16 * 1024 });
        for await (const chunk of rs)
        send({ type: 'FILE_DATA', filename, chunk: chunk.toString('base64'), final: false });

        send({ type: 'FILE_DATA', filename, chunk: '', final: true });
            console.log('Upload complete.');
            rl.prompt();
            return;
    }

    if (cmd === '/download') {
        const filename = parts.slice(1).join(' ');
        if (!filename) { console.log('Usage: /download <filename>'); rl.prompt(); return; }
        send({ type: 'COMMAND', command: '/download', filename });
        rl.prompt();
        return;
    }

    if (cmd === '/read' || cmd === '/info') {
        const filename = parts.slice(1).join(' ');
        if (!filename) { console.log(`Usage: ${cmd} <filename>`); rl.prompt(); return; }
        send({ type: 'COMMAND', command: cmd, filename });
        rl.prompt();
        return;
    }

    if (cmd === '/delete') {
        if (ROLE !== 'admin') { console.log('Delete requires admin'); rl.prompt(); return; }
        const filename = parts.slice(1).join(' ');
        if (!filename) { console.log(`Usage: ${cmd} <filename>`); rl.prompt(); return; }
        send({ type: 'COMMAND', command: cmd, filename });
        rl.prompt();
        return;
    }

    if (cmd === '/search') {
    const keyword = parts.slice(1).join(' ');
    if (!keyword) { console.log('Usage: /search <keyword>'); rl.prompt(); return; }
    send({ type: 'COMMAND', command: '/search', keyword });
    rl.prompt();
    return;
}
    send({ type: 'COMMAND', command: text });
    rl.prompt();
});

rl.on('close', () => { console.log('Exiting client'); process.exit(0); });

askConnectionInfo();
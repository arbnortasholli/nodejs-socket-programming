# UDP Socket Programming

A simple UDP-based file server and client system in Node.js. Supports basic file operations, admin authentication etc.

# Features
# Server
Handles multiple clients
Inactivity timeout disconnects clients
Logs all activities to server_logs.txt

# Client
Connects to server with a username and role
Admin and read-only roles
Sends commands to server
Downloads/uploads files
Receives messages and errors from server
File operations:
/list – List all files
/info <filename> – File info (size, creation, modification)
/read <filename> – Read file content (base64)
/delete <filename> – Delete file (admin only)
/search <keyword> – Search files
/upload <filename> – Upload files (admin only)
/download <filename> – Download files
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const url = require('url');

const app = express();
const PORT = 3000;

// 静态文件托管
app.use(express.static('public'));

// 添加房间销毁页面
app.get('/destroyed', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>聊天室已销毁</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f0f0f0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .box {
          background: white;
          padding: 2rem 3rem;
          border-radius: 12px;
          text-align: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #d32f2f; margin-bottom: 0.5rem; }
        p { color: #555; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>🔒 房间已被销毁</h1>
        <p>房主已离开，聊天室已永久关闭。<br>请关闭此页面。</p>
      </div>
    </body>
    </html>
  `);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 房间 Map：roomId -> { owner: WebSocket, guest: WebSocket | null }
const rooms = new Map();

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const roomId = params.get('room');
  if (!roomId) {
    ws.close(4000, '缺少房间号');
    return;
  }

  let room = rooms.get(roomId);

  // 房间不存在 → 第一个连接为房主
  if (!room) {
    room = { owner: ws, guest: null };
    rooms.set(roomId, room);
    console.log(`房间 ${roomId} 创建，房主已进入`);
    sendTo(ws, { type: 'system', text: '你已成为房主，等待对方加入…' });
  }
  // 已存在房间，尝试作为访客加入
  else {
    if (room.guest) {
      // 已有访客，拒绝
      ws.close(4001, '房间已满');
      return;
    }
    room.guest = ws;
    console.log(`访客加入房间 ${roomId}`);
    sendTo(room.owner, { type: 'system', text: '对方已加入聊天' });
    sendTo(room.guest, { type: 'system', text: '你已加入房间，开始聊天吧' });
  }

  // 消息转发（密文）
  ws.on('message', (data) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const target = ws === room.owner ? room.guest : room.owner;
    if (target && target.readyState === target.OPEN) {
      target.send(data.toString());
    }
  });

  // 连接关闭处理
  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (ws === room.owner) {
      // 房主离开 → 销毁房间
      console.log(`房主退出，销毁房间 ${roomId}`);
      if (room.guest && room.guest.readyState === room.guest.OPEN) {
        sendTo(room.guest, { type: 'destroy', text: '房主已退出，聊天室已销毁' });
        // 稍微延迟关闭，确保消息送达
        setTimeout(() => room.guest?.close(), 200);
      }
      rooms.delete(roomId);
    } else if (ws === room.guest) {
      // 访客离开
      console.log(`访客离开房间 ${roomId}`);
      room.guest = null;
      if (room.owner && room.owner.readyState === room.owner.OPEN) {
        sendTo(room.owner, { type: 'system', text: '对方已离开，等待新访客加入…' });
      }
    }
  });
});

function sendTo(ws, data) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`💬 服务器已启动：http://192.168.1.3:${PORT}`);
});

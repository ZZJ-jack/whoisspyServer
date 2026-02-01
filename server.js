const express = require('express');
const cors = require('cors');

// 创建应用实例
const app = express();

app.use(cors());
app.use(express.json());

// 内存存储房间信息
const roomMap = {};

// 生成6位数字房间号
function generateRoomId() {
  while (true) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    if (!roomMap[id]) return id;
  }
}

// 接口1：创建房间
app.post('/api/createRoom', (req, res) => {
  const { total } = req.body;
  if (!total || total < 2) {
    return res.json({ code: -1, msg: '总玩家数必须≥2' });
  }
  const roomId = generateRoomId();
  const civil = total - 1;
  roomMap[roomId] = {
    isLock: false, lockNum: 0, total, spy: 1, civil, assigned: 0, lastRole: ''
  };
  res.json({ code: 0, msg: '房间创建成功', data: { roomId, isOwner: true } });
});

// 接口2：加入房间
app.post('/api/joinRoom', (req, res) => {
  const { roomId } = req.body;
  if (!roomMap[roomId]) {
    return res.json({ code: -1, msg: '房间号无效或已过期' });
  }
  const room = roomMap[roomId];
  res.json({
    code: 0,
    msg: '加入房间成功',
    data: { isOwner: false, lockNum: room.lockNum, isLock: room.isLock, total: room.total }
  });
});

// 接口3：锁定题目编号
app.post('/api/lockNum', (req, res) => {
  const { roomId, num } = req.body;
  if (!roomMap[roomId]) return res.json({ code: -1, msg: '房间号无效' });
  roomMap[roomId].isLock = true;
  roomMap[roomId].lockNum = num;
  res.json({ code: 0, msg: '题目编号已锁定', data: { lockNum: num } });
});

// 接口4：获取身份词语
app.post('/api/getWord', (req, res) => {
  const { roomId } = req.body;
  if (!roomMap[roomId]) return res.json({ code: -1, msg: '房间号无效' });
  const room = roomMap[roomId];
  if (!room.isLock) return res.json({ code: -2, msg: '房主尚未锁定题目' });

  const assignedSpy = room.assigned - room.civil + (room.lastRole === 'civil' ? 1 : 0);
  const currRole = room.assigned === 0
    ? (Math.random() > 0.5 ? 'spy' : 'civil')
    : (assignedSpy < room.spy ? 'spy' : 'civil');

  room.assigned += 1;
  room.lastRole = currRole;
  res.json({ code: 0, msg: '身份分配成功', data: { currRole, lockNum: room.lockNum } });
});

// 接口5：重置房间
app.post('/api/resetRoom', (req, res) => {
  const { roomId } = req.body;
  if (!roomMap[roomId]) return res.json({ code: -1, msg: '房间号无效' });
  const total = roomMap[roomId].total;
  roomMap[roomId] = {
    isLock: false, lockNum: 0, total, spy: 1, civil: total - 1, assigned: 0, lastRole: ''
  };
  res.json({ code: 0, msg: '房间重置成功' });
});

// 对于 Cloudflare Workers，我们需要创建一个适配器
async function handleRequest(request) {
  const url = new URL(request.url);
  const body = await request.text();
  
  // 创建一个模拟的 Express 请求/响应对象
  const req = {
    method: request.method,
    url: url.pathname,
    headers: request.headers,
    body: body ? JSON.parse(body) : {}
  };
  
  const res = {
    json: (data) => {
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  };
  
  // 这里需要根据路由分发请求
  // 简化版：直接调用对应的处理函数
  if (url.pathname === '/api/createRoom' && request.method === 'POST') {
    // 调用创建房间逻辑
    const { total } = req.body;
    if (!total || total < 2) {
      return res.json({ code: -1, msg: '总玩家数必须≥2' });
    }
    const roomId = generateRoomId();
    const civil = total - 1;
    roomMap[roomId] = {
      isLock: false, lockNum: 0, total, spy: 1, civil, assigned: 0, lastRole: ''
    };
    return res.json({ code: 0, msg: '房间创建成功', data: { roomId, isOwner: true } });
  }
  
  // 其他路由类似处理...
  
  return new Response('Not Found', { status: 404 });
}

// Cloudflare Workers 入口点
export default {
  fetch: handleRequest
};
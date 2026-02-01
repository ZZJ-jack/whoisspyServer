// 导入所需的 polyfill
import express from 'express';

const app = express();

// 启用 CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 解析 JSON 请求体
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
  console.log('创建房间请求:', req.body);
  
  if (!total || total < 2) {
    return res.json({ code: -1, msg: '总玩家数必须≥2' });
  }
  const roomId = generateRoomId();
  const civil = total - 1;
  roomMap[roomId] = {
    isLock: false, 
    lockNum: 0, 
    total, 
    spy: 1, 
    civil, 
    assigned: 0, 
    lastRole: ''
  };
  console.log('房间创建成功:', roomId);
  res.json({ 
    code: 0, 
    msg: '房间创建成功', 
    data: { 
      roomId, 
      isOwner: true 
    } 
  });
});

// 接口2：加入房间
app.post('/api/joinRoom', (req, res) => {
  const { roomId } = req.body;
  console.log('加入房间请求:', req.body);
  
  if (!roomMap[roomId]) {
    return res.json({ code: -1, msg: '房间号无效或已过期' });
  }
  const room = roomMap[roomId];
  res.json({
    code: 0,
    msg: '加入房间成功',
    data: { 
      isOwner: false, 
      lockNum: room.lockNum, 
      isLock: room.isLock, 
      total: room.total 
    }
  });
});

// 接口3：锁定题目编号
app.post('/api/lockNum', (req, res) => {
  const { roomId, num } = req.body;
  console.log('锁定题目请求:', req.body);
  
  if (!roomMap[roomId]) {
    return res.json({ code: -1, msg: '房间号无效' });
  }
  roomMap[roomId].isLock = true;
  roomMap[roomId].lockNum = num;
  res.json({ 
    code: 0, 
    msg: '题目编号已锁定', 
    data: { lockNum: num } 
  });
});

// 接口4：获取身份词语
app.post('/api/getWord', (req, res) => {
  const { roomId } = req.body;
  console.log('获取身份请求:', req.body);
  
  if (!roomMap[roomId]) {
    return res.json({ code: -1, msg: '房间号无效' });
  }
  const room = roomMap[roomId];
  
  if (!room.isLock) {
    return res.json({ code: -2, msg: '房主尚未锁定题目' });
  }

  const assignedSpy = room.assigned - room.civil + (room.lastRole === 'civil' ? 1 : 0);
  const currRole = room.assigned === 0
    ? (Math.random() > 0.5 ? 'spy' : 'civil')
    : (assignedSpy < room.spy ? 'spy' : 'civil');

  room.assigned += 1;
  room.lastRole = currRole;
  
  console.log('身份分配:', { roomId, currRole, assigned: room.assigned });
  
  res.json({ 
    code: 0, 
    msg: '身份分配成功', 
    data: { 
      currRole, 
      lockNum: room.lockNum 
    } 
  });
});

// 接口5：重置房间
app.post('/api/resetRoom', (req, res) => {
  const { roomId } = req.body;
  console.log('重置房间请求:', req.body);
  
  if (!roomMap[roomId]) {
    return res.json({ code: -1, msg: '房间号无效' });
  }
  const total = roomMap[roomId].total;
  roomMap[roomId] = {
    isLock: false, 
    lockNum: 0, 
    total, 
    spy: 1, 
    civil: total - 1, 
    assigned: 0, 
    lastRole: ''
  };
  res.json({ code: 0, msg: '房间重置成功' });
});

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ 
    code: 0, 
    msg: '服务正常', 
    data: { 
      timestamp: Date.now(),
      roomCount: Object.keys(roomMap).length
    } 
  });
});

// 处理未找到的路由
app.use((req, res) => {
  console.log('未找到路由:', req.method, req.url);
  res.status(404).json({ 
    code: -404, 
    msg: '接口不存在',
    path: req.url,
    method: req.method
  });
});

// Cloudflare Workers 适配器
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      console.log('收到请求:', request.method, url.pathname);
      
      // 处理请求
      const response = await handleRequest(request);
      return response;
    } catch (error) {
      console.error('处理请求时出错:', error);
      return new Response(JSON.stringify({ 
        code: -500, 
        msg: '服务器内部错误',
        error: error.message 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};

// 请求处理函数
async function handleRequest(request) {
  const url = new URL(request.url);
  
  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
  
  // 模拟 Express 的请求处理
  const req = {
    method: request.method,
    url: url.pathname,
    headers: request.headers,
    body: {}
  };
  
  // 解析请求体（如果是 POST 请求）
  if (request.method === 'POST') {
    try {
      req.body = await request.json();
    } catch (e) {
      // 如果解析失败，尝试作为文本解析
      const text = await request.text();
      if (text) {
        try {
          req.body = JSON.parse(text);
        } catch (e2) {
          req.body = {};
        }
      }
    }
  }
  
  // 根据路由分发请求
  if (url.pathname === '/api/createRoom' && request.method === 'POST') {
    return handleCreateRoom(req);
  }
  
  if (url.pathname === '/api/joinRoom' && request.method === 'POST') {
    return handleJoinRoom(req);
  }
  
  if (url.pathname === '/api/lockNum' && request.method === 'POST') {
    return handleLockNum(req);
  }
  
  if (url.pathname === '/api/getWord' && request.method === 'POST') {
    return handleGetWord(req);
  }
  
  if (url.pathname === '/api/resetRoom' && request.method === 'POST') {
    return handleResetRoom(req);
  }
  
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return handleHealthCheck(req);
  }
  
  // 未找到路由
  return new Response(JSON.stringify({ 
    code: -404, 
    msg: '接口不存在',
    path: url.pathname,
    method: request.method
  }), {
    status: 404,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 处理函数
function handleCreateRoom(req) {
  const { total } = req.body;
  
  if (!total || total < 2) {
    return new Response(JSON.stringify({ code: -1, msg: '总玩家数必须≥2' }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  const roomId = generateRoomId();
  const civil = total - 1;
  roomMap[roomId] = {
    isLock: false, 
    lockNum: 0, 
    total, 
    spy: 1, 
    civil, 
    assigned: 0, 
    lastRole: ''
  };
  
  console.log('创建房间成功:', roomId);
  
  return new Response(JSON.stringify({ 
    code: 0, 
    msg: '房间创建成功', 
    data: { 
      roomId, 
      isOwner: true 
    } 
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleJoinRoom(req) {
  const { roomId } = req.body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ code: -1, msg: '房间号无效或已过期' }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  const room = roomMap[roomId];
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '加入房间成功',
    data: { 
      isOwner: false, 
      lockNum: room.lockNum, 
      isLock: room.isLock, 
      total: room.total 
    }
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleLockNum(req) {
  const { roomId, num } = req.body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ code: -1, msg: '房间号无效' }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  roomMap[roomId].isLock = true;
  roomMap[roomId].lockNum = num;
  
  return new Response(JSON.stringify({ 
    code: 0, 
    msg: '题目编号已锁定', 
    data: { lockNum: num } 
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleGetWord(req) {
  const { roomId } = req.body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ code: -1, msg: '房间号无效' }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  const room = roomMap[roomId];
  
  if (!room.isLock) {
    return new Response(JSON.stringify({ code: -2, msg: '房主尚未锁定题目' }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const assignedSpy = room.assigned - room.civil + (room.lastRole === 'civil' ? 1 : 0);
  const currRole = room.assigned === 0
    ? (Math.random() > 0.5 ? 'spy' : 'civil')
    : (assignedSpy < room.spy ? 'spy' : 'civil');

  room.assigned += 1;
  room.lastRole = currRole;
  
  console.log('身份分配:', { roomId, currRole, assigned: room.assigned });
  
  return new Response(JSON.stringify({ 
    code: 0, 
    msg: '身份分配成功', 
    data: { 
      currRole, 
      lockNum: room.lockNum 
    } 
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleResetRoom(req) {
  const { roomId } = req.body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ code: -1, msg: '房间号无效' }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  const total = roomMap[roomId].total;
  roomMap[roomId] = {
    isLock: false, 
    lockNum: 0, 
    total, 
    spy: 1, 
    civil: total - 1, 
    assigned: 0, 
    lastRole: ''
  };
  
  return new Response(JSON.stringify({ code: 0, msg: '房间重置成功' }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleHealthCheck(req) {
  return new Response(JSON.stringify({ 
    code: 0, 
    msg: '服务正常', 
    data: { 
      timestamp: Date.now(),
      roomCount: Object.keys(roomMap).length
    } 
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
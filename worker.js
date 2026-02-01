// 内存存储房间信息
const roomMap = {};

// 生成6位数字房间号
function generateRoomId() {
  while (true) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    if (!roomMap[id]) return id;
  }
}

// CORS 头部
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handleRequest(request) {
  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  const url = new URL(request.url);
  
  // 解析请求体
  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ code: -1, msg: '请求体格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // 路由分发
  if (url.pathname === '/api/createRoom' && request.method === 'POST') {
    const { total } = body;
    if (!total || total < 2) {
      return new Response(JSON.stringify({ code: -1, msg: '总玩家数必须≥2' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const roomId = generateRoomId();
    const civil = total - 1;
    roomMap[roomId] = {
      isLock: false, lockNum: 0, total, spy: 1, civil, assigned: 0, lastRole: ''
    };
    return new Response(JSON.stringify({ 
      code: 0, 
      msg: '房间创建成功', 
      data: { roomId, isOwner: true } 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (url.pathname === '/api/joinRoom' && request.method === 'POST') {
    const { roomId } = body;
    if (!roomMap[roomId]) {
      return new Response(JSON.stringify({ code: -1, msg: '房间号无效或已过期' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const room = roomMap[roomId];
    return new Response(JSON.stringify({
      code: 0,
      msg: '加入房间成功',
      data: { isOwner: false, lockNum: room.lockNum, isLock: room.isLock, total: room.total }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (url.pathname === '/api/lockNum' && request.method === 'POST') {
    const { roomId, num } = body;
    if (!roomMap[roomId]) {
      return new Response(JSON.stringify({ code: -1, msg: '房间号无效' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    roomMap[roomId].isLock = true;
    roomMap[roomId].lockNum = num;
    return new Response(JSON.stringify({ 
      code: 0, 
      msg: '题目编号已锁定', 
      data: { lockNum: num } 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (url.pathname === '/api/getWord' && request.method === 'POST') {
    const { roomId } = body;
    if (!roomMap[roomId]) {
      return new Response(JSON.stringify({ code: -1, msg: '房间号无效' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const room = roomMap[roomId];
    if (!room.isLock) {
      return new Response(JSON.stringify({ code: -2, msg: '房主尚未锁定题目' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const assignedSpy = room.assigned - room.civil + (room.lastRole === 'civil' ? 1 : 0);
    const currRole = room.assigned === 0
      ? (Math.random() > 0.5 ? 'spy' : 'civil')
      : (assignedSpy < room.spy ? 'spy' : 'civil');

    room.assigned += 1;
    room.lastRole = currRole;
    return new Response(JSON.stringify({ 
      code: 0, 
      msg: '身份分配成功', 
      data: { currRole, lockNum: room.lockNum } 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (url.pathname === '/api/resetRoom' && request.method === 'POST') {
    const { roomId } = body;
    if (!roomMap[roomId]) {
      return new Response(JSON.stringify({ code: -1, msg: '房间号无效' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const total = roomMap[roomId].total;
    roomMap[roomId] = {
      isLock: false, lockNum: 0, total, spy: 1, civil: total - 1, assigned: 0, lastRole: ''
    };
    return new Response(JSON.stringify({ code: 0, msg: '房间重置成功' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  return new Response(JSON.stringify({ code: -404, msg: '接口不存在' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

export default {
  fetch: handleRequest
};
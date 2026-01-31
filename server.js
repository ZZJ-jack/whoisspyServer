// 引入核心依赖
const express = require('express');
const cors = require('cors');

// 初始化Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// ===================== 1. 修复后的跨域配置（关键） =====================
// 兼容所有前端域名（生产环境可替换为精准域名，先测试）
app.use(cors({
  origin: '*', // 临时放宽为所有域名（测试通过后可改为你的前端域名：https://whoisspy.zzjjack.us.kg）
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Origin', 'X-Requested-With', 'Accept'],
  credentials: false, // 临时关闭credentials（避免跨域凭证问题）
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// 强制处理所有OPTIONS请求，返回204
app.options('*', (req, res) => {
  res.status(204).end();
});

// ===================== 后续代码（不变） =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 内存存储房间数据
let roomStore = {};

// 生成6位唯一随机房间号
function generateUniqueRoomId() {
  let roomId;
  do {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
  } while (roomStore[roomId]);
  return roomId;
}

// 校验房间号是否存在
function isRoomExist(roomId) {
  return !!roomStore[roomId];
}

// 接口实现（保持不变）
app.post('/api/createRoom', (req, res) => {
  try {
    const { total } = req.body;
    if (!total || isNaN(total) || total < 2) {
      return res.json({
        code: -1,
        msg: '总玩家数必须≥2，请输入有效数字'
      });
    }
    const roomId = generateUniqueRoomId();
    roomStore[roomId] = {
      total: parseInt(total),
      lockNum: 0,
      isLock: false,
      usedCount: 0
    };
    res.json({
      code: 0,
      msg: '创建成功',
      data: { roomId }
    });
  } catch (err) {
    console.error('创建房间失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

app.post('/api/joinRoom', (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '请输入6位有效数字房间号'
      });
    }
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -2,
        msg: '房间号不存在，请检查输入'
      });
    }
    const { isLock, lockNum, total } = roomStore[roomId];
    res.json({
      code: 0,
      msg: '加入房间成功',
      data: { isLock, lockNum, total }
    });
  } catch (err) {
    console.error('加入房间失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

app.post('/api/lockNum', (req, res) => {
  try {
    const { roomId, num } = req.body;
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '房间号格式错误'
      });
    }
    if (!num || isNaN(num) || num < 1) {
      return res.json({
        code: -2,
        msg: '请输入有效题目编号'
      });
    }
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -3,
        msg: '房间不存在'
      });
    }
    roomStore[roomId].lockNum = parseInt(num);
    roomStore[roomId].isLock = true;
    res.json({
      code: 0,
      msg: '题目编号锁定成功'
    });
  } catch (err) {
    console.error('锁定编号失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

app.post('/api/getWord', (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '房间号格式错误'
      });
    }
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -2,
        msg: '房间不存在，请重新加入'
      });
    }
    const room = roomStore[roomId];
    if (!room.isLock) {
      return res.json({
        code: -3,
        msg: '房主尚未锁定题目，请等待'
      });
    }
    if (room.usedCount >= room.total) {
      return res.json({
        code: -4,
        msg: '当前房间人数已达上限，无法领取词语'
      });
    }
    let currRole = 'civilian';
    if (room.usedCount === 0) {
      currRole = 'spy';
    }
    room.usedCount += 1;
    res.json({
      code: 0,
      msg: '身份获取成功',
      data: {
        currRole,
        lockNum: room.lockNum
      }
    });
  } catch (err) {
    console.error('获取词语失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

app.post('/api/resetRoom', (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '房间号格式错误'
      });
    }
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -2,
        msg: '房间不存在'
      });
    }
    roomStore[roomId].lockNum = 0;
    roomStore[roomId].isLock = false;
    roomStore[roomId].usedCount = 0;
    res.json({
      code: 0,
      msg: '房间重置成功'
    });
  } catch (err) {
    console.error('重置房间失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ code: 0, msg: '服务器运行正常', data: { port: PORT } });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`✅ 后端服务已启动，运行在端口：${PORT}`);
  console.log(`✅ 跨域允许：所有域名（测试用）`);
  console.log(`✅ 健康检查地址：http://localhost:${PORT}/health`);
});

// 兜底处理404
app.use('*', (req, res) => {
  res.json({ code: -404, msg: '接口不存在' });
});
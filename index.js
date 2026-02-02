// 在前端代码中，修改以下部分：

// 1. 移除题库相关变量
// 删除：let wordBank = {}; 
// 删除：let validNums = []; 
// 删除：let isBankLoaded = false;

// 2. 修改获取词语函数
async function getWord() {
    if (isRequesting) return;
    if (!gameConfig.isInRoom) {
        return renderResult('error', '❌ 请先创建/加入房间');
    }
    if (gameConfig.hasGetWord) {
        return renderResult('error', '❌ 你已获取过词语，不可重复领取');
    }
    
    startRequest();
    try {
        const res = await axios.post(`${BASE_URL}/api/getWord`, {
            roomId: gameConfig.roomId
        });
        
        // 处理各种错误码
        if (res.data.code === -1) {
            return renderResult('error', res.data.msg);
        }
        if (res.data.code === -2) {
            return renderResult('error', res.data.msg);
        }
        if (res.data.code === -3) {
            renderResult('error', res.data.msg);
            gameConfig.hasGetWord = true;
            saveGameConfig();
            dom.queryBtn.classList.add('btn-disabled');
            dom.queryBtn.disabled = true;
            return;
        }
        if (res.data.code === -4) {
            return renderResult('error', res.data.msg);
        }
        
        const { currRole, lockNum, word, assigned, total } = res.data.data;
        const roleName = currRole === 'spy' ? '卧底' : '平民';
        
        // 更新状态
        gameConfig.hasGetWord = true;
        saveGameConfig();
        
        // 展示结果
        renderResult('game', lockNum, word, roleName, currRole);
        
        // 禁用获取按钮
        dom.queryBtn.classList.add('btn-disabled');
        dom.queryBtn.disabled = true;
        
    } catch (err) {
        renderResult('error', '❌ 身份获取失败，请稍后再试');
        console.error(err);
    } finally {
        endRequest();
    }
}

// 3. 修改页面初始化，移除题库加载
window.onload = function() {
    // ... 原有的恢复状态逻辑 ...
    
    // 删除：readTxtFromServer(); // 不再需要
    // 改为：检查后端题库状态
    checkBackendStatus();
    
    bindAllEvents();
    dom.roomIdInput.oninput = function() {
        this.value = this.value.replace(/\D/g, '');
    };
};

// 4. 添加检查后端状态函数
async function checkBackendStatus() {
    try {
        const res = await axios.post(`${BASE_URL}/api/getBankInfo`);
        if (res.data.code === 0) {
            const { total, minNum, maxNum } = res.data.data;
            dom.bankCount.innerText = `(${total}题)`;
            dom.numInput.max = maxNum;
            dom.numInput.placeholder = `输入${minNum}-${maxNum}的编号`;
            renderResult('success', `✅ 后端题库就绪，共${total}题`);
        }
    } catch (err) {
        console.log('后端题库信息获取失败，不影响主要功能');
    }
}

// 5. 修改启用游戏操作按钮函数
function enableGameOper(isEnable, canRandom) {
    // 不再依赖题库加载状态
    dom.numInput.disabled = !isEnable;
    dom.queryBtn.disabled = !isEnable || gameConfig.hasGetWord;
    dom.randomBtn.disabled = !isEnable || !canRandom;
    
    dom.queryBtn.classList.toggle('btn-disabled', !isEnable || gameConfig.hasGetWord);
    dom.randomBtn.classList.toggle('btn-disabled', !isEnable || !canRandom);
    
    if (isEnable) {
        // 可以显示默认范围，或者留空
        dom.numInput.placeholder = `输入题目编号`;
    }
}
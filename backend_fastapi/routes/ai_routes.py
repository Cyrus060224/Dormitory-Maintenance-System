import uuid
import time
import base64
import re
import json

import httpx
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse

from database import get_db
from auth import verify_token, require_admin
from models import AIConfigCreateRequest, AIConfigUpdateRequest, AIChatRequest
from services.ai_service import mask_api_key, get_simulation_diagnosis, call_active_llm

router = APIRouter()


@router.get("/api/admin/ai-configs")
async def get_ai_configs(current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM ai_configs ORDER BY createdAt DESC").fetchall()
        configs = []
        for r in rows:
            d = dict(r)
            d["apiKey"] = mask_api_key(d["apiKey"])
            configs.append(d)
    finally:
        conn.close()
    return {"success": True, "data": configs}


@router.post("/api/admin/ai-configs")
async def create_ai_config(payload: AIConfigCreateRequest, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        config_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        is_active_val = 1 if payload.isActive else 0

        if is_active_val == 1:
            conn.execute("UPDATE ai_configs SET isActive = 0")

        conn.execute("""
            INSERT INTO ai_configs (id, name, provider, apiKey, baseUrl, model, systemPrompt, isActive, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            config_id, payload.name, payload.provider, payload.apiKey,
            payload.baseUrl, payload.model, payload.systemPrompt, is_active_val,
            now, now
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        d = dict(row)
        d["apiKey"] = mask_api_key(d["apiKey"])
    finally:
        conn.close()
    return {"success": True, "data": d}


@router.patch("/api/admin/ai-configs/{config_id}")
async def update_ai_config(config_id: str, payload: AIConfigUpdateRequest, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AI配置预设不存在")

        updates = []
        values = []
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        if payload.name is not None:
            updates.append("name = ?")
            values.append(payload.name)
        if payload.provider is not None:
            updates.append("provider = ?")
            values.append(payload.provider)
        if payload.apiKey is not None and "..." not in payload.apiKey:
            updates.append("apiKey = ?")
            values.append(payload.apiKey)
        if payload.baseUrl is not None:
            updates.append("baseUrl = ?")
            values.append(payload.baseUrl)
        if payload.model is not None:
            updates.append("model = ?")
            values.append(payload.model)
        if payload.systemPrompt is not None:
            updates.append("systemPrompt = ?")
            values.append(payload.systemPrompt)

        if payload.isActive is not None:
            is_active_val = 1 if payload.isActive else 0
            if is_active_val == 1:
                conn.execute("UPDATE ai_configs SET isActive = 0")
            updates.append("isActive = ?")
            values.append(is_active_val)

        updates.append("updatedAt = ?")
        values.append(now)
        values.append(config_id)

        conn.execute(f"UPDATE ai_configs SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

        row = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        d = dict(row)
        d["apiKey"] = mask_api_key(d["apiKey"])
    finally:
        conn.close()
    return {"success": True, "data": d}


@router.delete("/api/admin/ai-configs/{config_id}")
async def delete_ai_config(config_id: str, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AI配置预设不存在")
        conn.execute("DELETE FROM ai_configs WHERE id = ?", (config_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "配置已成功删除"}


@router.post("/api/admin/ai-configs/test")
async def test_ai_config(payload: AIConfigCreateRequest, current_user: dict = Depends(require_admin)):
    if payload.provider == "simulation":
        return {"success": True, "message": "模拟引擎测试成功！宿宝已准备就绪。"}

    try:
        async with httpx.AsyncClient() as client:
            if payload.provider == "ollama":
                url = f"{payload.baseUrl}/api/chat" if payload.baseUrl else "http://localhost:11434/api/chat"
                res = await client.post(
                    url,
                    json={
                        "model": payload.model or "llama3",
                        "messages": [{"role": "user", "content": "hi"}],
                        "stream": False
                    },
                    timeout=5.0
                )
                if res.status_code == 200:
                    return {"success": True, "message": f"Ollama 引擎连接成功！模型: {payload.model}"}
                else:
                    raise HTTPException(status_code=400, detail=f"Ollama 返回错误 (状态码 {res.status_code}): {res.text}")
            else:
                url = f"{payload.baseUrl}/chat/completions"
                headers = {
                    "Content-Type": "application/json"
                }
                if payload.apiKey:
                    headers["Authorization"] = f"Bearer {payload.apiKey}"

                body = {
                    "model": payload.model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5
                }
                res = await client.post(url, json=body, headers=headers, timeout=5.0)
                if res.status_code == 200:
                    return {"success": True, "message": f"大模型接口测试成功！模型: {payload.model}"}
                else:
                    return JSONResponse(
                        status_code=400,
                        content={"success": False, "detail": f"模型接口返回错误 (状态码 {res.status_code}): {res.text}"}
                    )
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"success": False, "detail": f"测试连接异常: {str(e)}"}
        )


@router.post("/api/chat")
async def chat_with_assistant(payload: AIChatRequest, current_user: dict = Depends(verify_token)):
    conn = get_db()
    active_config = None
    try:
        row = conn.execute("SELECT * FROM ai_configs WHERE isActive = 1 LIMIT 1").fetchone()
        if row:
            active_config = dict(row)
    finally:
        conn.close()

    provider = active_config["provider"] if active_config else "simulation"
    system_prompt = active_config["systemPrompt"] if active_config else "你是一个可爱的宿舍生活助手，名字叫'宿宝'。请用温柔和善的语气解答学校宿舍生活、报修规范、维修指引相关的问题。"
    model = active_config["model"] if active_config else "simulation-model"
    api_key = active_config["apiKey"] if active_config else ""
    base_url = active_config["baseUrl"] if active_config else ""

    api_messages = []
    if system_prompt:
        api_messages.append({"role": "system", "content": system_prompt})

    for msg in payload.messages[-10:]:
        api_messages.append({"role": msg.role, "content": msg.content})

    if provider == "simulation":
        last_user_msg = payload.messages[-1].content if payload.messages else ""

        reply = "宿宝收到啦！这是一个模拟引擎的回复。等管理员配置了正式的 API Key（如 ChatGPT 或 DeepSeek）后，宿宝就可以回答各种好玩的生活问题啦！"
        if "断电" in last_user_msg or "停电" in last_user_msg or "没电" in last_user_msg:
            reply = '💡 **宿宝提示：宿舍用电指引**\n\n如果宿舍突然停电，请按照以下步骤排查：\n1. 检查是否只有你宿舍停电，如果是，可能是负荷过大导致跳闸，可查看宿舍门口配电箱的空气开关是否跳开。\n2. 检查校园网/公众号缴费系统，确认电费是否已经用完，如果是，请及时充值，充值后系统一般会在5分钟内自动送电。\n3. 如果以上均正常，请在宿舍管理系统提交"用电类"报修工单，维修师傅会尽快上门协助！'
        elif "水" in last_user_msg or "漏水" in last_user_msg or "堵塞" in last_user_msg:
            reply = '💧 **宿宝提示：水暖管道紧急处理**\n\n1. **水管爆裂/严重漏水**：请迅速关闭洗手池或卫生间下方的三角阀以切断水源，并提交"加急/紧急"报修单，同时可以电话联系楼栋宿管阿姨安排值班师傅。\n2. **下水道堵塞**：请尽量避免继续用水防止溢水，提交报修工单，并在备注中写明是否需要专用疏通工具。'
        elif "密码" in last_user_msg or "修改密码" in last_user_msg:
            reply = '🔒 **宿宝提示：密码管理**\n\n如果您需要修改密码：\n1. 点击左侧导航栏的 **"个人中心"**。\n2. 在页面中找到 **"修改密码"** 面板。\n3. 输入您的旧密码及新密码，点击保存即可。\n\n如果忘记密码，请联系宿管老师（系统管理员）进行后台密码重置。'
        elif "报修" in last_user_msg or "如何报修" in last_user_msg:
            reply = '🛠️ **宿宝提示：如何提交报修单**\n\n1. 在页面左侧点击 **"报修管理"** 页面。\n2. 点击顶部的 **"申请报修"** 按钮。\n3. 填写真实的楼栋、宿舍号，选择故障分类并填写详细描述（建议上传故障照片方便师傅带齐工具）。\n4. 点击提交后，系统将自动分配师傅为您维修，请保持电话畅通！'
        elif "你好" in last_user_msg or "你是谁" in last_user_msg:
            reply = "你好呀！我是宿舍小管家 **「宿宝」** 🤖✨。有什么关于宿舍报修、起居缴费或生活指南的问题，都可以随时问我哦！"

        return {"success": True, "data": {"reply": reply}}

    reply = await call_active_llm(api_messages, timeout=60.0)
    if reply:
        return {"success": True, "data": {"reply": reply}}
    else:
        return {"success": False, "detail": "AI 服务响应错误，请检查模型配置"}


@router.post("/api/repairs/analyze-image")
async def analyze_repair_image(file: UploadFile = File(...), current_user: dict = Depends(verify_token)):
    allowed_extensions = {".png", ".jpg", ".jpeg", ".gif"}
    import os
    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in allowed_extensions:
        raise HTTPException(status_code=400, detail="只允许上传图片格式 (.png, .jpg, .jpeg, .gif)")

    max_size = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="图片大小不能超过 5MB")

    image_base64 = base64.b64encode(content).decode("utf-8")

    conn = get_db()
    active_config = None
    try:
        row = conn.execute("SELECT * FROM ai_configs WHERE isActive = 1 LIMIT 1").fetchone()
        if row:
            active_config = dict(row)
    finally:
        conn.close()

    provider = active_config["provider"] if active_config else "simulation"
    model = active_config["model"] if active_config else "simulation-model"
    api_key = active_config["apiKey"] if active_config else ""
    base_url = active_config["baseUrl"] if active_config else ""

    if provider == "simulation":
        sim_data = get_simulation_diagnosis(file.filename)
        return {"success": True, "data": sim_data}

    prompt = """
    你是一个宿舍报修系统的视觉AI预检大脑。请根据上传的图片，判断其属于哪种报修分类，并给出中文的故障分析描述。
    你必须以 JSON 格式返回，JSON 必须且仅包含两个字段：
    1. 'category': 必须是以下英文单词之一：'water' (水类故障), 'electricity' (电类故障), 'furniture' (家具五金类), 'network' (网络电脑类), 'other' (其他类)。
    2. 'diagnosis': 简短的中文预检诊断结论，字数在50字以内，带有'经宿宝预检：...'前缀。

    示例 JSON：
    {
      "category": "water",
      "diagnosis": "经宿宝预检：洗手池下水管有开裂漏水迹象，已匹配水电类报修。"
    }
    """

    try:
        async with httpx.AsyncClient() as client:
            if provider == "ollama":
                url = f"{base_url}/api/chat" if base_url else "http://localhost:11434/api/chat"
                res = await client.post(
                    url,
                    json={
                        "model": model or "llava",
                        "messages": [
                            {
                                "role": "user",
                                "content": prompt,
                                "images": [image_base64]
                            }
                        ],
                        "stream": False
                    },
                    timeout=15.0
                )
                if res.status_code == 200:
                    text_reply = res.json()["message"]["content"]
                    try:
                        json_match = re.search(r"\{.*\}", text_reply, re.DOTALL)
                        if json_match:
                            parsed = json.loads(json_match.group(0))
                            if "category" in parsed and "diagnosis" in parsed:
                                return {"success": True, "data": parsed}
                    except:
                        pass
                    return {"success": True, "data": {"category": "other", "diagnosis": f"经宿宝预检：{text_reply[:60]}"}}
            else:
                url = f"{base_url}/chat/completions"
                headers = {
                    "Content-Type": "application/json"
                }
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"

                body = {
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": prompt
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{image_base64}"
                                    }
                                }
                            ]
                        }
                    ],
                    "max_tokens": 150
                }
                res = await client.post(url, json=body, headers=headers, timeout=15.0)
                if res.status_code == 200:
                    text_reply = res.json()["choices"][0]["message"]["content"]
                    try:
                        json_match = re.search(r"\{.*\}", text_reply, re.DOTALL)
                        if json_match:
                            parsed = json.loads(json_match.group(0))
                            if "category" in parsed and "diagnosis" in parsed:
                                return {"success": True, "data": parsed}
                    except:
                        pass
                    return {"success": True, "data": {"category": "other", "diagnosis": f"经宿宝预检：诊断完毕"}}
    except Exception as e:
        print(f"AI Vision Exception: {e}, falling back to simulation")

    sim_data = get_simulation_diagnosis(file.filename)
    return {"success": True, "data": sim_data}

import json
import httpx

from database import get_db


# ============================================================
#  通用 LLM 调用（与宿宝共用同一套 ai_configs 配置）
# ============================================================

async def call_active_llm(messages: list[dict], temperature: float = 0.0, timeout: float = 30.0, json_mode: bool = False) -> str | None:
    """
    调用当前激活的 AI 模型，返回回复文本。
    json_mode=True 时强制模型输出 JSON（用于派单/分析），False 时自然语言（用于聊天）。
    失败返回 None（调用方可自行降级到规则引擎）。
    """
    conn = get_db()
    active_config = None
    try:
        row = conn.execute("SELECT * FROM ai_configs WHERE isActive = 1 LIMIT 1").fetchone()
        if row:
            active_config = dict(row)
    finally:
        conn.close()

    provider = active_config["provider"] if active_config else "simulation"
    model = active_config["model"] if active_config else ""
    api_key = active_config["apiKey"] if active_config else ""
    base_url = active_config["baseUrl"] if active_config else ""

    # 模拟引擎 → 不调用 LLM
    if provider == "simulation":
        return None

    try:
        async with httpx.AsyncClient() as client:
            if provider == "ollama":
                url = f"{base_url}/api/chat" if base_url else "http://localhost:11434/api/chat"
                body = {
                    "model": model or "llama3",
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": temperature},
                }
                if json_mode:
                    body["format"] = "json"
                response = await client.post(url, json=body, timeout=timeout)
                if response.status_code == 200:
                    return response.json().get("message", {}).get("content", "").strip()
            else:
                # OpenAI 兼容（SiliconFlow / DeepSeek / 通义千问 / 月之暗面等）
                url = f"{base_url}/chat/completions"
                headers = {"Content-Type": "application/json"}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
                body = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                }
                if json_mode:
                    body["response_format"] = {"type": "json_object"}
                response = await client.post(url, json=body, headers=headers, timeout=timeout)
                if response.status_code == 200:
                    return response.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except Exception as e:
        print(f"[call_active_llm] LLM 调用失败: {e}")

    return None


# ============================================================
#  AI 智能派单（LLM 驱动 + 规则降级）
# ============================================================

async def ai_dispatch(description: str, category: str, priority: str, candidates: list[dict]) -> dict | None:
    """
    让 LLM 综合分析后选择最佳维修员。

    参数:
      description  - 报修描述
      category     - 报修类型 (water/electricity/furniture/network/other)
      priority     - 优先级 (low/normal/high/urgent)
      candidates   - 候选维修员列表, 每人含:
                     {id, name, skills, activeTasks, avgRating, totalCompleted}

    返回:
      {"techId": "...", "reason": "..."}  或  None（无法决策时降级）
    """
    if not candidates:
        return None

    # 只有一个候选 → 直接选，无需调用 LLM
    if len(candidates) == 1:
        return {"techId": candidates[0]["id"], "reason": "唯一匹配维修员，已直接分配"}

    priority_labels = {"urgent": "紧急", "high": "高", "normal": "普通", "low": "低"}
    category_labels = {"water": "水管/水电", "electricity": "电路/电器", "furniture": "家具/木工",
                       "network": "网络/网线", "other": "其他"}

    candidates_text = ""
    for c in candidates:
        rating_str = f"{c['avgRating']:.1f}" if c['avgRating'] else "暂无"
        candidates_text += (
            f"- ID: {c['id']}\n"
            f"  姓名: {c['name']}\n"
            f"  技能: {c['skills']}\n"
            f"  当前在办工单: {c['activeTasks']} 单\n"
            f"  历史平均评分: {rating_str} (满分5分)\n"
            f"  累计完成工单: {c['totalCompleted']} 单\n\n"
        )

    system_prompt = (
        "你是一个专业的大学宿舍报修智能派单系统。你的任务是根据报修信息和候选维修员的综合数据，"
        "选择最合适的维修员进行派单。\n\n"
        "请综合考虑以下因素：\n"
        "1. 技能匹配度：维修员的技能是否与报修类型高度匹配\n"
        "2. 当前工作负载：在办工单越少越好，避免过度忙碌影响效率\n"
        "3. 历史服务质量：平均评分越高说明维修质量越好\n"
        "4. 经验丰富度：累计完成工单越多经验越丰富\n"
        "5. 优先级紧急程度：紧急/高优先级应分配给评分高且空闲的维修员\n\n"
        "你必须返回一个 JSON 对象，格式如下：\n"
        '{"techId": "你选择的维修员ID", "reason": "选择理由（30字以内）"}\n\n'
        "只返回 JSON，不要有其他内容。"
    )

    user_prompt = (
        f"报修信息：\n"
        f"- 类型: {category_labels.get(category, category)}\n"
        f"- 优先级: {priority_labels.get(priority, priority)}\n"
        f"- 描述: {description}\n\n"
        f"候选维修员：\n{candidates_text}"
        f"请选择最合适的维修员。"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    content = await call_active_llm(messages, temperature=0.0, timeout=10.0, json_mode=True)
    if not content:
        return None

    try:
        parsed = json.loads(content)
        tech_id = parsed.get("techId")
        reason = parsed.get("reason", "")
        # 校验 techId 是否在候选列表中
        valid_ids = {c["id"] for c in candidates}
        if tech_id in valid_ids:
            return {"techId": tech_id, "reason": reason}
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"[ai_dispatch] LLM 返回解析失败: {e}, 原文: {content}")

    return None


# ============================================================
#  报修分类 + 优先级评估（LLM 优先 → 关键词规则降级）
# ============================================================

async def _get_ai_analysis(description: str) -> tuple[str, str, str]:
    """双轨 AI 分析：先尝试激活的 LLM 模型，失败降级到关键词规则引擎"""

    # 轨 1：尝试调用激活的 LLM 模型
    system_prompt = (
        "你是一个专业的大学宿舍报修分析器。请将用户的报修描述分类并评估优先级。\n\n"
        "分类（category）：\n"
        "- 'water': 水管、漏水、卫生间、马桶、冷热水、花洒、水龙头\n"
        "- 'electricity': 插座、灯、断电、跳闸、开关、电线、电器\n"
        "- 'furniture': 床、桌椅、柜子、门、窗、锁、合页、玻璃\n"
        "- 'network': 校园网、路由器、WiFi、宽带、网线、网速\n"
        "- 'other': 其他\n\n"
        "优先级（priority）：\n"
        "- 'urgent': 极度危险需立即处理，如漏电、火灾、水管爆裂、深夜被锁门外\n"
        "- 'high': 严重影响生活，如没水没电、马桶堵、门锁坏、考试期间断网\n"
        "- 'normal': 常规维修，如桌腿松动、灯泡闪烁、网速慢、门吱呀响\n"
        "- 'low': 轻微问题或描述过于简短\n\n"
        '必须返回 JSON：{"category":"water|electricity|furniture|network|other","priority":"low|normal|high|urgent"}'
    )

    content = await call_active_llm(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": f"报修描述: {description}"}],
        temperature=0.0,
        timeout=5.0,
        json_mode=True,
    )

    if content:
        try:
            parsed = json.loads(content)
            cat = parsed.get("category")
            pri = parsed.get("priority")
            if cat in ("water", "electricity", "furniture", "network", "other") and \
               pri in ("low", "normal", "high", "urgent"):
                return cat, pri, "active_llm"
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

    # 轨 2：备用/降级方案 ── 关键词规则引擎
    desc = description.lower()

    categories = {
        "water": ["水", "漏水", "水管", "水龙头", "漏雨", "下水道", "马桶", "堵", "排水", "热水", "冷水", "花洒", "地漏", "喷水", "滴水", "爆管", "阀门"],
        "electricity": ["电", "插座", "灯", "断电", "没电", "跳闸", "开关", "电线", "灯管", "漏电", "短路", "电器", "空调", "热水器", "烧坏"],
        "furniture": ["床", "椅子", "桌子", "柜子", "门", "窗", "锁", "合页", "把手", "玻璃", "衣柜", "床架", "抽屉", "合叶", "木工", "钥匙", "开不了"],
        "network": ["网", "校园网", "路由器", "宽带", "网络", "断网", "网线", "连不上", "网速", "WiFi", "wifi", "上网", "接口", "网口", "无线"],
    }

    urgent_hazard_keywords = ["漏电", "着火", "起火", "爆炸", "触电", "电线冒烟", "起火花", "爆裂喷水", "大水漫灌", "水管爆裂"]
    high_hazard_keywords = ["无法锁门", "锁坏了", "没水", "没电", "马桶堵塞", "地面积水", "开不了锁", "无法关窗", "玻璃碎了", "钥匙断在锁里", "天花板漏水"]
    urgency_booster_keywords = ["紧急", "特急", "急需", "火速", "马上", "非常急", "极其严重", "十万火急", "危险", "速来", "马上要用", "尽快", "快来"]

    scores = {cat: 0 for cat in categories}
    for cat, keywords in categories.items():
        for kw in keywords:
            if kw in desc:
                scores[cat] += desc.count(kw)

    recommended_category = "other"
    max_score = 0
    for cat, score in scores.items():
        if score > max_score:
            max_score = score
            recommended_category = cat

    base_priority = "normal"
    if any(kw in desc for kw in urgent_hazard_keywords):
        base_priority = "urgent"
    elif any(kw in desc for kw in high_hazard_keywords):
        base_priority = "high"
    elif len(desc.strip()) < 8:
        base_priority = "low"

    recommended_priority = base_priority
    if any(kw in desc for kw in urgency_booster_keywords):
        if base_priority == "low":
            recommended_priority = "normal"
        elif base_priority == "normal":
            recommended_priority = "high"
        elif base_priority == "high":
            recommended_priority = "urgent"

    return recommended_category, recommended_priority, "rule_booster"


# ============================================================
#  辅助工具
# ============================================================

def mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:4]}...{key[-4:]}"


def get_simulation_diagnosis(filename: str) -> dict:
    """模拟 AI 视觉诊断（当无真实 AI 引擎时使用）"""
    filename_lower = filename.lower()
    category = "other"
    diagnosis = "经宿宝视觉诊断：设备外观无明显损坏，已自动分类为其他类。建议您补充文字描述。"

    if any(k in filename_lower for k in ["water", "leak", "pipe", "tap", "sink", "toilet", "水", "阀", "漏", "堵"]):
        category = "water"
        diagnosis = "经宿宝视觉预检：检测到水管/阀门处有疑似渗水与锈蚀。宿宝已为您推荐「水电类」报修，维修师傅将携带管道配件上门排查。"
    elif any(k in filename_lower for k in ["light", "bulb", "lamp", "power", "wire", "switch", "electricity", "电", "灯", "插座", "跳闸"]):
        category = "electricity"
        diagnosis = "经宿宝视觉预检：检测到灯具不亮或线路老化。宿宝已为您推荐「水电类」报修。提示：若是断电跳闸，请先登录系统确认电费余额。"
    elif any(k in filename_lower for k in ["chair", "desk", "bed", "door", "lock", "handle", "cabinet", "wood", "furniture", "木", "门", "锁", "椅", "床", "柜"]):
        category = "furniture"
        diagnosis = "经宿宝视觉预检：检测到家具结构松动或锁具五金磨损。宿宝已为您推荐「家具类」报修，师傅将携带相应五金备件上门。"
    elif any(k in filename_lower for k in ["net", "wifi", "cable", "router", "port", "lan", "网络", "网线", "路由器"]):
        category = "network"
        diagnosis = "经宿宝视觉预检：检测到网口或水晶头指示灯异常。宿宝已为您推荐「网络类」报修，将派专员进行端口和网络检测。"
    else:
        h = sum(ord(c) for c in filename) % 4
        cats = ["water", "electricity", "furniture", "network"]
        category = cats[h]
        diagnoses = {
            "water": "经宿宝视觉预检：图片预检有疑似潮湿渗水痕迹。宿宝已为您推荐「水电类」报修。",
            "electricity": "经宿宝视觉预检：图片显示电气或灯具开关排布。宿宝已为您推荐「水电类」报修。",
            "furniture": "经宿宝视觉预检：发现木质框架或家具组件边缘。宿宝已为您推荐「家具类」报修。",
            "network": "经宿宝视觉预检：图像中存在网口或线缆连接特征。宿宝已为您推荐「网络类」报修。",
        }
        diagnosis = diagnoses[category]
    return {"category": category, "diagnosis": diagnosis}

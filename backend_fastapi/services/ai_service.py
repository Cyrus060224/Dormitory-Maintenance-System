import json
import httpx


async def _get_ai_analysis(description: str) -> tuple[str, str, str]:
    """双轨 AI 分析：先尝试 Ollama Llama3，失败降级到关键词规则引擎"""
    desc = description.lower()

    # 轨 1：尝试使用本地大模型 Ollama Llama3 进行高级语义分析
    try:
        async with httpx.AsyncClient() as client:
            system_prompt = (
                "You are a professional university dormitory repair analyzer. Classify the user's repair description into exactly one category and one priority.\n\n"
                "Categories:\n"
                "- 'water': plumbing, water leak, bathroom, toilet, hot/cold water, shower, faucets.\n"
                "- 'electricity': power socket, lights, electricity trip, switches, wires, electrical appliances.\n"
                "- 'furniture': bed, table, chair, desk, cabinet, door, window, lock, keys, glass.\n"
                "- 'network': internet connection, campus network, router, WiFi, Ethernet cables.\n"
                "- 'other': anything else.\n\n"
                "Priorities:\n"
                "- 'urgent': Extreme hazards requiring immediate response, like electrical fires, live wires exposed, flooding/heavy bursts of water, locked out of dorm room late at night.\n"
                "- 'high': Severe inconvenience but not immediate physical danger, like no water, no electricity, toilet clogged, door/lock completely broken, window broken in bad weather, network down during exams.\n"
                "- 'normal': Standard maintenance like slightly loose table legs, a flickering lightbulb, slow network, creaking door hinges.\n"
                "- 'low': Trivial requests, very brief descriptions, or cosmetically minor flaws.\n\n"
                "Respond ONLY with a valid JSON object in this format:\n"
                "{\n  \"category\": \"water\" | \"electricity\" | \"furniture\" | \"network\" | \"other\",\n  \"priority\": \"low\" | \"normal\" | \"high\" | \"urgent\"\n}"
            )

            response = await client.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": "llama3:8b",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Description: {description}"}
                    ],
                    "stream": False,
                    "options": {"temperature": 0.0},
                    "format": "json"
                },
                timeout=2.0
            )

            if response.status_code == 200:
                res_json = response.json()
                content = res_json.get("message", {}).get("content", "").strip()
                parsed = json.loads(content)
                cat = parsed.get("category")
                pri = parsed.get("priority")
                if cat in ("water", "electricity", "furniture", "network", "other") and \
                   pri in ("low", "normal", "high", "urgent"):
                    return cat, pri, "ollama_llama3"
    except Exception as e:
        print(f"[AI Analyzer] Ollama Llama3 analysis failed or timed out: {e}. Falling back to Rule Engine.")

    # 轨 2：备用/降级方案 ── 升级版本地词法与情感词助推分类引擎
    categories = {
        "water": ["水", "漏水", "水管", "水龙头", "漏雨", "下水道", "马桶", "堵", "排水", "热水", "冷水", "花洒", "地漏", "喷水", "滴水", "爆管", "阀门"],
        "electricity": ["电", "插座", "灯", "断电", "没电", "跳闸", "开关", "电线", "灯管", "漏电", "短路", "电器", "空调", "热水器", "烧坏"],
        "furniture": ["床", "椅子", "桌子", "柜子", "门", "窗", "锁", "合页", "把手", "玻璃", "衣柜", "床架", "抽屉", "合叶", "木工", "钥匙", "开不了"],
        "network": ["网", "校园网", "路由器", "宽带", "网络", "断网", "网线", "连不上", "网速", "WiFi", "wifi", "上网", "接口", "网口", "无线"],
    }

    urgent_hazard_keywords = ["漏电", "着火", "起火", "爆炸", "触电", "电线冒烟", "起火花", "爆裂喷水", "大水漫灌", "水管爆裂"]
    high_hazard_keywords = ["无法锁门", "锁坏了", "没水", "没电", "马桶堵塞", "地面积水", "开不了锁", "无法关窗", "玻璃碎了", "钥匙断在锁里", "天花板漏水"]
    urgency_booster_keywords = ["紧急", "特急", "急需", "火速", "马上", "非常急", "极其严重", "十万火急", "危险", "速来", "马上要用", "尽快", "快来"]

    # 计算分类匹配分数
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

    # 基础优先级评估
    base_priority = "normal"
    if any(kw in desc for kw in urgent_hazard_keywords):
        base_priority = "urgent"
    elif any(kw in desc for kw in high_hazard_keywords):
        base_priority = "high"
    elif len(desc.strip()) < 8:
        base_priority = "low"

    # 情感/主观语气修饰词助推器 (Booster)
    recommended_priority = base_priority
    if any(kw in desc for kw in urgency_booster_keywords):
        if base_priority == "low":
            recommended_priority = "normal"
        elif base_priority == "normal":
            recommended_priority = "high"
        elif base_priority == "high":
            recommended_priority = "urgent"

    return recommended_category, recommended_priority, "rule_booster"


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
            "network": "经宿宝视觉预检：图像中存在网口或线缆连接特征。宿宝已为您推荐「网络类」报修。"
        }
        diagnosis = diagnoses[category]
    return {"category": category, "diagnosis": diagnosis}

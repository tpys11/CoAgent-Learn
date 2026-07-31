import json
def update_memories(api_key,project_id,txt,db,sid="default"):
    open("/tmp/um.txt","a").write("called|")
    if not txt or not txt.strip():return
    from core.base_llm import DeepSeekLLM
    llm=DeepSeekLLM(api_key=api_key)
    NL=chr(10)
    # 1. 情景记忆
    try:
        p="分析这段对话，提取本项目情景记忆(JSON):"+NL+"对话:"+txt[:1500]
        p+=NL+NL+"JSON格式:"+NL
        p+="{\"项目概述\":\"\",\"当前进度\":\"\",\"领域\":\"\",\"水平\":\"\",\"兴趣\":[],\"偏好\":[],\"知识点\":[],\"薄弱点\":[],\"学习建议\":\"\",\"摘要\":\"\"}"
        r=llm.chat([{"role":"user","content":p}])
        d=json.loads(r) if isinstance(r,str) else r
        rows=db.execute("SELECT data FROM project_memories WHERE session_id=%s AND project_id=%s",(sid,project_id))
        if rows:
            o=dict(rows[0]["data"]) if rows[0]["data"] else {}
            for k in ["项目概述","当前进度","学习建议","领域","水平","兴趣","偏好"]:
                if k in d and d[k]:o[k]=d[k]
            for ak in ["知识点","难点","薄弱点"]:
                if d.get(ak):
                    a=o.get(ak,[]);[a.append(x) for x in d[ak] if x not in a];o[ak]=a
            if d.get("摘要"):
                o["摘要"]=d["摘要"]
                ss=o.get("对话摘要",[]);ss.append({"摘要":d["摘要"][:200]})
                o["对话摘要"]=ss[-10:]
            db.execute("UPDATE project_memories SET data=%s,updated_at=CURRENT_TIMESTAMP WHERE session_id=%s AND project_id=%s",(json.dumps(o,ensure_ascii=False),sid,project_id))
        else:
            db.execute("INSERT INTO project_memories (session_id,project_id,data) VALUES (%s,%s,%s)",(sid,project_id,json.dumps(d,ensure_ascii=False)))
    except Exception as e:print("[mem] 情景失败:"+str(e)[:100])
    # 2. 全局画像
    try:
        p2="分析这段对话，提取用户画像(JSON):"+NL+"对话:"+txt[:800]
        p2+=NL+NL+"JSON格式:"+NL
        p2+="{\"用户背景\":\"\",\"偏好提问方式\":[],\"偏好学习方式\":[],\"偏好_输出\":[],\"学习时长\":\"\",\"学习内容\":[]}"
        r2=llm.chat([{"role":"user","content":p2}])
        nd=json.loads(r2) if isinstance(r2,str) else r2
        old=db.execute("SELECT data FROM global_profile WHERE session_id=%s",(sid,))
        od=dict(old[0]["data"]) if old and old[0]["data"] else {}
        for k in ["用户背景","偏好提问方式","偏好学习方式","偏好_输出","学习时长","学习内容"]:
            if k in nd and nd[k]:od[k]=nd[k]
        pr=db.execute("SELECT data FROM project_memories WHERE session_id=%s AND project_id=%s",(sid,project_id))
        if pr:
            pd=pr[0]["data"] or {};ps={}
            for f in ["领域","水平","薄弱点","兴趣","偏好"]:
                if pd.get(f):ps[f]=pd[f]
            lb=project_id if project_id!="default" else "默认项目"
            pj=od.get("项目摘要",{});pj[lb]=ps;od["项目摘要"]=pj
        has=db.execute("SELECT session_id FROM global_profile WHERE session_id=%s",(sid,))
        if has:
            db.execute("UPDATE global_profile SET data=%s,updated_at=CURRENT_TIMESTAMP WHERE session_id=%s",(json.dumps(od,ensure_ascii=False),sid))
        else:
            db.execute("INSERT INTO global_profile (session_id,data) VALUES (%s,%s)",(sid,json.dumps(od,ensure_ascii=False)))
    except Exception as e:print("[mem] 全局失败:"+str(e)[:100])

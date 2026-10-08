import os, time, json, requests
K = os.environ["GEMINI_API_KEY"]
URL = "https://www.youtube.com/watch?v=qYq-lTOZXeM"
def run(model, meta, prompt="이 영상의 길이(분)와 핵심 내용을 세 줄로."):
    t = time.time()
    body = {"contents":[{"role":"user","parts":[{"file_data":{"file_uri":URL},"video_metadata":meta},{"text":prompt}]}],
            "generationConfig":{"mediaResolution":"MEDIA_RESOLUTION_LOW"}}
    r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={K}", json=body, timeout=280)
    out = r.text[:400] if not r.ok else json.dumps(r.json().get("usageMetadata"), ensure_ascii=False)[:300] + " | " + r.json()["candidates"][0]["content"]["parts"][0]["text"][:300].replace("\n"," ")
    print(model, meta, r.status_code, round(time.time()-t), "s", out, flush=True)
run("gemini-flash-lite-latest", {"fps":0.2})
run("gemini-flash-lite-latest", {"fps":0.2})
run("gemini-flash-lite-latest", {"fps":0.2,"start_offset":"0s","end_offset":"1800s"})
run("gemini-flash-lite-latest", {"fps":0.2,"start_offset":"1800s","end_offset":"3600s"})
run("gemini-flash-lite-latest", {"fps":0.05})
run("gemini-flash-latest", {"fps":0.2})
